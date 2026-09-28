// Mascot Kart page controller: menus, Grand Prix / quick race / time trial flows, the race loop
// (fixed 60 Hz simulation, interpolated rendering), HUD, minimap, audio, save data and QA hooks.
// QA hook: add ?qa to expose window.__kart.
import { OPPONENTS, type OpponentSlug } from "../dash/data";
import { KartAudio } from "./audio";
import { buildGrid, CUP_POINTS, CUPS, HERO_INFO, racerColor, type CupId, type Hero } from "./data";
import { KART_STRINGS, type Locale } from "./i18n";
import { KartControls } from "./input";
import { KartRenderer } from "./render";
import { NO_INPUT, Race } from "./sim";
import { THEMES } from "./theme";
import { buildTrack, type Track } from "./track";
import { TRACKS } from "./tracks";
import { KART_STEP, type Difficulty, type Inputs, type ItemKind, type Kart, type Mode, type RaceEvent, type RacerSpec } from "./types";

const SAVE_KEY = "kart-save-v1";
const ICON: Record<ItemKind, string> = { booster: "🚀", ball: "⚽", balloon: "🎈", banana: "🍌", gloves: "🧤", magnet: "🧲", redcard: "🟥", roar: "📣" };
const ICONS = Object.values(ICON);
const CONFETTI = ["#ffd64a", "#ffffff", "#1b2446", "#f97316", "#38bdf8", "#f472b6"];

type Screen = "loading" | "menu" | "driver" | "cup" | "track" | "result" | "podium";
type Flow = "gp" | "quick" | "tt";
type Trophy = "gold" | "silver" | "bronze";

interface Save {
  mode: Mode;
  diff: Difficulty;
  hero: Hero;
  trophies: Record<string, Trophy>;
  records: Record<string, { total: number; lap: number; ghost?: string }>;
}

interface Gp {
  cup: CupId;
  race: number; // 0-based index of the race being run or just finished
  points: Record<string, number>;
}

interface RaceSetup {
  track: string;
  flow: Flow;
  racers: RacerSpec[];
}

function loadSave(): Save {
  const base: Save = { mode: "item", diff: "rookie", hero: "leoul", trophies: {}, records: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "{}");
    return { ...base, ...raw, trophies: raw.trophies ?? {}, records: raw.records ?? {} };
  } catch {
    return base;
  }
}

function store(save: Save): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // private mode or full storage
  }
}

