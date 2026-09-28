// Dev server: cd site && npx astro dev --port 4322 --host 127.0.0.1
// QA hook: add ?qa to expose window.__h2h (match, state, startQuick, endNow, forceGoal, debugRestart, ...).

import { SQUAD, OPPONENTS, SEOUL_TEAM, AI_TIER, type Kit, type OpponentSlug, type SquadPlayer } from "./data";
import { applyRound, newSeason, sortRows, validateTable, type SeasonState, type TeamRow } from "./league";
import { FcMatch, blankFcInput, simulateFcMatch } from "./fc/sim";
import { FC_STEP, type FcEvent, type FcState, type RestartType, type Side } from "./fc/types";
import { FcRenderer, type FcRenderImages } from "./fc/render";
import { FcControls } from "./fc/input";
import { H2HAudio } from "./audio";
import { H2H_STRINGS, type EndVariant } from "./i18n";
import { RIVAL_OVR, bestFive, cardFor, teamOvr, type FcCard } from "./ratings";

const SAVE_KEY = "h2h-save-v1";
const VS_MS = 2200;
const RESULT_DELAY_MS = 1300;
const CONFETTI = ["#ffd64a", "#ffffff", "#1b2446", "#f97316", "#38bdf8", "#f472b6"];

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

function stars(n: number): string {
  return "★".repeat(n) + "☆".repeat(Math.max(0, 5 - n));
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
  const controls = new FcControls(root);
  const save = loadSave();
  let selected = SQUAD.find((p) => p.num === save.selected) ?? SQUAD[0];
  let season = save.season ?? newSeason(selected, 2026 + selected.num);
  let match: FcMatch | null = null;
  let renderer: FcRenderer | null = null;
  let lineup: SquadPlayer[] = bestFive(selected.num);
  let matchMeta: { opponent: OpponentSlug; kit: Kit; mode: "league" | "quick" } = { opponent: "ansan-greeners", kit: "home", mode: "quick" };
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
  let resultTimer = 0;
  let hintKey = "";
  let lastQuick: { opponent: OpponentSlug; kit: Kit } | null = null;
  const coarse = window.matchMedia("(pointer: coarse)");
  const portrait = window.matchMedia("(orientation: portrait)");

  function show(next: typeof mode): void {
    mode = next;
    for (const s of qa("[data-h2h-screen]")) s.hidden = s.dataset.h2hScreen !== next;
    root.dataset.mode = next;
    q("[data-h2h-touch]")!.hidden = next !== "match";
    q("[data-h2h-hud]")!.hidden = !(next === "match" || next === "paused");
    document.body.classList.toggle("h2h-lock-scroll", next === "match" || next === "paused");
    controls.enabled = next === "match";
    if (next !== "match") controls.reset();
    if (next === "match" || next === "paused") requestAnimationFrame(layout);
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

  function cardLine(card: FcCard): string {
    return `${t.footLabel(card.foot)} · ${t.skillMoves} ${stars(card.skill)} · ${t.weakFoot} ${stars(card.weak)}`;
  }

  function fillCard(card: FcCard, player: SquadPlayer): void {
    const el = q("[data-fc-card]");
    if (!el) return;
    el.dataset.color = card.color;
    q("[data-fc-ovr]")!.textContent = String(card.ovr);
    q("[data-fc-pos]")!.textContent = t.posLabel(card.pos);
    const art = q<HTMLImageElement>("[data-fc-art]");
    if (art) art.src = `${assets}stickers/${player.num}-home.webp`;
    q("[data-fc-name]")!.textContent = player.ko;
    q("[data-fc-sub]")!.textContent = `#${player.num} ${player.en}`;
    const labels = card.gk ? t.gkLabels : t.faceLabels;
    const values = card.gk ? [card.gk.div, card.gk.han, card.gk.kic, card.gk.ref, card.gk.spd, card.gk.pos] : [card.pac, card.sho, card.pas, card.dri, card.def, card.phy];
    const stats = q("[data-fc-stats]")!;
    stats.textContent = "";
    labels.forEach((label, i) => {
      const row = document.createElement("div");
      const v = values[i];
      row.dataset.tier = v >= 75 ? "hi" : v >= 60 ? "mid" : "lo";
      row.innerHTML = `<dd>${v}</dd><dt>${label}</dt>`;
      stats.append(row);
    });
    q("[data-fc-meta]")!.textContent = cardLine(card);
    const styles = q("[data-fc-styles]")!;
    styles.textContent = card.styles.length ? `${t.playStyles}: ${card.styles.join(" · ")}` : "";
    styles.hidden = !card.styles.length;
  }

  function fillLineup(): void {
    lineup = bestFive(selected.num);
    const list = q("[data-fc-lineup]");
    if (list) {
      list.textContent = "";
      for (const p of lineup) {
        const c = cardFor(p.num);
        const li = document.createElement("li");
        if (p.num === selected.num) li.dataset.captain = "true";
        li.dataset.color = c.color;
        li.innerHTML = `<img src="${assets}thumbs/${p.num}.webp" alt="" width="40" height="40" loading="lazy" /><span><b>${p.ko}</b><small>#${p.num} ${p.en}</small></span><em><strong>${c.ovr}</strong>${t.posLabel(c.pos)}</em>`;
        list.append(li);
      }
    }
    const ovr = q("[data-fc-team-ovr]");
    if (ovr) ovr.textContent = String(teamOvr(lineup));
  }

  function syncSelected(): void {
    for (const b of qa<HTMLButtonElement>("[data-h2h-player]")) {
      const on = Number(b.dataset.h2hPlayer) === selected.num;
      b.setAttribute("aria-pressed", String(on));
    }
    q("[data-h2h-selected]")!.textContent = `#${selected.num} ${selected.ko} · ${selected.en}`;
    const line = q("[data-h2h-preview-line]");
    if (line) line.textContent = t.seasonLine(selected.goals, selected.assists, selected.apps);
    fillCard(cardFor(selected.num), selected);
    fillLineup();
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

  async function buildRenderer(players: SquadPlayer[], opponent: OpponentSlug, kit: Kit): Promise<void> {
    const [strips, mascot, stadium] = await Promise.all([
      Promise.all(players.map((p) => loadImage(`${assets}players/${p.num}-${kit}.webp`))),
      loadImage(`${assets}mascots/${opponent}.webp`),
      kit === "home"
        ? loadImage(`${assets}stadium/mokdong.webp`)
        : loadImage(`${assets}stadium/away-${opponent}.webp`).then((img) => img ?? loadImage(`${assets}stadium/away.webp`)),
    ]);
    const images: FcRenderImages = { strips, stripKeys: players.map((p) => `${p.num}-${kit}`), mascot, stadium };
    renderer = new FcRenderer(
      canvas,
      images,
      {
        banner: t.fcBanners,
        goal: t.goalBanner,
        homeNames: players.map((p) => p.en),
        homeNums: players.map((p) => p.num),
        rivalName: OPPONENTS[opponent].name,
      },
      opponent,
    );
    layout();
  }

  function layout(): void {
    if (!renderer) return;
    const stage = q("[data-h2h-stage]")!;
    const inMatch = mode === "match" || mode === "paused";
    if (coarse.matches && inMatch) {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      if (portrait.matches) {
        if (h >= w * 1.25) renderer.resize(w, "tall");
        else renderer.resize(Math.min(w, h), "square");
      } else renderer.resize(Math.min(w, h * 16 / 9), "wide");
    } else renderer.resize(Math.max(260, stage.clientWidth), "wide");
  }

  async function startMatch(opponent: OpponentSlug, kit: Kit, matchMode: "league" | "quick"): Promise<void> {
    audio.unlock();
    audio.startMusic();
    lineup = bestFive(selected.num);
    matchMeta = { opponent, kit, mode: matchMode };
    match = new FcMatch({ home: lineup, captain: selected.num, opponent, kit, mode: matchMode, seed: (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0 });
    await buildRenderer(lineup, opponent, kit);
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
    hintKey = "";
    acc = 0;
    window.clearTimeout(resultTimer);
    if (matchMode === "quick") lastQuick = { opponent, kit };
    show("match");
    showVs(opponent, kit, matchMode);
  }

  function venue(opponent: OpponentSlug, kit: Kit): string {
    return kit === "home" ? t.venueHome : t.venueAway(OPPONENTS[opponent].club);
  }

  function showVs(opponent: OpponentSlug, kit: Kit, matchMode: "league" | "quick"): void {
    const vs = q<HTMLElement>("[data-h2h-vs]");
    if (!vs) return;
    const o = OPPONENTS[opponent];
    vs.style.setProperty("--rival", o.color);
    const playerImg = q<HTMLImageElement>("[data-h2h-vs-player]");
    if (playerImg) playerImg.src = `${assets}stickers/${selected.num}-${kit}.webp`;
    q("[data-h2h-vs-player-name]")!.textContent = `#${selected.num} ${selected.ko}`;
    q("[data-h2h-vs-player-sub]")!.textContent = `${selected.en} · ${t.posLabel(cardFor(selected.num).pos)} · OVR ${teamOvr(lineup)}`;
    const rivalImg = q<HTMLImageElement>("[data-h2h-vs-rival]");
    if (rivalImg) rivalImg.src = `${assets}mascot-heads/${opponent}.webp`;
    q("[data-h2h-vs-rival-club]")!.textContent = o.club;
    q("[data-h2h-vs-rival-name]")!.textContent = o.korean;
    q("[data-h2h-vs-rival-sub]")!.textContent = `${o.name} · OVR ${RIVAL_OVR[AI_TIER[opponent]]}`;
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

  function pauseToggle(): void {
    if (mode === "match") show("paused");
    else if (mode === "paused") show("match");
  }
  controls.onPause = pauseToggle;

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
  q("[data-h2h-pause]")?.addEventListener("click", pauseToggle);
  q("[data-h2h-mute]")?.addEventListener("click", () => {
    audio.setMuted(!audio.muted);
    const btn = q("[data-h2h-mute]");
    if (btn) btn.textContent = audio.muted ? "×" : "♪";
  });
  q("[data-h2h-resume]")?.addEventListener("click", () => show("match"));
  q("[data-h2h-result-continue]")?.addEventListener("click", () => {
    if (matchMeta.mode === "quick") {
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
    if (match?.state.phase === "ended") return;
    match = null;
    if (matchMeta.mode === "quick") {
      show("quick");
      return;
    }
    renderSeason();
    show("season");
  });
  window.addEventListener("resize", () => requestAnimationFrame(layout));
  portrait.addEventListener?.("change", () => requestAnimationFrame(layout));
  window.addEventListener("keydown", (e) => {
    if (vsActive && !vsHold) {
      hideVs();
      return;
    }
    if ((e.key === "p" || e.key === "Escape") && (mode === "match" || mode === "paused")) pauseToggle();
  });
  root.addEventListener("pointerdown", () => {
    if (vsActive && !vsHold) hideVs();
  });
  document.addEventListener("visibilitychange", () => {
    audio.suspend(document.hidden);
    if (document.hidden && mode === "match") show("paused");
  });

  function minuteLabel(s: FcState): string {
    if (s.phase === "halftime") return t.halfTimeShort;
    if (s.goldenGoal || s.minute >= 90) return "90+'";
    return `${Math.max(0, s.minute)}'`;
  }

  function updateHud(s: FcState): void {
    q("[data-h2h-clock]")!.textContent = minuteLabel(s);
    q("[data-h2h-score]")!.textContent = `${s.score.home} : ${s.score.away}`;
  }

  function updateTouch(s: FcState): void {
    const sp = s.setPiece;
    const homeSetPiece = s.phase === "restart" && sp && sp.side === "home";
    if (homeSetPiece && sp) controls.setLabels(t.btnSetPiece(sp.type, sp.direct));
    else if (s.ball.owner?.side === "away") controls.setLabels(t.btnDefend);
    else controls.setLabels(t.btnAttack);
    const hint = q("[data-h2h-hint]");
    if (!hint) return;
    const key = homeSetPiece && sp ? `${sp.type}-${sp.direct}` : "";
    if (key === hintKey) return;
    hintKey = key;
    hint.hidden = !key;
    if (key && sp) {
      q("[data-h2h-hint-text]")!.textContent = t.setPieceHint(sp.type as RestartType, sp.direct);
    }
  }

  function sounds(events: FcEvent[]): void {
    for (const ev of events) {
      if (ev.type === "pass" || ev.type === "through" || ev.type === "lob") audio.boot();
      else if (ev.type === "shot" || ev.type === "header") audio.kick();
      else if (ev.type === "goal") audio.goal();
      else if (ev.type === "save" || ev.type === "catch") audio.save();
      else if (ev.type === "post") audio.post();
      else if (ev.type === "tackle") audio.slide();
      else if (ev.type === "foul" || ev.type === "halftime" || ev.type === "fulltime") audio.whistle();
    }
  }

  function setStat(key: string, homeText: string, rivalText: string, home: number, rival: number): void {
    const row = q(`[data-h2h-stat='${key}']`);
    if (!row) return;
    row.querySelector("[data-h2h-stat-home]")!.textContent = homeText;
    row.querySelector("[data-h2h-stat-rival]")!.textContent = rivalText;
    row.style.setProperty("--l", "0.5");
    const share = home + rival > 0 ? home / (home + rival) : 0.5;
    requestAnimationFrame(() => requestAnimationFrame(() => row.style.setProperty("--l", share.toFixed(3))));
  }

  function finishResult(): void {
    if (!match || resultPending) return;
    resultPending = true;
    const done = match;
    window.clearTimeout(resultTimer);
    resultTimer = window.setTimeout(() => showResult(done), RESULT_DELAY_MS);
  }

  function showResult(m: FcMatch): void {
    const s = m.state;
    const { opponent, kit } = matchMeta;
    const o = OPPONENTS[opponent];
    const gf = s.score.home;
    const ga = s.score.away;
    const outcome = gf > ga ? "win" : gf === ga ? "draw" : "loss";
    const league = matchMeta.mode === "league";
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
    q("[data-h2h-result-meta]")!.textContent = league ? `${t.roundOf(round)} · ${venue(opponent, kit)}` : `${t.quickMatch} · ${venue(opponent, kit)}`;
    const homeImg = q<HTMLImageElement>("[data-h2h-result-home-img]");
    if (homeImg) homeImg.src = `${assets}heads/${selected.num}.webp`;
    q("[data-h2h-result-home-name]")!.textContent = `#${selected.num} ${selected.ko}`;
    const rivalImg = q<HTMLImageElement>("[data-h2h-result-rival-img]");
    if (rivalImg) rivalImg.src = `${assets}mascot-heads/${opponent}.webp`;
    q("[data-h2h-result-rival-name]")!.textContent = `${o.name} ${o.korean}`;
    q("[data-h2h-result-home-goals]")!.textContent = s.stats.home.goals.length ? `⚽ ${s.stats.home.goals.join(" ")}` : "";
    q("[data-h2h-result-rival-goals]")!.textContent = s.stats.away.goals.length ? `⚽ ${s.stats.away.goals.join(" ")}` : "";
    q("[data-h2h-result-score]")!.textContent = `${gf} : ${ga}`;
    const pts = gf > ga ? 3 : gf === ga ? 1 : 0;
    const pill = q("[data-h2h-result-points]")!;
    pill.textContent = t.pointsShort(pts);
    pill.hidden = !league;
    q("[data-h2h-result-line]")!.textContent = outcome === "win" ? t.winLine(`#${selected.num} ${selected.ko}`) : outcome === "loss" ? t.lossLine(o.name) : t.drawLine;
    const h = s.stats.home;
    const a = s.stats.away;
    const possTotal = h.possession + a.possession;
    const poss = possTotal > 0 ? Math.round((h.possession / possTotal) * 100) : 50;
    setStat("possession", `${poss}%`, `${100 - poss}%`, poss, 100 - poss);
    setStat("shots", `${h.shots} (${h.onTarget})`, `${a.shots} (${a.onTarget})`, h.shots, a.shots);
    setStat("passes", `${h.passesDone}/${h.passes}`, `${a.passesDone}/${a.passes}`, h.passesDone, a.passesDone);
    setStat("tackles", String(h.tackles), String(a.tackles), h.tackles, a.tackles);
    setStat("corners", String(h.corners), String(a.corners), h.corners, a.corners);
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
    if (rematch) rematch.hidden = matchMeta.mode !== "quick";
    confetti(q("[data-h2h-result-confetti]"), outcome === "win" ? 46 : 0);
    if (outcome === "win") audio.levelUp();
    else if (outcome === "loss") audio.miss();
    show("result");
  }

  function stepMatch(m: FcMatch, n: number): void {
    for (let i = 0; i < n; i++) {
      m.step(controls.frame());
      renderer?.onEvents(m.state.events, m.state);
      sounds(m.state.events);
      if (m.state.phase === "ended") {
        finishResult();
        break;
      }
    }
  }

  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const running = mode === "match" && match && !vsActive && !qaPaused;
    if (running && match) {
      acc += dt;
      let steps = 0;
      while (acc >= FC_STEP && steps < 5) {
        stepMatch(match, 1);
        acc -= FC_STEP;
        steps++;
      }
      if (steps >= 5) acc = 0;
    }
    if (match && renderer && (mode === "match" || mode === "paused")) {
      renderer.draw(match.state, running ? dt : 0);
      updateHud(match.state);
      updateTouch(match.state);
    }
    raf = requestAnimationFrame(frame);
  }

  syncSelected();
  renderSeason();
  show("select");
  raf = requestAnimationFrame(frame);

  const toSide = (side: string): Side => (side === "left" || side === "home" ? "home" : "away");
  const api = {
    get match() {
      return match;
    },
    get state() {
      return match?.state ?? null;
    },
    get season() {
      return season;
    },
    get lineup() {
      return lineup.map((p) => p.num);
    },
    startSeason: () => {
      season = newSeason(selected, 2026 + selected.num);
      save.season = season;
      store(save);
      renderSeason();
    },
    startQuick: (opponent: OpponentSlug = "ansan-greeners", kit: Kit = "home") => startMatch(opponent, kit, "quick"),
    simulateAiMatch: (seed = 1, opponent: OpponentSlug = "ansan-greeners") => simulateAiMatch(selected, opponent, seed),
    pause: (on: boolean) => {
      qaPaused = !!on;
    },
    step: (n = 1) => {
      if (match) stepMatch(match, n);
    },
    endNow: () => {
      if (!match) return;
      match.endNow();
      stepMatch(match, 1);
      if (match.state.phase === "ended") finishResult();
    },
    forceGoal: (side: string) => {
      if (!match) return;
      match.forceGoal(toSide(side));
      stepMatch(match, 1);
    },
    debugRestart: (type: RestartType, side: string = "home") => {
      match?.debugRestart(type, toSide(side));
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
    blankInput: () => blankFcInput(),
    destroy: () => cancelAnimationFrame(raf),
  };
  if (new URLSearchParams(location.search).has("qa")) (window as unknown as { __h2h?: typeof api }).__h2h = api;
}

export function simulateAiMatch(player: SquadPlayer, opponent: OpponentSlug, seed: number): FcMatch {
  return simulateFcMatch({ home: bestFive(player.num), captain: player.num, opponent, kit: "home", mode: "ai", seed });
}
