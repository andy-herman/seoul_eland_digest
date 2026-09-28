// Clap for Seoul: menus, microphone and tap input, the play loop, pause, results, calibration,
// saves and the QA hooks.
import { AI_TIER, OPPONENTS, type OpponentSlug } from "../h2h/data";
import { ClapAudio } from "./audio";
import { CHANTS, gridFor, type ChantGrid, type Cue } from "./chants";
import { songTitle, type ClubSongId } from "../lib/clubSongs";
import { DEFAULT_SONG, isSongId } from "../rhythm/songs";
import type { DetEvent } from "./detector";
import { CLAP_STRINGS, type Locale } from "./i18n";
import { ClapMatch, starsFor, type MatchEvent, type Tier } from "./match";
import { ClapRenderer } from "./render";

const SAVE_KEY = "clap-v1";
const LEAD = 0.8; // seconds between pressing kick off and the song starting

type Mode = "loading" | "menu" | "play" | "paused" | "result" | "calibrate";

interface Save {
  song: ClubSongId;
  input: "mic" | "tap";
  level: "casual" | "ultras";
  rival: OpponentSlug | "";
  sensitivity: number;
  micOffset: number | null;
  record: Partial<Record<OpponentSlug, [number, number, number]>>;
  stars: Partial<Record<OpponentSlug, number>>;
}

