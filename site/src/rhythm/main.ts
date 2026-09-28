// Seoul Song Rhythm: menus, play loop, pause, results, calibration, saves and the QA hooks.
import { SongAudio } from "./audio";
import { SONG_BPM, SONG_END } from "./charts";
import { type Difficulty, type Judgment, RhythmEngine, perfectInputs } from "./engine";
import { RHYTHM_STRINGS, type Locale } from "./i18n";
import { RhythmRenderer } from "./render";

const SAVE_KEY = "seoul-song-v1";
const LEAD = 2.1; // seconds of countdown before the song starts
const KEYS: Record<string, number> = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3, ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 };

interface Best {
  score: number;
  acc: number;
  grade: string;
  fc: boolean;
  ap: boolean;
}
interface Save {
  diff: Difficulty;
  speed: number;
  offset: number; // ms
  hits: boolean;
  best: Partial<Record<Difficulty, Best>>;
}
type Mode = "loading" | "menu" | "play" | "paused" | "result" | "calibrate";

function loadSave(): Save {
  const base: Save = { diff: "normal", speed: 5, offset: 0, hits: true, best: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "{}");
    return { ...base, ...raw, best: { ...(raw.best ?? {}) } };
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
const visibleFor = (speed: number) => 2.6 - 0.2 * speed;

export function mountSeoulSong(root: HTMLElement): void {
  const locale = (root.dataset.locale as Locale) ?? "en";
  const t = RHYTHM_STRINGS[locale];
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const qa = <T extends HTMLElement = HTMLElement>(sel: string) => [...root.querySelectorAll<T>(sel)];
  const canvas = q<HTMLCanvasElement>("[data-ss-canvas]")!;
  const audio = new SongAudio(root.dataset.song!);
  const renderer = new RhythmRenderer(canvas, { base: root.dataset.assets!, play: root.dataset.play! });
  const save = loadSave();
  const coarse = matchMedia("(pointer: coarse)").matches;
  const fmtInt = new Intl.NumberFormat(locale === "pt" ? "pt-BR" : "en-US");
  const fmtPct = new Intl.NumberFormat(locale === "pt" ? "pt-BR" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let mode: Mode = "loading";
  let engine: RhythmEngine | null = null;
  let diff: Difficulty = save.diff;
  let raf = 0;
  let last = performance.now();
  let autoplay = false;
  let resumeAt = 0; // perf ms when a resume countdown ends
  let finished = false;
  const queue: { lane: number; down: boolean; ts: number }[] = [];
  const pointerLane = new Map<number, number>();
  const keyDown = new Set<string>();

  const setMode = (m: Mode) => {
    mode = m;
    root.dataset.mode = m;
    for (const el of qa("[data-ss-screen]")) el.hidden = el.dataset.ssScreen !== m && !(m === "paused" && el.dataset.ssScreen === "paused");
    q("[data-ss-screen='paused']")!.hidden = m !== "paused";
    document.body.classList.toggle("ss-lock-scroll", coarse && (m === "play" || m === "paused"));
    if (m === "play" || m === "paused") requestAnimationFrame(() => renderer.resize());
  };

  // ------------------------------------------------------------------ menu
  const refreshMenu = () => {
    for (const b of qa<HTMLButtonElement>("[data-ss-diff]")) b.setAttribute("aria-checked", String(b.dataset.ssDiff === diff));
    for (const el of qa("[data-ss-best]")) {
      const b = save.best[el.dataset.ssBest as Difficulty];
      el.textContent = b ? `${t.best} ${fmtInt.format(b.score)} · ${b.grade}${b.ap ? " ★" : b.fc ? " ✓" : ""}` : t.noBest;
    }
    q("[data-ss-speed-val]")!.textContent = String(save.speed);
    q("[data-ss-offset-val]")!.textContent = `${save.offset > 0 ? "+" : ""}${save.offset} ms`;
    const hits = q<HTMLButtonElement>("[data-ss-hits]")!;
    hits.setAttribute("aria-pressed", String(save.hits));
    hits.textContent = save.hits ? t.on : t.off;
  };
  for (const b of qa<HTMLButtonElement>("[data-ss-diff]"))
    b.addEventListener("click", () => {
      diff = b.dataset.ssDiff as Difficulty;
      save.diff = diff;
      store(save);
      refreshMenu();
    });
  for (const b of qa<HTMLButtonElement>("[data-ss-speed]"))
    b.addEventListener("click", () => {
      save.speed = Math.max(1, Math.min(10, save.speed + Number(b.dataset.ssSpeed)));
      store(save);
      refreshMenu();
    });
  for (const b of qa<HTMLButtonElement>("[data-ss-offset]"))
    b.addEventListener("click", () => {
      save.offset = Math.max(-200, Math.min(300, save.offset + Number(b.dataset.ssOffset)));
      store(save);
      refreshMenu();
    });
  q("[data-ss-hits]")!.addEventListener("click", () => {
    save.hits = !save.hits;
    store(save);
    refreshMenu();
  });
  q("[data-ss-play]")!.addEventListener("click", () => void start(diff));

  // ------------------------------------------------------------------ play
  async function start(d: Difficulty): Promise<void> {
    audio.unlock();
    const btn = q<HTMLButtonElement>("[data-ss-play]")!;
    const err = q("[data-ss-err]")!;
    err.hidden = true;
    const label = btn.textContent;
    if (!audio.ready) {
      btn.disabled = true;
      try {
        await audio.load((f) => (btn.textContent = `${t.loadingSong} ${Math.round(f * 100)}%`));
      } catch {
        err.hidden = false;
        btn.disabled = false;
        btn.textContent = label;
        return;
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
    }
    await audio.resume();
    diff = d;
    engine = new RhythmEngine(d);
    audio.hitSounds = save.hits;
    audio.offset = save.offset / 1000;
    renderer.visible = visibleFor(save.speed);
    renderer.reset();
    renderer.labels = {
      judgments: t.judgments,
      combo: t.combo,
      fever: t.fever,
      early: t.early,
      late: t.late,
      keys: coarse ? ["", "", "", ""] : ["D", "F", "J", "K"],
    };
    queue.length = 0;
    pointerLane.clear();
    keyDown.clear();
    finished = false;
    resumeAt = 0;
    q("[data-ss-hint]")!.textContent = coarse ? t.touchHint : `${t.keysHint} · ← ↓ ↑ →`;
    setMode("play");
    if (!coarse) q("[data-ss-stage]")!.scrollIntoView({ block: "center", behavior: "smooth" });
    audio.start(0, LEAD);
  }

  function lanePress(lane: number, down: boolean, ts: number): void {
    if (mode !== "play" || !engine) return;
    queue.push({ lane, down, ts });
  }

  // inputs are applied in timestamp order before each frame's miss sweep
  function applyInputs(): void {
    if (!engine) return;
    queue.sort((a, b) => a.ts - b.ts);
    for (const x of queue) {
      const at = audio.at(x.ts);
      engine.update(at);
      if (x.down) {
        renderer.pressed[x.lane] = true;
        renderer.onPress(x.lane, audio.now());
        const j = engine.press(x.lane, at);
        audio.hit(x.lane, j === "perfect");
      } else {
        renderer.pressed[x.lane] = [...pointerLane.values()].includes(x.lane) || [...keyDown].some((k) => KEYS[k] === x.lane);
        engine.release(x.lane, at);
      }
    }
    queue.length = 0;
  }

  function autoInputs(now: number): void {
    if (!engine) return;
    for (let l = 0; l < 4; l++) {
      for (const n of engine.lanes[l]) {
        if (n.state !== "pending") continue;
        if (n.t > now) break;
        engine.update(n.t);
        engine.press(l, n.t);
        renderer.pressed[l] = true;
        renderer.onPress(l, now);
        audio.hit(l, true);
      }
    }
  }

  const hud = {
    score: q("[data-ss-score]")!,
    acc: q("[data-ss-acc]")!,
    fever: q("[data-ss-fever]")!,
    feverBox: q("[data-ss-fever-box]")!,
    progress: q("[data-ss-progress]")!,
    count: q("[data-ss-count]")!,
    hint: q("[data-ss-hint]")!,
  };
  let shown = { score: -1, acc: -1, fever: -1, prog: -1 };

  function frame(): void {
    raf = requestAnimationFrame(frame);
    const p = performance.now();
    const dt = Math.min(0.05, (p - last) / 1000);
    last = p;
    if (mode !== "play" && mode !== "paused") return;
    if (resumeAt && p >= resumeAt && mode === "play") {
      resumeAt = 0;
      hud.count.textContent = "";
      void audio.resume();
    }
    const now = audio.now();
    if (mode === "play" && engine && !resumeAt) {
      if (autoplay) autoInputs(now);
      applyInputs();
      engine.update(now);
      for (const ev of engine.drainEvents()) {
        if (ev.type === "judge") {
          renderer.onJudge(ev.lane, ev.judgment as Judgment, ev.offset, now, ev.part);
          renderer.onCombo(ev.combo, now);
        } else if (ev.type === "fever") renderer.onFever(ev.on, now);
      }
      if (autoplay) for (let l = 0; l < 4; l++) if (!engine.isHolding(l)) renderer.pressed[l] = false;
      // countdown during the lead-in
      hud.count.textContent = now < -0.05 ? String(Math.min(3, Math.ceil(-now / (LEAD / 3)))) : "";
      hud.hint.style.opacity = now < 4 ? "0.85" : "0";
      if (!finished && (now > Math.max(SONG_END, engine.lastTime + 2.2) || (engine.finished && now > engine.lastTime + 1.4))) finish();
    }
    renderer.draw(engine, now, dt, true);
    if (engine) {
      if (engine.score !== shown.score) hud.score.textContent = fmtInt.format((shown.score = engine.score));
      const acc = Math.round(engine.accuracy * 100) / 100;
      if (acc !== shown.acc) hud.acc.textContent = `${fmtPct.format((shown.acc = acc))}%`;
      const inF = engine.inFever(now);
      const fv = inF ? Math.max(0, (engine.feverUntil - now) / (16 * (60 / SONG_BPM))) : engine.fever;
      if (Math.abs(fv - shown.fever) > 0.004) {
        hud.fever.style.width = `${((shown.fever = fv) * 100).toFixed(1)}%`;
        hud.feverBox.dataset.on = String(inF);
      }
      const prog = Math.max(0, Math.min(1, now / SONG_END));
      if (Math.abs(prog - shown.prog) > 0.002) hud.progress.style.width = `${((shown.prog = prog) * 100).toFixed(1)}%`;
    }
  }

  function finish(): void {
    if (!engine) return;
    finished = true;
    audio.fadeOut(1.6);
    const r = engine.result();
    const prev = save.best[diff];
    const isBest = !prev || r.score > prev.score;
    if (isBest) save.best[diff] = { score: r.score, acc: r.accuracy, grade: r.grade, fc: r.fullCombo, ap: r.allPerfect };
    else if (prev) {
      prev.fc = prev.fc || r.fullCombo;
      prev.ap = prev.ap || r.allPerfect;
    }
    store(save);
    q("[data-ss-res-kicker]")!.textContent = `${t.results} · ${t.diffs[diff].name}`;
    const g = q("[data-ss-grade]")!;
    g.textContent = r.grade;
    g.dataset.g = r.grade;
    q("[data-ss-res-text]")!.textContent = t.gradeText[r.grade];
    q("[data-ss-badge-new]")!.hidden = !isBest;
    q("[data-ss-badge-fc]")!.hidden = !r.fullCombo || r.allPerfect;
    q("[data-ss-badge-ap]")!.hidden = !r.allPerfect;
    q("[data-ss-r-score]")!.textContent = fmtInt.format(r.score);
    q("[data-ss-r-acc]")!.textContent = `${fmtPct.format(r.accuracy)}%`;
    q("[data-ss-r-combo]")!.textContent = `${r.maxCombo} / ${r.total}`;
    for (const j of ["perfect", "great", "good", "miss"] as Judgment[]) q(`[data-ss-r-${j}]`)!.textContent = String(r.counts[j]);
    const m = q<HTMLImageElement>("[data-ss-res-mascot]")!;
    const play = root.dataset.play!;
    m.src = play + (r.grade === "S" || r.grade === "A" ? (r.grade === "S" ? "leoul-celebrate" : "lenyang-jump") : r.grade === "D" ? "lenyang-sad" : "leoul-wave") + ".webp";
    refreshMenu();
    setMode("result");
    root.scrollIntoView({ block: "start", behavior: coarse ? "auto" : "smooth" });
  }

  function pause(): void {
    if (mode !== "play" || finished) return;
    audio.pause();
    resumeAt = 0;
    hud.count.textContent = "";
    for (let l = 0; l < 4; l++) renderer.pressed[l] = false;
    pointerLane.clear();
    keyDown.clear();
    setMode("paused");
  }
  function resume(): void {
    if (mode !== "paused") return;
    setMode("play");
    // three quick counts on the beat before the song carries on
    const beat = 60000 / SONG_BPM;
    resumeAt = performance.now() + beat * 3;
    let n = 3;
    hud.count.textContent = "3";
    const tick = () => {
      n--;
      if (n > 0 && resumeAt) {
        hud.count.textContent = String(n);
        setTimeout(tick, beat);
      }
    };
    setTimeout(tick, beat);
  }
  function quit(): void {
    audio.stop();
    void audio.resume();
    engine = null;
    finished = true;
    refreshMenu();
    setMode("menu");
  }
  q("[data-ss-pause]")!.addEventListener("click", pause);
  q("[data-ss-resume]")!.addEventListener("click", resume);
  q("[data-ss-restart]")!.addEventListener("click", () => {
    audio.stop();
    void audio.resume().then(() => start(diff));
  });
  q("[data-ss-quit]")!.addEventListener("click", quit);
  q("[data-ss-retry]")!.addEventListener("click", () => void start(diff));
  q("[data-ss-menu]")!.addEventListener("click", () => {
    refreshMenu();
    setMode("menu");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });

  // ------------------------------------------------------------------ input
  window.addEventListener("keydown", (e) => {
    if (mode === "calibrate" && !e.repeat) return calTap(e.timeStamp);
    if (mode === "paused" && (e.code === "Escape" || e.code === "KeyP" || e.code === "Space")) {
      e.preventDefault();
      return resume();
    }
    if (mode !== "play") return;
    if (e.code === "Escape" || e.code === "KeyP") {
      e.preventDefault();
      return pause();
    }
    const lane = KEYS[e.code];
    if (lane === undefined) return;
    e.preventDefault();
    if (e.repeat || keyDown.has(e.code)) return;
    keyDown.add(e.code);
    lanePress(lane, true, e.timeStamp);
  });
  window.addEventListener("keyup", (e) => {
    const lane = KEYS[e.code];
    if (lane === undefined || !keyDown.has(e.code)) return;
    keyDown.delete(e.code);
    lanePress(lane, false, e.timeStamp);
  });
  window.addEventListener("blur", () => {
    for (const code of keyDown) lanePress(KEYS[code], false, performance.now());
    keyDown.clear();
  });
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (mode !== "play") return;
    const r = canvas.getBoundingClientRect();
    const lane = renderer.laneAt(e.clientX - r.left, e.clientY - r.top);
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already released pointer */
    }
    pointerLane.set(e.pointerId, lane);
    lanePress(lane, true, e.timeStamp);
  });
  const up = (e: PointerEvent) => {
    const lane = pointerLane.get(e.pointerId);
    if (lane === undefined) return;
    pointerLane.delete(e.pointerId);
    lanePress(lane, false, e.timeStamp);
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  new ResizeObserver(() => renderer.resize()).observe(canvas);

  // ------------------------------------------------------------------ calibration
  let calClicks: number[] = [];
  let calTaps: number[] = [];
  let calResult = 0;
  let calTimers: number[] = [];
  const pad = q<HTMLButtonElement>("[data-ss-cal-pad]")!;
  const calRes = q("[data-ss-cal-res]")!;
  const calUse = q<HTMLButtonElement>("[data-ss-cal-use]")!;
  function calStart(): void {
    audio.unlock();
    calTimers.forEach((id) => clearTimeout(id));
    calTimers = [];
    calTaps = [];
    calRes.textContent = "";
    calUse.hidden = true;
    void audio.resume().then(() => new Promise((r) => setTimeout(r, 150))).then(() => {
      calClicks = audio.metronome(16, SONG_BPM, 0.8);
      // flash the pad when each click reaches the speakers, not when it is scheduled
      const heardNow = audio.heard(performance.now());
      calClicks.forEach((ct) => {
        const ms = (ct - heardNow) * 1000;
        calTimers.push(window.setTimeout(() => (pad.dataset.beat = "true"), ms));
        calTimers.push(window.setTimeout(() => (pad.dataset.beat = "false"), ms + 90));
      });
      const endMs = (calClicks[calClicks.length - 1] - heardNow) * 1000 + 700;
      calTimers.push(window.setTimeout(calFinish, endMs));
    });
  }
  function calTap(ts: number): void {
    if (!calClicks.length) return calStart();
    const heard = audio.heard(ts);
    let best = Infinity;
    for (const c of calClicks) if (Math.abs(heard - c) < Math.abs(best)) best = heard - c;
    if (Math.abs(best) < 0.3) calTaps.push(best);
  }
  function calFinish(): void {
    const use = calTaps.slice(2).sort((a, b) => a - b);
    calClicks = [];
    if (use.length < 5) {
      calRes.textContent = t.calText;
      return;
    }
    const med = use[Math.floor(use.length / 2)];
    calResult = Math.max(-200, Math.min(300, Math.round((med * 1000) / 5) * 5));
    calRes.textContent = t.calResult(calResult);
    calUse.hidden = false;
  }
  pad.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    calTap(e.timeStamp);
  });
  q("[data-ss-cal]")!.addEventListener("click", () => {
    calClicks = [];
    calRes.textContent = "";
    calUse.hidden = true;
    setMode("calibrate");
  });
  q("[data-ss-cal-again]")!.addEventListener("click", calStart);
  calUse.addEventListener("click", () => {
    save.offset = calResult;
    store(save);
    refreshMenu();
    setMode("menu");
  });
  q("[data-ss-cal-back]")!.addEventListener("click", () => {
    calTimers.forEach((id) => clearTimeout(id));
    calClicks = [];
    refreshMenu();
    setMode("menu");
  });

  // ------------------------------------------------------------------ boot
  refreshMenu();
  void renderer.ready.then(
    () => setMode("menu"),
    () => setMode("menu"),
  );
  raf = requestAnimationFrame(frame);

  const api = {
    get engine() {
      return engine;
    },
    audio,
    renderer,
    get mode() {
      return mode;
    },
    start: (d: Difficulty = "normal", opts: { auto?: boolean } = {}) => {
      autoplay = !!opts.auto;
      return start(d);
    },
    auto: (on: boolean) => {
      autoplay = on;
    },
    pause,
    resume,
    // QA: play out the rest of the chart instantly, perfectly or not at all, then show the results
    finish: (how: "perfect" | "none" = "perfect") => {
      if (!engine) return;
      if (how === "perfect") {
        const now = audio.now();
        for (const x of perfectInputs(engine.notes)) {
          if (x.t < now) continue;
          engine.update(x.t);
          if (x.down) engine.press(x.lane, x.t);
          else engine.release(x.lane, x.t);
        }
      }
      engine.update(SONG_END + 5);
      finish();
    },
    destroy: () => cancelAnimationFrame(raf),
  };
  if (new URLSearchParams(location.search).has("qa")) (window as unknown as { __rhythm?: typeof api }).__rhythm = api;
}
