// Wires Dribble Dash into the page: loading, menu with a live demo run behind
// it, HUD, touch/keyboard/button controls, game over, and the mascot album.

import { GameAudio } from "../game/audio";
import { OPPONENT_SLUGS, OPPONENTS, SPRITES, type AlbumId, type Hero, type Locale, type PlayerPoseName } from "./data";
import { DASH_STRINGS } from "./i18n";
import { DashRenderer, type DashImages } from "./render";
import { autopilot, DashSim, STEP, type Obstacle, type SimEvent } from "./sim";

const SAVE_KEY = "dd-save-v1";
const ALBUM_TOTAL = OPPONENT_SLUGS.length + 2;
const PLAYER_POSES: PlayerPoseName[] = ["run1", "run2", "run3", "jump", "slide", "fall"];

type Mode = "loading" | "menu" | "playing" | "paused" | "over";

interface SaveData {
  best: number;
  album: AlbumId[];
}

function loadSave(): SaveData {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "{}");
    const valid = new Set<string>([...OPPONENT_SLUGS, "leoul", "lenyang"]);
    return {
      best: Number.isFinite(raw.best) ? Math.max(0, Math.floor(raw.best)) : 0,
      album: Array.isArray(raw.album) ? raw.album.filter((id: unknown): id is AlbumId => typeof id === "string" && valid.has(id)) : [],
    };
  } catch {
    return { best: 0, album: [] };
  }
}

function persist(save: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Private mode or storage full: the run still counts for this visit.
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      img
        .decode()
        .catch(() => undefined)
        .then(() => resolve(img));
    };
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

