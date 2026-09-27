// Dev server: cd site && npx astro dev --port 4322 --host 127.0.0.1
// QA hook: add ?qa to expose window.__h2h with { match, startQuick, startSeason, simulateAiMatch, season }.

import { SQUAD, OPPONENTS, type Kit, type OpponentSlug, type SquadPlayer } from "./data";
import { applyRound, newSeason, sortRows, validateTable, type SeasonState } from "./league";
import { H2HMatch, STEP, blankInput, headCenter, type Body, type InputState } from "./sim";
import { H2HRenderer, type H2HImages } from "./render";
import { H2HControls } from "./input";
import { H2HAudio } from "./audio";
import { H2H_STRINGS } from "./i18n";

const SAVE_KEY = "h2h-save-v1";

interface SaveData {
  selected: number;
  season: SeasonState | null;
}

function loadSave(): SaveData {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "{}");
    const selected = SQUAD.some((p) => p.num === raw.selected) ? raw.selected : SQUAD[0].num;
    return { selected, season: raw.season && raw.season.fixtures ? raw.season : null };
  } catch {
    return { selected: SQUAD[0].num, season: null };
  }
}

function store(save: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Progress is optional in private browsing.
  }
}

function loadImage(src: string): Promise<HTMLImageElement | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(undefined);
    img.src = src;
  });
}

