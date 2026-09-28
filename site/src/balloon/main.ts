// Balloon Battle page controller: loading, title and hero select, stage map,
// stage intro cards, the fixed-step game loop, HUD, sounds, results, saves and
// the mascot album.

import { ALL_MASCOTS, ENEMIES, HERO_STATS, OPPONENTS, WORLDS, type Hero, type Locale, type OpponentSlug } from "./data";
import { STAGES } from "./levels";
import { Game } from "./sim";
import { Renderer, BOARD_ASPECT, type Images } from "./render";
import { Controls } from "./input";
import { BalloonAudio } from "./audio";
import { clubPlaylist } from "../lib/clubSongs";
import { BB_STRINGS } from "./i18n";
import type { GameEvent } from "./core";

const SAVE_KEY = "bb-save-v1";
const RANKS = ["C", "B", "A", "S", "SS"];

interface Save {
  hero: Hero;
  unlocked: number; // highest playable stage index
  best: Record<string, { rank: string; score: number }>;
  album: string[];
}

function loadSave(): Save {
  const fresh: Save = { hero: "leoul", unlocked: 0, best: {}, album: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "{}");
    return {
      hero: raw.hero === "lenyang" ? "lenyang" : "leoul",
      unlocked: Number.isInteger(raw.unlocked) ? Math.min(STAGES.length - 1, Math.max(0, raw.unlocked)) : 0,
      best: raw.best && typeof raw.best === "object" ? raw.best : {},
      album: Array.isArray(raw.album) ? raw.album.filter((s: unknown) => typeof s === "string") : [],
    };
  } catch {
    return fresh;
  }
}

function storeSave(save: Save): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // private mode: progress just is not kept
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

type Mode = "loading" | "title" | "worlds" | "intro" | "playing" | "paused" | "result" | "over" | "ending";