export function mountDribbleDash(root: HTMLElement): void {
  const locale: Locale = root.dataset.locale === "pt" ? "pt" : "en";
  const t = DASH_STRINGS[locale];
  const base = root.dataset.assets ?? "/play/dash/";
  const playBase = root.dataset.playAssets ?? "/play/";
  const params = new URLSearchParams(location.search);
  const debug = params.has("debug");

  const el = <T extends HTMLElement>(selector: string): T => {
    const found = root.querySelector<T>(selector);
    if (!found) throw new Error(`Dribble Dash markup is missing ${selector}`);
    return found;
  };

  document.documentElement.classList.add("dd-has-game");
  const stage = el(".dd-stage");
  const canvas = el<HTMLCanvasElement>("[data-dd-canvas]");
  const hud = el("[data-dd-hud]");
  const scoreEl = el("[data-dd-score]");
  const hudBest = el("[data-dd-hud-best]");
  const treatsEl = el("[data-dd-treats]");
  const hint = el("[data-dd-hint]");
  const toast = el("[data-dd-toast]");
  const live = el("[data-dd-live]");
  const controls = el("[data-dd-controls]");
  const jumpBtn = el<HTMLButtonElement>("[data-dd-jump]");
  const slideBtn = el<HTMLButtonElement>("[data-dd-slide]");
  const muteBtn = el<HTMLButtonElement>("[data-dd-mute]");
  const musicBtn = el<HTMLButtonElement>("[data-dd-music]");
  const musicState = el("[data-dd-music-state]");
  const progress = el("[data-dd-progress]");
  const loadingText = el("[data-dd-loading-text]");
  const menuBest = el("[data-dd-menu-best]");
  const menuAlbum = el("[data-dd-menu-album]");
  const overTitle = el("[data-dd-over-title]");
  const overClub = el("[data-dd-over-club]");
  const overArt = el<HTMLImageElement>("[data-dd-over-art]");
  const finalEl = el("[data-dd-final]");
  const statsEl = el("[data-dd-stats]");
  const bestLine = el("[data-dd-best-line]");
  const overScreen = el("[data-dd-screen=\"over\"]");
  const newCardsBox = el("[data-dd-new-cards]");
  const newCardsList = el("[data-dd-new-cards-list]");
  const againBtn = el<HTMLButtonElement>("[data-dd-again]");
  const collectedEl = document.querySelector<HTMLElement>("[data-dd-collected]");
  const screens = [...root.querySelectorAll<HTMLElement>("[data-dd-screen]")];

  const audio = new GameAudio(`${playBase}seoul-song-2024.mp3`);
  const save = loadSave();
  const coarse = window.matchMedia("(hover: none) and (pointer: coarse)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let mode: Mode = "loading";
  let renderer: DashRenderer | null = null;
  let sim: DashSim | null = null;
  let demo = true;
  let hero: Hero = "leoul";
  let newCards: AlbumId[] = [];
  let accumulator = 0;
  let last = performance.now();
  let raf = 0;
  let overTimer = 0;
  let hintTimer = 0;
  let toastTimer = 0;
  let stageVisible = true;
  let slideKey = false;
  let slideButton = false;
  let canvasSlide = false;
  let pointer: { id: number; y: number; t: number } | null = null;
  let shownScore = -1;
  let shownTreats = -1;
  let runsThisVisit = 0;
  let qaAuto = false;
  let crashAt = 0;

  // Screens and HUD ----------------------------------------------------------

  function showScreen(name: Mode | null, focus = true): void {
    for (const screen of screens) screen.hidden = screen.dataset.ddScreen !== name;
    const playing = name === null;
    root.dataset.ddMode = name ?? "playing";
    hud.hidden = !(playing || name === "paused" || name === "over");
    controls.dataset.active = playing ? "true" : "false";
    jumpBtn.disabled = !playing;
    slideBtn.disabled = !playing;
    if (focus && name) {
      const target = root.querySelector<HTMLElement>(`[data-dd-screen="${name}"] [data-dd-autofocus]`);
      target?.focus({ preventScroll: true });
    }
  }

  function announce(text: string): void {
    live.textContent = "";
    window.setTimeout(() => (live.textContent = text), 30);
  }

  function showToast(text: string): void {
    toast.textContent = text;
    toast.classList.add("dd-toast-show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("dd-toast-show"), 2400);
  }

  function renderMenuStats(): void {
    menuBest.textContent = save.best > 0 ? t.best(save.best) : "";
    menuAlbum.textContent = t.albumProgress(save.album.length, ALBUM_TOTAL);
    hudBest.textContent = String(save.best);
  }

  function renderAlbum(fresh: AlbumId[] = []): void {
    const owned = new Set(save.album);
    document.querySelectorAll<HTMLElement>("[data-dd-card]").forEach((card) => {
      const id = card.dataset.ddCard as AlbumId;
      if (owned.has(id)) card.removeAttribute("data-locked");
      else card.setAttribute("data-locked", "");
      if (fresh.includes(id)) {
        card.classList.remove("dd-card-new");
        void card.offsetWidth;
        card.classList.add("dd-card-new");
      }
    });
    if (collectedEl) collectedEl.textContent = t.collected(save.album.length, ALBUM_TOTAL);
  }

  function unlock(id: AlbumId): boolean {
    if (save.album.includes(id)) return false;
    save.album.push(id);
    persist(save);
    newCards.push(id);
    return true;
  }

  function updateHud(force = false): void {
    if (!sim) return;
    const score = sim.score;
    if (force || score !== shownScore) {
      scoreEl.textContent = String(score);
      shownScore = score;
    }
    const treats = sim.state.treatsTaken;
    if (force || treats !== shownTreats) {
      treatsEl.textContent = String(treats);
      shownTreats = treats;
    }
  }

  function syncMuteButton(): void {
    muteBtn.dataset.state = audio.muted ? "off" : "on";
    muteBtn.setAttribute("aria-pressed", String(audio.muted));
    musicBtn.setAttribute("aria-pressed", String(audio.musicEnabled));
    musicState.textContent = audio.musicEnabled ? t.musicOn : t.musicOff;
  }

  // Bring the stage (and as much of the controls as fits) into view on phones.
  function revealStage(): void {
    const header = document.querySelector<HTMLElement>("[data-site-header]");
    const pinned = header && ["sticky", "fixed"].includes(getComputedStyle(header).position);
    const offset = (pinned ? header.getBoundingClientRect().height : 0) + 8;
    const top = stage.getBoundingClientRect().top;
    const bottom = Math.max(stage.getBoundingClientRect().bottom, jumpBtn.getBoundingClientRect().bottom, slideBtn.getBoundingClientRect().bottom);
    if (top >= offset && bottom <= window.innerHeight) return;
    window.scrollTo({ top: window.scrollY + top - offset, behavior: reducedMotion.matches ? "auto" : "smooth" });
  }

  // Game flow ----------------------------------------------------------------

  function startDemo(): void {
    demo = true;
    sim = new DashSim(Math.random() < 0.5 ? "leoul" : "lenyang");
  }

  function startRun(choice: Hero): void {
    if (!renderer) return;
    audio.unlock();
    audio.startMusic();
    hero = choice;
    demo = false;
    newCards = [];
    sim = new DashSim(hero);
    accumulator = 0;
    shownScore = -1;
    shownTreats = -1;
    updateHud(true);
    mode = "playing";
    showScreen(null);
    slideKey = slideButton = canvasSlide = false;
    runsThisVisit += 1;
    hint.textContent = coarse.matches ? t.hintTouch : t.hintKeys;
    hint.hidden = false;
    window.clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => (hint.hidden = true), runsThisVisit > 2 ? 1800 : 3600);
    canvas.focus({ preventScroll: true });
    announce(t.announceStart(t.heroes[hero].name));
    requestAnimationFrame(revealStage);
  }

  function pause(): void {
    if (mode !== "playing") return;
    mode = "paused";
    slideKey = slideButton = canvasSlide = false;
    sim?.setSlide(false);
    showScreen("paused");
  }

  function resume(): void {
    if (mode !== "paused") return;
    mode = "playing";
    last = performance.now();
    showScreen(null);
    canvas.focus({ preventScroll: true });
  }

  function toMenu(): void {
    window.clearTimeout(overTimer);
    mode = "menu";
    hint.hidden = true;
    startDemo();
    renderMenuStats();
    showScreen("menu");
  }

  function spriteFor(o: Obstacle): string {
    if (!o.slug) return `${base}${SPRITES.cone.file}`;
    return `${base}${SPRITES.opponents[o.slug][o.kind === "leap" ? "leap" : "tackle"].file}`;
  }

  function finishRun(): void {
    if (!sim) return;
    const s = sim.state;
    const score = sim.score;
    const newBest = score > save.best;
    if (newBest) save.best = score;
    unlock(hero);
    persist(save);
    const by = s.crashedBy;
    if (by?.slug) {
      const o = OPPONENTS[by.slug];
      overTitle.textContent = t.tackledBy(o.name);
      overClub.textContent = `${o.club} · ${o.korean}`;
    } else {
      overTitle.textContent = t.trippedCone;
      overClub.textContent = t.coneClub;
    }
    if (by) {
      overArt.src = spriteFor(by);
      overArt.hidden = false;
    } else {
      overArt.hidden = true;
    }
    finalEl.textContent = String(score);
    statsEl.textContent = t.stats(sim.meters, s.treatsTaken, s.passed);
    bestLine.textContent = newBest ? t.newBest : t.bestLine(save.best);
    if (newBest) overScreen.setAttribute("data-dd-new-best", "");
    else overScreen.removeAttribute("data-dd-new-best");
    newCardsList.replaceChildren(
      ...newCards.map((id) => {
        const li = document.createElement("li");
        li.textContent = id === "leoul" || id === "lenyang" ? t.heroes[id].name : `${OPPONENTS[id].name} (${OPPONENTS[id].club})`;
        return li;
      }),
    );
    newCardsBox.hidden = newCards.length === 0;
    renderAlbum(newCards);
    renderMenuStats();
    mode = "over";
    showScreen("over");
    announce(t.announceCrash(overTitle.textContent ?? "", score));
  }

  function handleEvent(e: SimEvent): void {
    if (!sim) return;
    renderer?.onEvent(e, sim.state);
    if (demo) return;
    switch (e.type) {
      case "jump":
        audio.jump();
        hint.hidden = true;
        break;
      case "slide":
        audio.slide();
        hint.hidden = true;
        break;
      case "pass":
        audio.dodge();
        if (unlock(e.slug)) {
          const o = OPPONENTS[e.slug];
          audio.card();
          showToast(t.newCard(o.name, o.club));
          renderAlbum([e.slug]);
        }
        break;
      case "cone":
        audio.dodge();
        break;
      case "treat":
        audio.treat();
        break;
      case "milestone":
        audio.milestone();
        scoreEl.classList.remove("dd-pulse");
        void scoreEl.offsetWidth;
        scoreEl.classList.add("dd-pulse");
        break;
      case "night":
        if (e.on) showToast(t.nightToast);
        break;
      case "crash":
        audio.crash();
        crashAt = performance.now();
        slideKey = slideButton = canvasSlide = false;
        window.clearTimeout(overTimer);
        overTimer = window.setTimeout(finishRun, 950);
        break;
      default:
        break;
    }
  }

  // Main loop ------------------------------------------------------------------

  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!renderer || !sim) return;
    if (!stageVisible && mode !== "playing") return;
    const running = mode === "playing" || mode === "over" || (mode === "menu" && demo);
    if (running) {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= STEP && steps < 24) {
        if (demo || qaAuto) autopilot(sim);
        if (demo && sim.state.over && sim.state.overTime > 1.2) startDemo();
        sim.update(STEP);
        for (const e of sim.drainEvents()) handleEvent(e);
        accumulator -= STEP;
        steps++;
      }
      if (steps === 24) accumulator = 0;
      if (mode === "playing") updateHud();
    }
    renderer.draw(sim.state, running ? dt : 0);
    if (debug) renderer.debugBoxes(sim.state, sim);
  }

  function resize(): void {
    if (!renderer) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1);
    if (sim) renderer.draw(sim.state, 0);
  }

  // Input --------------------------------------------------------------------

  function syncSlide(): void {
    sim?.setSlide(mode === "playing" && (slideKey || slideButton || canvasSlide));
  }

  function jump(): void {
    if (mode !== "playing" || !sim) return;
    sim.pressJump();
  }

  window.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.code;
    const gameKey = ["Space", "ArrowUp", "ArrowDown", "KeyW", "KeyS"].includes(key);
    const onControl = event.target instanceof HTMLElement && event.target.closest("button, a, summary, input, select, textarea");
    if (mode === "playing") {
      if (key === "Space" || key === "ArrowUp" || key === "KeyW") {
        event.preventDefault();
        if (!event.repeat) jump();
      } else if (key === "ArrowDown" || key === "KeyS") {
        event.preventDefault();
        slideKey = true;
        syncSlide();
      } else if (key === "KeyP" || key === "Escape") {
        event.preventDefault();
        pause();
      }
    } else if (mode === "paused" && (key === "KeyP" || key === "Escape")) {
      event.preventDefault();
      resume();
    } else if (mode === "over" && gameKey && !onControl) {
      // Keys still held from the run must not scroll the page; after a moment,
      // Space or ↑ starts the next run, like the dino game.
      const settling = event.repeat || performance.now() - crashAt < 1500;
      if (settling) event.preventDefault();
      else if (key === "Space" || key === "ArrowUp" || key === "KeyW") {
        event.preventDefault();
        startRun(hero);
      }
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "ArrowDown" || event.code === "KeyS") {
      slideKey = false;
      syncSlide();
    }
  });

  jumpBtn.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    jump();
  });
  jumpBtn.addEventListener("click", (event) => {
    if (event.detail === 0) jump();
  });

  const releaseSlide = () => {
    slideButton = false;
    syncSlide();
  };
  slideBtn.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (mode !== "playing") return;
    slideBtn.setPointerCapture?.(event.pointerId);
    slideButton = true;
    syncSlide();
  });
  slideBtn.addEventListener("pointerup", releaseSlide);
  slideBtn.addEventListener("pointercancel", releaseSlide);
  slideBtn.addEventListener("lostpointercapture", releaseSlide);
  slideBtn.addEventListener("click", (event) => {
    if (event.detail !== 0 || mode !== "playing") return;
    slideButton = true;
    syncSlide();
    window.setTimeout(releaseSlide, 450);
  });
  for (const button of [jumpBtn, slideBtn]) button.addEventListener("contextmenu", (event) => event.preventDefault());

  canvas.addEventListener("pointerdown", (event) => {
    if (mode !== "playing" || !event.isPrimary) return;
    event.preventDefault();
    audio.unlock();
    jump();
    pointer = { id: event.pointerId, y: event.clientY, t: performance.now() };
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!pointer || event.pointerId !== pointer.id || canvasSlide) return;
    if (event.clientY - pointer.y > 26 && performance.now() - pointer.t < 450) {
      sim?.cancelFreshJump();
      canvasSlide = true;
      syncSlide();
    }
  });
  const endPointer = (event: PointerEvent) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    pointer = null;
    canvasSlide = false;
    syncSlide();
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  root.querySelectorAll<HTMLButtonElement>("[data-dd-start]").forEach((btn) =>
    btn.addEventListener("click", () => {
      audio.click();
      startRun(btn.dataset.ddStart === "lenyang" ? "lenyang" : "leoul");
    }),
  );
  againBtn.addEventListener("click", () => startRun(hero));
  el<HTMLButtonElement>("[data-dd-pause]").addEventListener("click", () => {
    if (mode === "playing") pause();
    else if (mode === "paused") resume();
  });
  el<HTMLButtonElement>("[data-dd-resume]").addEventListener("click", resume);
  root.querySelectorAll<HTMLButtonElement>("[data-dd-menu]").forEach((btn) => btn.addEventListener("click", toMenu));
  root.querySelectorAll<HTMLAnchorElement>("[data-dd-album-link]").forEach((link) =>
    link.addEventListener("click", () => {
      if (mode === "playing") pause();
    }),
  );
  muteBtn.addEventListener("click", () => {
    audio.unlock();
    audio.setMuted(!audio.muted);
    syncMuteButton();
  });
  musicBtn.addEventListener("click", () => {
    audio.unlock();
    audio.setMusicEnabled(!audio.musicEnabled);
    syncMuteButton();
  });

  document.addEventListener("visibilitychange", () => {
    audio.suspend(document.hidden);
    if (document.hidden) pause();
    last = performance.now();
  });

  new ResizeObserver(resize).observe(stage);
  new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        stageVisible = entry.intersectionRatio > 0.25;
        if (!stageVisible && mode === "playing") pause();
      }
    },
    { threshold: [0, 0.25, 0.5] },
  ).observe(stage);

  // Loading --------------------------------------------------------------------

  async function load(): Promise<void> {
    showScreen("loading", false);
    renderAlbum();
    renderMenuStats();
    syncMuteButton();
    const files: string[] = [];
    for (const slug of OPPONENT_SLUGS) files.push(base + SPRITES.opponents[slug].tackle.file, base + SPRITES.opponents[slug].leap.file);
    for (const who of ["leoul", "lenyang"] as Hero[]) for (const pose of PLAYER_POSES) files.push(base + SPRITES.players[who][pose].file);
    files.push(base + SPRITES.cone.file, base + SPRITES.boards.file, base + SPRITES.stands.file);
    files.push(`${playBase}ball.webp`, `${playBase}icon-meat.webp`, `${playBase}icon-fish.webp`);
    let done = 0;
    const loaded = await Promise.all(
      files.map((src) =>
        loadImage(src).then((image) => {
          done += 1;
          progress.style.width = `${Math.round((done / files.length) * 100)}%`;
          return image;
        }),
      ),
    );
    let i = 0;
    const next = () => loaded[i++];
    const opponents = {} as DashImages["opponents"];
    for (const slug of OPPONENT_SLUGS) opponents[slug] = { tackle: next(), leap: next() };
    const players = {} as DashImages["players"];
    for (const who of ["leoul", "lenyang"] as Hero[]) {
      players[who] = {} as Record<PlayerPoseName, HTMLImageElement>;
      for (const pose of PLAYER_POSES) players[who][pose] = next();
    }
    const [cone, boards, stands, ball, meat, fish] = [next(), next(), next(), next(), next(), next()];
    renderer = new DashRenderer(canvas, { opponents, players, cone, boards, stands, ball, treat: { leoul: meat, lenyang: fish } });
    startDemo();
    resize();
    mode = "menu";
    showScreen("menu", false);
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  load().catch((error) => {
    console.error(error);
    loadingText.textContent = t.loadError;
    progress.parentElement?.setAttribute("hidden", "");
  });

  // Headless QA hook (only with ?qa in the URL).
  if (params.has("qa")) {
    (window as unknown as { __dash: unknown }).__dash = {
      get mode() {
        return mode;
      },
      get sim() {
        return sim;
      },
      start: (who: Hero) => startRun(who),
      setAutopilot: (on: boolean) => (qaAuto = on),
    };
  }
  void raf;
}