export function mountHeadToHead(root: HTMLElement): void {
  const locale = root.dataset.locale === "pt" ? "pt" : "en";
  const t = H2H_STRINGS[locale];
  const assets = root.dataset.assets ?? "/play/h2h/";
  const playAssets = root.dataset.playAssets ?? "/play/";
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const qa = <T extends HTMLElement = HTMLElement>(sel: string) => [...root.querySelectorAll<T>(sel)];
  const canvas = q<HTMLCanvasElement>("[data-h2h-canvas]")!;
  const audio = new H2HAudio(root.dataset.music ?? `${playAssets}seoul-song-2024.mp3`);
  const controls = new H2HControls(root);
  const save = loadSave();
  let selected = SQUAD.find((p) => p.num === save.selected) ?? SQUAD[0];
  let season = save.season ?? newSeason(selected, 2026 + selected.num);
  let match: H2HMatch | null = null;
  let renderer: H2HRenderer | null = null;
  let mode: "loading" | "select" | "season" | "quick" | "match" | "paused" | "result" | "end" = "loading";
  let quickKit: Kit = "home";
  let last = performance.now();
  let acc = 0;
  let raf = 0;
  let resultPending = false;
  let tableBefore = 1;
  let vsActive = false;
  let vsHold = false;
  let vsTimer = 0;
  let qaPaused = false;

  function show(next: typeof mode): void {
    mode = next;
    for (const s of qa("[data-h2h-screen]")) s.hidden = s.dataset.h2hScreen !== next;
    root.dataset.mode = next;
    q("[data-h2h-touch]")!.hidden = next !== "match";
    q("[data-h2h-hud]")!.hidden = !(next === "match" || next === "paused");
    document.body.classList.toggle("h2h-lock-scroll", next === "match" || next === "paused");
    if (next === "match") requestAnimationFrame(() => q("[data-h2h-stage]")?.scrollIntoView({ block: "center", inline: "nearest" }));
  }

  function syncSelected(): void {
    for (const b of qa<HTMLButtonElement>("[data-h2h-player]")) {
      const on = Number(b.dataset.h2hPlayer) === selected.num;
      b.setAttribute("aria-pressed", String(on));
    }
    q("[data-h2h-selected]")!.textContent = `#${selected.num} ${selected.ko} · ${selected.en}`;
    const img = q<HTMLImageElement>("[data-h2h-preview-img]");
    if (img) img.src = `${assets}stickers/${selected.num}-home.webp`;
    const line = q("[data-h2h-preview-line]");
    if (line) line.textContent = t.seasonLine(selected.goals, selected.assists, selected.apps);
    const bars = q("[data-h2h-preview-bars]");
    if (bars) {
      const stats = SQUAD.find((p) => p.num === selected.num);
      bars.textContent = "";
      if (stats) {
        const values = [stats.goals / 12 + 0.35, stats.height / 210, (stats.goals * 2 + stats.assists + stats.apps / 8) / 28];
        for (const v of values) {
          const s = document.createElement("span");
          s.style.setProperty("--v", String(Math.max(0.25, Math.min(0.9, v))));
          bars.append(s);
        }
      }
    }
  }

  function renderSeason(): void {
    const next = season.fixtures[season.round];
    q("[data-h2h-next]")!.textContent = next ? `${next.home ? t.home : t.away}: ${OPPONENTS[next.opponent].club} · ${OPPONENTS[next.opponent].name}` : seasonEnding();
    const tbody = q("[data-h2h-table]")!;
    tbody.textContent = "";
    sortRows(season.rows).forEach((row, i) => {
      const tr = document.createElement("tr");
      if (row.id === "seoul-eland") tr.dataset.seoul = "true";
      tr.innerHTML = `<td>${i + 1}</td><td><span style="--c:${row.color}"></span>${row.shortName}</td><td>${row.p}</td><td>${row.w}</td><td>${row.d}</td><td>${row.l}</td><td>${row.gf}</td><td>${row.ga}</td><td>${row.gd}</td><td>${row.pts}</td>`;
      tbody.append(tr);
    });
    const fx = q("[data-h2h-fixtures]")!;
    fx.textContent = "";
    for (const f of season.fixtures) {
      const li = document.createElement("li");
      li.dataset.done = String(!!f.result);
      if (f.result) li.dataset.chip = f.result.gf > f.result.ga ? "W" : f.result.gf === f.result.ga ? "D" : "L";
      li.textContent = `${String(f.round + 1).padStart(2, "0")} · ${f.home ? t.home : t.away} · ${OPPONENTS[f.opponent].club}${f.result ? ` · ${f.result.gf}-${f.result.ga}` : ""}`;
      fx.append(li);
    }
  }

  function seasonEnding(): string {
    validateTable(season);
    const rank = sortRows(season.rows).findIndex((r) => r.id === "seoul-eland") + 1;
    return rank === 1 ? t.champion : rank <= 5 ? t.playoff : t.again;
  }

  async function buildRenderer(opponent: OpponentSlug, kit: Kit): Promise<void> {
    const head = await loadImage(`${assets}heads/${selected.num}.webp`);
    const playerStrip = await loadImage(`${assets}players/${selected.num}-${kit}.webp`);
    const sticker = await loadImage(`${assets}stickers/${selected.num}-${kit}.webp`);
    const mascot = await loadImage(`${assets}mascots/${opponent}.webp`);
    const stadium =
      kit === "home"
        ? await loadImage(`${assets}stadium/mokdong.webp`)
        : (await loadImage(`${assets}stadium/away-${opponent}.webp`)) ?? (await loadImage(`${assets}stadium/away.webp`));
    const ball = await loadImage(`${playAssets}ball.webp`);
    const images: H2HImages = { playerHead: head, playerStrip, playerSticker: sticker, mascot, stadium, ball };
    renderer = new H2HRenderer(canvas, images, locale);
    if (match) match.images = images;
    layout();
  }

  function layout(): void {
    const box = q("[data-h2h-stage]")!;
    const rect = box.getBoundingClientRect();
    renderer?.resize(Math.max(300, Math.min(box.clientWidth, window.innerWidth - rect.left * 2 - 8)));
  }

  async function startMatch(opponent: OpponentSlug, kit: Kit, matchMode: "league" | "quick" | "ai" = "league"): Promise<void> {
    audio.unlock();
    audio.startMusic();
    match = new H2HMatch({ player: selected, opponent, kit, mode: matchMode, seed: Date.now() % 100000 });
    await buildRenderer(opponent, kit);
    const playerHud = q("[data-h2h-hud-player]");
    if (playerHud) playerHud.textContent = `${selected.ko} · ${selected.en}`;
    const rivalHud = q("[data-h2h-hud-rival]");
    if (rivalHud) rivalHud.innerHTML = `${OPPONENTS[opponent].name.toUpperCase()}<small>${OPPONENTS[opponent].korean}</small>`;
    const homeAvatar = q<HTMLElement>("[data-side='home']");
    if (homeAvatar) homeAvatar.style.backgroundImage = `url(${assets}heads/${selected.num}.webp)`;
    const rivalAvatar = q<HTMLElement>("[data-side='rival']");
    if (rivalAvatar) {
      rivalAvatar.style.backgroundImage = `url(${assets}mascot-heads/${opponent}.webp)`;
      rivalAvatar.style.backgroundColor = OPPONENTS[opponent].color;
    }
    resultPending = false;
    show("match");
    showVs(opponent, kit, matchMode);
  }

  function showVs(opponent: OpponentSlug, kit: Kit, matchMode: "league" | "quick" | "ai"): void {
    const vs = q<HTMLElement>("[data-h2h-vs]");
    if (!vs) return;
    vs.style.setProperty("--rival", OPPONENTS[opponent].color);
    const playerImg = q<HTMLImageElement>("[data-h2h-vs-player]");
    if (playerImg) playerImg.src = `${assets}stickers/${selected.num}-${kit}.webp`;
    const playerName = q("[data-h2h-vs-player-name]");
    if (playerName) playerName.textContent = `#${selected.num} ${selected.ko}`;
    const rivalImg = q<HTMLImageElement>("[data-h2h-vs-rival]");
    if (rivalImg) rivalImg.src = `${assets}mascot-heads/${opponent}.webp`;
    const rivalName = q("[data-h2h-vs-rival-name]");
    if (rivalName) rivalName.textContent = `${OPPONENTS[opponent].name} · ${OPPONENTS[opponent].korean}`;
    const meta = q("[data-h2h-vs-meta]");
    const round = season.round + 1;
    if (meta) meta.textContent = matchMode === "league" ? `${kit === "home" ? "Mokdong Leoul Park" : OPPONENTS[opponent].club} · Round ${round} of 16` : "Quick match";
    vs.hidden = false;
    vsActive = true;
    window.clearTimeout(vsTimer);
    if (!vsHold) vsTimer = window.setTimeout(() => hideVs(), 1800);
  }

  function hideVs(): void {
    const vs = q<HTMLElement>("[data-h2h-vs]");
    if (vs) vs.hidden = true;
    vsActive = false;
  }

  for (const b of qa<HTMLButtonElement>("[data-h2h-player]")) b.addEventListener("click", () => {
    selected = SQUAD.find((p) => p.num === Number(b.dataset.h2hPlayer)) ?? selected;
    save.selected = selected.num;
    if (!save.season || save.season.playerNum !== selected.num) {
      season = newSeason(selected, 2026 + selected.num);
      save.season = season;
    }
    store(save);
    syncSelected();
    renderSeason();
  });
  q("[data-h2h-to-season]")?.addEventListener("click", () => {
    renderSeason();
    show("season");
  });
  q("[data-h2h-to-select]")?.addEventListener("click", () => show("select"));
  q("[data-h2h-new-season]")?.addEventListener("click", () => {
    season = newSeason(selected, 2026 + selected.num + Math.floor(Math.random() * 9000));
    save.season = season;
    store(save);
    renderSeason();
  });
  q("[data-h2h-play-next]")?.addEventListener("click", () => {
    const next = season.fixtures[season.round];
    if (!next) {
      show("end");
      q("[data-h2h-end-text]")!.textContent = seasonEnding();
      return;
    }
    tableBefore = sortRows(season.rows).findIndex((r) => r.id === "seoul-eland") + 1;
    void startMatch(next.opponent, next.home ? "home" : "away", "league");
  });
  q("[data-h2h-to-quick]")?.addEventListener("click", () => show("quick"));
  for (const b of qa<HTMLButtonElement>("[data-h2h-kit]")) b.addEventListener("click", () => {
    quickKit = b.dataset.h2hKit as Kit;
    for (const x of qa<HTMLButtonElement>("[data-h2h-kit]")) x.setAttribute("aria-pressed", String(x === b));
  });
  for (const b of qa<HTMLButtonElement>("[data-h2h-quick]")) b.addEventListener("click", () => {
    void startMatch(b.dataset.h2hQuick as OpponentSlug, quickKit, "quick");
  });
  q("[data-h2h-pause]")?.addEventListener("click", () => show(mode === "paused" ? "match" : "paused"));
  q("[data-h2h-mute]")?.addEventListener("click", () => {
    audio.setMuted(!audio.muted);
    const btn = q("[data-h2h-mute]");
    if (btn) btn.textContent = audio.muted ? "×" : "♪";
  });
  q("[data-h2h-resume]")?.addEventListener("click", () => show("match"));
  q("[data-h2h-result-continue]")?.addEventListener("click", () => {
    renderSeason();
    show("season");
  });
  q("[data-h2h-menu]")?.addEventListener("click", () => {
    renderSeason();
    show("season");
  });
  window.addEventListener("resize", layout);
  window.addEventListener("keydown", (e) => {
    if ((e.key === "p" || e.key === "Escape") && (mode === "match" || mode === "paused")) show(mode === "match" ? "paused" : "match");
    if (vsActive) hideVs();
  });
  root.addEventListener("pointerdown", () => {
    if (vsActive && !vsHold) hideVs();
  });

  function updateHud(): void {
    if (!match) return;
    q("[data-h2h-clock]")!.textContent = match.goldenGoal ? "GG" : `${Math.floor(match.clock / 60)}:${String(Math.ceil(match.clock % 60)).padStart(2, "0")}`;
    q("[data-h2h-score]")!.textContent = `${match.score.left} : ${match.score.right}`;
    q("[data-h2h-power]")!.style.setProperty("--p", String(match.left.power));
    q("[data-h2h-rival-power]")!.style.setProperty("--p", String(match.right.power));
  }

  function finishResult(): void {
    if (!match || resultPending) return;
    resultPending = true;
    const score = `${match.score.left}-${match.score.right}`;
    q("[data-h2h-result-score]")!.textContent = score;
    const pts = match.score.left > match.score.right ? 3 : match.score.left === match.score.right ? 1 : 0;
    q("[data-h2h-result-line]")!.textContent =
      match.score.left > match.score.right ? `${t.winLine(`#${selected.num} ${selected.ko}`)} ${t.pointsGained(pts)}` : match.score.left < match.score.right ? `${t.lossLine(OPPONENTS[match.opponent].name)} ${t.pointsGained(pts)}` : `${t.drawLine} ${t.pointsGained(pts)}`;
    if (match.mode === "league") {
      season = applyRound(season, match.score.left, match.score.right);
      save.season = season;
      store(save);
    }
    const after = sortRows(season.rows).findIndex((r) => r.id === "seoul-eland") + 1;
    const stats = q("[data-h2h-result-stats]");
    if (stats) stats.textContent = `${match.score.left} goals · ${match.stats.kickContacts} shots · ${match.stats.powerShots} power shots`;
    const move = q("[data-h2h-result-table]");
    if (move) move.textContent = match.mode === "league" ? t.tableMove(tableBefore, after) : t.quickMatch;
    show("result");
  }

  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (mode === "match" && match && !vsActive && !qaPaused) {
      acc += dt;
      while (acc >= STEP) {
        const ai = match.aiInput("right", STEP);
        match.step(STEP, controls.frame(), ai);
        for (const ev of match.events) {
          if (ev.type === "kick") audio.boot();
          if (ev.type === "goal") audio.goal();
          if (ev.type === "power") audio.powerShot();
          if (ev.type === "pickup") audio.pickup();
          if (ev.type === "post") audio.post();
        }
        if (match.phase === "ended") finishResult();
        acc -= STEP;
      }
    }
    renderer?.draw(match ?? new H2HMatch({ player: selected, opponent: "ansan-greeners", kit: "home", mode: "quick", seed: 1 }));
    updateHud();
    raf = requestAnimationFrame(frame);
  }

  syncSelected();
  renderSeason();
  show("select");
  raf = requestAnimationFrame(frame);
  document.addEventListener("visibilitychange", () => audio.suspend(document.hidden));

  const api = {
    get match() {
      return match;
    },
    get season() {
      return season;
    },
    startSeason: () => {
      season = newSeason(selected, 2026 + selected.num);
      save.season = season;
      store(save);
      renderSeason();
    },
    startQuick: (opponent: OpponentSlug = "ansan-greeners", kit: Kit = "home") => startMatch(opponent, kit, "quick"),
    simulateAiMatch: (seed = 1, opponent: OpponentSlug = "ansan-greeners") => simulateAiMatch(selected, opponent, seed),
    hitboxes: () => hitboxes(match),
    debug: (on: boolean) => {
      renderer?.setDebug(!!on);
      if (match) renderer?.draw(match);
    },
    pause: (on: boolean) => {
      qaPaused = !!on;
      if (match) renderer?.draw(match);
    },
    endNow: () => {
      if (match) {
        match.elapsed = 90;
        match.step(STEP, blankInput(), blankInput());
      }
    },
    forceGoal: (side: "left" | "right") => {
      if (!match) return;
      match.ball.x = side === "left" ? 1510 : 90;
      match.ball.y = 705;
      match.ball.vx = side === "left" ? 360 : -360;
      match.ball.vy = 0;
      match.step(STEP, blankInput(), blankInput());
    },
    setSeasonRound: (n: number) => {
      season.round = Math.max(0, Math.min(16, Math.floor(n)));
      renderSeason();
    },
    holdVs: (hold: boolean) => {
      vsHold = hold;
      if (!hold && vsActive) hideVs();
    },
    finishSeason: (position = 1) => {
      const rows = sortRows(season.rows);
      const seoul = rows.find((r) => r.id === "seoul-eland");
      if (seoul) {
        seoul.p = 16;
        seoul.w = position === 1 ? 11 : position <= 5 ? 8 : 6;
        seoul.d = position === 1 ? 4 : position <= 5 ? 5 : 4;
        seoul.l = 16 - seoul.w - seoul.d;
        seoul.gf = position === 1 ? 42 : position <= 5 ? 30 : 24;
        seoul.ga = position === 1 ? 18 : position <= 5 ? 23 : 28;
        seoul.gd = seoul.gf - seoul.ga;
        seoul.pts = seoul.w * 3 + seoul.d;
      }
      season.round = 16;
      q("[data-h2h-end-text]")!.textContent = position === 1 ? t.champion : position <= 5 ? t.playoff : t.again;
      show("end");
    },
    destroy: () => cancelAnimationFrame(raf),
  };
  if (new URLSearchParams(location.search).has("qa")) (window as unknown as { __h2h?: typeof api }).__h2h = api;
}

export function simulateAiMatch(player: SquadPlayer, opponent: OpponentSlug, seed: number): H2HMatch {
  const m = new H2HMatch({ player, opponent, kit: "home", mode: "ai", seed });
  m.start();
  let guard = 0;
  while (m.phase !== "ended" && guard++ < 60 * 260) {
    const left = m.aiInput("left", STEP);
    const right = m.aiInput("right", STEP);
    m.step(STEP, left, right);
  }
  return m;
}

export function makeBlankInput(): InputState {
  return blankInput();
}

function hitboxes(match: H2HMatch | null) {
  if (!match) return null;
  const body = (b: Body) => {
    const h = headCenter(b);
    return {
      x: b.x - b.w / 2,
      y: b.y - b.h,
      w: b.w,
      h: b.h,
      head: { x: h.x, y: h.y, r: b.headR * (b.bigHeadT > 0 ? 1.3 : 1) },
    };
  };
  return {
    left: body(match.left),
    right: body(match.right),
    ball: { x: match.ball.x, y: match.ball.y, r: match.ball.r },
  };
}
