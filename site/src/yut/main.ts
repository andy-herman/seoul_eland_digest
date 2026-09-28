import { YutAudio } from "./audio";
import { PLAYER_NAMES, RIVAL_CHOICES, YUT_STRINGS, tierLabel, type Locale } from "./i18n";
import {
  BOARD_POS,
  OPPONENTS,
  THROW_INFO,
  applyMove,
  applyThrow,
  chooseMove,
  cloneState,
  discardIfNoMoves,
  legalMoves,
  makeRng,
  newGame,
  previewMove,
  rivalLevel,
  type GameState,
  type Level,
  type Mode,
  type MoveOption,
  type OpponentSlug,
  type PieceGroup,
  type Station,
  type TeamId,
  type ThrowId,
} from "./model";
import { YutThrowScene } from "./throwScene";

const SAVE_KEY = "yut-fc-v2";
const SEOUL = "#1b2446";
const GOLD = "#ffc23a";
const CARDINAL = "#ef4444";

interface Save {
  rivals: Record<string, { wins: number; losses: number; streak: number; best: number }>;
}

interface TokenDef {
  id: string;
  name: string;
  ko: string;
  src: string;
  crop?: "front-third";
}

interface HitTarget {
  x: number;
  y: number;
  r: number;
  kind: "piece" | "new" | "destination";
  id?: number | "new";
}

interface Effect {
  text: string;
  x: number;
  y: number;
  life: number;
  color: string;
  big?: boolean;
}

interface Confetti {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

interface AnimMove {
  move: MoveOption;
  piece: TokenDef;
  team: TeamId;
  count: number;
  start: number;
  duration: number;
}

declare global {
  interface Window {
    __yut?: unknown;
  }
}

function loadSave(): Save {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "{}") as Partial<Save>;
    return { rivals: { ...(raw.rivals ?? {}) } };
  } catch {
    return { rivals: {} };
  }
}

function storeSave(save: Save): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Local storage can be unavailable in private mode.
  }
}

function pickPlayerName(locale: Locale, token: TokenDef): string {
  if (locale === "pt" && token.id === "carius") return "Alan Cariús";
  return token.name;
}

function stationPoint(station: Station, w: number, h: number): [number, number] {
  const p = BOARD_POS[station];
  const padX = w * 0.08;
  const padY = h * 0.08;
  return [padX + (p.x / 100) * (w - padX * 2), padY + (p.y / 100) * (h - padY * 2)];
}

function teamOf(mode: Mode, rival: OpponentSlug, locale: Locale, team: TeamId): { name: string; short: string; color: string; head: string } {
  if (team === 0) return { name: "Seoul E-Land", short: "SEL", color: SEOUL, head: "" };
  if (mode === "pass") return { name: YUT_STRINGS[locale].passAndPlayTeam[1], short: "LEN", color: "#f59e0b", head: "" };
  const op = OPPONENTS[rival];
  return { name: op.club.replace(" FC", ""), short: op.name, color: op.color, head: "" };
}