export function mountBalloonBattle(root: HTMLElement): void {
  const locale = (root.dataset.locale === "pt" ? "pt" : "en") as Locale;
  const t = BB_STRINGS[locale];
  const assets = root.dataset.assets ?? "/play/balloon/";
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const qa = <T extends HTMLElement = HTMLElement>(sel: string) => [...root.querySelectorAll<T>(sel)];
  const canvas = q<HTMLCanvasElement>("[data-bb-canvas]")!;
  const stageBox = q("[data-bb-stage]")!;
  const hud = q("[data-bb-hud]")!;
  const banner = q("[data-bb-banner]")!;
  const toast = q("[data-bb-toast]")!;
  const live = q("[data-bb-live]");
  const controlsEl = q("[data-bb-controls]")!;
  const audio = new BalloonAudio(root.dataset.music ?? clubPlaylist("/play/"));
  const save = loadSave();

  let mode: Mode = "loading";
  let game: Game | null = null;
  let stageIndex = 0;
  let renderer: Renderer | null = null;
  let base: { fx: HTMLImageElement; chars: HTMLImageElement } | null = null;
  const tileCache = new Map<string, HTMLImageElement>();
  let bosses: HTMLImageElement | null = null;
  let endT = 0;
  let cardsSeen = 0;
  const cardsFreshThisStage = new Set<string>();
  let trappedHintShown = false;

  // ------------------------------------------------------------ screens

  function show(next: Mode): void {
    mode = next;
    for (const el of qa("[data-bb-screen]")) el.hidden = el.dataset.bbScreen !== next;
    hud.hidden = !(next === "playing" || next === "paused");
    controlsEl.dataset.active = next === "playing" ? "true" : "false";
    root.dataset.mode = next;
    if (next !== "playing" && next !== "paused") document.documentElement.removeAttribute("data-bb-immersive");
    // a leftover "Go!" or "Hurry up!" banner must not sit on top of a menu
    if (next !== "playing") banner.hidden = true;
    if (next !== "playing" && next !== "loading" && next !== "title") {
      const header = document.querySelector<HTMLElement>("[data-site-header]");
      const top = root.getBoundingClientRect().top;
      if (top < (header?.offsetHeight ?? 0) || top > window.innerHeight * 0.5) root.scrollIntoView({ block: "start" });
    }
    const focus = q(`[data-bb-screen="${next}"] [data-bb-autofocus]`);
    if (focus && next !== "playing") requestAnimationFrame(() => focus.focus({ preventScroll: true }));
  }

  function say(text: string): void {
    if (live) live.textContent = text;
  }

  let bannerTimer = 0;
  function flashBanner(text: string, kind = "", ms = 1100): void {
    banner.textContent = text;
    banner.dataset.kind = kind;
    banner.hidden = false;
    banner.classList.remove("bb-banner-anim");
    void banner.offsetWidth;
    banner.classList.add("bb-banner-anim");
    window.clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => (banner.hidden = true), ms);
    say(text);
  }

  let toastTimer = 0;
  function showToast(text: string, ms = 2600): void {
    toast.textContent = text;
    toast.dataset.show = "true";
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toast.dataset.show = "false"), ms);
  }

  // ------------------------------------------------------------ title and hero select

  function selectHero(hero: Hero): void {
    save.hero = hero;
    storeSave(save);
    for (const b of qa("[data-bb-hero]")) b.setAttribute("aria-pressed", String(b.dataset.bbHero === hero));
  }
  for (const b of qa("[data-bb-hero]")) b.addEventListener("click", () => {
    audio.unlock();
    audio.click();
    selectHero(b.dataset.bbHero as Hero);
  });
  selectHero(save.hero);

  q("[data-bb-play]")?.addEventListener("click", () => {
    audio.unlock();
    audio.click();
    audio.startMusic();
    openWorlds();
  });

  function syncMusicButtons(): void {
    for (const b of qa("[data-bb-music]")) {
      b.setAttribute("aria-pressed", String(audio.musicEnabled));
      const s = b.querySelector("[data-bb-music-state]");
      if (s) s.textContent = audio.musicEnabled ? t.musicOn : t.musicOff;
    }
    const mute = q("[data-bb-mute]");
    mute?.setAttribute("aria-pressed", String(audio.muted));
  }
  for (const b of qa("[data-bb-music]")) b.addEventListener("click", () => {
    audio.unlock();
    audio.setMusicEnabled(!audio.musicEnabled);
    if (audio.musicEnabled) audio.startMusic();
    syncMusicButtons();
  });
  q("[data-bb-mute]")?.addEventListener("click", () => toggleMute());
  function toggleMute(): void {
    audio.unlock();
    audio.setMuted(!audio.muted);
    syncMusicButtons();
  }
  syncMusicButtons();

  // ------------------------------------------------------------ stage select

  function openWorlds(): void {
    for (const btn of qa<HTMLButtonElement>("[data-bb-stage-btn]")) {
      const id = btn.dataset.bbStageBtn!;
      const i = STAGES.findIndex((s) => s.id === id);
      const locked = i > save.unlocked;
      btn.disabled = locked;
      btn.dataset.locked = String(locked);
      const rank = btn.querySelector("[data-bb-rank]");
      if (rank) rank.textContent = save.best[id]?.rank ?? (locked ? "🔒" : "");
      btn.dataset.rank = save.best[id]?.rank ?? "";
    }
    for (const card of qa("[data-bb-world]")) {
      const w = WORLDS.findIndex((x) => x.id === card.dataset.bbWorld);
      card.dataset.locked = String(w * 3 > save.unlocked);
    }
    show("worlds");
    const current = q<HTMLButtonElement>(`[data-bb-stage-btn="${STAGES[Math.min(save.unlocked, STAGES.length - 1)].id}"]`);
    requestAnimationFrame(() => current?.focus({ preventScroll: true }));
  }
  for (const btn of qa<HTMLButtonElement>("[data-bb-stage-btn]")) btn.addEventListener("click", () => {
    audio.click();
    openIntro(STAGES.findIndex((s) => s.id === btn.dataset.bbStageBtn));
  });
  for (const b of qa("[data-bb-to-worlds]")) b.addEventListener("click", () => {
    audio.click();
    game = null;
    openWorlds();
  });
  for (const b of qa("[data-bb-to-title]")) b.addEventListener("click", () => {
    audio.click();
    show("title");
  });

  // ------------------------------------------------------------ stage intro card

  function openIntro(i: number): void {
    stageIndex = i;
    const st = STAGES[i];
    const world = WORLDS.find((w) => w.id === st.world)!;
    q("[data-bb-intro-stage]")!.textContent = t.stageLabel(st.id);
    q("[data-bb-intro-title]")!.textContent = t.stages[st.id];
    q("[data-bb-intro-world]")!.textContent = t.worlds[st.world];
    root.style.setProperty("--bb-world", world.color);
    const list = q("[data-bb-intro-mascots]")!;
    list.textContent = "";
    const slugs = Object.keys(st.enemies) as OpponentSlug[];
    if (st.boss) slugs.unshift(bossSlug(st.boss) as OpponentSlug);
    for (const slug of [...new Set(slugs)]) {
      const o = OPPONENTS[slug];
      const li = document.createElement("li");
      li.className = "bb-meet";
      const art = document.createElement("span");
      art.className = "bb-avatar";
      art.style.setProperty("--row", String(avatarRow(slug)));
      const text = document.createElement("span");
      const boss = st.boss && bossSlug(st.boss) === slug;
      text.innerHTML = `<strong></strong> <em></em><br><small></small>`;
      text.querySelector("strong")!.textContent = boss ? `${t.bossStage}: ${o.name}` : o.name;
      text.querySelector("em")!.textContent = o.club;
      text.querySelector("small")!.textContent = boss && st.boss ? t.bossMoves[st.boss] : t.behaviors[ENEMIES[slug].behavior];
      li.append(art, text);
      list.append(li);
    }
    q("[data-bb-intro-tip]")!.textContent = st.tip ? t.tips[st.tip] ?? "" : "";
    show("intro");
  }

  function bossSlug(kind: string): string {
    return { swoony: "suwon-fc", gunhami: "gyeongnam-fc", chaba: "chungbuk-cheongju", mars: "hwaseong-fc", cheolryong: "jeonnam-dragons", aguileon: "suwon-samsung-bluewings" }[kind] ?? "";
  }

  function avatarRow(slug: string): number {
    const order = ["leoul", "lenyang", "ansan-greeners", "busan-ipark", "cheonan-city", "chungbuk-cheongju", "chungnam-asan", "daegu-fc", "gimhae-fc", "gimpo-fc", "gyeongnam-fc", "hwaseong-fc", "jeonnam-dragons", "paju-frontier", "seongnam-fc", "suwon-fc", "suwon-samsung-bluewings", "yongin-fc"];
    return Math.max(0, order.indexOf(slug));
  }

  q("[data-bb-intro-start]")?.addEventListener("click", () => {
    audio.unlock();
    audio.click();
    audio.startMusic();
    void startStage(stageIndex);
  });

  async function ensureImages(worldId: string, needBoss: boolean): Promise<Images> {
    if (!base) throw new Error("base images missing");
    let tiles = tileCache.get(worldId);
    if (!tiles) {
      tiles = await loadImage(`${assets}tiles_${worldId}.webp`);
      tileCache.set(worldId, tiles);
    }
    if (needBoss && !bosses) bosses = await loadImage(`${assets}bosses.webp`);
    return { tiles, fx: base.fx, chars: base.chars, bosses: bosses ?? undefined };
  }

  async function startStage(i: number): Promise<void> {
    const st = STAGES[i];
    stageIndex = i;
    let images: Images;
    try {
      images = await ensureImages(st.world, !!st.boss);
    } catch {
      showToast(t.loadError, 5000);
      return;
    }
    game = new Game(i, save.hero, (Date.now() & 0xffff) + i);
    cardsSeen = 0;
    cardsFreshThisStage.clear();
    trappedHintShown = false;
    endT = 0;
    if (!renderer) renderer = new Renderer(canvas, images);
    renderer.setImages(images, st.world);
    root.style.setProperty("--bb-world", game.world.color);
    q("[data-bb-stage-label]")!.textContent = `${st.id} · ${t.stages[st.id]}`;
    controls.reset();
    show("playing");
    lastHud = "";
    updateHud(game);
    layout();
    canvas.focus({ preventScroll: true });
    if (document.documentElement.hasAttribute("data-bb-immersive")) stageBox.scrollIntoView({ block: "center" });
    else root.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  // ------------------------------------------------------------ controls and layout

  const controls = new Controls({
    pause: () => togglePause(),
    mute: () => toggleMute(),
    isPlaying: () => mode === "playing",
  });
  const joyZone = q("[data-bb-joy]");
  const joyBase = q("[data-bb-joy-base]");
  const joyKnob = q("[data-bb-joy-knob]");
  if (joyZone && joyBase && joyKnob) controls.attachJoystick(joyZone, joyBase, joyKnob);
  const bombBtn = q("[data-bb-btn=bomb]");
  const itemBtn = q("[data-bb-btn=item]");
  if (bombBtn) controls.attachButton(bombBtn, "bomb");
  if (itemBtn) controls.attachButton(itemBtn, "item");
  const coarse = window.matchMedia("(pointer: coarse)");
  const syncTouch = () => (root.dataset.touch = String(coarse.matches || controls.touchSeen));
  syncTouch();
  coarse.addEventListener?.("change", syncTouch);
  window.addEventListener("touchstart", () => {
    if (!controls.touchSeen) {
      controls.touchSeen = true;
      syncTouch();
      layout();
    }
  }, { passive: true });

  function layout(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const boxW = stageBox.parentElement?.clientWidth ?? root.clientWidth;
    const touch = root.dataset.touch === "true";
    const landscape = window.innerWidth > window.innerHeight;
    root.dataset.landscape = String(touch && landscape);
    // phones held sideways: hide the site header and put the HUD beside the board
    const immersive = touch && landscape && (mode === "playing" || mode === "paused");
    document.documentElement.toggleAttribute("data-bb-immersive", immersive);
    const hudH = hud.hidden || immersive ? 0 : hud.offsetHeight + 8;
    const header = document.querySelector<HTMLElement>("[data-site-header]");
    const headerH = header && ["sticky", "fixed"].includes(getComputedStyle(header).position) ? header.offsetHeight : 0;
    root.style.setProperty("--bb-header", `${headerH}px`);
    const controlsH = touch && !landscape ? 150 : 0;
    const availH = immersive ? window.innerHeight - 10 : Math.max(220, window.innerHeight - headerH - hudH - controlsH - (touch ? 16 : 40));
    let w = Math.min(immersive ? window.innerWidth : boxW, availH * BOARD_ASPECT, 900);
    if (touch && landscape) w = Math.min(w, window.innerWidth - 330);
    w = Math.max(220, Math.floor(w));
    stageBox.style.width = `${w}px`;
    root.style.setProperty("--bb-board-w", `${w}px`);
    if (renderer) {
      const h = renderer.resize(w, dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    } else {
      canvas.style.width = `${w}px`;
      canvas.style.height = `${Math.round(w / BOARD_ASPECT)}px`;
    }
  }
  window.addEventListener("resize", () => layout());
  window.addEventListener("orientationchange", () => setTimeout(layout, 200));
  // the HUD can wrap to a second line (long score, extra hearts); re-fit the board when it does
  if (typeof ResizeObserver !== "undefined") {
    let hudSeenH = -1;
    new ResizeObserver(() => {
      const h = hud.offsetHeight;
      if (h === hudSeenH) return;
      hudSeenH = h;
      if (mode === "playing" || mode === "paused") layout();
    }).observe(hud);
  }

  // ------------------------------------------------------------ pause and visibility

  function togglePause(): void {
    if (mode === "playing") {
      show("paused");
      audio.stopMusic();
    } else if (mode === "paused") {
      show("playing");
      layout();
      audio.startMusic();
      last = performance.now();
    }
  }
  q("[data-bb-pause]")?.addEventListener("click", () => togglePause());
  q("[data-bb-resume]")?.addEventListener("click", () => togglePause());
  q("[data-bb-restart]")?.addEventListener("click", () => {
    audio.click();
    void startStage(stageIndex);
  });
  document.addEventListener("visibilitychange", () => {
    audio.suspend(document.hidden);
    if (document.hidden && mode === "playing") togglePause();
  });

  // ------------------------------------------------------------ results

  function finishStage(): void {
    if (!game) return;
    const res = game.result();
    const st = STAGES[stageIndex];
    const prev = save.best[st.id];
    const better = !prev || res.score > prev.score;
    const bestRank = prev && RANKS.indexOf(prev.rank) > RANKS.indexOf(res.rank) ? prev.rank : res.rank;
    save.best[st.id] = { rank: bestRank, score: Math.max(res.score, prev?.score ?? 0) };
    save.unlocked = Math.max(save.unlocked, Math.min(STAGES.length - 1, stageIndex + 1));
    storeSave(save);
    q("[data-bb-result-rank]")!.textContent = res.rank;
    q("[data-bb-result-rank]")!.dataset.rank = res.rank;
    q("[data-bb-result-score]")!.textContent = res.score.toLocaleString(locale === "pt" ? "pt-BR" : "en-US");
    q("[data-bb-result-time]")!.textContent = fmtTime(res.time);
    q("[data-bb-result-lost]")!.textContent = String(res.lost);
    q("[data-bb-result-best]")!.hidden = !better || !prev;
    q("[data-bb-result-title]")!.textContent = `${st.id} · ${t.stages[st.id]}`;
    const cards = q("[data-bb-result-cards]")!;
    const fresh = game.newCards.filter((s) => cardsFreshThisStage.has(s));
    cards.hidden = fresh.length === 0;
    const ul = cards.querySelector("ul")!;
    ul.textContent = "";
    for (const slug of fresh) {
      const li = document.createElement("li");
      li.textContent = `${OPPONENTS[slug].name} · ${OPPONENTS[slug].club}`;
      ul.append(li);
    }
    const nextBtn = q<HTMLButtonElement>("[data-bb-next]")!;
    nextBtn.hidden = stageIndex >= STAGES.length - 1;
    show(stageIndex >= STAGES.length - 1 ? "ending" : "result");
    if (stageIndex >= STAGES.length - 1) q("[data-bb-ending-score]")!.textContent = res.score.toLocaleString(locale === "pt" ? "pt-BR" : "en-US");
  }
  q("[data-bb-next]")?.addEventListener("click", () => {
    audio.click();
    openIntro(Math.min(STAGES.length - 1, stageIndex + 1));
  });
  for (const b of qa("[data-bb-retry]")) b.addEventListener("click", () => {
    audio.click();
    void startStage(stageIndex);
  });

  function fmtTime(s: number): string {
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  // ------------------------------------------------------------ album

  const albumTotal = ALL_MASCOTS.length + 2;
  // the album sits below the game, outside the root, so search the whole game page
  const albumScope: ParentNode = root.closest(".bb-page") ?? document;
  function syncAlbum(): void {
    for (const card of albumScope.querySelectorAll<HTMLElement>("[data-bb-card]")) {
      const id = card.dataset.bbCard!;
      const open = save.album.includes(id);
      if (open) card.removeAttribute("data-locked");
      else card.setAttribute("data-locked", "");
    }
    const n = save.album.length;
    for (const el of albumScope.querySelectorAll<HTMLElement>("[data-bb-collected]")) el.textContent = t.collected(n, albumTotal);
  }
  function unlockCard(id: string, announce: boolean): void {
    if (save.album.includes(id)) return;
    save.album.push(id);
    storeSave(save);
    syncAlbum();
    cardsFreshThisStage.add(id);
    if (announce) {
      const name = id === "leoul" || id === "lenyang" ? t.heroes[id].name : OPPONENTS[id as OpponentSlug].name;
      showToast(t.cardUnlocked(name));
    }
  }
  syncAlbum();

  // ------------------------------------------------------------ HUD

  let lastHud = "";
  function updateHud(g: Game): void {
    const p = g.player;
    const s = g.stats;
    const key = [p.hearts, Math.ceil(g.clock), g.score, s.balloons, s.range, s.speed, p.needles, p.shields, p.kick, g.hurry].join("|");
    if (key === lastHud) return;
    lastHud = key;
    const hearts = q("[data-bb-hearts]")!;
    hearts.textContent = "♥".repeat(Math.max(0, p.hearts));
    hearts.setAttribute("aria-label", `${t.hudHearts}: ${p.hearts}`);
    const time = q("[data-bb-time]")!;
    time.textContent = fmtTime(Math.ceil(g.clock));
    time.dataset.hurry = String(g.clock <= 20);
    q("[data-bb-score]")!.textContent = g.score.toLocaleString(locale === "pt" ? "pt-BR" : "en-US");
    q("[data-bb-stat=balloons]")!.textContent = String(s.balloons);
    q("[data-bb-stat=range]")!.textContent = String(s.range);
    q("[data-bb-stat=speed]")!.textContent = String(s.speed);
    q("[data-bb-needles]")!.textContent = String(p.needles);
    q("[data-bb-shields]")!.textContent = String(p.shields);
    q("[data-bb-kick]")!.hidden = !p.kick;
    if (itemBtn) itemBtn.dataset.ready = String(p.needles > 0 || p.shields > 0);
  }

  // ------------------------------------------------------------ events -> sound and UI

  function handle(ev: GameEvent, g: Game): void {
    switch (ev) {
      case "ready":
        audio.readyBeep();
        flashBanner(t.ready, "ready", 1500);
        break;
      case "go":
        audio.go();
        flashBanner(t.go, "go", 700);
        break;
      case "place":
        audio.place();
        break;
      case "burst":
        audio.splash();
        break;
      case "trapped":
        audio.trapped();
        if (!trappedHintShown || g.player.needles > 0) {
          showToast(g.player.needles > 0 ? t.trappedHint : t.trappedNoNeedle, 2400);
          trappedHintShown = true;
        }
        break;
      case "enemyTrapped":
        audio.enemyTrapped();
        break;
      case "pop":
        audio.pop();
        break;
      case "playerPop":
        audio.playerPop();
        renderer && (renderer.shake = 1);
        break;
      case "needle":
        audio.needle();
        break;
      case "shield":
        audio.shield();
        break;
      case "item":
        audio.item();
        break;
      case "curse":
        audio.curse();
        break;
      case "kick":
        audio.kick();
        break;
      case "push":
        audio.push();
        break;
      case "clang":
        audio.clang();
        break;
      case "bossHit":
        audio.bossHit();
        break;
      case "bossDown":
        audio.bossDown();
        renderer && (renderer.shake = 1.4);
        break;
      case "bossDizzy":
        renderer && (renderer.shake = 0.6);
        break;
      case "warn":
        audio.warn();
        break;
      case "hurry":
        audio.hurry();
        flashBanner(t.hurry, "hurry", 1600);
        break;
      case "clear":
        audio.clear();
        flashBanner(t.clear, "clear", 2000);
        break;
      case "over":
        audio.over();
        break;
      case "lob":
        audio.lob();
        break;
      case "roar":
        audio.roar();
        break;
      case "teleport":
        audio.teleport();
        break;
      case "summon":
        audio.summon();
        break;
      case "breath":
        audio.breath();
        break;
      case "dash":
        audio.dash();
        break;
      case "heart":
        audio.heart();
        break;
    }
  }

  // ------------------------------------------------------------ loop

  const DT = 1 / 60;
  let qaBot: ((g: Game) => void) | null = null;
  let acc = 0;
  let last = performance.now();
  function frame(now: number): void {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!game || !renderer) return;
    if (mode === "playing") {
      acc += dt;
      let steps = 0;
      while (acc >= DT && steps < 6) {
        if (qaBot) qaBot(game);
        else controls.poll(game.input);
        game.step(DT);
        for (const ev of game.events) handle(ev, game);
        acc -= DT;
        steps++;
      }
      if (steps === 6) acc = 0;
      // album cards unlock the moment a mascot pops
      while (cardsSeen < game.newCards.length) unlockCard(game.newCards[cardsSeen++], true);
      if (game.phase === "clear" || game.phase === "over") {
        endT += dt;
        if (game.phase === "clear" && endT > 2.3) {
          if (!save.album.includes(save.hero)) unlockCard(save.hero, false);
          finishStage();
        } else if (game.phase === "over" && endT > 1.8) {
          show("over");
        }
      }
      updateHud(game);
    }
    if (mode === "playing" || mode === "paused" || mode === "result" || mode === "over" || mode === "ending") renderer.draw(game, now / 1000);
  }

  // ------------------------------------------------------------ boot

  async function boot(): Promise<void> {
    show("loading");
    layout();
    try {
      const [fx, chars] = await Promise.all([loadImage(`${assets}tiles_fx.webp`), loadImage(`${assets}chars.webp`)]);
      base = { fx, chars };
      // warm the first world so the first stage starts instantly
      void ensureImages(STAGES[Math.min(save.unlocked, STAGES.length - 1)].world, false).catch(() => undefined);
    } catch {
      const text = q("[data-bb-loading-text]");
      if (text) text.textContent = t.loadError;
      return;
    }
    const cont = q("[data-bb-play]");
    if (cont && save.unlocked > 0) cont.textContent = t.continueLabel;
    show("title");
    requestAnimationFrame(frame);
  }
  void boot();
  void HERO_STATS;
  if (new URLSearchParams(location.search).has("qa")) {
    // test hook for automated device QA
    (window as unknown as { __bb: unknown }).__bb = {
      get game() {
        return game;
      },
      get mode() {
        return mode;
      },
      start: (i: number) => startStage(i),
      setBot: (fn: ((g: Game) => void) | null) => {
        qaBot = fn;
      },
      unlockAll: () => {
        save.unlocked = STAGES.length - 1;
        storeSave(save);
      },
    };
  }
}
