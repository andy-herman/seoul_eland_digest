// Dev server: cd site && npx astro dev --port 4322 --host 127.0.0.1
// QA hook: add ?qa to expose window.__h2h with { match, startQuick, startSeason, simulateAiMatch, season }.

import { SQUAD, OPPONENTS, SEOUL_TEAM, type Kit, type OpponentSlug, type SquadPlayer } from "./data";
import { applyRound, newSeason, sortRows, validateTable, type SeasonState, type TeamRow } from "./league";
import { H2HMatch, STEP, WORLD_W, blankInput, headCenter, type Body, type InputState } from "./sim";
import { H2HRenderer, type H2HImages } from "./render";
import { H2HControls } from "./input";
import { H2HAudio } from "./audio";
import { H2H_STRINGS, type EndVariant } from "./i18n";

const SAVE_KEY = "h2h-save-v1";
const VS_MS = 2000;
const RESULT_DELAY_MS = 1100;
const CONFETTI = ["#ffd64a", "#ffffff", "#1b2446", "#f97316", "#38bdf8", "#f472b6"];

interface SideTally {
  kicks: number;
  headers: number;
  power: number;
  goals: string[];
}

interface MatchTally {
  left: SideTally;
  right: SideTally;
  territory: number;
  playT: number;
  prevHeader: { left: number; right: number };
  prevKickHit: { left: boolean; right: boolean };
  prevScore: { left: number; right: number };
}

function newTally(): MatchTally {
  const side = (): SideTally => ({ kicks: 0, headers: 0, power: 0, goals: [] });
  return { left: side(), right: side(), territory: 0, playT: 0, prevHeader: { left: 0, right: 0 }, prevKickHit: { left: false, right: false }, prevScore: { left: 0, right: 0 } };
}

function clubShort(club: string): string {
  return club.replace(/\s*FC\b/g, "").replace(/\s+/g, " ").trim();
}

function reducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function confetti(host: HTMLElement | null, count: number): void {
  if (!host) return;
  host.textContent = "";
  if (reducedMotion()) return;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("i");
    piece.style.setProperty("--x", `${Math.round(Math.random() * 100)}%`);
    piece.style.setProperty("--dx", `${Math.round((Math.random() - 0.5) * 120)}px`);
    piece.style.setProperty("--c", CONFETTI[i % CONFETTI.length]);
    piece.style.setProperty("--w", `${(0.4 + Math.random() * 0.35).toFixed(2)}rem`);
    piece.style.setProperty("--d", `${(2.2 + Math.random() * 1.6).toFixed(2)}s`);
    piece.style.setProperty("--delay", `${(Math.random() * 0.9).toFixed(2)}s`);
    piece.style.setProperty("--r", `${Math.round(360 + Math.random() * 540) * (Math.random() < 0.5 ? -1 : 1)}deg`);
    host.append(piece);
  }
}

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
  let tally = newTally();
  let resultTimer = 0;
  let lastQuick: { opponent: OpponentSlug; kit: Kit } | null = null;
  const compactLandscape = window.matchMedia("(orientation: landscape) and (max-height: 520px)");

  function show(next: typeof mode): void {
    mode = next;
    for (const s of qa("[data-h2h-screen]")) s.hidden = s.dataset.h2hScreen !== next;
    root.dataset.mode = next;
    q("[data-h2h-touch]")!.hidden = next !== "match";
    q("[data-h2h-hud]")!.hidden = !(next === "match" || next === "paused");
    document.body.classList.toggle("h2h-lock-scroll", next === "match" || next === "paused");
    if (next === "match" || next === "paused") layout();
    if (next === "paused") {
      const score = q("[data-h2h-pause-score]");
      if (score) score.textContent = `${q("[data-h2h-score]")?.textContent ?? "0 : 0"} · ${q("[data-h2h-clock]")?.textContent ?? ""}`;
    }
    if (next === "match") requestAnimationFrame(() => q("[data-h2h-stage]")?.scrollIntoView({ block: "center", inline: "nearest" }));
    else if (next !== "paused" && next !== "loading") requestAnimationFrame(() => revealScreen(next));
  }

  function revealScreen(name: typeof mode): void {
    const screen = q(`[data-h2h-screen='${name}']`);
    if (!screen || screen.hidden) return;
    const top = screen.getBoundingClientRect().top;
    const big = name === "result" || name === "end";
    if (top < 72 || (big && top > window.innerHeight * 0.3)) screen.scrollIntoView({ block: "start" });
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

  function seoulRank(): number {
    return sortRows(season.rows).findIndex((r) => r.id === SEOUL_TEAM.id) + 1;
  }

  function zone(pos: number): string {
    return pos <= 2 ? "up" : pos <= 6 ? "po" : pos >= 17 ? "rel" : "";
  }

  function teamCell(row: TeamRow): string {
    const seoul = row.id === SEOUL_TEAM.id;
    const img = seoul ? `${assets}heads/${selected.num}.webp` : `${assets}mascot-heads/${row.id}.webp`;
    const club = seoul ? "Seoul E-Land" : clubShort(row.name);
    const mascot = seoul ? "" : `<small>${row.shortName}</small>`;
    return `<span class="h2h-team"><img src="${img}" alt="" width="28" height="28" loading="lazy" style="--c:${row.color}" /><span>${club}${mascot}</span></span>`;
  }

  function chip(gf: number, ga: number): string {
    const r = gf > ga ? "W" : gf === ga ? "D" : "L";
    const label = locale === "pt" ? ({ W: "V", D: "E", L: "D" } as Record<string, string>)[r] : r;
    return `<i data-r="${r}">${label}</i>`;
  }

  function renderSeason(): void {
    const next = season.fixtures[season.round];
    const nextImg = q<HTMLImageElement>("[data-h2h-next-img]");
    const nextRound = q("[data-h2h-next-round]");
    if (next) {
      const o = OPPONENTS[next.opponent];
      q("[data-h2h-next]")!.textContent = `${next.home ? t.home : t.away} · ${o.club} · ${o.name} ${o.korean}`;
      if (nextRound) nextRound.textContent = t.roundOf(next.round + 1);
      if (nextImg) {
        nextImg.src = `${assets}mascot-heads/${next.opponent}.webp`;
        nextImg.style.setProperty("--next", o.color);
      }
    } else {
      q("[data-h2h-next]")!.textContent = seasonEnding();
      if (nextRound) nextRound.textContent = `${t.ordinal(seoulRank())} ${t.ofTeams}`;
      if (nextImg) {
        nextImg.src = `${assets}heads/${selected.num}.webp`;
        nextImg.style.setProperty("--next", SEOUL_TEAM.color);
      }
    }
    const tbody = q("[data-h2h-table]")!;
    tbody.textContent = "";
    sortRows(season.rows).forEach((row, i) => {
      const tr = document.createElement("tr");
      if (row.id === SEOUL_TEAM.id) tr.dataset.seoul = "true";
      const z = zone(i + 1);
      if (z) tr.dataset.zone = z;
      tr.innerHTML = `<td>${i + 1}</td><td>${teamCell(row)}</td><td>${row.p}</td><td>${row.w}</td><td>${row.d}</td><td>${row.l}</td><td class="h2h-opt">${row.gf}</td><td class="h2h-opt">${row.ga}</td><td>${row.gd > 0 ? "+" : ""}${row.gd}</td><td>${row.pts}</td>`;
      tbody.append(tr);
    });
    const fx = q("[data-h2h-fixtures]")!;
    fx.textContent = "";
    for (const f of season.fixtures) {
      const o = OPPONENTS[f.opponent];
      const li = document.createElement("li");
      li.dataset.done = String(!!f.result);
      if (f.round === season.round) li.dataset.next = "true";
      const score = f.result ? `<em>${f.result.gf}-${f.result.ga} ${chip(f.result.gf, f.result.ga)}</em>` : "<em></em>";
      li.innerHTML = `<b>${t.roundShort(f.round + 1)}</b><img src="${assets}mascot-heads/${f.opponent}.webp" alt="" width="30" height="30" loading="lazy" style="--c:${o.color}" /><span>${f.home ? t.home : t.away} · ${clubShort(o.club)}</span>${score}`;
      fx.append(li);
    }
  }

  function endVariant(rank: number): EndVariant {
    return rank === 1 ? "champion" : rank === 2 ? "runnerUp" : rank <= 6 ? "playoff" : rank >= 17 ? "relegation" : "mid";
  }

  function seasonEnding(): string {
    try {
      validateTable(season);
    } catch (err) {
      console.warn(err);
    }
    const rank = seoulRank();
    return t.endLine[endVariant(rank)](t.ordinal(rank));
  }

  function showEnd(): void {
    const rank = seoulRank();
    const variant = endVariant(rank);
    const screen = q("[data-h2h-screen='end']")!;
    screen.dataset.variant = variant;
    q("[data-h2h-end-title]")!.textContent = t.endTitle[variant];
    q("[data-h2h-end-text]")!.textContent = seasonEnding();
    q("[data-h2h-end-pos]")!.textContent = t.ordinal(rank);
    const sticker = q<HTMLImageElement>("[data-h2h-end-sticker]");
    if (sticker) sticker.src = `${assets}stickers/${selected.num}-home.webp`;
    const row = season.rows.find((r) => r.id === SEOUL_TEAM.id);
    if (row) {
      q("[data-h2h-end-record]")!.textContent = `${row.w}-${row.d}-${row.l}`;
      q("[data-h2h-end-goals]")!.textContent = `${row.gf}-${row.ga}`;
      q("[data-h2h-end-points]")!.textContent = String(row.pts);
    }
    const wins = season.userResults.filter((r) => r.gf > r.ga);
    const best = wins.slice().sort((a, b) => b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf)[0];
    const bestEl = q("[data-h2h-end-best]")!;
    bestEl.textContent = best ? `${best.gf}-${best.ga}` : "-";
    if (best) {
      const vs = document.createElement("small");
      vs.textContent = t.vsLabel(OPPONENTS[best.opponent].name);
      bestEl.append(vs);
    }
    const beaten = q("[data-h2h-end-beaten]")!;
    beaten.textContent = "";
    const seen = new Set<OpponentSlug>();
    for (const w of wins) {
      if (seen.has(w.opponent)) continue;
      seen.add(w.opponent);
      const img = document.createElement("img");
      img.src = `${assets}mascot-heads/${w.opponent}.webp`;
      img.alt = OPPONENTS[w.opponent].name;
      img.title = `${OPPONENTS[w.opponent].name} · ${w.gf}-${w.ga}`;
      img.width = 48;
      img.height = 48;
      img.style.setProperty("--c", OPPONENTS[w.opponent].color);
      img.style.setProperty("--delay", `${(0.5 + seen.size * 0.06).toFixed(2)}s`);
      beaten.append(img);
    }
    if (!seen.size) {
      const em = document.createElement("em");
      em.textContent = t.endNoneBeaten;
      beaten.append(em);
    }
    confetti(q("[data-h2h-end-confetti]"), variant === "champion" ? 70 : variant === "runnerUp" ? 50 : variant === "playoff" ? 24 : 0);
    if (variant === "champion" || variant === "runnerUp") audio.levelUp();
    show("end");
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
    let width = box.clientWidth;
    if (compactLandscape.matches && (mode === "match" || mode === "paused")) {
      width = Math.min(box.clientWidth, box.clientHeight * 16 / 9);
    }
    renderer?.resize(Math.max(300, width));
  }

  async function startMatch(opponent: OpponentSlug, kit: Kit, matchMode: "league" | "quick" | "ai" = "league"): Promise<void> {
    audio.unlock();
    audio.startMusic();
    match = new H2HMatch({ player: selected, opponent, kit, mode: matchMode, seed: Date.now() % 100000 });
    await buildRenderer(opponent, kit);
    const playerHud = q("[data-h2h-hud-player]");
    if (playerHud) playerHud.textContent = `${selected.ko} · ${selected.en}`;
    const rivalName = q("[data-h2h-hud-rival-name]");
    if (rivalName) rivalName.textContent = OPPONENTS[opponent].name.toUpperCase();
    const rivalKo = q("[data-h2h-hud-rival-ko]");
    if (rivalKo) rivalKo.textContent = `${OPPONENTS[opponent].korean} · ${clubShort(OPPONENTS[opponent].club)}`;
    const homeAvatar = q<HTMLElement>("[data-side='home']");
    if (homeAvatar) homeAvatar.style.backgroundImage = `url(${assets}heads/${selected.num}.webp)`;
    const rivalAvatar = q<HTMLElement>("[data-side='rival']");
    if (rivalAvatar) {
      rivalAvatar.style.backgroundImage = `url(${assets}mascot-heads/${opponent}.webp)`;
      rivalAvatar.style.backgroundColor = OPPONENTS[opponent].color;
    }
    resultPending = false;
    window.clearTimeout(resultTimer);
    tally = newTally();
    if (matchMode === "quick") lastQuick = { opponent, kit };
    show("match");
    showVs(opponent, kit, matchMode);
  }

  function venue(opponent: OpponentSlug, kit: Kit): string {
    return kit === "home" ? t.venueHome : t.venueAway(OPPONENTS[opponent].club);
  }

  function showVs(opponent: OpponentSlug, kit: Kit, matchMode: "league" | "quick" | "ai"): void {
    const vs = q<HTMLElement>("[data-h2h-vs]");
    if (!vs) return;
    const o = OPPONENTS[opponent];
    vs.style.setProperty("--rival", o.color);
    const playerImg = q<HTMLImageElement>("[data-h2h-vs-player]");
    if (playerImg) playerImg.src = `${assets}stickers/${selected.num}-${kit}.webp`;
    q("[data-h2h-vs-player-name]")!.textContent = `#${selected.num} ${selected.ko}`;
    q("[data-h2h-vs-player-sub]")!.textContent = `${selected.en} · ${selected.pos}`;
    const rivalImg = q<HTMLImageElement>("[data-h2h-vs-rival]");
    if (rivalImg) rivalImg.src = `${assets}mascot-heads/${opponent}.webp`;
    q("[data-h2h-vs-rival-club]")!.textContent = o.club;
    q("[data-h2h-vs-rival-name]")!.textContent = o.korean;
    q("[data-h2h-vs-rival-sub]")!.textContent = `${o.name} · ${o.kind[locale]}`;
    const meta = q("[data-h2h-vs-meta]");
    if (meta) meta.textContent = matchMode === "league" ? `${t.roundOf(season.round + 1)} · ${venue(opponent, kit)}` : `${t.quickMatch} · ${venue(opponent, kit)}`;
    vs.hidden = true;
    void vs.offsetWidth;
    vs.hidden = false;
    vsActive = true;
    audio.whistle();
    window.clearTimeout(vsTimer);
    if (!vsHold) vsTimer = window.setTimeout(() => hideVs(), VS_MS);
  }

  function hideVs(): void {
    const vs = q<HTMLElement>("[data-h2h-vs]");
    if (vs) vs.hidden = true;
    vsActive = false;
    window.clearTimeout(vsTimer);
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
  for (const b of qa("[data-h2h-to-select]")) b.addEventListener("click", () => show("select"));
  for (const b of qa("[data-h2h-new-season]")) b.addEventListener("click", () => {
    season = newSeason(selected, 2026 + selected.num + Math.floor(Math.random() * 9000));
    save.season = season;
    store(save);
    renderSeason();
    show("season");
  });
  q("[data-h2h-play-next]")?.addEventListener("click", () => {
    const next = season.fixtures[season.round];
    if (!next) {
      showEnd();
      return;
    }
    tableBefore = seoulRank();
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
    if (match?.mode === "quick") {
      show("quick");
      return;
    }
    renderSeason();
    if (!season.fixtures[season.round]) showEnd();
    else show("season");
  });
  q("[data-h2h-rematch]")?.addEventListener("click", () => {
    if (lastQuick) void startMatch(lastQuick.opponent, lastQuick.kit, "quick");
  });
  q("[data-h2h-menu]")?.addEventListener("click", () => {
    if (match?.phase === "ended") return;
    if (match?.mode === "quick") {
      show("quick");
      return;
    }
    renderSeason();
    show("season");
  });
  window.addEventListener("resize", layout);
  window.addEventListener("keydown", (e) => {
    if (vsActive && !vsHold) {
      hideVs();
      return;
    }
    if ((e.key === "p" || e.key === "Escape") && (mode === "match" || mode === "paused")) show(mode === "match" ? "paused" : "match");
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

  function track(m: H2HMatch): void {
    for (const side of ["left", "right"] as const) {
      const b = m[side];
      if (b.headerT > tally.prevHeader[side] + 0.001) tally[side].headers += 1;
      tally.prevHeader[side] = b.headerT;
      if (b.kickHit && !tally.prevKickHit[side]) tally[side].kicks += 1;
      tally.prevKickHit[side] = b.kickHit;
      while (m.score[side] > tally.prevScore[side]) {
        tally.prevScore[side] += 1;
        tally[side].goals.push(m.goldenGoal ? "90+'" : `${Math.max(1, Math.min(90, Math.ceil(m.elapsed)))}'`);
      }
    }
    for (const ev of m.events) if (ev.type === "power" && ev.by) tally[ev.by].power += 1;
    if (m.phase === "play") {
      tally.playT += STEP;
      if (m.ball.x > WORLD_W / 2) tally.territory += STEP;
    }
  }

  function setStat(key: string, home: number, rival: number, suffix = ""): void {
    const row = q(`[data-h2h-stat='${key}']`);
    if (!row) return;
    row.querySelector("[data-h2h-stat-home]")!.textContent = `${home}${suffix}`;
    row.querySelector("[data-h2h-stat-rival]")!.textContent = `${rival}${suffix}`;
    row.style.setProperty("--l", "0.5");
    const share = home + rival > 0 ? home / (home + rival) : 0.5;
    requestAnimationFrame(() => requestAnimationFrame(() => row.style.setProperty("--l", share.toFixed(3))));
  }

  function finishResult(): void {
    if (!match || resultPending) return;
    resultPending = true;
    audio.whistle();
    const done = match;
    window.clearTimeout(resultTimer);
    resultTimer = window.setTimeout(() => showResult(done), RESULT_DELAY_MS);
  }

  function showResult(m: H2HMatch): void {
    const o = OPPONENTS[m.opponent];
    const gf = m.score.left;
    const ga = m.score.right;
    const outcome = gf > ga ? "win" : gf === ga ? "draw" : "loss";
    const league = m.mode === "league";
    const round = season.round + 1;
    if (league) {
      season = applyRound(season, gf, ga);
      save.season = season;
      store(save);
    }
    const screen = q("[data-h2h-screen='result']")!;
    screen.dataset.outcome = outcome;
    screen.style.setProperty("--rival", o.color);
    q("[data-h2h-result-banner]")!.textContent = t.banner[outcome];
    q("[data-h2h-result-meta]")!.textContent = league ? `${t.roundOf(round)} · ${venue(m.opponent, m.kit)}` : `${t.quickMatch} · ${venue(m.opponent, m.kit)}`;
    const homeImg = q<HTMLImageElement>("[data-h2h-result-home-img]");
    if (homeImg) homeImg.src = `${assets}heads/${selected.num}.webp`;
    q("[data-h2h-result-home-name]")!.textContent = `#${selected.num} ${selected.ko}`;
    const rivalImg = q<HTMLImageElement>("[data-h2h-result-rival-img]");
    if (rivalImg) rivalImg.src = `${assets}mascot-heads/${m.opponent}.webp`;
    q("[data-h2h-result-rival-name]")!.textContent = `${o.name} ${o.korean}`;
    q("[data-h2h-result-home-goals]")!.textContent = tally.left.goals.length ? `⚽ ${tally.left.goals.join(" ")}` : "";
    q("[data-h2h-result-rival-goals]")!.textContent = tally.right.goals.length ? `⚽ ${tally.right.goals.join(" ")}` : "";
    q("[data-h2h-result-score]")!.textContent = `${gf} : ${ga}`;
    const pts = gf > ga ? 3 : gf === ga ? 1 : 0;
    const pill = q("[data-h2h-result-points]")!;
    pill.textContent = t.pointsShort(pts);
    pill.hidden = !league;
    q("[data-h2h-result-line]")!.textContent = outcome === "win" ? t.winLine(`#${selected.num} ${selected.ko}`) : outcome === "loss" ? t.lossLine(o.name) : t.drawLine;
    setStat("kicks", tally.left.kicks, tally.right.kicks);
    setStat("headers", tally.left.headers, tally.right.headers);
    setStat("power", tally.left.power, tally.right.power);
    const terr = tally.playT > 0 ? Math.round((tally.territory / tally.playT) * 100) : 50;
    setStat("territory", terr, 100 - terr, "%");
    const mini = q("[data-h2h-result-mini]")!;
    mini.hidden = !league;
    if (league) {
      const rows = sortRows(season.rows);
      const after = rows.findIndex((r) => r.id === SEOUL_TEAM.id) + 1;
      const move = q("[data-h2h-result-move]")!;
      move.textContent = t.moveLine(tableBefore, after);
      move.dataset.dir = after < tableBefore ? "up" : after > tableBefore ? "down" : "same";
      const list = q("[data-h2h-result-rows]")!;
      list.textContent = "";
      const from = Math.max(0, Math.min(rows.length - 5, after - 3));
      rows.slice(from, from + 5).forEach((row, i) => {
        const li = document.createElement("li");
        if (row.id === SEOUL_TEAM.id) li.dataset.seoul = "true";
        const img = row.id === SEOUL_TEAM.id ? `${assets}heads/${selected.num}.webp` : `${assets}mascot-heads/${row.id}.webp`;
        const name = row.id === SEOUL_TEAM.id ? "Seoul E-Land" : clubShort(row.name);
        li.innerHTML = `<b>${from + i + 1}</b><img src="${img}" alt="" width="24" height="24" style="--c:${row.color}" /><span>${name}</span><b>${row.pts}</b>`;
        list.append(li);
      });
    }
    const rematch = q("[data-h2h-rematch]");
    if (rematch) rematch.hidden = m.mode !== "quick";
    confetti(q("[data-h2h-result-confetti]"), outcome === "win" ? 46 : 0);
    if (outcome === "win") audio.levelUp();
    else if (outcome === "loss") audio.miss();
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
        track(match);
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
    if (match && (mode === "match" || mode === "paused")) {
      renderer?.draw(match);
      updateHud();
    }
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
        track(match);
      }
    },
    forceGoal: (side: "left" | "right") => {
      if (!match) return;
      match.ball.x = side === "left" ? 1510 : 90;
      match.ball.y = 705;
      match.ball.vx = side === "left" ? 360 : -360;
      match.ball.vy = 0;
      match.step(STEP, blankInput(), blankInput());
      track(match);
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
      // QA only: play out the remaining rounds with scripted scores aimed at a finishing zone.
      const script = position <= 1 ? [[4, 0]] : position === 2 ? [[3, 1], [2, 1], [1, 1]] : position <= 6 ? [[2, 1], [1, 1], [0, 1], [3, 2]] : position >= 17 ? [[0, 3], [0, 2], [1, 1], [0, 4]] : [[1, 2], [2, 2], [2, 1], [0, 1]];
      season = newSeason(selected, 2026 + selected.num + position);
      let i = 0;
      while (season.fixtures[season.round]) {
        const [gf, ga] = script[i++ % script.length];
        season = applyRound(season, gf, ga);
      }
      save.season = season;
      store(save);
      renderSeason();
      showEnd();
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