export function mountYutNori(root: HTMLElement): void {
  const locale = (root.dataset.locale as Locale) ?? "en";
  const t = YUT_STRINGS[locale];
  const params = new URLSearchParams(location.search);
  const qaMode = params.has("qa");
  const q = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const qa = <T extends HTMLElement = HTMLElement>(selector: string) => [...root.querySelectorAll<T>(selector)];
  const canvas = q<HTMLCanvasElement>("[data-yut-board]");
  const ctx = canvas.getContext("2d")!;
  const throwCanvas = q<HTMLCanvasElement>("[data-yut-throw-canvas]");
  const audio = new YutAudio(root.dataset.song!);
  const save = loadSave();
  const coarse = matchMedia("(pointer: coarse)").matches;
  const images = new Map<string, HTMLImageElement>();
  const seoulTokens: TokenDef[] = [
    { id: "leoul", name: PLAYER_NAMES.leoul[locale], ko: PLAYER_NAMES.leoul.ko, src: `${root.dataset.drivers}leoul.webp`, crop: "front-third" },
    { id: "lenyang", name: PLAYER_NAMES.lenyang[locale], ko: PLAYER_NAMES.lenyang.ko, src: `${root.dataset.drivers}lenyang.webp`, crop: "front-third" },
    { id: "euller", name: PLAYER_NAMES.euller[locale], ko: PLAYER_NAMES.euller.ko, src: `${root.dataset.heads}7.webp` },
    { id: "carius", name: PLAYER_NAMES.carius[locale], ko: PLAYER_NAMES.carius.ko, src: `${root.dataset.heads}10.webp` },
  ];

  let state: GameState = newGame(20260928);
  let rng = makeRng(state.seed);
  let mode: Mode = "rival";
  let level: Level = "friendly";
  let rival: OpponentSlug = "busan-ipark";
  let thrower: YutThrowScene | null = null;
  let selectedThrow: ThrowId | null = null;
  let selectedGroup: number | "new" | null = null;
  let preview: MoveOption | null = null;
  let busy = false;
  let autoplay = false;
  let message = t.commentary.ready;
  let resultCard = "";
  let keyboardIndex = -1;
  let hitTargets: HitTarget[] = [];
  let effects: Effect[] = [];
  let confetti: Confetti[] = [];
  let anim: AnimMove | null = null;
  let raf = 0;
  let lastFrame = performance.now();

  const image = (src: string): HTMLImageElement => {
    let img = images.get(src);
    if (!img) {
      img = new Image();
      img.decoding = "async";
      img.src = src;
      images.set(src, img);
    }
    return img;
  };

  const tokenFor = (team: TeamId, index: number): TokenDef => {
    if (team === 0 || mode === "pass") return seoulTokens[index % seoulTokens.length];
    const op = OPPONENTS[rival];
    return { id: rival, name: op.name, ko: op.korean, src: `${root.dataset.mascots}${rival}.webp` };
  };

  const groupToken = (group: PieceGroup): TokenDef => {
    const all = state.teams[group.team].groups;
    const index = Math.max(
      0,
      all.findIndex((g) => g.id === group.id),
    );
    return tokenFor(group.team, index);
  };

  const labelTeam = (team: TeamId): string => teamOf(mode, rival, locale, team).name;

  const currentLevel = (): Level => {
    if (mode === "pass") return "friendly";
    if (level === "random") return "random";
    if (level === "pro") return "pro";
    return rivalLevel(rival) >= 3 ? "friendly" : "friendly";
  };

  const screen = (name: "menu" | "play" | "result") => {
    root.dataset.mode = name;
    for (const el of qa("[data-yut-screen]")) el.hidden = el.dataset.yutScreen !== name;
    document.body.classList.toggle("yut-lock-scroll", coarse && name === "play");
    if (name === "play") {
      ensureThrower();
      startLoop();
      requestAnimationFrame(resize);
    } else {
      stopLoop();
      thrower?.dispose();
      thrower = null;
    }
  };

  const ensureThrower = () => {
    if (!thrower) {
      thrower = new YutThrowScene(throwCanvas);
      thrower.onClack = (power) => audio.clack(power);
    }
    void thrower.warm();
  };

  const startLoop = () => {
    if (raf) return;
    lastFrame = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;
      updateEffects(dt);
      drawBoard();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };

  const stopLoop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };

  const updateEffects = (dt: number) => {
    effects = effects.flatMap((e) => (e.life - dt > 0 ? [{ ...e, life: e.life - dt, y: e.y - dt * 16 }] : []));
    confetti = confetti.flatMap((p) => {
      const life = p.life - dt;
      if (life <= 0) return [];
      return [{ ...p, life, x: p.x + p.vx * dt, y: p.y + p.vy * dt, vy: p.vy + 420 * dt }];
    });
  };

  const refreshMenu = () => {
    const grid = q("[data-yut-rivals]");
    grid.innerHTML = "";
    for (const choice of RIVAL_CHOICES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "yut-rival";
      button.dataset.rival = choice.slug;
      button.setAttribute("aria-pressed", String(choice.slug === rival));
      button.style.setProperty("--rival", choice.color);
      button.innerHTML = `<img alt="" width="48" height="48"><span><b></b><small></small></span><em></em>`;
      button.querySelector("img")!.src = `${root.dataset.mascots}${choice.slug}.webp`;
      button.querySelector("b")!.textContent = choice.name;
      button.querySelector("small")!.textContent = choice.club;
      button.querySelector("em")!.textContent = tierLabel(locale, choice.slug);
      button.addEventListener("click", () => {
        audio.unlock();
        audio.click();
        rival = choice.slug;
        refreshMenu();
      });
      grid.append(button);
    }
  };

  const renderHud = () => {
    const team0 = teamOf(mode, rival, locale, 0);
    const team1 = teamOf(mode, rival, locale, 1);
    q("[data-yut-score]").textContent = `${team0.name} ${state.teams[0].home}-${state.teams[1].home} ${team1.name}`;
    q("[data-yut-turn]").textContent = labelTeam(state.turn);
    q("[data-yut-message]").textContent = message;
    q("[data-yut-result-card]").textContent = resultCard;
    q<HTMLButtonElement>("[data-yut-throw]").disabled = busy || !state.mustThrow || state.winner !== null || (mode === "rival" && state.turn === 1);
    q<HTMLButtonElement>("[data-yut-mute]").textContent = audio.muted ? t.unmute : t.mute;
    renderChips();
    renderMoveButtons();
    renderRows();
  };

  const renderChips = () => {
    const queue = q("[data-yut-queue]");
    queue.innerHTML = "";
    for (const id of state.queue) {
      const info = THROW_INFO[id];
      const copy = t.throwNames[id];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "yut-chip";
      button.dataset.sel = String(selectedThrow === id);
      button.innerHTML = `<b>${copy.ko}</b><span>${copy.steps}</span>`;
      button.addEventListener("click", () => {
        audio.click();
        selectedThrow = id;
        selectedGroup = null;
        preview = null;
        message = t.commentary.choosePiece;
        render();
      });
      button.title = `${copy.roman}, ${copy.meaning}, ${info.steps}`;
      queue.append(button);
    }
    if (!state.queue.length) queue.textContent = state.mustThrow ? t.throwHint : t.noMoves;
  };

  const renderMoveButtons = () => {
    const wrap = q("[data-yut-moves]");
    wrap.innerHTML = "";
    const moves = selectedThrow ? legalMoves({ ...state, queue: [selectedThrow] } as GameState, state.turn) : legalMoves(state, state.turn);
    for (const move of moves) {
      const token = move.groupId === "new" ? tokenFor(state.turn, 0) : groupToken(state.teams[state.turn].groups.find((g) => g.id === move.groupId)!);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "yut-move";
      button.dataset.sel = String(selectedGroup === move.groupId && selectedThrow === move.throwId);
      button.innerHTML = `<span class="yut-mini-token"></span><b></b><small></small>`;
      drawCssToken(button.querySelector(".yut-mini-token")!, token, state.turn, 1);
      button.querySelector("b")!.textContent = move.groupId === "new" ? t.newPiece : pickPlayerName(locale, token);
      button.querySelector("small")!.textContent =
        move.to === "home"
          ? t.goal
          : `${t.throwNames[move.throwId].ko} ${t.throwNames[move.throwId].steps}${move.captures ? ` · ${t.tackle}` : ""}${move.stacks ? ` · ${t.stack}` : ""}`;
      button.addEventListener("click", () => {
        audio.click();
        selectedThrow = move.throwId;
        selectedGroup = move.groupId;
        preview = move;
        message = move.danger > 0.18 ? t.commentary.danger(pickPlayerName(locale, token)) : t.commentary.chooseDestination;
        render();
      });
      wrap.append(button);
    }
    if (!moves.length && state.queue.length && !state.mustThrow) {
      const note = document.createElement("p");
      note.className = "yut-muted";
      note.textContent = t.noMoves;
      wrap.append(note);
    }
  };

  const renderRows = () => {
    renderTeamRow(0);
    renderTeamRow(1);
  };

  const renderTeamRow = (team: TeamId) => {
    const bench = q(`[data-yut-bench="${team}"]`);
    const home = q(`[data-yut-home="${team}"]`);
    bench.innerHTML = "";
    home.innerHTML = "";
    for (let i = 0; i < state.teams[team].off; i++) {
      const token = tokenFor(team, i);
      const node = document.createElement(team === state.turn ? "button" : "span");
      node.className = "yut-row-token";
      if (team === state.turn && state.queue.length) {
        (node as HTMLButtonElement).type = "button";
        node.addEventListener("click", () => {
          const id = selectedThrow ?? state.queue[0];
          const move = id ? previewMove(state, team, id, "new") : null;
          if (!move) return;
          selectedThrow = id;
          selectedGroup = "new";
          preview = move;
          message = t.commentary.chooseDestination;
          render();
        });
      }
      drawCssToken(node, token, team, 1);
      bench.append(node);
    }
    for (let i = 0; i < state.teams[team].home; i++) {
      const node = document.createElement("span");
      node.className = "yut-row-token yut-row-token-home";
      drawCssToken(node, tokenFor(team, i), team, 1);
      home.append(node);
    }
  };

  const drawCssToken = (node: Element, token: TokenDef, team: TeamId, count: number) => {
    const rivalColor = mode === "pass" && team === 1 ? "#f59e0b" : OPPONENTS[rival].color;
    const color = team === 0 ? SEOUL : rivalColor;
    (node as HTMLElement).style.setProperty("--token", color);
    (node as HTMLElement).style.setProperty("--rim", team === 0 ? GOLD : "#ffffff");
    node.innerHTML = `<img alt="" width="44" height="44"><i>${count > 1 ? `×${count}` : ""}</i>`;
    node.querySelector("img")!.src = token.src;
    if (token.crop === "front-third") node.querySelector("img")!.classList.add("yut-front-crop");
  };

  const render = () => {
    renderHud();
    drawBoard();
  };

  const resize = () => {
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(box.width * dpr));
    canvas.height = Math.max(1, Math.round(box.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBoard();
    thrower?.resize();
  };

  const drawBoard = () => {
    const w = canvas.clientWidth || 720;
    const h = canvas.clientHeight || 620;
    hitTargets = [];
    ctx.clearRect(0, 0, w, h);
    drawPitch(w, h);
    drawRoutes(w, h);
    drawStations(w, h);
    drawPreview(w, h);
    drawPieces(w, h);
    drawEffects();
  };

  const drawPitch = (w: number, h: number) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#287946");
    g.addColorStop(1, "#115633");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = i % 2 ? "rgba(255,255,255,.055)" : "rgba(0,0,0,.045)";
      ctx.fillRect(0, (h / 9) * i, w, h / 9);
    }
    ctx.strokeStyle = "rgba(255,255,255,.88)";
    ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.006);
    ctx.strokeRect(w * 0.08, h * 0.08, w * 0.84, h * 0.84);
    ctx.beginPath();
    ctx.moveTo(w * 0.08, h * 0.5);
    ctx.lineTo(w * 0.92, h * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.5, Math.min(w, h) * 0.105, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect(w * 0.33, h * 0.08, w * 0.34, h * 0.16);
    ctx.strokeRect(w * 0.33, h * 0.76, w * 0.34, h * 0.16);
    const [gx, gy] = stationPoint("A", w, h);
    ctx.fillStyle = "rgba(11,18,56,.78)";
    ctx.fillRect(gx - 52, gy + 24, 104, 20);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 16px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("GOAL", gx, gy + 40);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(gx - 28, gy + 17);
    ctx.lineTo(gx, gy + 4);
    ctx.lineTo(gx + 28, gy + 17);
    ctx.stroke();
  };

  const routeLine = (stations: Station[], w: number, h: number) => {
    ctx.beginPath();
    stations.forEach((station, i) => {
      const [x, y] = stationPoint(station, w, h);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  };

  const drawRoutes = (w: number, h: number) => {
    ctx.strokeStyle = "rgba(255,255,255,.88)";
    ctx.lineWidth = Math.max(3, Math.min(w, h) * 0.007);
    ctx.lineCap = "round";
    routeLine(["A", "r1", "r2", "r3", "r4", "B", "t1", "t2", "t3", "t4", "C", "l1", "l2", "l3", "l4", "D", "b1", "b2", "b3", "b4", "A"], w, h);
    ctx.strokeStyle = "rgba(255,255,255,.72)";
    routeLine(["B", "d1", "d2", "O", "d3", "d4", "D"], w, h);
    routeLine(["C", "e1", "e2", "O", "e3", "e4", "A"], w, h);
  };

  const drawStations = (w: number, h: number) => {
    for (const [station, pos] of Object.entries(BOARD_POS) as [Station, (typeof BOARD_POS)[Station]][]) {
      const [x, y] = stationPoint(station, w, h);
      const r = pos.corner ? Math.min(w, h) * 0.022 : pos.center ? Math.min(w, h) * 0.018 : Math.min(w, h) * 0.013;
      ctx.beginPath();
      ctx.fillStyle = pos.corner ? "#fff6c7" : "#ffffff";
      ctx.strokeStyle = pos.center ? GOLD : "rgba(11,18,56,.85)";
      ctx.lineWidth = pos.center ? 4 : 3;
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (pos.corner) drawFlag(x, y, station === "A" ? GOLD : "#ef4444");
    }
  };

  const drawFlag = (x: number, y: number, color: string) => {
    ctx.strokeStyle = "#f9fafb";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 16, y - 20);
    ctx.lineTo(x + 16, y + 5);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + 17, y - 20);
    ctx.lineTo(x + 40, y - 13);
    ctx.lineTo(x + 17, y - 6);
    ctx.closePath();
    ctx.fill();
  };

  const drawPreview = (w: number, h: number) => {
    if (!preview) return;
    ctx.save();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = Math.max(7, Math.min(w, h) * 0.012);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(255,194,58,.5)";
    ctx.shadowBlur = 15;
    const start = preview.from === "bench" ? stationPoint("A", w, h) : stationPoint(preview.from, w, h);
    ctx.beginPath();
    ctx.moveTo(start[0], start[1]);
    for (const st of preview.path) {
      const [x, y] = stationPoint(st, w, h);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    if (preview.to !== "home") {
      const [x, y] = stationPoint(preview.to, w, h);
      const pulse = 1 + Math.sin(performance.now() / 130) * 0.08;
      ctx.save();
      ctx.globalAlpha = 0.72;
      drawToken(tokenFor(state.turn, 0), state.turn, x, y, 1, 23 * pulse, true);
      ctx.restore();
      hitTargets.push({ kind: "destination", x, y, r: 34 });
      if (preview.danger > 0.16) {
        ctx.strokeStyle = CARDINAL;
        ctx.lineWidth = 5;
        ctx.setLineDash([8, 7]);
        ctx.beginPath();
        ctx.arc(x, y, 36, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else {
      const [x, y] = stationPoint("A", w, h);
      hitTargets.push({ kind: "destination", x, y: y + 36, r: 48 });
    }
  };

  const drawPieces = (w: number, h: number) => {
    const groups = [...state.teams[0].groups, ...state.teams[1].groups];
    const byPos = new Map<Station, PieceGroup[]>();
    for (const group of groups) {
      const list = byPos.get(group.pos) ?? [];
      list.push(group);
      byPos.set(group.pos, list);
    }
    const movable = new Set(
      legalMoves(state, state.turn)
        .map((m) => m.groupId)
        .filter((id): id is number => typeof id === "number"),
    );
    const canNew = legalMoves(state, state.turn).some((m) => m.groupId === "new");
    if (canNew) {
      const [x, y] = stationPoint("A", w, h);
      drawPulse(x, y + 42, GOLD);
      hitTargets.push({ kind: "new", id: "new", x, y: y + 42, r: 34 });
    }
    for (const [station, list] of byPos) {
      const [x, y] = stationPoint(station, w, h);
      list.forEach((group, i) => {
        if (anim?.move.groupId === group.id) return;
        const dx = (i - (list.length - 1) / 2) * 26;
        const dy = list.length > 1 ? Math.sin(i) * 5 : 0;
        const px = x + dx;
        const py = y + dy;
        if (group.team === state.turn && movable.has(group.id)) drawPulse(px, py, group.team === 0 ? GOLD : OPPONENTS[rival].color);
        drawToken(groupToken(group), group.team, px, py, group.count, 22, false);
        hitTargets.push({ kind: "piece", id: group.id, x: px, y: py, r: 32 });
      });
    }
    if (anim) drawAnimatedMove(w, h);
  };

  const drawPulse = (x: number, y: number, color: string) => {
    const r = 26 + Math.sin(performance.now() / 140) * 5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  const drawToken = (token: TokenDef, team: TeamId, x: number, y: number, count: number, radius: number, ghost: boolean) => {
    const rivalColor = mode === "pass" && team === 1 ? "#f59e0b" : OPPONENTS[rival].color;
    const color = team === 0 ? SEOUL : rivalColor;
    for (let i = Math.min(3, count) - 1; i >= 0; i--) {
      ctx.save();
      ctx.translate(x - i * 4, y - i * 4);
      ctx.globalAlpha = ghost ? 0.56 : 1;
      ctx.fillStyle = color;
      ctx.strokeStyle = team === 0 ? GOLD : "#ffffff";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const img = image(token.src);
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, radius - 4, 0, Math.PI * 2);
      ctx.clip();
      if (img.complete && img.naturalWidth) {
        if (token.crop === "front-third") {
          const sx = img.naturalWidth * 0.665;
          const sw = img.naturalWidth * 0.335;
          ctx.drawImage(img, sx, 0, sw, img.naturalHeight, -radius + 2, -radius + 1, radius * 2 - 4, radius * 2 - 2);
        } else {
          ctx.drawImage(img, -radius + 2, -radius + 2, radius * 2 - 4, radius * 2 - 4);
        }
      }
      ctx.restore();
      if (count > 1 && i === 0) {
        ctx.fillStyle = CARDINAL;
        ctx.beginPath();
        ctx.arc(radius * 0.76, -radius * 0.78, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "900 12px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(`×${count}`, radius * 0.76, -radius * 0.74 + 4);
      }
      ctx.restore();
    }
  };

  const drawAnimatedMove = (w: number, h: number) => {
    if (!anim) return;
    const elapsed = performance.now() - anim.start;
    const t01 = Math.min(1, elapsed / anim.duration);
    const stops = [anim.move.from === "bench" ? "A" : anim.move.from, ...anim.move.path] as Station[];
    const points = stops.map((s) => stationPoint(s, w, h));
    if (!points.length) return;
    const idx = Math.min(points.length - 1, Math.floor(t01 * Math.max(1, points.length - 1)));
    const local = t01 * Math.max(1, points.length - 1) - idx;
    const a = points[idx];
    const b = points[Math.min(points.length - 1, idx + 1)] ?? a;
    const x = a[0] + (b[0] - a[0]) * local;
    const y = a[1] + (b[1] - a[1]) * local - Math.sin(Math.PI * t01) * 18;
    drawToken(anim.piece, anim.team, x, y, anim.count, 24, false);
  };

  const drawEffects = () => {
    for (const p of confetti) {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size * 1.8);
    }
    for (const e of effects) {
      ctx.globalAlpha = Math.min(1, e.life * 1.5);
      ctx.fillStyle = e.color;
      ctx.font = `${e.big ? 52 : 24}px Arial Rounded MT Bold, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.lineWidth = e.big ? 7 : 4;
      ctx.strokeStyle = "#0b1238";
      ctx.strokeText(e.text, e.x, e.y);
      ctx.fillText(e.text, e.x, e.y);
      ctx.globalAlpha = 1;
    }
  };

  const addGoalConfetti = () => {
    const w = canvas.clientWidth || 720;
    const h = canvas.clientHeight || 620;
    const [x, y] = stationPoint("A", w, h);
    const colors = [GOLD, "#ffffff", "#38bdf8", "#ef4444"];
    for (let i = 0; i < 90; i++) {
      confetti.push({
        x: x + (Math.random() - 0.5) * 120,
        y: y - 25,
        vx: (Math.random() - 0.5) * 260,
        vy: -220 - Math.random() * 250,
        life: 1.8 + Math.random() * 0.6,
        color: colors[i % colors.length],
        size: 5 + Math.random() * 5,
      });
    }
  };

  const addEffect = (text: string, station: Station | "home", color = GOLD, big = false) => {
    const w = canvas.clientWidth || 720;
    const h = canvas.clientHeight || 620;
    const [x, y] = stationPoint(station === "home" ? "A" : station, w, h);
    effects.push({ text, x, y: y - 34, life: big ? 1.8 : 1.1, color, big });
  };

  const doThrow = async () => {
    if (busy || !state.mustThrow || state.winner !== null || (mode === "rival" && state.turn === 1)) return;
    busy = true;
    audio.unlock();
    audio.startMusic();
    ensureThrower();
    render();
    const tr = applyThrow(state, rng);
    resultCard = resultText(tr.id);
    await thrower!.animate(tr);
    if (tr.extra) {
      message = t.commentary.extra;
      audio.throwAgain();
    } else {
      state.mustThrow = false;
      message = t.commentary.chooseThrow;
    }
    discardBlocked();
    selectedThrow = selectedThrow ?? state.queue[0] ?? null;
    busy = false;
    render();
    if (mode === "rival" && state.turn === 1) void aiLoop();
  };

  const resultText = (id: ThrowId): string => {
    const copy = t.throwNames[id];
    const extra = THROW_INFO[id].extra ? ` · ${t.throwAgain}` : "";
    return `${copy.ko} ${copy.roman} · ${copy.meaning} · ${copy.steps}${extra}`;
  };

  const discardBlocked = () => {
    const gone = discardIfNoMoves(state);
    if (gone.length) {
      message = t.commentary.noMoves;
      if (mode === "rival" && state.turn === 1) void aiLoop();
    }
  };

  const confirmPreview = async () => {
    if (!preview || busy) return;
    const movingGroup = preview.groupId === "new" ? null : state.teams[preview.team].groups.find((g) => g.id === preview!.groupId);
    const token = movingGroup ? groupToken(movingGroup) : tokenFor(preview.team, 0);
    const count = movingGroup?.count ?? 1;
    const move = preview;
    busy = true;
    anim = { move, piece: token, team: move.team, count, start: performance.now(), duration: autoplay ? 20 : 520 + move.path.length * 90 };
    render();
    await sleep(anim.duration);
    anim = null;
    const res = applyMove(state, move);
    selectedThrow = state.queue[0] ?? null;
    selectedGroup = null;
    preview = null;
    keyboardIndex = -1;
    if (res.home) {
      audio.goal();
      addGoalConfetti();
      addEffect(t.goal, "home", GOLD, true);
      message = t.commentary.home(pickPlayerName(locale, token));
    } else if (res.capture) {
      audio.tackle();
      addEffect(t.tackle, move.to as Station, CARDINAL, true);
      message = t.commentary.capture(pickPlayerName(locale, token));
    } else if (res.stack) {
      audio.stack();
      addEffect(t.stack, move.to as Station, "#86efac", false);
      message = t.commentary.stack(pickPlayerName(locale, token), count + res.stack);
    } else if (res.shortcut) {
      audio.shortcut();
      addEffect(t.shortcut, move.to === "home" ? "A" : move.to, GOLD, false);
      message = t.commentary.shortcut(pickPlayerName(locale, token));
    } else if (move.throwId === "back") {
      audio.click();
      message = t.commentary.back(pickPlayerName(locale, token));
    } else {
      audio.click();
      message = t.commentary.plain(pickPlayerName(locale, token), Math.abs(THROW_INFO[move.throwId].steps));
    }
    busy = false;
    if (state.winner !== null) finish();
    else {
      discardBlocked();
      render();
      if (mode === "rival" && state.turn === 1) void aiLoop();
    }
  };

  const aiLoop = async () => {
    if (busy || state.winner !== null || mode !== "rival" || state.turn !== 1) return;
    busy = true;
    render();
    await sleep(autoplay ? 20 : 480);
    while (state.turn === 1 && state.winner === null) {
      while (state.mustThrow && state.winner === null) {
        ensureThrower();
        const tr = applyThrow(state, rng);
        resultCard = resultText(tr.id);
        message = t.commentary.aiMove(OPPONENTS[rival].name);
        render();
        await thrower!.animate(tr);
        if (!tr.extra) state.mustThrow = false;
        else message = t.commentary.extra;
        if (!autoplay) await sleep(200);
      }
      discardBlocked();
      while (state.queue.length && state.turn === 1 && state.winner === null) {
        const move = chooseMove(state, currentLevel(), rng, 1);
        if (!move) {
          state.queue.shift();
          continue;
        }
        preview = move;
        selectedThrow = move.throwId;
        selectedGroup = move.groupId;
        message = t.commentary.aiMove(OPPONENTS[rival].name);
        render();
        await sleep(autoplay ? 20 : 420);
        busy = false;
        await confirmPreview();
        busy = true;
        if (state.mustThrow) break;
      }
      if (!state.mustThrow && !state.queue.length) break;
    }
    busy = false;
    if (state.winner !== null) finish();
    else render();
  };

  const finish = () => {
    const winner = state.winner ?? 0;
    const recKey = `${rival}:${level}`;
    const record = save.rivals[recKey] ?? { wins: 0, losses: 0, streak: 0, best: 0 };
    if (mode === "rival") {
      if (winner === 0) {
        record.wins++;
        record.streak++;
        record.best = Math.max(record.best, record.streak);
      } else {
        record.losses++;
        record.streak = 0;
      }
      save.rivals[recKey] = record;
      storeSave(save);
    }
    q("[data-yut-result-title]").textContent = t.commentary.win(labelTeam(winner));
    q("[data-yut-result-score]").textContent = `${labelTeam(0)} ${state.teams[0].home}-${state.teams[1].home} ${labelTeam(1)}`;
    q("[data-yut-record]").textContent = mode === "rival" ? `${t.save}: ${record.wins}-${record.losses}, streak ${record.streak}, best ${record.best}` : "";
    q<HTMLImageElement>("[data-yut-result-rival]").src = `${root.dataset.mascots}${rival}.webp`;
    screen("result");
  };

  const start = (opts: Partial<{ mode: Mode; rival: OpponentSlug; level: Level; seed: number }> = {}) => {
    mode = opts.mode ?? (root.querySelector<HTMLButtonElement>("[data-mode-pass]")?.getAttribute("aria-pressed") === "true" ? "pass" : "rival");
    rival = opts.rival ?? rival;
    level = opts.level ?? level;
    const seed = opts.seed ?? Date.now() % 100000000;
    state = newGame(seed);
    rng = makeRng(seed);
    selectedThrow = null;
    selectedGroup = null;
    preview = null;
    busy = false;
    resultCard = "";
    message = t.commentary.ready;
    effects = [];
    confetti = [];
    screen("play");
    audio.unlock();
    audio.startMusic();
    render();
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const boardClick = (clientX: number, clientY: number) => {
    const box = canvas.getBoundingClientRect();
    const x = clientX - box.left;
    const y = clientY - box.top;
    const hit = hitTargets
      .map((h) => ({ h, d: Math.hypot(h.x - x, h.y - y) }))
      .filter((h) => h.d <= h.h.r)
      .sort((a, b) => a.d - b.d)[0]?.h;
    if (!hit) return;
    audio.unlock();
    audio.click();
    if (hit.kind === "destination" && preview) {
      void confirmPreview();
      return;
    }
    const throwId = selectedThrow ?? state.queue[0] ?? null;
    if (!throwId) return;
    const move = previewMove(state, state.turn, throwId, hit.kind === "new" ? "new" : (hit.id as number));
    if (!move) return;
    selectedThrow = throwId;
    selectedGroup = move.groupId;
    preview = move;
    message =
      move.danger > 0.18
        ? t.commentary.danger(hit.kind === "new" ? t.newPiece : pickPlayerName(locale, tokenFor(state.turn, 0)))
        : t.commentary.chooseDestination;
    render();
  };

  canvas.addEventListener("click", (event) => boardClick(event.clientX, event.clientY));
  q("[data-yut-throw]").addEventListener("click", () => void doThrow());
  q("[data-yut-cancel]").addEventListener("click", () => {
    audio.click();
    preview = null;
    selectedGroup = null;
    keyboardIndex = -1;
    message = t.commentary.choosePiece;
    render();
  });
  q("[data-yut-play]").addEventListener("click", () => start());
  q("[data-yut-restart]").addEventListener("click", () => start({ seed: state.seed + 1 }));
  q("[data-yut-rematch]").addEventListener("click", () => start({ seed: state.seed + 1 }));
  q("[data-yut-mute]").addEventListener("click", () => {
    audio.setMuted(!audio.muted);
    renderHud();
  });
  for (const button of qa<HTMLButtonElement>("[data-mode-choice]")) {
    button.addEventListener("click", () => {
      audio.click();
      qa<HTMLButtonElement>("[data-mode-choice]").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    });
  }
  for (const button of qa<HTMLButtonElement>("[data-ai-level]")) {
    button.addEventListener("click", () => {
      audio.click();
      level = button.dataset.aiLevel as Level;
      qa<HTMLButtonElement>("[data-ai-level]").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    });
  }
  for (const button of qa("[data-yut-menu]")) button.addEventListener("click", () => screen("menu"));

  let touchStartY = 0;
  throwCanvas.addEventListener("pointerdown", (event) => {
    touchStartY = event.clientY;
    audio.unlock();
  });
  throwCanvas.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "touch" || touchStartY - event.clientY > 18) void doThrow();
  });

  addEventListener("keydown", (event) => {
    if (root.dataset.mode !== "play") return;
    if (event.code === "Space") {
      event.preventDefault();
      void doThrow();
      return;
    }
    if (event.code === "Escape") {
      preview = null;
      selectedGroup = null;
      render();
      return;
    }
    const moves = legalMoves(state, state.turn);
    if (event.code === "Tab" || event.code.startsWith("Arrow")) {
      event.preventDefault();
      if (!moves.length) return;
      const dir = event.code === "ArrowLeft" || event.code === "ArrowUp" ? -1 : 1;
      keyboardIndex = (keyboardIndex + dir + moves.length) % moves.length;
      const move = moves[keyboardIndex];
      selectedThrow = move.throwId;
      selectedGroup = move.groupId;
      preview = move;
      render();
      return;
    }
    if (event.code === "Enter") {
      event.preventDefault();
      if (preview) void confirmPreview();
      else void doThrow();
    }
  });

  addEventListener("resize", resize);
  addEventListener("visibilitychange", () => audio.suspend(document.hidden));

  refreshMenu();
  screen("menu");
  render();

  if (qaMode) {
    window.__yut = {
      start,
      autoplay: (value = true) => {
        autoplay = Boolean(value);
        if (autoplay && root.dataset.mode === "play" && mode === "rival" && state.turn === 1) void aiLoop();
      },
      throw: doThrow,
      state: () => cloneState(state),
      moves: () => legalMoves(state),
      selectFirst: () => {
        const move = legalMoves(state)[0] ?? null;
        if (move) {
          selectedThrow = move.throwId;
          selectedGroup = move.groupId;
          preview = move;
          render();
        }
        return move;
      },
      confirm: confirmPreview,
      forceThrow: (id: ThrowId) => {
        state.queue.push(id);
        state.mustThrow = false;
        selectedThrow = id;
        render();
      },
      captureSetup: () => {
        state = newGame(44);
        state.teams[0].off = 3;
        state.teams[1].off = 3;
        state.teams[0].groups = [{ id: 1, team: 0, pos: "r1", count: 1, route: "perimeter", history: ["A"] }];
        state.teams[1].groups = [{ id: 2, team: 1, pos: "r2", count: 1, route: "perimeter", history: ["A", "r1"] }];
        state.nextId = 3;
        state.queue = ["do"];
        state.mustThrow = false;
        selectedThrow = "do";
        preview = previewMove(state, 0, "do", 1);
        selectedGroup = 1;
        screen("play");
        render();
      },
      stackSetup: () => {
        state = newGame(45);
        state.teams[0].off = 2;
        state.teams[0].groups = [
          { id: 1, team: 0, pos: "r1", count: 1, route: "perimeter", history: ["A"] },
          { id: 2, team: 0, pos: "r2", count: 1, route: "perimeter", history: ["A", "r1"] },
        ];
        state.nextId = 3;
        state.queue = ["do"];
        state.mustThrow = false;
        selectedThrow = "do";
        preview = previewMove(state, 0, "do", 1);
        selectedGroup = 1;
        screen("play");
        render();
      },
      shortcutSetup: () => {
        state = newGame(46);
        state.teams[0].off = 3;
        state.teams[0].groups = [{ id: 1, team: 0, pos: "B", count: 1, route: "perimeter", history: ["A", "r1", "r2", "r3", "r4"] }];
        state.nextId = 2;
        state.queue = ["gae"];
        state.mustThrow = false;
        selectedThrow = "gae";
        preview = previewMove(state, 0, "gae", 1);
        selectedGroup = 1;
        screen("play");
        render();
      },
      goalSetup: () => {
        state = newGame(47);
        state.teams[0].home = 3;
        state.teams[0].off = 3;
        state.teams[0].groups = [{ id: 1, team: 0, pos: "A", count: 1, route: "perimeter", history: ["b4"] }];
        state.nextId = 2;
        state.queue = ["do"];
        state.mustThrow = false;
        selectedThrow = "do";
        preview = previewMove(state, 0, "do", 1);
        selectedGroup = 1;
        screen("play");
        render();
      },
      finish: () => {
        state.teams[0].home = 4;
        state.winner = 0;
        finish();
      },
    };
  }
}
