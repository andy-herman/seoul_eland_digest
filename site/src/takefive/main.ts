// Take Five: menus, the recording studio, playback, results, share links, saves and the QA hooks.
import { GameAudio } from "../game/audio";
import { OPPONENTS, SQUAD, type OpponentSlug } from "../h2h/data";
import { decodeShare, encodeShare, loadString, saveString } from "./codec";
import { STEP, TakeSim, recordSolution, scriptToTrack, starsFor, steps, type ActKind, type LevelDef, type Outcome, type SimEvent, type Track } from "./engine";
import { TAKE5_STRINGS, type Locale } from "./i18n";
import { LEVELS, type CampaignLevel } from "./levels";
import { BoardRenderer, Recording, viewOf, type Aim, type FrameView } from "./render";
import { mirrorLevel, type RewriteGoal } from "./rewrite";

const SAVE_KEY = "take5-v1";
const CHARGE_TIME = 0.75; // seconds of holding for a full-power kick
const COUNT_BEAT = 0.5; // seconds per countdown beat
const PREROLL = 1.2; // seconds of the old take shown before a punch-in goes live

interface Save {
  stars: Record<string, number>;
  best: Record<string, number>; // fastest goal, seconds
  wip: Record<string, string>; // takes in progress, per level
  slow: boolean;
  routes: boolean;
}

/** The compact form of a Rewrite level that the page embeds (the full level is rebuilt from it). */
export interface RewriteSeed {
  id: string;
  template: string;
  mirrored: boolean;
  tier: 1 | 2 | 3 | 4;
  opponent: OpponentSlug;
  round: number;
  date: string;
  venue: "home" | "away" | "neutral";
  opponentName: string;
  ours: number;
  theirs: number;
  goal: RewriteGoal;
}

type Level = LevelDef & {
  kind: "campaign" | "rewrite";
  n: number;
  seed?: RewriteSeed;
};

type Mode = "loading" | "menu" | "brief" | "studio" | "watch";
type Phase = "idle" | "countdown" | "record" | "play";

function loadSave(): Save {
  const base: Save = { stars: {}, best: {}, wip: {}, slow: false, routes: true };
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "{}");
    return { ...base, ...raw, stars: { ...(raw.stars ?? {}) }, best: { ...(raw.best ?? {}) }, wip: { ...(raw.wip ?? {}) } };
  } catch {
    return base;
  }
}
function store(s: Save): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* private mode */
  }
}

function buildRecording(level: LevelDef, tracks: (Track | null)[]): { rec: Recording; sim: TakeSim } {
  const sim = new TakeSim(level, tracks, null);
  const rec = new Recording(sim.n, level.slots.length, level.defenders.length);
  rec.capture(sim);
  while (!sim.done) {
    sim.advance();
    rec.capture(sim);
  }
  rec.last = Math.min(sim.step, sim.n);
  return { rec, sim };
}

