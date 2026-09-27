// Dev server: cd site && npx astro dev --port 4322 --host 127.0.0.1
// QA hook: add ?qa to expose window.__h2h with { match, startQuick, startSeason, simulateAiMatch, season }.

import { SQUAD, OPPONENTS, type Kit, type OpponentSlug, type SquadPlayer } from "./data";
import { applyRound, newSeason, sortRows, validateTable, type SeasonState } from "./league";
import { H2HMatch, STEP, blankInput, type InputState } from "./sim";
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

  function show(next: typeof mode): void {
    mode = next;
    for (const s of qa("[data-h2h-screen]")) s.hidden = s.dataset.h2hScreen !== next;
    root.dataset.mode = next;
    q("[data-h2h-touch]")!.hidden = next !== "match";
    q("[data-h2h-hud]")!.hidden = !(next === "match" || next === "paused");
  }

  function syncSelected(): void {
    for (const b of qa<HTMLButtonElement>("[data-h2h-player]")) {
      const on = Number(b.dataset.h2hPlayer) === selected.num;
      b.setAttribute("aria-pressed", String(on));
    }
    q("[data-h2h-selected]")!.textContent = `#${selected.num} ${selected.ko} · ${selected.en}`;
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
    const sticker = await loadImage(`${assets}stickers/${selected.num}-${kit}.webp`);
    const mascot = await loadImage(`${assets}mascots/${opponent}.webp`);
    const stadium =
      kit === "home"
        ? await loadImage(`${assets}stadium/mokdong.webp`)
        : (await loadImage(`${assets}stadium/away-${opponent}.webp`)) ?? (await loadImage(`${assets}stadium/away.webp`));
    const ball = await loadImage(`${playAssets}ball.webp`);
    const images: H2HImages = { playerHead: head, playerSticker: sticker, mascot, stadium, ball };
    renderer = new H2HRenderer(canvas, images, locale);
    if (match) match.images = images;
    layout();
  }

  function layout(): void {
    const box = q("[data-h2h-stage]")!;
    renderer?.resize(Math.min(box.clientWidth, window.innerWidth - 22));
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
    resultPending = false;
    show("match");
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
    show("result");
  }

  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (mode === "match" && match) {
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