function fmt(t: number): string {
  if (!Number.isFinite(t)) return "--:--.--";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const TROPHY_ICON: Record<Trophy, string> = { gold: "🥇", silver: "🥈", bronze: "🥉" };
const TROPHY_RANK: Record<Trophy, number> = { gold: 3, silver: 2, bronze: 1 };

// Ghosts are stored as quantised x, y, z, heading at 20 Hz.
function encodeGhost(frames: number[][]): string {
  return frames.map((f) => [Math.round(f[0] * 20), Math.round(f[1] * 20), Math.round(f[2] * 20), Math.round(f[3] * 100)].join(",")).join(";");
}
function decodeGhost(s: string): number[][] {
  return s.split(";").map((row) => {
    const v = row.split(",").map(Number);
    return [v[0] / 20, v[1] / 20, v[2] / 20, v[3] / 100];
  });
}

export function mountMascotKart(root: HTMLElement): void {
  const locale = (root.dataset.locale as Locale) ?? "en";
  const t = KART_STRINGS[locale];
  const assets = root.dataset.assets ?? "/play/kart/";
  const playAssets = root.dataset.play ?? "/play/";
  const audio = new KartAudio(root.dataset.music ?? "");
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const qa = <T extends HTMLElement = HTMLElement>(sel: string) => [...root.querySelectorAll<T>(sel)];
  const canvas = q<HTMLCanvasElement>("[data-kart-canvas]")!;
  const stage = q("[data-kart-stage]")!;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const controls = new KartControls(root);
  const renderer = new KartRenderer(canvas, { pixelRatioMax: coarse ? 1.5 : 2, portrait: false });
  const save = loadSave();
  const trackCache = new Map<string, Track>();
  const trackOf = (id: string) => {
    if (!trackCache.has(id)) trackCache.set(id, buildTrack(TRACKS[id]));
    return trackCache.get(id)!;
  };
  const imgCache = new Map<string, Promise<HTMLImageElement | null>>();
  const driverImg = (id: string) => {
    if (!imgCache.has(id)) imgCache.set(id, loadImage(`${assets}drivers/${id}.webp`));
    return imgCache.get(id)!;
  };
  let kartModel: Promise<void> | null = null;

  let flow: Flow = "quick";
  let gp: Gp | null = null;
  let setup: RaceSetup | null = null;
  let race: Race | null = null;
  let ready = false;
  let paused = false;
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let finishedAt = 0; // real time the player crossed the line
  let resultShown = false;
  let autopilot = false;
  let qaPaused = false;
  let ghostRec: number[][] = [];
  let ghostPlay: number[][] | null = null;
  let toastT = 0;
  let bannerT = 0;
  let lapFlashT = 0;
  let spinT = 0;
  let slowFrames = 0;
  let prevRank = 0;
  let minimap: { img: HTMLCanvasElement; map: (x: number, z: number) => [number, number] } | null = null;

  const name = (id: string) => (id === "leoul" || id === "lenyang" ? t.drivers[id].name : OPPONENTS[id as OpponentSlug]?.name ?? id);
  const korean = (id: string) => (id === "leoul" || id === "lenyang" ? HERO_INFO[id].korean : OPPONENTS[id as OpponentSlug]?.korean ?? "");
  const club = (id: string) => (id === "leoul" || id === "lenyang" ? "Seoul E-Land FC" : OPPONENTS[id as OpponentSlug]?.club ?? "");
  const faceStyle = (el: HTMLElement, id: string) => {
    el.style.backgroundImage = `url(${assets}drivers/${id}.webp)`;
    el.style.backgroundColor = racerColor(id);
  };
  const suffix = (n: number) => (locale === "pt" ? "º" : t.ordinal(n).replace(/^\d+/, ""));

  // ---------------------------------------------------------------- screens and modes
  const setMode = (mode: "loading" | "menu" | "race" | "paused") => {
    root.dataset.mode = mode;
    const racing = mode === "race" || mode === "paused";
    q("[data-kart-screen='paused']")!.hidden = mode !== "paused";
    q("[data-kart-touch]")!.hidden = !(racing && coarse);
    controls.enabled = mode === "race";
    document.body.classList.toggle("kart-lock-scroll", racing && coarse);
    if (racing) requestAnimationFrame(resize);
  };
  const show = (screen: Screen | null) => {
    for (const el of qa("[data-kart-screen]")) {
      if (el.dataset.kartScreen === "paused") continue;
      el.hidden = el.dataset.kartScreen !== screen;
    }
    if (screen && screen !== "loading") {
      const el = q(`[data-kart-screen='${screen}']`);
      if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  };
  const resize = () => {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    renderer.portrait = h > w * 1.05;
    renderer.resize(w, h);
  };
  new ResizeObserver(resize).observe(stage);

  const menu = () => {
    flow = "quick";
    gp = null;
    stopRace();
    setMode("menu");
    show("menu");
    refreshMenu();
  };

  function refreshMenu(): void {
    for (const seg of qa("[data-kart-seg]")) {
      const key = seg.dataset.kartSeg as "mode" | "diff";
      const value = key === "mode" ? save.mode : save.diff;
      for (const b of seg.querySelectorAll<HTMLButtonElement>("button")) b.setAttribute("aria-pressed", String(b.dataset.v === value));
    }
    const mh = q("[data-kart-seg-hint='mode']");
    if (mh) mh.textContent = t.modeHints[save.mode];
    const dh = q("[data-kart-seg-hint='diff']");
    if (dh) dh.textContent = t.diffHints[save.diff];
    const music = q("[data-kart-music-menu]");
    if (music) music.dataset.off = String(!audio.musicEnabled);
    const hudMusic = q("[data-kart-music]");
    if (hudMusic) hudMusic.dataset.off = String(!audio.musicEnabled);
    for (const cup of ["seoul", "korea"] as CupId[]) {
      const el = q(`[data-kart-trophy='${cup}']`);
      const tr = save.trophies[`${cup}-${save.mode}-${save.diff}`];
      if (el) el.textContent = tr ? TROPHY_ICON[tr] : "";
    }
    for (const el of qa("[data-kart-record]")) {
      const rec = save.records[el.dataset.kartRecord!];
      el.textContent = rec ? `⏱ ${fmt(rec.total)}` : "";
    }
  }

  function drawThumbs(): void {
    for (const c of qa<HTMLCanvasElement>("[data-kart-thumb]")) {
      if (c.dataset.drawn) continue;
      const tr = trackOf(c.dataset.kartThumb!);
      const theme = THEMES[tr.def.theme];
      const g = c.getContext("2d")!;
      const grad = g.createLinearGradient(0, 0, 0, c.height);
      grad.addColorStop(0, theme.skyTop);
      grad.addColorStop(1, theme.skyHorizon);
      g.fillStyle = grad;
      g.fillRect(0, 0, c.width, c.height);
      const b = tr.bounds;
      const sc = Math.min((c.width - 12) / (b.x1 - b.x0), (c.height - 12) / (b.z1 - b.z0));
      const ox = (c.width - (b.x1 - b.x0) * sc) / 2;
      const oz = (c.height - (b.z1 - b.z0) * sc) / 2;
      const P = (x: number, z: number) => [ox + (x - b.x0) * sc, c.height - (oz + (z - b.z0) * sc)] as const;
      g.lineJoin = "round";
      for (const [w, col] of [
        [Math.max(3, 18 * sc), "#111a33"],
        [Math.max(2, 13 * sc), theme.night ? "#9fb4ff" : "#ffffff"],
      ] as [number, string][]) {
        g.beginPath();
        tr.samples.forEach((s, i) => {
          const [x, y] = P(s.x, s.z);
          if (i) g.lineTo(x, y);
          else g.moveTo(x, y);
        });
        g.closePath();
        g.lineWidth = w;
        g.strokeStyle = col;
        g.stroke();
      }
      const s0 = tr.samples[tr.startIndex];
      const [sx, sy] = P(s0.x, s0.z);
      g.fillStyle = "#f2b705";
      g.beginPath();
      g.arc(sx, sy, Math.max(3, 24 * sc), 0, Math.PI * 2);
      g.fill();
      c.dataset.drawn = "1";
    }
  }

  // ---------------------------------------------------------------- menu wiring
  for (const seg of qa("[data-kart-seg]")) {
    seg.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
      if (!b?.dataset.v) return;
      audio.unlock();
      audio.click();
      if (seg.dataset.kartSeg === "mode") save.mode = b.dataset.v as Mode;
      else save.diff = b.dataset.v as Difficulty;
      store(save);
      refreshMenu();
    });
  }
  const toggleMusic = () => {
    audio.unlock();
    audio.setMusicEnabled(!audio.musicEnabled);
    if (audio.musicEnabled) audio.startMusic();
    refreshMenu();
  };
  q("[data-kart-music-menu]")?.addEventListener("click", toggleMusic);
  q("[data-kart-music]")?.addEventListener("click", toggleMusic);
  for (const b of qa("[data-kart-go]")) {
    b.addEventListener("click", () => {
      audio.unlock();
      audio.startMusic();
      audio.click();
      flow = b.dataset.kartGo as Flow;
      show("driver");
    });
  }
  for (const b of qa("[data-kart-driver]")) {
    b.addEventListener("click", () => {
      audio.click();
      save.hero = b.dataset.kartDriver as Hero;
      store(save);
      show(flow === "gp" ? "cup" : "track");
      drawThumbs();
      refreshMenu();
    });
  }
  for (const b of qa("[data-kart-back]")) {
    b.addEventListener("click", () => {
      audio.click();
      const cur = qa("[data-kart-screen]").find((el) => !el.hidden)?.dataset.kartScreen;
      show(cur === "driver" ? "menu" : "driver");
    });
  }
  for (const b of qa("[data-kart-cup]")) b.addEventListener("click", () => startGp(b.dataset.kartCup as CupId));
  for (const b of qa("[data-kart-track]")) {
    b.addEventListener("click", () => {
      audio.click();
      const id = b.dataset.kartTrack!;
      if (flow === "tt") void startRace({ track: id, flow: "tt", racers: [{ id: save.hero, human: true }] });
      else void startRace({ track: id, flow: "quick", racers: fieldFor(id) });
    });
  }
  for (const el of qa("[data-face]")) faceStyle(el, el.dataset.face!);

  const cupOf = (track: string): CupId => (CUPS.korea.tracks.includes(track) ? "korea" : "seoul");
  const fieldFor = (track: string, order?: string[], slot = 4) => buildGrid(save.hero, CUPS[cupOf(track)].field, order, slot);

  function startGp(cup: CupId): void {
    audio.click();
    flow = "gp";
    const points: Record<string, number> = { [save.hero]: 0 };
    for (const id of CUPS[cup].field) points[id] = 0;
    gp = { cup, race: 0, points };
    void startRace({ track: CUPS[cup].tracks[0], flow: "gp", racers: fieldFor(CUPS[cup].tracks[0], undefined, 4) });
  }

  // ---------------------------------------------------------------- races
  async function startRace(s: RaceSetup): Promise<void> {
    setup = s;
    stopRace();
    setMode("loading");
    show("loading");
    resultShown = false;
    finishedAt = 0;
    const def = TRACKS[s.track];
    const track = trackOf(s.track);
    const mode: Mode = s.flow === "tt" ? "speed" : save.mode;
    race = new Race({ track: def, racers: s.racers, mode, difficulty: save.diff, seed: (Date.now() & 0xffff) + 7, timeTrial: s.flow === "tt" }, track);
    kartModel ??= renderer.loadKartModel(`${assets}kart.glb`);
    const ids = s.racers.map((r) => r.id);
    const imgs = await Promise.all(ids.map(driverImg));
    await kartModel;
    await renderer.setup(race, THEMES[def.theme] ?? THEMES.mokdong, assets, Object.fromEntries(ids.map((id, i) => [id, imgs[i]])));
    renderer.focus = race.humanIndex;
    ghostRec = [];
    ghostPlay = null;
    const rec = save.records[s.track];
    if (s.flow === "tt" && rec?.ghost) {
      ghostPlay = decodeGhost(rec.ghost);
      renderer.addGhost(await driverImg(save.hero), racerColor(save.hero));
    }
    buildMinimap(track);
    setMode("race");
    show(null);
    resetHud();
    audio.engineStart();
    audio.startMusic();
    stage.scrollIntoView({ block: coarse ? "start" : "center" });
    resize();
    ready = true;
    paused = false;
    last = performance.now();
    acc = 0;
  }

  function stopRace(): void {
    ready = false;
    audio.engineStop();
    controls.reset();
  }

  function humanInput(): Inputs {
    if (!race) return NO_INPUT;
    controls.countdown = race.state.phase === "countdown";
    const k = race.human;
    if (!k) return NO_INPUT;
    if (autopilot) {
      const brain = (race as unknown as { brains: { think: (k: Kart, s: unknown, tr: Track, m: Mode) => Inputs }[] }).brains[race.humanIndex];
      return brain.think(k, race.state, race.track, race.opts.mode);
    }
    return controls.frame();
  }

  function stepOnce(): void {
    if (!race) return;
    renderer.snapshot();
    race.step(humanInput());
    const k = race.human;
    if (k && setup?.flow === "tt" && race.state.phase === "race" && !k.finished && Math.round(race.state.time * 60) % 3 === 0) ghostRec.push([k.x, k.y, k.z, k.theta]);
    for (const e of race.drainEvents()) onEvent(e);
  }

  function onEvent(e: RaceEvent): void {
    if (!race) return;
    const me = race.humanIndex;
    switch (e.type) {
      case "countdown":
        audio.countdown(e.n);
        banner(String(e.n));
        break;
      case "go":
        audio.go();
        banner(t.go);
        break;
      case "boost":
        if (e.kart === me) {
          audio.boost(e.kind);
          const msg = t.boosts[e.kind];
          if (msg && e.kind !== "nitro" && e.kind !== "item") toast(msg, e.kind === "instant" || e.kind === "draft" ? "blue" : "");
        }
        break;
      case "gauge":
        if (e.kart === me) audio.gauge();
        break;
      case "itemGet":
        if (e.kart === me) {
          audio.itemGet();
          spinT = 0.9;
        }
        break;
      case "itemUse":
        if (e.kart === me) audio.itemUse(e.item);
        break;
      case "hit":
        if (e.kart === me) {
          audio.hit(e.what, e.blocked);
          toast(e.blocked ? t.blocked : t.hits[e.what] ?? "", e.blocked ? "blue" : "bad");
        } else if (e.by === me && !e.blocked) toast(`${t.hits[e.what] ?? ""} ${name(race.state.karts[e.kart].id)}`, "");
        break;
      case "wall":
        if (e.kart === me) audio.wall(e.power);
        break;
      case "land":
        renderer.landed(e.kart, e.power);
        if (e.kart === me) audio.land();
        break;
      case "lap":
        if (e.kart === me) {
          audio.lap(e.lap === race.laps);
          lapFlashT = 2.4;
          const el = q("[data-kh-laptime]");
          if (el) el.textContent = fmt(e.time);
        }
        break;
      case "finalLap":
        if (e.kart === me) banner(t.finalLap);
        break;
      case "finish":
        if (e.kart === me) {
          finishedAt = performance.now();
          audio.finish(e.rank <= 3);
          banner(setup?.flow === "tt" ? t.finish : `${t.ordinal(e.rank)}!`);
          bannerT = 2.6;
        }
        break;
      default:
        break;
    }
  }

  function banner(text: string): void {
    const el = q("[data-kh-banner]");
    if (!el) return;
    el.textContent = text;
    el.dataset.pop = "false";
    void el.offsetWidth;
    el.dataset.pop = "true";
    bannerT = 1.1;
  }

  function toast(text: string, kind: string): void {
    const el = q("[data-kh-toast]");
    if (!el || !text.trim()) return;
    el.textContent = text;
    el.dataset.kind = kind;
    toastT = 1.3;
  }

  function resetHud(): void {
    for (const sel of ["[data-kh-banner]", "[data-kh-toast]", "[data-kh-warn]", "[data-kh-laptime]"]) {
      const el = q(sel);
      if (el) el.textContent = "";
    }
    const gauge = q("[data-kh-gauge]");
    const items = q("[data-kh-items]");
    const speedMode = race?.opts.mode === "speed";
    if (gauge) gauge.hidden = !speedMode;
    if (items) items.hidden = speedMode;
    const of = q("[data-kh-of]");
    if (of) of.textContent = `/${race?.state.karts.length ?? 1}`;
    const rank = q("[data-kh-rank]")?.parentElement;
    if (rank) rank.hidden = setup?.flow === "tt";
    prevRank = 0;
    bannerT = toastT = lapFlashT = spinT = 0;
  }

  function buildMinimap(tr: Track): void {
    const size = 200;
    const img = document.createElement("canvas");
    img.width = img.height = size;
    const g = img.getContext("2d")!;
    const b = tr.bounds;
    const sc = (size - 20) / Math.max(b.x1 - b.x0, b.z1 - b.z0);
    const ox = (size - (b.x1 - b.x0) * sc) / 2;
    const oz = (size - (b.z1 - b.z0) * sc) / 2;
    const map = (x: number, z: number): [number, number] => [ox + (x - b.x0) * sc, size - (oz + (z - b.z0) * sc)];
    g.lineJoin = "round";
    for (const [w, col] of [
      [11, "rgba(17,26,51,.85)"],
      [6, "rgba(255,255,255,.95)"],
    ] as [number, string][]) {
      g.beginPath();
      tr.samples.forEach((s, i) => {
        const [x, y] = map(s.x, s.z);
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.closePath();
      g.lineWidth = w;
      g.strokeStyle = col;
      g.stroke();
    }
    const [sx, sy] = map(tr.samples[tr.startIndex].x, tr.samples[tr.startIndex].z);
    g.fillStyle = "#f2b705";
    g.fillRect(sx - 4, sy - 4, 8, 8);
    minimap = { img, map };
  }

  function drawMinimap(): void {
    const c = q<HTMLCanvasElement>("[data-kh-map]");
    if (!c || !minimap || !race) return;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(minimap.img, 0, 0);
    if (ghostPlay) {
      const f = ghostFrame(race.state.time);
      if (f) {
        const [x, y] = minimap.map(f[0], f[2]);
        g.fillStyle = "rgba(255,255,255,.55)";
        g.beginPath();
        g.arc(x, y, 5, 0, Math.PI * 2);
        g.fill();
      }
    }
    for (let pass = 0; pass < 2; pass++) {
      for (const k of race.state.karts) {
        if ((pass === 1) !== k.human) continue;
        const [x, y] = minimap.map(k.x, k.z);
        g.fillStyle = racerColor(k.id);
        g.strokeStyle = k.human ? "#ffd64a" : "#ffffff";
        g.lineWidth = k.human ? 3 : 1.5;
        g.beginPath();
        g.arc(x, y, k.human ? 7 : 4.5, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
    }
  }

  function ghostFrame(time: number): number[] | null {
    if (!ghostPlay || time < 0) return null;
    const f = time * 20;
    const i = Math.floor(f);
    if (i >= ghostPlay.length - 1) return null;
    const a = ghostPlay[i];
    const b = ghostPlay[i + 1];
    const u = f - i;
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u];
  }

  function updateHud(dt: number): void {
    if (!race) return;
    const st = race.state;
    const k = race.human ?? st.karts[0];
    const rankEl = q("[data-kh-rank]");
    if (rankEl && prevRank !== k.rank) {
      rankEl.textContent = String(k.rank);
      q("[data-kh-suffix]")!.textContent = suffix(k.rank);
      prevRank = k.rank;
    }
    q("[data-kh-lap]")!.textContent = `${Math.max(1, Math.min(race.laps, k.lap))}/${race.laps}`;
    q("[data-kh-time]")!.textContent = fmt(Math.max(0, k.finished ? k.finishTime : st.time));
    lapFlashT = Math.max(0, lapFlashT - dt);
    if (lapFlashT <= 0) q("[data-kh-laptime]")!.textContent = "";
    q("[data-kh-speed]")!.textContent = String(Math.round(Math.abs(k.speed) * 7.2));
    if (race.opts.mode === "speed") {
      const g = q("[data-kh-gauge]")!;
      g.style.setProperty("--g", k.gauge.toFixed(3));
      g.dataset.full = String(k.gauge > 0.97);
      for (const b of qa("[data-kh-b]")) b.dataset.on = String(Number(b.dataset.khB) < k.boosters);
    } else {
      spinT = Math.max(0, spinT - dt);
      for (const slot of qa("[data-kh-slot]")) {
        const i = Number(slot.dataset.khSlot);
        const it = k.items[i];
        const spinning = spinT > 0 && k.rouletteT > 0 && i === k.items.length - 1;
        slot.dataset.spin = String(spinning);
        slot.textContent = spinning ? ICONS[Math.floor(performance.now() / 70) % ICONS.length] : it ? ICON[it] : "";
      }
    }
    // traffic-light countdown: READY, three reds, then green at GO
    const lights = q("[data-kh-lights]")!;
    if (st.phase === "countdown" || st.time < 0.9) {
      lights.hidden = false;
      const lit = st.phase === "countdown" ? Math.max(0, Math.min(3, Math.floor(st.time + 4))) : 3;
      [...lights.children].forEach((el, i) => ((el as HTMLElement).dataset.on = st.phase === "countdown" ? (i < lit ? "red" : "") : "green"));
      if (st.time < -3 && bannerT <= 0) {
        const b = q("[data-kh-banner]")!;
        if (b.textContent !== t.ready) {
          b.textContent = t.ready;
          b.dataset.pop = "true";
        }
      }
    } else lights.hidden = true;
    q("[data-kh-hint]")!.textContent = st.phase === "countdown" ? (coarse ? t.tapStart : t.keysHint) : "";
    bannerT = Math.max(0, bannerT - dt);
    if (bannerT <= 0 && st.time > -3) q("[data-kh-banner]")!.textContent = "";
    toastT = Math.max(0, toastT - dt);
    if (toastT <= 0) q("[data-kh-toast]")!.textContent = "";
    const warn = q("[data-kh-warn]")!;
    if (!k.finished && Number.isFinite(st.retireAt) && st.phase === "race") warn.textContent = t.retireIn(Math.max(0, Math.ceil(st.retireAt - st.time)));
    else warn.textContent = k.wrongWayT > 1.2 && !k.finished ? t.wrongWay : "";
    q("[data-kh-lines]")!.dataset.on = String(k.boostT > 0.1 && k.boostKind !== "magnet" && k.boostKind !== "pad");
    audio.engineUpdate(k.speed, st.phase === "race" && !k.finished, k.boostT > 0, k.drifting, k.slip);
    drawMinimap();
  }

  // ---------------------------------------------------------------- results
  function finishRace(): void {
    if (!race || !setup || resultShown) return;
    resultShown = true;
    ready = false;
    audio.engineStop();
    const st = race.state;
    const me = race.human!;
    const rows = q("[data-kart-res-rows]")!;
    rows.innerHTML = "";
    const trackName = t.tracks[setup.track].name;
    const kicker = q("[data-kart-res-kicker]")!;
    const title = q("[data-kart-res-title]")!;
    const sub = q("[data-kart-res-sub]")!;
    const next = q<HTMLButtonElement>("[data-kart-res-next]")!;
    const retry = q<HTMLButtonElement>("[data-kart-res-retry]")!;
    const best = me.lapTimes.length ? Math.min(...me.lapTimes) : Infinity;
    if (setup.flow === "tt") {
      const rec = save.records[setup.track];
      const isRecord = Number.isFinite(me.finishTime) && (!rec || me.finishTime < rec.total);
      if (isRecord) save.records[setup.track] = { total: me.finishTime, lap: Math.min(best, rec?.lap ?? Infinity), ghost: encodeGhost(ghostRec) };
      else if (rec && best < rec.lap) rec.lap = best;
      store(save);
      kicker.textContent = trackName;
      title.textContent = isRecord ? t.newRecord : t.ttResult;
      sub.textContent = `${t.total} ${fmt(me.finishTime)} · ${t.bestLap} ${fmt(best)}${rec && !isRecord ? ` · ${t.record} ${fmt(rec.total)}` : ""}`;
      me.lapTimes.forEach((lt, i) => {
        const li = document.createElement("li");
        li.dataset.me = String(lt === best);
        li.innerHTML = `<b>${i + 1}</b><span class="kart-face"></span><span>${t.lap} ${i + 1}</span><em>${fmt(lt)}</em><i>${lt === best ? "★" : ""}</i>`;
        faceStyle(li.querySelector(".kart-face") as HTMLElement, me.id);
        rows.append(li);
      });
      next.hidden = true;
      retry.hidden = false;
    } else {
      const pts = setup.flow === "gp" && gp ? gp.points : null;
      st.order.forEach((idx, r) => {
        const k = st.karts[idx];
        const done = Number.isFinite(k.finishTime);
        const gain = done ? CUP_POINTS[r] ?? 0 : 0;
        if (pts) pts[k.id] = (pts[k.id] ?? 0) + gain;
        const li = document.createElement("li");
        li.dataset.me = String(k.human);
        li.innerHTML = `<b>${r + 1}</b><span class="kart-face"></span><span>${name(k.id)}<small>${korean(k.id)} · ${club(k.id)}</small></span><em>${done ? fmt(k.finishTime) : t.retired}</em><i>${pts ? `+${gain}` : ""}</i>`;
        faceStyle(li.querySelector(".kart-face") as HTMLElement, k.id);
        rows.append(li);
      });
      const place = Number.isFinite(me.finishTime) ? t.ordinal(me.rank) : t.retired;
      title.textContent = `${place} · ${t.results}`;
      kicker.textContent = setup.flow === "gp" && gp ? `${t.cups[gp.cup].name} · ${t.race(gp.race + 1, 4)} · ${trackName}` : trackName;
      sub.textContent = `${t.bestLap} ${fmt(best)}${pts ? ` · ${t.total} ${pts[me.id]} ${t.colPts}` : ""}`;
      if (setup.flow === "gp" && gp) {
        next.hidden = false;
        next.textContent = gp.race >= 3 ? t.cupResult : t.next;
        retry.hidden = true;
      } else {
        next.hidden = true;
        retry.hidden = false;
      }
    }
    setMode("menu");
    show("result");
  }

  q("[data-kart-res-next]")?.addEventListener("click", () => {
    audio.click();
    if (!gp || !setup) return;
    if (gp.race >= 3) return showPodium();
    gp.race += 1;
    const standings = Object.keys(gp.points).sort((a, b) => gp!.points[b] - gp!.points[a]);
    // next grid: reverse standings, so the leader starts at the back
    const grid = [...standings].reverse();
    const slot = grid.indexOf(save.hero);
    const track = CUPS[gp.cup].tracks[gp.race];
    void startRace({ track, flow: "gp", racers: fieldFor(track, grid, slot) });
  });
  q("[data-kart-res-retry]")?.addEventListener("click", () => {
    audio.click();
    if (setup) void startRace(setup.flow === "tt" ? setup : { ...setup, racers: fieldFor(setup.track) });
  });
  q("[data-kart-res-menu]")?.addEventListener("click", () => {
    audio.click();
    menu();
  });

  function showPodium(): void {
    if (!gp) return;
    const standings = Object.keys(gp.points).sort((a, b) => gp!.points[b] - gp!.points[a]);
    const place = standings.indexOf(save.hero) + 1;
    const trophy: Trophy | "none" = place === 1 ? "gold" : place === 2 ? "silver" : place === 3 ? "bronze" : "none";
    const key = `${gp.cup}-${save.mode}-${save.diff}`;
    if (trophy !== "none" && (!save.trophies[key] || TROPHY_RANK[trophy] > TROPHY_RANK[save.trophies[key]])) save.trophies[key] = trophy;
    store(save);
    const pod = q("[data-kart-screen='podium']")!;
    pod.dataset.trophy = trophy;
    q("[data-kart-pod-cup]")!.textContent = `${t.cups[gp.cup].name} · ${t.modes[save.mode]} · ${t.diffs[save.diff]}`;
    q("[data-kart-pod-title]")!.textContent = t.trophy[trophy];
    q("[data-kart-pod-text]")!.textContent = t.trophyText[trophy];
    const cupImg = q<HTMLImageElement>("[data-kart-cupimg]");
    if (cupImg) cupImg.src = `${playAssets}h2h/trophy.webp`;
    for (let i = 1; i <= 3; i++) {
      const id = standings[i - 1];
      const face = q(`[data-pod-face='${i}']`);
      if (face && id) faceStyle(face, id);
      const nm = q(`[data-pod-name='${i}']`);
      if (nm && id) nm.textContent = `${name(id)} · ${gp.points[id]}`;
    }
    const rows = q("[data-kart-pod-rows]")!;
    rows.innerHTML = "";
    standings.forEach((id, r) => {
      const li = document.createElement("li");
      li.dataset.me = String(id === save.hero);
      li.innerHTML = `<b>${r + 1}</b><span class="kart-face"></span><span>${name(id)}<small>${korean(id)} · ${club(id)}</small></span><em></em><i>${gp!.points[id]}</i>`;
      faceStyle(li.querySelector(".kart-face") as HTMLElement, id);
      rows.append(li);
    });
    const conf = q("[data-kart-confetti]")!;
    conf.innerHTML = "";
    if (trophy !== "none" && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (let i = 0; i < 60; i++) {
        const piece = document.createElement("i");
        piece.style.left = `${Math.random() * 100}%`;
        piece.style.background = CONFETTI[i % CONFETTI.length];
        piece.style.animationDuration = `${2.2 + Math.random() * 2.4}s`;
        piece.style.animationDelay = `${Math.random() * 0.8}s`;
        conf.append(piece);
      }
    }
    setMode("menu");
    show("podium");
  }
  q("[data-kart-pod-again]")?.addEventListener("click", () => gp && startGp(gp.cup));
  q("[data-kart-pod-menu]")?.addEventListener("click", () => {
    audio.click();
    menu();
  });

  // ---------------------------------------------------------------- pause
  const pause = (on: boolean) => {
    if (!race || !ready) return;
    paused = on;
    setMode(on ? "paused" : "race");
    if (on) {
      audio.engineUpdate(0, false, false, false, 0);
      controls.reset();
    }
    last = performance.now();
  };
  controls.onPause = () => pause(!paused);
  q("[data-kart-pause]")?.addEventListener("click", () => pause(true));
  q("[data-kart-resume]")?.addEventListener("click", () => pause(false));
  q("[data-kart-restart]")?.addEventListener("click", () => {
    if (!setup) return;
    if (setup.flow === "gp") void startRace(setup);
    else void startRace(setup.flow === "tt" ? setup : { ...setup, racers: fieldFor(setup.track) });
  });
  q("[data-kart-quit]")?.addEventListener("click", () => menu());
  document.addEventListener("visibilitychange", () => {
    audio.suspend(document.hidden);
    if (document.hidden && ready && !paused && race?.state.phase !== "done") pause(true);
  });

  // ---------------------------------------------------------------- loop
  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!race || !ready) return;
    if (!paused && !qaPaused) {
      const me = race.human;
      // after the player finishes, watch for a moment, then fast-forward the rest of the field
      if (me?.finished && finishedAt && now - finishedAt > 2600) {
        for (let i = 0; i < 900 && race.state.phase !== "done"; i++) stepOnce();
      }
      acc += dt;
      let n = 0;
      while (acc >= KART_STEP && n < 8) {
        stepOnce();
        acc -= KART_STEP;
        n++;
      }
      if (n >= 8) acc = 0;
      if (race.state.phase === "done") {
        if (!me?.finished || !Number.isFinite(me.finishTime)) banner(t.retired);
        finishRace();
        return;
      }
    }
    if (ghostPlay) renderer.ghostPose(ghostFrame(race.state.time));
    renderer.render(paused || qaPaused ? 1 : acc / KART_STEP, dt);
    updateHud(dt);
    // adaptive resolution for slower phones
    if (dt > 0.026) slowFrames++;
    else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 90) {
      slowFrames = 0;
      renderer.lowerQuality();
    }
  }
  raf = requestAnimationFrame(frame);

  // first screen
  setMode("menu");
  show("menu");
  refreshMenu();

  const api = {
    get race() {
      return race;
    },
    get gp() {
      return gp;
    },
    renderer,
    start: (s: { track?: string; mode?: Mode; difficulty?: Difficulty; hero?: Hero; flow?: Flow } = {}) => {
      if (s.mode) save.mode = s.mode;
      if (s.difficulty) save.diff = s.difficulty;
      if (s.hero) save.hero = s.hero;
      const track = s.track ?? "mokdong";
      const f = s.flow ?? "quick";
      flow = f;
      return startRace({ track, flow: f, racers: f === "tt" ? [{ id: save.hero, human: true }] : fieldFor(track) });
    },
    startGp: (cup: CupId = "seoul") => startGp(cup),
    pause: (on: boolean) => {
      qaPaused = on;
    },
    step: (n = 1) => {
      for (let i = 0; i < n; i++) stepOnce();
    },
    autopilot: (on: boolean) => {
      autopilot = on;
    },
    finishNow: () => {
      // QA: let the autopilot finish the race at full speed
      if (!race) return;
      autopilot = true;
      for (let i = 0; i < 60 * 600 && race.state.phase !== "done"; i++) stepOnce();
      autopilot = false;
      finishRace();
    },
    podium: () => showPodium(),
    show: (s: Screen) => show(s),
    menu,
    destroy: () => cancelAnimationFrame(raf),
  };
  if (new URLSearchParams(location.search).has("qa")) (window as unknown as { __kart?: typeof api }).__kart = api;
}
