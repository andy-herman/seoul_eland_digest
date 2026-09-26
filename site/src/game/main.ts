import { loadImages, MUSIC_FILE } from "./assets";
import { GameAudio } from "./audio";
import { CARDS, loadBest, loadUnlocked, saveBest, saveUnlocked, type CardId } from "./cards";
import { PenaltyEngine, type DiveZone, type Mode, type Phase, type ShotReport, type Special } from "./engine";
import { STRINGS, type Locale } from "./i18n";

type ScreenName = "loading" | "menu" | "pause" | "over";

export function mountPenaltyParty(root: HTMLElement): void {
  const locale: Locale = root.dataset.locale === "pt" ? "pt" : "en";
  const t = STRINGS[locale];
  const base = root.dataset.assets ?? "/play/";

  const el = <T extends HTMLElement>(selector: string): T => {
    const found = root.querySelector<T>(selector);
    if (!found) throw new Error(`Penalty Party markup is missing ${selector}`);
    return found;
  };

  const canvas = el<HTMLCanvasElement>("[data-pp-canvas]");
  const stage = el(".pp-stage");
  document.documentElement.classList.add("pp-has-game");
  const hud = el("[data-pp-hud]");
  const scoreEl = el("[data-pp-score]");
  const levelEl = el("[data-pp-level]");
  const livesEl = el("[data-pp-lives]");
  const pauseBtn = el<HTMLButtonElement>("[data-pp-pause]");
  const muteBtn = el<HTMLButtonElement>("[data-pp-mute]");
  const musicBtn = el<HTMLButtonElement>("[data-pp-music]");
  const musicState = el("[data-pp-music-state]");
  const controls = el("[data-pp-controls]");
  const prompt = el("[data-pp-prompt]");
  const shootControls = el("[data-pp-shoot-controls]");
  const saveControls = el("[data-pp-save-controls]");
  const actionBtn = el<HTMLButtonElement>("[data-pp-action]");
  const diveBtns = [...root.querySelectorAll<HTMLButtonElement>("[data-pp-dive]")];
  const live = el("[data-pp-live]");
  const toast = el("[data-pp-toast]");
  const progress = el("[data-pp-progress]");
  const loadingText = el("[data-pp-loading-text]");
  const collectedEl = document.querySelector<HTMLElement>("[data-pp-collected]");
  const screens = new Map<ScreenName, HTMLElement>(
    [...root.querySelectorAll<HTMLElement>("[data-pp-screen]")].map((s) => [s.dataset.ppScreen as ScreenName, s]),
  );

  const audio = new GameAudio(`${base}${MUSIC_FILE}`);
  const unlocked = loadUnlocked();
  const best = loadBest();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let engine: PenaltyEngine | null = null;
  let currentMode: Mode = "shoot";
  let playing = false;
  let roundNumber = 0;
  let newCards: CardId[] = [];
  let lastScore = 0;
  let toastQueue: string[] = [];
  let toastTimer = 0;

  // Screens, HUD and announcements ------------------------------------------

  function showScreen(name: ScreenName | null, moveFocus = true): void {
    for (const [key, screen] of screens) screen.hidden = key !== name;
    root.toggleAttribute("data-pp-overlay", name !== null);
    if (moveFocus && name && name !== "loading") {
      const first = screens.get(name)?.querySelector<HTMLElement>("button, summary");
      first?.focus({ preventScroll: true });
    }
  }

  function announce(message: string): void {
    live.textContent = "";
    window.setTimeout(() => {
      live.textContent = message;
    }, 60);
  }

  function showToast(message: string): void {
    toastQueue.push(message);
    if (!toastTimer) nextToast();
  }

  function nextToast(): void {
    const message = toastQueue.shift();
    if (!message) {
      toast.classList.remove("pp-toast-show");
      toastTimer = 0;
      return;
    }
    toast.textContent = message;
    toast.classList.add("pp-toast-show");
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("pp-toast-show");
      toastTimer = window.setTimeout(nextToast, 250);
    }, 2400);
  }

  function renderHud(score: number, lives: number, level: number): void {
    scoreEl.textContent = score.toLocaleString(locale === "pt" ? "pt-BR" : "en-US");
    levelEl.textContent = `${t.level} ${level}`;
    livesEl.setAttribute("aria-label", `${t.lives}: ${lives}`);
    livesEl.querySelectorAll("img").forEach((img, i) => img.classList.toggle("pp-life-lost", i >= lives));
  }

  function renderBest(): void {
    root.querySelectorAll<HTMLElement>("[data-pp-best]").forEach((node) => {
      const value = best[node.dataset.ppBest as Mode];
      node.textContent = value > 0 ? t.best(value) : "";
    });
  }

  function renderSoundButtons(): void {
    muteBtn.setAttribute("aria-pressed", String(audio.muted));
    muteBtn.setAttribute("aria-label", audio.muted ? t.unmute : t.mute);
    muteBtn.dataset.state = audio.muted ? "off" : "on";
    musicBtn.setAttribute("aria-pressed", String(audio.musicEnabled));
    musicState.textContent = audio.musicEnabled ? t.musicOn : t.musicOff;
  }

  function renderCards(): void {
    document.querySelectorAll<HTMLElement>("[data-card]").forEach((card) => {
      card.toggleAttribute("data-locked", !unlocked.has(card.dataset.card as CardId));
    });
    if (collectedEl) collectedEl.textContent = t.collected(unlocked.size, CARDS.length);
  }

  function unlock(id: CardId): void {
    if (unlocked.has(id)) return;
    unlocked.add(id);
    saveUnlocked(unlocked);
    newCards.push(id);
    renderCards();
    document.querySelector<HTMLElement>(`[data-card="${id}"]`)?.classList.add("pp-card-new");
    audio.card();
    showToast(`${t.newCard} ${t.cards[id].title}`);
    announce(t.announce.card(t.cards[id].title));
  }

  function setControls(phase: Phase, mode: Mode): void {
    const inGame = playing && phase !== "over";
    controls.hidden = !inGame;
    hud.hidden = !playing;
    shootControls.hidden = mode !== "shoot";
    saveControls.hidden = mode !== "save";
    actionBtn.disabled = !(phase === "aimX" || phase === "aimY");
    const canDive = phase === "windup" || phase === "runup" || phase === "flight";
    diveBtns.forEach((btn) => {
      btn.disabled = !canDive;
    });
    if (mode === "shoot") {
      prompt.textContent = phase === "aimX" ? t.announce.aimAcross : phase === "aimY" ? t.announce.aimHeight : "";
    } else {
      prompt.textContent = canDive ? t.announce.diveNow : "";
    }
  }

  // On phones the game usually starts below the fold: bring the stage (and as
  // much of the controls as fits) into view under the site header, which only
  // covers content while it is sticky (landscape phones let it scroll away).
  function revealStage(): void {
    const header = document.querySelector<HTMLElement>("[data-site-header]");
    const pinned = header && ["sticky", "fixed"].includes(getComputedStyle(header).position);
    const offset = (pinned ? header.getBoundingClientRect().height : 0) + 8;
    const top = stage.getBoundingClientRect().top;
    const bottom = Math.max(stage.getBoundingClientRect().bottom, controls.getBoundingClientRect().bottom);
    if (top >= offset && bottom <= window.innerHeight) return;
    window.scrollTo({ top: window.scrollY + top - offset, behavior: reducedMotion.matches ? "auto" : "smooth" });
  }

  // Game flow ----------------------------------------------------------------

  function startGame(mode: Mode): void {
    if (!engine) return;
    audio.unlock();
    audio.startMusic();
    currentMode = mode;
    playing = true;
    newCards = [];
    roundNumber = 0;
    root.dataset.ppMode = mode;
    renderHud(0, 3, 1);
    showScreen(null);
    engine.newGame(mode);
    canvas.focus({ preventScroll: true });
    requestAnimationFrame(revealStage);
  }

  function pause(): void {
    if (!engine || !playing || engine.paused || engine.state.phase === "over") return;
    engine.paused = true;
    showScreen("pause");
  }

  function resume(): void {
    if (!engine) return;
    engine.paused = false;
    showScreen(null);
    canvas.focus({ preventScroll: true });
  }

  function toMenu(): void {
    if (!engine) return;
    playing = false;
    engine.attract();
    renderBest();
    showScreen("menu");
  }

  function specialMessage(special: Special): string {
    switch (special) {
      case "nap":
        return t.popups.nap;
      case "balloon":
        return t.popups.balloon;
      case "meat":
        return t.popups.meat;
      case "power":
        return t.popups.power;
      default:
        return "";
    }
  }

  function handleShot(r: ShotReport): void {
    renderHud(r.score, r.lives, r.level);
    const outcomeWord: Record<string, string> = {
      post: t.popups.post,
      bar: t.popups.bar,
      wide: t.popups.wide,
      over: t.popups.over,
    };
    if (r.mode === "shoot") {
      if (r.outcome === "goal") {
        announce(t.announce.goal(r.points, r.score));
        unlock("leoul-blue-mane");
        if (r.topCorner) unlock("leoul-short-legs");
        if (r.goals >= 5) unlock("leoul-born-2015");
        if (r.meatHit) unlock("leoul-meat");
        if (r.special === "balloon") unlock("lenyang-round-things");
        if (r.special === "nap") unlock("lenyang-nap");
      } else if (r.outcome === "save") {
        announce(t.announce.save(r.lives));
      } else {
        announce(t.announce.missed(outcomeWord[r.outcome] ?? "", r.lives));
      }
    } else if (r.outcome === "save") {
      announce(t.announce.saveMine(r.points, r.score));
      unlock("lenyang-brothers");
      if (r.saves >= 5) unlock("lenyang-spy");
      if (r.corner && (r.diveZone === "left" || r.diveZone === "right")) unlock("lenyang-jersey");
      if (r.special === "power") unlock("leoul-inwangsan");
    } else if (r.outcome === "goal") {
      announce(t.announce.conceded(r.lives));
    } else {
      announce(t.announce.lucky(r.score));
    }
    if (r.leveledUp) window.setTimeout(() => announce(t.announce.level(r.level)), 1200);
  }

  function handleGameOver(mode: Mode, score: number, goals: number, saves: number, level: number): void {
    lastScore = score;
    const isBest = score > best[mode];
    if (isBest) {
      best[mode] = score;
      saveBest(best);
    }
    el("[data-pp-final]").textContent = score.toLocaleString(locale === "pt" ? "pt-BR" : "en-US");
    el("[data-pp-final-stats]").textContent = mode === "shoot" ? t.statsShoot(goals, level) : t.statsSave(saves, level);
    el("[data-pp-best-line]").textContent = isBest && score > 0 ? t.newBest : t.best(best[mode]);
    const cardsBox = el("[data-pp-new-cards]");
    const list = el("[data-pp-new-cards-list]");
    list.replaceChildren(
      ...newCards.map((id) => {
        const li = document.createElement("li");
        li.textContent = t.cards[id].title;
        return li;
      }),
    );
    cardsBox.hidden = newCards.length === 0;
    root.toggleAttribute("data-pp-new-best", isBest && score > 0);
    window.setTimeout(() => {
      showScreen("over");
      announce(t.announce.gameOver(score));
    }, 500);
  }

  // Input --------------------------------------------------------------------

  function diveFromPointer(event: PointerEvent): DiveZone {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    return x < 1 / 3 ? "left" : x > 2 / 3 ? "right" : "center";
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (!engine || !playing || engine.paused) return;
    event.preventDefault();
    audio.unlock();
    if (currentMode === "shoot") engine.action();
    else engine.dive(diveFromPointer(event));
  });

  actionBtn.addEventListener("click", () => engine?.action());
  diveBtns.forEach((btn) => btn.addEventListener("click", () => engine?.dive(btn.dataset.ppDive as DiveZone)));

  document.addEventListener("keydown", (event) => {
    if (!engine || !playing) return;
    const target = event.target instanceof Element ? event.target : null;
    const onControl = !!target?.closest("button, a, input, select, textarea, summary");
    const key = event.key;
    if (key === "p" || key === "P" || key === "Escape") {
      if (engine.paused) resume();
      else pause();
      event.preventDefault();
      return;
    }
    if (key === "m" || key === "M") {
      audio.setMuted(!audio.muted);
      renderSoundButtons();
      return;
    }
    if (engine.paused || engine.state.phase === "over") return;
    if (currentMode === "shoot") {
      if ((key === " " || key === "Enter") && !onControl) {
        event.preventDefault();
        engine.action();
      }
      return;
    }
    const zone: DiveZone | null =
      key === "ArrowLeft" || key === "a" || key === "A"
        ? "left"
        : key === "ArrowRight" || key === "d" || key === "D"
          ? "right"
          : key === "ArrowDown" || key === "ArrowUp" || key === "s" || key === "S" || key === "w" || key === "W" || ((key === " " || key === "Enter") && !onControl)
            ? "center"
            : null;
    if (zone) {
      event.preventDefault();
      engine.dive(zone);
    }
  });

  root.querySelectorAll<HTMLButtonElement>("[data-pp-start]").forEach((btn) => {
    btn.addEventListener("click", () => startGame(btn.dataset.ppStart as Mode));
  });
  pauseBtn.addEventListener("click", () => (engine?.paused ? resume() : pause()));
  el<HTMLButtonElement>("[data-pp-resume]").addEventListener("click", resume);
  root.querySelectorAll<HTMLButtonElement>("[data-pp-menu]").forEach((btn) => btn.addEventListener("click", toMenu));
  el<HTMLButtonElement>("[data-pp-again]").addEventListener("click", () => startGame(currentMode));
  el<HTMLButtonElement>("[data-pp-switch]").addEventListener("click", () => startGame(currentMode === "shoot" ? "save" : "shoot"));
  el<HTMLButtonElement>("[data-pp-share]").addEventListener("click", async () => {
    const shareText = t.shareText(lastScore);
    const url = window.location.href.split("#")[0];
    try {
      if (navigator.share) {
        await navigator.share({ title: t.heading, text: shareText, url });
        return;
      }
      await navigator.clipboard.writeText(`${shareText} ${url}`);
      showToast(t.linkCopied);
    } catch {
      // The user closed the share sheet.
    }
  });
  muteBtn.addEventListener("click", () => {
    audio.unlock();
    audio.setMuted(!audio.muted);
    renderSoundButtons();
  });
  musicBtn.addEventListener("click", () => {
    audio.unlock();
    audio.setMusicEnabled(!audio.musicEnabled);
    if (audio.musicEnabled && playing) audio.startMusic();
    renderSoundButtons();
  });

  document.addEventListener("visibilitychange", () => {
    audio.suspend(document.hidden);
    if (document.hidden) pause();
  });

  // Boot ---------------------------------------------------------------------

  renderCards();
  renderBest();
  renderSoundButtons();
  showScreen("loading");

  loadImages(base, (done, total) => {
    progress.style.width = `${Math.round((done / total) * 100)}%`;
  })
    .then((images) => {
      engine = new PenaltyEngine(canvas, images, audio, t, {
        onPhase: (phase, mode) => {
          setControls(phase, mode);
          // Spoken prompts for the first two rounds only; after that the outcome
          // announcements carry the game.
          if (roundNumber <= 2) {
            if (phase === "aimX") announce(t.announce.aimAcross);
            else if (phase === "aimY") announce(t.announce.aimHeight);
            else if (phase === "windup") announce(t.announce.diveNow);
          }
        },
        onRoundStart: (_mode, special) => {
          roundNumber += 1;
          const message = specialMessage(special);
          if (message) {
            showToast(message);
            announce(message);
          }
        },
        onKick: (mode) => unlock(mode === "shoot" ? "leoul-soccer-crazy" : "lenyang-jamsil-cat"),
        onShot: handleShot,
        onGameOver: handleGameOver,
      });
      engine.reducedMotion = reducedMotion.matches;
      reducedMotion.addEventListener("change", () => {
        if (engine) engine.reducedMotion = reducedMotion.matches;
      });
      const resize = () => engine?.resize();
      new ResizeObserver(resize).observe(canvas);
      resize();
      engine.attract();
      engine.start();
      const visibility = new IntersectionObserver(([entry]) => {
        if (!engine) return;
        if (entry.isIntersecting) engine.start();
        else {
          pause();
          engine.stop();
        }
      });
      visibility.observe(canvas);
      void document.fonts?.load('900 40px "Pretendard Variable"');
      showScreen("menu", false);
    })
    .catch(() => {
      loadingText.textContent = t.loadError;
    });
}