function loadSave(): Save {
  const base: Save = { song: DEFAULT_SONG.id, input: "mic", level: "casual", rival: "", sensitivity: 0.6, micOffset: null, record: {}, stars: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "{}");
    return { ...base, ...raw, song: isSongId(raw.song) ? raw.song : base.song, record: { ...(raw.record ?? {}) }, stars: { ...(raw.stars ?? {}) } };
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

// the squad's main scorers take turns getting the credit in the commentary
const SCORERS = ["Euller", "Park Jae-yong", "Alan Cariús", "Baek Ji-woong", "Kim Hyun", "Byeon Gyeong-jun"];

export function mountClapForSeoul(root: HTMLElement): void {
  const locale = (root.dataset.locale as Locale) ?? "en";
  const t = CLAP_STRINGS[locale];
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const qa = <T extends HTMLElement = HTMLElement>(sel: string) => [...root.querySelectorAll<T>(sel)];
  const qaMode = new URLSearchParams(location.search).has("qa");
  const coarse = matchMedia("(pointer: coarse)").matches;
  const save = loadSave();
  let grid: ChantGrid = gridFor(save.song);
  const songUrl = (g: ChantGrid) => `${root.dataset.play!}${g.song.file}`;
  const audio = new ClapAudio(songUrl(grid));
  if (save.micOffset !== null) audio.micOffset = save.micOffset;
  // taps reuse the input offset a player calibrated in Seoul Song Rhythm, if any
  try {
    const rhythm = JSON.parse(localStorage.getItem("seoul-song-v1") ?? "{}");
    if (typeof rhythm.offset === "number" && Math.abs(rhythm.offset) < 300) audio.offset = rhythm.offset / 1000;
  } catch {
    /* no rhythm save */
  }
  const canvas = q<HTMLCanvasElement>("[data-cs-canvas]")!;
  const renderer = new ClapRenderer(canvas, { rhythm: root.dataset.rhythm!, play: root.dataset.play!, mascots: root.dataset.mascots! });
  renderer.song = grid.song;
  const nextSlug = (root.dataset.nextSlug as OpponentSlug) || "gimpo-fc";
  let rival: OpponentSlug = save.rival || nextSlug;
  let mode: Mode = "loading";
  let match: ClapMatch | null = null;
  let raf = 0;
  let level = 0; // room loudness 0..1
  let loudest = -90;
  let clapsHeard = 0;
  let perfects = 0;
  let shouting = false;
  let tapShout = false;
  let usingMic = false;
  let scorerIdx = 0;
  let autoplay = false;
  let finished = false;
  let reserve = 0.03;
  const safe = { t: 0, r: 0, b: 0, l: 0 };
  // keep the canvas layout clear of the on-screen pads and of the notch and home bar
  const measure = () => {
    const c = canvas.getBoundingClientRect();
    const pad = q("[data-cs-clap]")!.getBoundingClientRect();
    const show = root.dataset.input !== "mic" && pad.height > 0 && c.height > 0;
    reserve = show ? Math.max(0, (c.bottom - pad.top) / c.height) + 0.012 : 0.03;
    const s = getComputedStyle(q("[data-cs-safe]")!);
    safe.t = parseFloat(s.paddingTop) || 0;
    safe.r = parseFloat(s.paddingRight) || 0;
    safe.b = parseFloat(s.paddingBottom) || 0;
    safe.l = parseFloat(s.paddingLeft) || 0;
  };

  const setMode = (m: Mode) => {
    mode = m;
    root.dataset.mode = m;
    for (const el of qa("[data-cs-screen]")) el.hidden = el.dataset.csScreen !== m && !(m === "paused" && el.dataset.csScreen === "play");
    q("[data-cs-screen='paused']")!.hidden = m !== "paused";
    document.documentElement.classList.toggle("cs-lock-scroll", coarse && (m === "play" || m === "paused"));
    if (m === "play" || m === "paused")
      requestAnimationFrame(() => {
        renderer.resize();
        measure();
      });
  };

  // ------------------------------------------------------------------ menu
  const refreshMenu = () => {
    for (const b of qa<HTMLButtonElement>("[data-cs-song]")) b.setAttribute("aria-checked", String(b.dataset.csSong === grid.song.id));
    for (const b of qa<HTMLButtonElement>("[data-cs-input]")) b.setAttribute("aria-checked", String(b.dataset.csInput === save.input));
    for (const b of qa<HTMLButtonElement>("[data-cs-level]")) b.setAttribute("aria-checked", String(b.dataset.csLevel === save.level));
    for (const b of qa<HTMLButtonElement>("[data-cs-rival]")) {
      b.setAttribute("aria-checked", String(b.dataset.csRival === rival));
      const rec = save.record[b.dataset.csRival as OpponentSlug];
      const el = b.querySelector<HTMLElement>("[data-cs-rec]");
      if (el) el.textContent = rec ? `${rec[0]}-${rec[1]}-${rec[2]}` : "";
      const st = b.querySelector<HTMLElement>("[data-cs-stars]");
      const n = save.stars[b.dataset.csRival as OpponentSlug] ?? 0;
      if (st) st.textContent = n ? "★".repeat(n) : "";
    }
    q<HTMLInputElement>("[data-cs-sens]")!.value = String(Math.round(save.sensitivity * 100));
    q("[data-cs-mic-row]")!.hidden = save.input !== "mic";
  };
  const pickSong = (id: string) => {
    if (!isSongId(id) || id === grid.song.id || mode === "play" || mode === "paused") return;
    grid = gridFor(id);
    save.song = id;
    store(save);
    audio.setUrl(songUrl(grid));
    renderer.song = grid.song;
    refreshMenu();
  };
  for (const b of qa<HTMLButtonElement>("[data-cs-song]")) b.addEventListener("click", () => pickSong(b.dataset.csSong!));
  for (const b of qa<HTMLButtonElement>("[data-cs-input]"))
    b.addEventListener("click", () => {
      save.input = b.dataset.csInput as Save["input"];
      store(save);
      refreshMenu();
    });
  for (const b of qa<HTMLButtonElement>("[data-cs-level]"))
    b.addEventListener("click", () => {
      save.level = b.dataset.csLevel as Save["level"];
      store(save);
      refreshMenu();
    });
  for (const b of qa<HTMLButtonElement>("[data-cs-rival]"))
    b.addEventListener("click", () => {
      rival = b.dataset.csRival as OpponentSlug;
      save.rival = rival;
      store(save);
      refreshMenu();
    });
  q<HTMLInputElement>("[data-cs-sens]")!.addEventListener("input", (e) => {
    save.sensitivity = Number((e.target as HTMLInputElement).value) / 100;
    audio.setSensitivity(save.sensitivity);
    store(save);
  });
  const note = (msg: string, bad = false) => {
    const el = q("[data-cs-note]")!;
    el.textContent = msg;
    el.dataset.bad = String(bad);
    el.hidden = !msg;
  };

  // ------------------------------------------------------------------ audio in
  const dbToLevel = (db: number) => Math.max(0, Math.min(1, (db + 62) / 50));
  audio.onDetect = (events: DetEvent[]) => {
    for (const e of events) {
      if (e.type === "level") {
        level += (dbToLevel(e.db) - level) * 0.35;
        if (mode === "play") {
          loudest = Math.max(loudest, e.db);
          if (match) match.activity(audio.songTimeOfMic(e.t), e.hot);
        }
      } else if (e.type === "clap") {
        if (mode === "calibrate") calHeard.push(e.t);
        else if (mode === "play" && match) {
          clapsHeard++;
          match.clap(audio.songTimeOfMic(e.t));
        }
      } else if (e.type === "shout") {
        shouting = e.on;
        if (mode === "play" && match) match.shout(audio.songTimeOfMic(e.t), e.on);
      }
    }
  };
  const ensureMic = async (): Promise<boolean> => {
    if (save.input !== "mic") return false;
    if (audio.mic === "on") return true;
    note(t.micAsking);
    const st = await audio.startMic(save.sensitivity);
    if (st === "on") {
      note("");
      return true;
    }
    note(st === "denied" ? t.micDenied : t.micUnsupported, true);
    save.input = "tap";
    store(save);
    refreshMenu();
    return false;
  };

  // ------------------------------------------------------------------ play
  const cueNow = (now: number): Cue | null => {
    if (!match) return null;
    // the chant being sung, or the next one while it is being called
    for (const c of match.cues) if (now < c.t1 + 0.15) return c;
    return null;
  };
  const kickOff = async () => {
    audio.unlock();
    q<HTMLButtonElement>("[data-cs-go]")!.disabled = true;
    try {
      usingMic = await ensureMic();
      if (!audio.ready) {
        const btn = q("[data-cs-go]")!;
        for (const s of qa<HTMLButtonElement>("[data-cs-song]")) s.disabled = true;
        await audio.load((f) => (btn.textContent = t.loadingSong(Math.round(f * 100)))).finally(() => {
          for (const s of qa<HTMLButtonElement>("[data-cs-song]")) s.disabled = false;
        });
      }
    } catch {
      note(t.micUnsupported, true);
    }
    q("[data-cs-go]")!.textContent = `▶ ${t.kickOff}`;
    q<HTMLButtonElement>("[data-cs-go]")!.disabled = false;
    if (!audio.ready) return;
    const op = OPPONENTS[rival];
    renderer.setRival(rival, op.color);
    match = new ClapMatch({ tier: AI_TIER[rival] as Tier, level: save.level, seed: (Date.now() & 0xffffff) ^ 0x5eed, grid });
    renderer.song = grid.song;
    clapsHeard = 0;
    perfects = 0;
    loudest = -90;
    scorerIdx = Math.floor(Math.random() * SCORERS.length);
    finished = false;
    root.dataset.input = usingMic ? "mic" : "tap";
    audio.start(0, LEAD);
    if (usingMic) audio.syncRef();
    setMode("play");
    startLoop();
    if (!coarse) requestAnimationFrame(() => root.scrollIntoView({ block: "start" }));
  };
  q("[data-cs-go]")!.addEventListener("click", () => void kickOff());

  const onMatchEvents = (events: MatchEvent[]) => {
    const op = OPPONENTS[rival];
    for (const e of events) {
      if (e.type === "judge") {
        renderer.judge(e.judgment);
        if (e.judgment === "perfect") perfects++;
      } else if (e.type === "cue") {
        const r = match!.results[match!.results.length - 1];
        for (const m of r.marks) if (m.judgment === "miss") renderer.judge("miss");
      } else if (e.type === "chance") {
        renderer.banner(e.side === "home" ? t.chanceHome : t.chanceAway(op.name), e.side === "home" ? "#ffe27a" : "#ffb3b3");
        audio.crowd("ooh");
      } else if (e.type === "goal") {
        if (e.side === "home") {
          renderer.banner(t.goalHome(SCORERS[scorerIdx++ % SCORERS.length]), "#ffe27a", true);
          renderer.goal(true);
          audio.crowd("roar");
        } else {
          renderer.banner(t.goalAway(op.name), "#ffb3b3", true);
          renderer.goal(false);
          audio.crowd("groan");
        }
      } else if (e.type === "save") {
        renderer.banner(e.side === "home" ? t.saveHome : t.saveAway, "#bfe9ff");
        audio.crowd("ooh");
      } else if (e.type === "clear") {
        renderer.banner(e.side === "home" ? t.clearHome : t.clearAway, "#ffffff");
      } else if (e.type === "whistle") {
        if (e.what === "kickoff") renderer.banner(t.kickoffLine, "#ffffff");
        else if (e.what === "half") renderer.banner(t.halfLine, "#ffffff");
        else renderer.banner(t.fullLine, "#ffe27a", true);
        audio.whistle(e.what !== "kickoff");
      }
    }
  };

  const frame = () => {
    raf = requestAnimationFrame(frame);
    const now = audio.now();
    if (mode === "play" && match) {
      if (autoplay) autoInput(now);
      match.update(now);
      onMatchEvents(match.drain());
      if (match.done && !finished && now > grid.fulltimeT + 1.2) {
        finished = true;
        audio.fadeOut(2.5);
        setTimeout(showResult, 900);
      }
    }
    if (!usingMic) level = Math.max(0, level - 0.02);
    const cue = cueNow(now);
    const called = cue && now < cue.t0;
    const beatsLeft = cue ? Math.ceil((cue.t0 - now) / ((cue.t1 - cue.t0) / 4)) : 0;
    renderer.draw(
      {
        now,
        score: match ? match.score : [0, 0],
        minute: grid.minuteAt(now),
        momentum: match ? match.momentum : 0,
        chance: match ? match.chance : null,
        cue,
        chantName: cue ? t.chants[cue.chant].name : "",
        chantHow: cue ? t.chants[cue.chant].how : "",
        callText: !cue ? "" : called ? (beatsLeft <= 4 ? `${t.next} · ${beatsLeft}` : t.next) : "♪",
        level,
        shouting: shouting || tapShout,
        rivalName: OPPONENTS[rival].name,
        homeName: "Seoul E-Land",
        mic: usingMic,
        reserve,
        safe,
      },
      t.judgments,
      { room: t.room, tap: t.tapMode },
    );
  };
  const startLoop = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  };
  const stopLoop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };

  // ------------------------------------------------------------------ tap and keyboard input
  // In microphone mode the room is the only input: a tap on the phone or a key press would also be
  // heard by the microphone and count twice.
  const tapClap = (ts: number) => {
    if (mode !== "play" || !match || usingMic) return;
    match.clap(audio.at(ts));
    clapsHeard++;
    audio.hit(1, false);
    level = Math.min(1, level + 0.25);
  };
  const tapShoutOn = (ts: number) => {
    if (mode !== "play" || !match || tapShout || usingMic) return;
    tapShout = true;
    match.shout(audio.at(ts), true);
  };
  const tapShoutOff = (ts: number) => {
    if (!tapShout) return;
    tapShout = false;
    if (match) match.shout(audio.at(ts), false);
  };
  const clapBtn = q("[data-cs-clap]")!;
  clapBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    clapBtn.dataset.down = "true";
    tapClap(e.timeStamp);
  });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) clapBtn.addEventListener(ev, () => (clapBtn.dataset.down = "false"));
  const shoutBtn = q("[data-cs-shout]")!;
  shoutBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    shoutBtn.setPointerCapture(e.pointerId);
    shoutBtn.dataset.down = "true";
    tapShoutOn(e.timeStamp);
  });
  for (const ev of ["pointerup", "pointercancel"])
    shoutBtn.addEventListener(ev, (e) => {
      shoutBtn.dataset.down = "false";
      tapShoutOff((e as PointerEvent).timeStamp);
    });
  for (const b of [clapBtn, shoutBtn]) b.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("keydown", (e) => {
    if (mode !== "play") {
      if (mode === "paused" && e.code === "Escape") resume();
      return;
    }
    if (e.code === "Space" || e.code === "KeyJ" || e.code === "KeyF") {
      e.preventDefault();
      if (!e.repeat) tapClap(e.timeStamp);
    } else if (e.code === "Enter" || e.code === "KeyS") {
      e.preventDefault();
      if (!e.repeat) tapShoutOn(e.timeStamp);
    } else if (e.code === "Escape") pause();
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Enter" || e.code === "KeyS") tapShoutOff(e.timeStamp);
  });

  // ------------------------------------------------------------------ pause
  const pause = () => {
    if (mode !== "play") return;
    audio.pause();
    setMode("paused");
  };
  const resume = () => {
    if (mode !== "paused") return;
    void audio.resume();
    setMode("play");
  };
  const quit = () => {
    audio.stop();
    stopLoop();
    match = null;
    refreshMenu();
    setMode("menu");
  };
  q("[data-cs-pause]")!.addEventListener("click", pause);
  q("[data-cs-resume]")!.addEventListener("click", resume);
  q("[data-cs-quit]")!.addEventListener("click", quit);
  q("[data-cs-restart]")!.addEventListener("click", () => {
    audio.stop();
    void audio.resume().then(() => void kickOff());
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });

  // ------------------------------------------------------------------ result
  const showResult = () => {
    if (!match) return;
    stopLoop();
    const [a, b] = match.score;
    const op = OPPONENTS[rival];
    const outcome = a > b ? 0 : a === b ? 1 : 2;
    const rec = save.record[rival] ?? [0, 0, 0];
    rec[outcome]++;
    save.record[rival] = rec;
    const stars = starsFor(match);
    const n = stars.filter(Boolean).length;
    save.stars[rival] = Math.max(save.stars[rival] ?? 0, n);
    store(save);
    q("[data-cs-r-title]")!.textContent = outcome === 0 ? t.resultWin : outcome === 1 ? t.resultDraw : t.resultLoss;
    q("[data-cs-r-score]")!.textContent = t.resultText(a, b, op.name);
    q<HTMLImageElement>("[data-cs-r-mascot]")!.src = `${root.dataset.play}${outcome === 0 ? "leoul-celebrate" : outcome === 1 ? "lenyang-ready" : "leoul-sad"}.webp`;
    q<HTMLImageElement>("[data-cs-r-rival]")!.src = `${root.dataset.mascots}${rival}.webp`;
    // speakers leaking into the microphone this much drown shouts: say how to fix it
    const bl = audio.bleedInfo;
    q("[data-cs-r-bleed]")!.hidden = !(usingMic && bl && Math.max(bl.voice, bl.high) > 0.03);
    q("[data-cs-r-acc]")!.textContent = `${Math.round(match.accuracy * 100)}%`;
    q("[data-cs-r-claps]")!.textContent = String(clapsHeard);
    q("[data-cs-r-perfect]")!.textContent = String(perfects);
    q("[data-cs-r-loud]")!.textContent = usingMic && loudest > -89 ? `${Math.round(loudest)} dBFS` : "-";
    q("[data-cs-r-stars]")!.innerHTML = stars.map((s, i) => `<li data-on="${s}"><b>${s ? "★" : "☆"}</b> ${t.stars[i]}</li>`).join("");
    q("[data-cs-r-record]")!.textContent = t.record(rec[0], rec[1], rec[2]);
    q("[data-cs-r-song]")!.textContent = `♪ ${songTitle(grid.song, locale)}`;
    setMode("result");
    root.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  q("[data-cs-again]")!.addEventListener("click", () => void kickOff());
  q("[data-cs-menu]")!.addEventListener("click", () => {
    audio.stop();
    refreshMenu();
    setMode("menu");
  });

  // ------------------------------------------------------------------ calibration
  let calClicks: number[] = [];
  const calHeard: number[] = [];
  q("[data-cs-cal]")!.addEventListener("click", async () => {
    audio.unlock();
    setMode("calibrate");
    q("[data-cs-cal-res]")!.textContent = "";
    await ensureMic();
  });
  q("[data-cs-cal-start]")!.addEventListener("click", () => {
    audio.unlock();
    calHeard.length = 0;
    calClicks = audio.metronome(8, 100, 0.8);
    const end = calClicks[calClicks.length - 1] ?? 0;
    const wait = Math.max(1000, (end - (audio.ctx?.currentTime ?? 0) + 0.8) * 1000);
    q("[data-cs-cal-res]")!.textContent = "…";
    setTimeout(() => {
      const c = audio.ctx as (AudioContext & { outputLatency?: number }) | null;
      const out = c ? c.outputLatency || c.baseLatency || 0 : 0;
      const offs: number[] = [];
      for (const h of calHeard) {
        let best = Infinity;
        for (const k of calClicks) if (Math.abs(h - k - out) < Math.abs(best)) best = h - k - out;
        if (Math.abs(best) < 0.35) offs.push(best);
      }
      if (offs.length < 3) {
        q("[data-cs-cal-res]")!.textContent = t.calNone;
        return;
      }
      offs.sort((x, y) => x - y);
      const med = offs[Math.floor(offs.length / 2)];
      // what is left after the reported input latency is our correction
      audio.micOffset = Math.max(-0.1, Math.min(0.4, med - audio.inputDelay));
      save.micOffset = audio.micOffset;
      store(save);
      audio.syncRef();
      q("[data-cs-cal-res]")!.textContent = t.calResult(Math.round(med * 1000));
    }, wait);
  });
  q("[data-cs-cal-back]")!.addEventListener("click", () => {
    refreshMenu();
    setMode("menu");
  });

  // ------------------------------------------------------------------ QA: perfect inputs fed through the match
  let autoDone = new Set<number>();
  const autoInput = (now: number) => {
    if (!match) return;
    for (const cue of match.cues) {
      if (cue.t1 < now - 1 || cue.t0 > now + 0.2) continue;
      const def = CHANTS[cue.chant];
      const times = def.roll ? Array.from({ length: 13 }, (_, k) => cue.t0 + ((k + 0.5) / 13) * (cue.t1 - cue.t0)) : cue.claps;
      times.forEach((ct, k) => {
        const id = cue.i * 100 + k;
        if (now >= ct && !autoDone.has(id)) {
          autoDone.add(id);
          match!.clap(ct); // judged (and counted) like any other clap
          clapsHeard++;
        }
      });
      cue.shouts.forEach((s, k) => {
        const id = cue.i * 100 + 50 + k;
        if (now >= s.t0 && !autoDone.has(id)) {
          autoDone.add(id);
          match!.shout(s.t0, true);
          match!.shout(s.t0 + (s.t1 - s.t0) * 0.9, false);
        }
      });
    }
  };

  // ------------------------------------------------------------------ boot
  new ResizeObserver(() => {
    renderer.resize();
    measure();
  }).observe(canvas);
  refreshMenu();
  setMode("menu");
  if (qaMode) {
    const api = {
      state: () => ({ mode, score: match?.score ?? null, momentum: match?.momentum ?? 0, results: match?.results.length ?? 0, accuracy: match?.accuracy ?? 0, now: audio.now(), mic: audio.mic, input: root.dataset.input, micBlocks: audio.heardBlocks, clapsHeard, level }),
      autoplay: (on = true) => {
        autoplay = on;
        autoDone = new Set();
      },
      kickOff,
      pause,
      resume,
      quit,
      /** Jump the song (and so the match clock) forward, for quick QA runs. */
      seek: (sec: number) => {
        if (!match) return;
        audio.start(sec, 0);
        audio.syncRef();
      },
      bleed: () => audio.bleedInfo,
      bleedMic: async (db: number, alignMs = 0, useRef = true) => {
        audio.unlock();
        if (!audio.ready) await audio.load();
        save.input = "mic";
        const st = await audio.startBleedInput(db, save.sensitivity, alignMs, useRef);
        refreshMenu();
        return st;
      },
      finish: () => {
        if (!match) return;
        match.update(grid.fulltimeT + 5);
        onMatchEvents(match.drain());
        finished = true;
        showResult();
      },
      get kickoffTime() {
        return grid.kickoffT;
      },
      get fulltimeTime() {
        return grid.fulltimeT;
      },
      song: (id?: string) => {
        if (id) pickSong(id);
        return grid.song.id;
      },
      cues: () => (match ? match.cues.map((c) => ({ chant: c.chant, t0: c.t0, t1: c.t1, claps: c.claps, shouts: c.shouts })) : []),
      fileMic: async (url: string) => {
        audio.unlock();
        save.input = "mic";
        refreshMenu();
        return audio.startFileInput(url, save.sensitivity);
      },
    };
    (window as unknown as { __clap?: typeof api }).__clap = api;
  }
}