export function mountTakeFive(root: HTMLElement): void {
  const locale = (root.dataset.locale as Locale) ?? "en";
  const t = TAKE5_STRINGS[locale];
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const qa = <T extends HTMLElement = HTMLElement>(sel: string) => [...root.querySelectorAll<T>(sel)];
  const params = new URLSearchParams(location.search);
  const qaMode = params.has("qa");
  const coarse = matchMedia("(pointer: coarse)").matches;
  const save = loadSave();
  const audio = new GameAudio(root.dataset.song!);
  const canvas = q<HTMLCanvasElement>("[data-t5-canvas]")!;
  const renderer = new BoardRenderer(canvas, { heads: root.dataset.heads!, mascots: root.dataset.mascots! });
  const studioEl = q("[data-t5-studio]")!;
  const fmt = (v: number) => (locale === "pt" ? v.toFixed(1).replace(".", ",") : v.toFixed(1));

  // ------------------------------------------------------------------ levels
  const campaign: Level[] = LEVELS.map((l: CampaignLevel) => ({ ...l, kind: "campaign" as const, n: l.n }));
  const seeds: RewriteSeed[] = JSON.parse(q("[data-t5-rewrites]")?.textContent ?? "[]");
  const rewrites: Level[] = seeds.flatMap((s, i) => {
    const base = LEVELS.find((l) => l.id === s.template);
    if (!base) return [];
    const b = s.mirrored ? mirrorLevel(base) : base;
    return [{ ...b, id: s.id, opponent: s.opponent, tier: s.tier, kind: "rewrite" as const, n: i + 1, seed: s }];
  });
  const byId = new Map<string, Level>([...campaign, ...rewrites].map((l) => [l.id, l]));
  const nameOf = (num: number) => SQUAD.find((p) => p.num === num)?.en ?? `#${num}`;
  const koOf = (num: number) => SQUAD.find((p) => p.num === num)?.ko ?? "";
  const titleOf = (l: Level) => (l.kind === "campaign" ? t.levels[l.id]?.title ?? l.id : `${t.roundLabel(l.seed!.round)} · ${t.rewriteGoal(l.seed!.goal, l.seed!.ours, l.seed!.theirs)}`);
  const unlocked = (l: Level) => {
    if (qaMode || l.kind === "rewrite") return true;
    const i = campaign.indexOf(l);
    return i <= 0 || (save.stars[campaign[i - 1].id] ?? 0) > 0;
  };
  const objectiveText = (l: Level, k: 0 | 1) => {
    const o = l.stars[k];
    return t.objective(o, o.kind === "scorer" ? nameOf(l.slots[o.value ?? 0].num) : "");
  };

  // ------------------------------------------------------------------ state
  let mode: Mode = "loading";
  let phase: Phase = "idle";
  let level: Level = campaign[0];
  let tracks: (Track | null)[] = [];
  let undoStack: (Track | null)[][] = [];
  let selected = 0;
  let takes = 0;
  let rec: Recording;
  let recSim: TakeSim;
  let cursor = 0; // playhead step
  let live: TakeSim | null = null;
  let liveSlot = -1;
  let punchFrom = 0;
  let countEnd = 0;
  let lastBeat = -1;
  let acc = 0;
  let raf = 0;
  let lastT = performance.now();
  let status = "";
  let statusBad = false;
  let watchTracks: (Track | null)[] | null = null;
  let watchKind: "share" | "coach" | "replay" = "share";
  let fast = 1; // QA: sim steps per frame multiplier
  let scripted: Track | null = null; // QA: feed a scripted take through the live path
  let completeShown = false;

  // ------------------------------------------------------------------ screens
  const setMode = (m: Mode) => {
    mode = m;
    root.dataset.mode = m;
    for (const el of qa("[data-t5-screen]")) el.hidden = el.dataset.t5Screen !== m;
    studioEl.hidden = m !== "studio" && m !== "watch";
    document.body.classList.toggle("t5-lock-scroll", coarse && (m === "studio" || m === "watch"));
    if (m === "studio" || m === "watch") {
      requestAnimationFrame(() => renderer.resize());
      startLoop();
    } else stopLoop();
  };
  const setPhase = (p: Phase) => {
    phase = p;
    studioEl.dataset.phase = p;
  };

  // ------------------------------------------------------------------ menu
  const starStr = (n: number) => "★".repeat(n) + "☆".repeat(3 - n);
  const refreshMenu = () => {
    for (const b of qa<HTMLButtonElement>("[data-t5-level]")) {
      const l = byId.get(b.dataset.t5Level!);
      if (!l) continue;
      const open = unlocked(l);
      b.disabled = !open;
      b.dataset.locked = String(!open);
      const s = save.stars[l.id] ?? 0;
      const el = b.querySelector<HTMLElement>("[data-t5-stars]");
      if (el) el.textContent = open ? starStr(s) : `🔒 ${t.locked}`;
      b.dataset.done = String(s > 0);
    }
    const total = campaign.reduce((a, l) => a + (save.stars[l.id] ?? 0), 0);
    const tot = q("[data-t5-total]");
    if (tot) tot.textContent = `★ ${total} / ${campaign.length * 3}`;
  };
  for (const b of qa<HTMLButtonElement>("[data-t5-tab]"))
    b.addEventListener("click", () => {
      audio.unlock();
      audio.click();
      for (const x of qa<HTMLButtonElement>("[data-t5-tab]")) x.setAttribute("aria-selected", String(x === b));
      for (const p of qa("[data-t5-panel]")) p.hidden = p.dataset.t5Panel !== b.dataset.t5Tab;
    });
  for (const b of qa<HTMLButtonElement>("[data-t5-level]"))
    b.addEventListener("click", () => {
      const l = byId.get(b.dataset.t5Level!);
      if (!l || !unlocked(l)) return;
      audio.unlock();
      audio.click();
      openBrief(l);
    });

  // ------------------------------------------------------------------ brief
  const openBrief = (l: Level) => {
    level = l;
    const op = OPPONENTS[l.opponent as OpponentSlug];
    q("[data-t5-b-kicker]")!.textContent = l.kind === "campaign" ? `${t.levelN(l.n)} · ${t.chapters[(l as unknown as CampaignLevel).chapter].name}` : `${t.roundLabel(l.seed!.round)} · ${l.seed!.date}`;
    q("[data-t5-b-title]")!.textContent = l.kind === "campaign" ? t.levels[l.id].title : t.scoreLine(l.seed!.ours, l.seed!.theirs, l.seed!.opponentName);
    q("[data-t5-b-brief]")!.textContent =
      l.kind === "campaign" ? t.levels[l.id].brief : t.rewriteBrief(l.seed!.opponentName, op.name, l.seed!.ours, l.seed!.theirs, t.venue[l.seed!.venue]);
    q("[data-t5-b-tip]")!.textContent = l.kind === "campaign" ? t.levels[l.id].tip : `${t.rewriteGoal(l.seed!.goal, l.seed!.ours, l.seed!.theirs)}. ${t.levels[l.seed!.template]?.tip ?? ""}`;
    const img = q<HTMLImageElement>("[data-t5-b-mascot]")!;
    img.src = `${root.dataset.mascots}${l.opponent}.webp`;
    img.alt = op.name;
    q("[data-t5-b-opp]")!.textContent = t.defendedBy(op.name, op.club);
    q("[data-t5-b-tier]")!.textContent = t.tiers[l.tier];
    q("[data-t5-b-tier]")!.dataset.tier = String(l.tier);
    q("[data-t5-b-meta]")!.textContent = `${t.players(l.slots.length)} · ${t.seconds(l.seconds)}`;
    const got = save.stars[l.id] ?? 0;
    const objs = [t.goalStar, objectiveText(l, 0), objectiveText(l, 1)];
    q("[data-t5-b-objs]")!.innerHTML = "";
    objs.forEach((txt, i) => {
      const li = document.createElement("li");
      li.dataset.got = String(got > i);
      li.innerHTML = `<b>${got > i ? "★" : "☆"}</b><span></span>`;
      li.querySelector("span")!.textContent = txt;
      q("[data-t5-b-objs]")!.appendChild(li);
    });
    const squad = q("[data-t5-b-squad]")!;
    squad.innerHTML = "";
    for (const s of l.slots) {
      const d = document.createElement("span");
      d.innerHTML = `<img alt="" width="40" height="40"><b></b>`;
      d.querySelector("img")!.src = `${root.dataset.heads}${s.num}.webp`;
      d.querySelector("b")!.textContent = `#${s.num} ${nameOf(s.num)}`;
      squad.appendChild(d);
    }
    setMode("brief");
    root.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  q("[data-t5-b-back]")!.addEventListener("click", () => {
    audio.click();
    refreshMenu();
    setMode("menu");
  });
  q("[data-t5-b-go]")!.addEventListener("click", () => {
    audio.unlock();
    audio.click();
    audio.startMusic();
    openStudio(level);
  });

  // ------------------------------------------------------------------ studio
  const n = () => steps(level);
  const rebuild = () => {
    const b = buildRecording(level, tracks);
    rec = b.rec;
    recSim = b.sim;
  };
  const persist = () => {
    if (tracks.some(Boolean)) save.wip[level.id] = saveString(level.id, tracks, n());
    else delete save.wip[level.id];
    store(save);
  };
  const openStudio = (l: Level) => {
    level = l;
    tracks = l.slots.map(() => null);
    undoStack = [];
    takes = 0;
    const wip = save.wip[l.id];
    if (wip) {
      try {
        const got = loadString(wip);
        if (got.levelId === l.id && got.steps === steps(l) && got.tracks.length === l.slots.length) {
          tracks = got.tracks;
          takes = tracks.filter(Boolean).length;
        }
      } catch {
        delete save.wip[l.id];
      }
    }
    selected = firstEmpty();
    cursor = 0;
    completeShown = false;
    renderer.setCast(
      l.slots.map((s) => s.num),
      l.opponent,
      OPPONENTS[l.opponent as OpponentSlug].color,
    );
    renderer.clearFx();
    rebuild();
    buildTrackList();
    q("[data-t5-s-title]")!.textContent = titleOf(l);
    q("[data-t5-complete]")!.hidden = true;
    q("[data-t5-watchbar]")!.hidden = true;
    setStatus(takes ? outcomeLine() : t.firstHint);
    setPhase("idle");
    setMode("studio");
    refreshStudio();
    if (!coarse) requestAnimationFrame(() => root.scrollIntoView({ block: "start" }));
  };
  const firstEmpty = () => {
    const i = tracks.findIndex((x) => !x);
    return i >= 0 ? i : 0;
  };
  const setStatus = (s: string, bad = false) => {
    status = s;
    statusBad = bad;
    const el = q("[data-t5-status]")!;
    el.textContent = s;
    el.dataset.bad = String(bad);
  };
  const outcomeLine = (): string => {
    const parts: string[] = [];
    if (rec.outcome) parts.push(rec.outcome === "goal" ? t.outcomes.goal : `${t.outcomes[rec.outcome]} · ${fmt(rec.endStep * STEP)} s`);
    for (const p of recSim.paradoxes) parts.push(t.paradox(nameOf(level.slots[p.slot].num), p.what));
    return parts.join(" · ");
  };

  const buildTrackList = () => {
    const list = q("[data-t5-tracks]")!;
    list.innerHTML = "";
    level.slots.forEach((s, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "t5-track";
      b.dataset.t5Slot = String(i);
      b.innerHTML = `<img alt="" width="36" height="36"><span class="t5-tn"><b></b><small></small></span><em data-t5-tstate></em>`;
      b.querySelector("img")!.src = `${root.dataset.heads}${s.num}.webp`;
      b.querySelector("b")!.textContent = `#${s.num} ${nameOf(s.num)}`;
      b.querySelector("small")!.textContent = koOf(s.num);
      b.addEventListener("click", () => {
        if (phase !== "idle" && phase !== "play") return;
        audio.click();
        select(i);
      });
      list.appendChild(b);
    });
  };
  const select = (i: number) => {
    selected = Math.max(0, Math.min(level.slots.length - 1, i));
    refreshStudio();
  };
  const refreshStudio = () => {
    const bad = new Set(recSim.paradoxes.map((p) => p.slot));
    for (const b of qa<HTMLButtonElement>("[data-t5-slot]")) {
      const i = Number(b.dataset.t5Slot);
      b.setAttribute("aria-pressed", String(i === selected));
      const st = b.querySelector<HTMLElement>("[data-t5-tstate]")!;
      const has = !!tracks[i];
      st.textContent = bad.has(i) ? `⚠ ${t.paradoxTag}` : has ? `● ${t.recorded}` : `○ ${t.empty}`;
      st.dataset.state = bad.has(i) ? "paradox" : has ? "rec" : "empty";
      b.disabled = phase === "countdown" || phase === "record";
    }
    const scrub = q<HTMLInputElement>("[data-t5-scrub]")!;
    scrub.max = String(rec.last);
    scrub.value = String(cursor);
    const canPunch = !!tracks[selected] && cursor > 0 && cursor < n() - 30;
    const punch = q<HTMLButtonElement>("[data-t5-punch]")!;
    punch.disabled = !canPunch;
    punch.querySelector("span")!.textContent = t.punchIn(fmt(cursor * STEP));
    q<HTMLButtonElement>("[data-t5-undo]")!.disabled = !undoStack.length;
    q<HTMLButtonElement>("[data-t5-clear]")!.disabled = !tracks[selected];
    q<HTMLButtonElement>("[data-t5-play]")!.querySelector("span")!.textContent = phase === "play" ? t.pause : t.play;
    q("[data-t5-play]")!.dataset.playing = String(phase === "play");
    q<HTMLButtonElement>("[data-t5-slow]")!.setAttribute("aria-pressed", String(save.slow));
    q<HTMLButtonElement>("[data-t5-routes]")!.setAttribute("aria-pressed", String(save.routes));
    q("[data-t5-takes]")!.textContent = t.takesN(takes);
    const who = level.slots[selected];
    q("[data-t5-rec-who]")!.textContent = `#${who.num} ${nameOf(who.num)}`;
    q<HTMLButtonElement>("[data-t5-coach]")!.hidden = !(qaMode || takes >= 5 || (save.stars[level.id] ?? 0) > 0);
    const mute = q<HTMLButtonElement>("[data-t5-mute]")!;
    mute.setAttribute("aria-pressed", String(!audio.muted));
    mute.textContent = audio.muted ? "🔇" : "🔊";
  };

  // ------------------------------------------------------------------ recording
  const startTake = (punch: boolean) => {
    if (mode !== "studio" || (phase !== "idle" && phase !== "play")) return;
    audio.unlock();
    liveSlot = selected;
    const old = tracks[liveSlot];
    punchFrom = punch && old ? Math.max(1, Math.min(cursor, n() - 30)) : 0;
    live = new TakeSim(level, tracks, liveSlot, punchFrom ? { track: old!, fromStep: punchFrom } : undefined);
    // punch-in: jump to a little before the punch point so the player sees the run-up
    const pre = Math.max(0, punchFrom - Math.round(PREROLL / STEP));
    while (live.step < pre && !live.done) live.advance();
    renderer.clearFx();
    q("[data-t5-complete]")!.hidden = true;
    charge = null;
    releases.length = 0;
    countEnd = performance.now() + COUNT_BEAT * 3 * 1000;
    lastBeat = -1;
    acc = 0;
    setPhase("countdown");
    setStatus(`${t.takeLabel(takes + 1)} · #${level.slots[liveSlot].num} ${nameOf(level.slots[liveSlot].num)}`);
    refreshStudio();
  };
  const finishTake = (keep: boolean) => {
    if (!live) return;
    const slot = liveSlot;
    const recorded = live.recorded;
    live = null;
    charge = null;
    scripted = null;
    q("[data-t5-count]")!.textContent = "";
    if (keep && recorded) {
      undoStack.push(tracks.slice());
      if (undoStack.length > 40) undoStack.shift();
      tracks = tracks.slice();
      tracks[slot] = recorded;
      takes++;
      rebuild();
      persist();
      const line = outcomeLine();
      setStatus(`${t.takeKept(nameOf(level.slots[slot].num))}${line ? " · " + line : ""}`, recSim.paradoxes.length > 0 || (rec.outcome !== null && rec.outcome !== "goal"));
      if (rec.outcome === "goal") onGoal();
      else if (tracks[slot] && !tracks.every(Boolean)) selected = nextEmpty(slot);
    } else setStatus(t.takeDiscarded);
    cursor = 0;
    renderer.clearFx();
    setPhase("idle");
    refreshStudio();
  };
  const nextEmpty = (from: number) => {
    for (let k = 1; k <= tracks.length; k++) {
      const i = (from + k) % tracks.length;
      if (!tracks[i]) return i;
    }
    return from;
  };

  // ------------------------------------------------------------------ results
  const onGoal = () => {
    const stars = starsFor(level, recSim);
    const got = stars.filter(Boolean).length;
    const prev = save.stars[level.id] ?? 0;
    save.stars[level.id] = Math.max(prev, got);
    const tGoal = recSim.stats.goalStep * STEP;
    const prevBest = save.best[level.id];
    const newBest = prevBest === undefined || tGoal < prevBest - 1e-6;
    if (newBest) save.best[level.id] = Math.round(tGoal * 100) / 100;
    store(save);
    audio.levelUp();
    const box = q("[data-t5-complete]")!;
    q("[data-t5-c-stars]")!.innerHTML = stars.map((s) => `<i data-on="${s}">★</i>`).join("");
    const objs = [t.goalStar, objectiveText(level, 0), objectiveText(level, 1)];
    q("[data-t5-c-objs]")!.innerHTML = "";
    objs.forEach((txt, i) => {
      const li = document.createElement("li");
      li.dataset.got = String(stars[i]);
      li.innerHTML = `<b>${stars[i] ? "✓" : "✗"}</b><span></span>`;
      li.querySelector("span")!.textContent = txt;
      q("[data-t5-c-objs]")!.appendChild(li);
    });
    q("[data-t5-c-stats]")!.textContent = [t.goalAt(tGoal.toFixed(2)), t.passesN(recSim.stats.passes), t.takesN(takes)].join(" · ");
    q("[data-t5-c-best]")!.hidden = !(newBest && prevBest !== undefined);
    const next = nextLevel();
    q<HTMLButtonElement>("[data-t5-c-next]")!.hidden = !next;
    q("[data-t5-c-share-msg]")!.textContent = "";
    box.hidden = false;
    completeShown = true;
    root.dispatchEvent(new CustomEvent("t5:goal", { detail: { level: level.id, stars: got } }));
  };
  const nextLevel = (): Level | null => {
    const list = level.kind === "campaign" ? campaign : rewrites;
    const i = list.indexOf(level);
    const nx = i >= 0 ? list[i + 1] : undefined;
    return nx && unlocked(nx) ? nx : null;
  };
  q("[data-t5-c-close]")!.addEventListener("click", () => {
    audio.click();
    q("[data-t5-complete]")!.hidden = true;
  });
  q("[data-t5-c-replay]")!.addEventListener("click", () => {
    audio.click();
    q("[data-t5-complete]")!.hidden = true;
    cursor = 0;
    play();
  });
  q("[data-t5-c-next]")!.addEventListener("click", () => {
    const nx = nextLevel();
    audio.click();
    if (nx) openBrief(nx);
  });
  q("[data-t5-c-share]")!.addEventListener("click", () => void share());

  const shareUrl = async (): Promise<string> => {
    const code = await encodeShare(level.id, tracks, n());
    return `${location.origin}${location.pathname}#w=${code}`;
  };
  const share = async () => {
    audio.click();
    const msg = q("[data-t5-c-share-msg]")!;
    try {
      const url = await shareUrl();
      const text = t.shareText(titleOf(level));
      if (navigator.share && coarse) {
        await navigator.share({ title: "Take Five", text, url }).catch(() => undefined);
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      msg.textContent = t.copied;
    } catch {
      msg.textContent = t.shareFail;
    }
  };

  // ------------------------------------------------------------------ playback and watch mode
  const play = () => {
    if (phase === "play") {
      setPhase("idle");
      refreshStudio();
      return;
    }
    if (phase !== "idle") return;
    if (cursor >= rec.last) cursor = 0;
    renderer.clearFx();
    acc = 0;
    setPhase("play");
    refreshStudio();
  };
  const openWatch = (l: Level, trk: (Track | null)[], kind: "share" | "coach") => {
    level = l;
    watchKind = kind;
    watchTracks = trk;
    renderer.setCast(
      l.slots.map((s) => s.num),
      l.opponent,
      OPPONENTS[l.opponent as OpponentSlug].color,
    );
    const b = buildRecording(l, trk);
    rec = b.rec;
    recSim = b.sim;
    cursor = 0;
    selected = 0;
    tracks = trk;
    buildTrackList();
    q("[data-t5-s-title]")!.textContent = titleOf(l);
    q("[data-t5-w-title]")!.textContent = kind === "coach" ? t.coachTitle : t.watchTitle;
    q("[data-t5-w-sub]")!.textContent = t.watchLevel(titleOf(l));
    q("[data-t5-watchbar]")!.hidden = false;
    q("[data-t5-complete]")!.hidden = true;
    q<HTMLButtonElement>("[data-t5-w-try]")!.hidden = kind === "coach";
    q<HTMLButtonElement>("[data-t5-w-back]")!.hidden = kind !== "coach";
    setStatus(outcomeLine());
    renderer.clearFx();
    setMode("watch");
    setPhase("play");
    acc = 0;
  };
  q("[data-t5-w-again]")!.addEventListener("click", () => {
    audio.unlock();
    audio.click();
    cursor = 0;
    renderer.clearFx();
    setPhase("play");
  });
  q("[data-t5-w-try]")!.addEventListener("click", () => {
    audio.click();
    history.replaceState(null, "", location.pathname + location.search);
    openBrief(level);
  });
  q("[data-t5-w-back]")!.addEventListener("click", () => {
    audio.click();
    openStudioKeep();
  });
  q("[data-t5-w-menu]")!.addEventListener("click", () => {
    audio.click();
    history.replaceState(null, "", location.pathname + location.search);
    refreshMenu();
    setMode("menu");
  });
  // back to the studio from the coach's take, with the player's own takes intact
  let keepTracks: (Track | null)[] | null = null;
  let keepUndo: (Track | null)[][] = [];
  let keepTakes = 0;
  const openStudioKeep = () => {
    q("[data-t5-watchbar]")!.hidden = true;
    tracks = keepTracks ?? level.slots.map(() => null);
    undoStack = keepUndo;
    takes = keepTakes;
    rebuild();
    cursor = 0;
    renderer.clearFx();
    setStatus(takes ? outcomeLine() : t.firstHint);
    setPhase("idle");
    setMode("studio");
    refreshStudio();
  };
  q("[data-t5-coach]")!.addEventListener("click", () => {
    audio.click();
    keepTracks = tracks;
    keepUndo = undoStack;
    keepTakes = takes;
    openWatch(level, recordSolution(level), "coach");
  });

  // ------------------------------------------------------------------ transport
  q("[data-t5-record]")!.addEventListener("click", () => startTake(false));
  q("[data-t5-punch]")!.addEventListener("click", () => startTake(true));
  for (const b of qa("[data-t5-keep]")) b.addEventListener("click", () => finishTake(true));
  for (const b of qa("[data-t5-discard]")) b.addEventListener("click", () => finishTake(false));
  q("[data-t5-play]")!.addEventListener("click", () => {
    audio.unlock();
    play();
  });
  q("[data-t5-undo]")!.addEventListener("click", () => undo());
  q("[data-t5-clear]")!.addEventListener("click", () => clear());
  q("[data-t5-slow]")!.addEventListener("click", () => {
    save.slow = !save.slow;
    store(save);
    audio.click();
    refreshStudio();
  });
  q("[data-t5-routes]")!.addEventListener("click", () => {
    save.routes = !save.routes;
    store(save);
    audio.click();
    refreshStudio();
  });
  q("[data-t5-mute]")!.addEventListener("click", () => {
    audio.unlock();
    audio.setMuted(!audio.muted);
    if (!audio.muted) audio.startMusic();
    refreshStudio();
  });
  q("[data-t5-s-back]")!.addEventListener("click", () => {
    audio.click();
    if (live) finishTake(false);
    if (mode === "watch" && watchKind === "coach") {
      openStudioKeep();
      return;
    }
    persist();
    refreshMenu();
    setMode("menu");
  });
  const scrub = q<HTMLInputElement>("[data-t5-scrub]")!;
  scrub.addEventListener("input", () => {
    if (phase === "countdown" || phase === "record") return;
    cursor = Number(scrub.value);
    if (phase === "play") setPhase("idle");
    renderer.clearFx();
    refreshStudio();
  });
  const undo = () => {
    if (phase !== "idle" && phase !== "play") return;
    const prev = undoStack.pop();
    if (!prev) {
      setStatus(t.nothingToUndo);
      return;
    }
    audio.click();
    tracks = prev;
    takes = Math.max(0, takes - 1);
    rebuild();
    persist();
    cursor = Math.min(cursor, rec.last);
    setPhase("idle");
    setStatus(`${t.undone}${outcomeLine() ? " · " + outcomeLine() : ""}`);
    refreshStudio();
  };
  const clear = () => {
    if ((phase !== "idle" && phase !== "play") || !tracks[selected]) return;
    audio.click();
    undoStack.push(tracks.slice());
    tracks = tracks.slice();
    tracks[selected] = null;
    rebuild();
    persist();
    cursor = 0;
    setPhase("idle");
    setStatus(t.cleared(nameOf(level.slots[selected].num)));
    refreshStudio();
  };

  // ------------------------------------------------------------------ input
  const keys = new Set<string>();
  let charge: { kind: ActKind; t0: number; src: string } | null = null;
  const releases: { kind: ActKind; charge: number }[] = [];
  const touchStick = { x: 0, y: 0, id: -1, ox: 0, oy: 0 };
  const KICK_KEYS: Record<string, ActKind> = { KeyJ: "pass", Space: "pass", KeyK: "shot", KeyL: "lob" };
  const stick = (): { x: number; y: number } => {
    if (scripted && live) {
      const s = live.step;
      return { x: scripted.moves[s * 2] / 127, y: scripted.moves[s * 2 + 1] / 127 };
    }
    let x = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
    let y = (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) - (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0);
    if (x || y) {
      const m = Math.hypot(x, y);
      return { x: x / m, y: y / m };
    }
    x = touchStick.x;
    y = touchStick.y;
    return { x, y };
  };
  const chargeNow = () => (charge ? Math.min(1, (performance.now() - charge.t0) / 1000 / CHARGE_TIME) : 0);
  const pressKick = (kind: ActKind, src: string) => {
    if (phase !== "record" || charge) return;
    charge = { kind, t0: performance.now(), src };
  };
  const releaseKick = (src: string) => {
    if (!charge || charge.src !== src) return;
    const c = chargeNow();
    const kind = charge.kind;
    charge = null;
    if (phase === "record") releases.push({ kind, charge: c });
  };
  const typing = (e: Event) => {
    const el = e.target as HTMLElement | null;
    return !!el && ((el.tagName === "INPUT" && (el as HTMLInputElement).type !== "range") || el.tagName === "TEXTAREA" || el.isContentEditable);
  };
  window.addEventListener("keydown", (e) => {
    if (mode !== "studio" && mode !== "watch") return;
    if (typing(e)) return;
    const recording = phase === "record" || phase === "countdown";
    if (recording && (e.code.startsWith("Arrow") || e.code === "Space")) e.preventDefault();
    keys.add(e.code);
    if (recording) {
      const kind = KICK_KEYS[e.code];
      if (kind && !e.repeat) pressKick(kind, e.code);
      if (e.code === "Enter") finishTake(true);
      if (e.code === "Escape") finishTake(false);
      return;
    }
    if (mode !== "studio" || e.repeat) return;
    if (e.code === "KeyR") startTake(false);
    else if (e.code === "KeyP") startTake(true);
    else if (e.code === "Space") {
      e.preventDefault();
      play();
    } else if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") {
      e.preventDefault();
      undo();
    } else if (/^Digit[1-5]$/.test(e.code)) select(Number(e.code.slice(5)) - 1);
  });
  window.addEventListener("keyup", (e) => {
    keys.delete(e.code);
    if (KICK_KEYS[e.code]) releaseKick(e.code);
  });
  window.addEventListener("blur", () => {
    keys.clear();
    if (charge) releaseKick(charge.src);
  });

  const stickZone = q("[data-t5-stick]")!;
  const knob = q("[data-t5-knob]")!;
  const stickRadius = () => Math.max(34, stickZone.getBoundingClientRect().width * 0.3);
  stickZone.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    stickZone.setPointerCapture(e.pointerId);
    touchStick.id = e.pointerId;
    const r = stickZone.getBoundingClientRect();
    touchStick.ox = r.left + r.width / 2;
    touchStick.oy = r.top + r.height / 2;
    moveStick(e.clientX, e.clientY);
  });
  const moveStick = (cx: number, cy: number) => {
    const R = stickRadius();
    let dx = (cx - touchStick.ox) / R;
    let dy = (cy - touchStick.oy) / R;
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    // small dead zone, then full range
    const mm = Math.min(1, Math.hypot(dx, dy));
    const k = mm < 0.12 ? 0 : (mm - 0.12) / 0.88 / Math.max(mm, 1e-6);
    touchStick.x = dx * k;
    touchStick.y = dy * k;
    knob.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
  };
  stickZone.addEventListener("pointermove", (e) => {
    if (e.pointerId === touchStick.id) moveStick(e.clientX, e.clientY);
  });
  const endStick = (e: PointerEvent) => {
    if (e.pointerId !== touchStick.id) return;
    touchStick.id = -1;
    touchStick.x = 0;
    touchStick.y = 0;
    knob.style.transform = "";
  };
  stickZone.addEventListener("pointerup", endStick);
  stickZone.addEventListener("pointercancel", endStick);
  for (const b of qa<HTMLButtonElement>("[data-t5-kick]")) {
    const kind = b.dataset.t5Kick as ActKind;
    const src = `touch-${kind}`;
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      b.dataset.down = "true";
      pressKick(kind, src);
    });
    const up = () => {
      b.dataset.down = "false";
      releaseKick(src);
    };
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
    b.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  root.addEventListener("touchstart", () => (root.dataset.touch = "true"), { passive: true, once: true });
  canvas.addEventListener("pointerdown", (e) => {
    if (mode !== "studio" || (phase !== "idle" && phase !== "play")) return;
    const f = currentFrame();
    const i = renderer.hit(e.clientX, e.clientY, f);
    if (i >= 0) {
      audio.click();
      select(i);
    }
  });

  // ------------------------------------------------------------------ loop
  const gkFlags = () => level.defenders.map((d) => d.role === "gk");
  const currentFrame = (): FrameView => (live ? viewOf(live) : rec.frame(cursor, gkFlags()));
  const outcomeWord = (o: Outcome) => t.outcomes[o];
  const sfx = (events: SimEvent[]) => {
    for (const e of events) {
      if (e.type === "kick") audio.kick();
      else if (e.type === "goal") audio.goal();
      else if (e.type === "save") audio.save();
      else if (e.type === "post") audio.post();
      else if (e.type === "defball" && e.how !== "saved") audio.miss();
      else if (e.type === "paradox") audio.miss();
    }
  };
  const updateHud = () => {
    const total = level.seconds;
    const tnow = live ? live.time : cursor * STEP;
    q("[data-t5-clock]")!.textContent = `${fmt(Math.min(total, tnow))} / ${fmt(total)} s`;
    const tag = q("[data-t5-tag]")!;
    if (phase === "record" || phase === "countdown") {
      tag.textContent = live && live.beforePunch ? t.punchCountdown(fmt((punchFrom - live.step) * STEP)) : t.rec;
      tag.dataset.kind = "rec";
    } else if (phase === "play") {
      tag.textContent = t.playback;
      tag.dataset.kind = "play";
    } else {
      tag.textContent = t.takeLabel(takes + 1);
      tag.dataset.kind = "idle";
    }
    if (phase === "idle" || phase === "play") q<HTMLInputElement>("[data-t5-scrub]")!.value = String(cursor);
  };
  const frameLoop = (now: number) => {
    raf = requestAnimationFrame(frameLoop);
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    if (phase === "countdown" && live) {
      const left = (countEnd - now) / 1000;
      const beat = Math.ceil(left / COUNT_BEAT);
      if (beat !== lastBeat) {
        lastBeat = beat;
        if (beat > 0) {
          q("[data-t5-count]")!.textContent = String(beat);
          audio.click();
        }
      }
      if (left <= 0) {
        q("[data-t5-count]")!.textContent = t.go;
        audio.whistle();
        setTimeout(() => {
          if (phase === "record") q("[data-t5-count]")!.textContent = "";
        }, 450);
        setPhase("record");
        acc = 0;
      }
    }
    if (phase === "record" && live) {
      const speed = save.slow ? 0.6 : 1;
      acc += (dt * speed) / STEP;
      const whole = Math.min(8, Math.floor(acc));
      acc = Math.min(acc - whole, 2);
      let budget = whole * fast;
      while (budget-- > 0 && live && !live.done) {
        const s = stick();
        if (scripted) {
          for (const a of scripted.actions) if (a.step === live.step) live.queue({ ...a, done: false });
        } else {
          while (releases.length) {
            const r = releases.shift()!;
            live.act(r.kind, r.charge, s.x, s.y);
          }
        }
        live.advance(s.x, s.y);
        sfx(live.events);
        if (live.events.length) renderer.onEvents(live.events, viewOf(live), outcomeWord);
      }
      if (live && live.done) finishTake(true);
    } else if (phase === "play") {
      acc += dt / STEP;
      let k = Math.min(8, Math.floor(acc)) * fast;
      acc -= Math.floor(acc);
      while (k-- > 0 && cursor < rec.last) {
        cursor++;
        const ev = rec.events[cursor];
        if (ev.length) {
          sfx(ev);
          renderer.onEvents(ev, rec.frame(cursor, gkFlags()), outcomeWord);
        }
      }
      if (cursor >= rec.last) {
        setPhase("idle");
        refreshStudio();
      }
    }
    let aim: Aim | null = null;
    if (live && phase === "record" && charge) {
      const s = stick();
      const p = live.preview(charge.kind, chargeNow(), s.x, s.y);
      aim = { kind: charge.kind, charge: chargeNow(), x: p.x, y: p.y, h: p.h, snap: p.snap };
    }
    const f = currentFrame();
    const paths = live ? live.paths : recSim.paths;
    renderer.draw({
      frame: f,
      paths,
      tracks: live ? live.tracks : tracks,
      selected,
      live: live ? liveSlot : null,
      aim,
      paradoxes: live ? live.paradoxes : recSim.paradoxes,
      showRoutes: save.routes,
      dim: phase === "countdown",
    });
    updateHud();
  };
  const startLoop = () => {
    if (!raf) {
      lastT = performance.now();
      raf = requestAnimationFrame(frameLoop);
    }
  };
  const stopLoop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  new ResizeObserver(() => renderer.resize()).observe(canvas);
  document.addEventListener("visibilitychange", () => {
    audio.suspend(document.hidden);
    if (document.hidden && live) finishTake(false);
  });

  // ------------------------------------------------------------------ boot
  const boot = async () => {
    refreshMenu();
    const hash = location.hash;
    if (hash.startsWith("#w=")) {
      try {
        const got = await decodeShare(hash.slice(3));
        const l = byId.get(got.levelId);
        if (!l || got.steps !== steps(l) || got.tracks.length !== l.slots.length) throw new Error("level");
        openWatch(l, got.tracks, "share");
        if (!coarse) requestAnimationFrame(() => root.scrollIntoView({ block: "start" }));
        return;
      } catch {
        setMode("menu");
        const err = q("[data-t5-err]")!;
        err.textContent = t.badLink;
        err.hidden = false;
        return;
      }
    }
    setMode("menu");
  };
  void boot();

  // ------------------------------------------------------------------ QA hooks
  const api = {
    state: () => ({
      mode,
      phase,
      level: level.id,
      selected,
      takes,
      tracks: tracks.map((x) => !!x),
      outcome: rec?.outcome ?? null,
      endStep: rec?.endStep ?? -1,
      paradoxes: recSim?.paradoxes.length ?? 0,
      stars: recSim ? starsFor(level, recSim) : null,
      saved: save.stars,
      status,
      statusBad,
      cursor,
      completeShown,
      liveStep: live?.step ?? -1,
      watchKind: watchTracks ? watchKind : null,
    }),
    levels: () => [...byId.keys()],
    open: (id: string) => {
      const l = byId.get(id);
      if (l) openStudio(l);
      return !!l;
    },
    brief: (id: string) => {
      const l = byId.get(id);
      if (l) openBrief(l);
      return !!l;
    },
    select,
    record: (punch = false) => startTake(punch),
    keep: () => finishTake(true),
    discard: () => finishTake(false),
    undo,
    clear,
    play,
    setCursor: (s: number) => {
      cursor = Math.max(0, Math.min(s, rec.last));
      refreshStudio();
    },
    fast: (k: number) => (fast = Math.max(1, k)),
    /** Record solution entry i through the live UI path with scripted input. */
    scriptTake: (i: number) => {
      const st = level.solution[i];
      if (!st) return false;
      select(st.slot);
      scripted = scriptToTrack(level, st);
      startTake(false);
      countEnd = performance.now();
      return true;
    },
    stopScript: () => (scripted = null),
    shareUrl,
    unlockAll: () => {
      for (const l of campaign) save.stars[l.id] = Math.max(1, save.stars[l.id] ?? 0);
      store(save);
      refreshMenu();
    },
    resetSave: () => {
      localStorage.removeItem(SAVE_KEY);
      Object.assign(save, loadSave());
      refreshMenu();
    },
  };
  if (qaMode) (window as unknown as { __t5?: typeof api }).__t5 = api;
}
