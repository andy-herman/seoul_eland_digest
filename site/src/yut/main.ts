import { YutAudio } from "./audio";
import { YUT_STRINGS, RIVAL_CHOICES, type Locale } from "./i18n";
import { BOARD_POS, OPPONENTS, THROW_INFO, type Level, type Mode, type MoveOption, type OpponentSlug, type TeamId, applyMove, applyThrow, chooseMove, cloneState, discardIfNoMoves, legalMoves, makeRng, newGame, previewMove, type GameState, type ThrowId } from "./model";
import { YutThrowScene } from "./throwScene";

const SAVE_KEY = "yut-save-v1";
interface Save { rivals: Record<string, { wins: number; losses: number; streak: number; best: number }> }
function loadSave(): Save { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "") as Save; } catch { return { rivals: {} }; } }
function storeSave(s: Save): void { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* ignore */ } }

export function mountYutNori(root: HTMLElement): void {
  const locale = (root.dataset.locale as Locale) || "en"; const t = YUT_STRINGS[locale]; const isQa = new URLSearchParams(location.search).has("qa");
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!; const qa = <T extends HTMLElement = HTMLElement>(sel: string) => [...root.querySelectorAll<T>(sel)];
  const canvas = q<HTMLCanvasElement>("[data-yut-board]"); const ctx = canvas.getContext("2d")!; const thrower = new YutThrowScene(q<HTMLCanvasElement>("[data-yut-throw-canvas]")); const audio = new YutAudio(); thrower.onClack = (n) => audio.hit(n);
  let state: GameState = newGame(7); let rng = makeRng(7); let mode: Mode = "rival"; let level: Level = "friendly"; let rival = "busan-ipark" as OpponentSlug; let selectedThrow: ThrowId | null = null; let selectedGroup: number | "new" | null = null; let preview: MoveOption | null = null; let autoplay = false; let busy = false; let lastThrow = ""; let keyboardIndex = -1;
  const save = loadSave();

  const setScreen = (name: "menu" | "play" | "result") => { root.dataset.mode = name; for (const el of qa("[data-yut-screen]")) el.hidden = el.dataset.yutScreen !== name; document.body.classList.toggle("yut-lock-scroll", name === "play" && matchMedia("(pointer: coarse)").matches); requestAnimationFrame(resize); };
  const fmt = new Intl.NumberFormat(locale === "pt" ? "pt-BR" : "en-US");
  function labelTeam(team: TeamId): string { if (mode === "pass") return team === 0 ? "Leoul" : "Lenyang"; return team === 0 ? "Leoul" : OPPONENTS[rival].name; }
  function renderControls(): void {
    q("[data-yut-turn]").textContent = `${t.turn}: ${labelTeam(state.turn)}`;
    q("[data-yut-score]").textContent = `${labelTeam(0)} ${state.teams[0].home} - ${state.teams[1].home} ${labelTeam(1)}`;
    q("[data-yut-last]").textContent = lastThrow;
    const queue = q("[data-yut-queue]"); queue.innerHTML = "";
    state.queue.forEach((id) => { const b = document.createElement("button"); b.type = "button"; b.className = "yut-pill"; b.dataset.sel = selectedThrow === id ? "true" : "false"; b.textContent = `${THROW_INFO[id].ko} ${THROW_INFO[id].roman} ${THROW_INFO[id].steps > 0 ? `+${THROW_INFO[id].steps}` : THROW_INFO[id].steps}`; b.addEventListener("click", () => { selectedThrow = id; selectedGroup = null; preview = null; render(); }); queue.append(b); });
    const pieces = q("[data-yut-pieces]"); pieces.innerHTML = "";
    const throwId = selectedThrow || state.queue[0] || null;
    if (throwId && state.teams[state.turn].off) addPieceButton(pieces, "new", `${t.newPiece} (${state.teams[state.turn].off})`, throwId);
    for (const g of state.teams[state.turn].groups) addPieceButton(pieces, g.id, `${labelTeam(g.team)} ${g.count > 1 ? `x${g.count}` : ""} @ ${g.pos}`, throwId);
    q("[data-yut-message]").textContent = state.log[0] || t.hints[0];
    q("[data-yut-throw]").toggleAttribute("disabled", busy || !state.mustThrow || state.winner !== null || (mode === "rival" && state.turn === 1));
  }
  function addPieceButton(parent: HTMLElement, id: number | "new", label: string, throwId: ThrowId | null): void { const m = throwId ? previewMove(state, state.turn, throwId, id) : null; if (!m) return; const b = document.createElement("button"); b.type = "button"; b.className = "yut-piece-choice"; b.dataset.sel = selectedGroup === id ? "true" : "false"; b.textContent = label; b.addEventListener("click", () => { selectedThrow = throwId; selectedGroup = id; preview = m; render(); }); parent.append(b); }
  function resize(): void { const r = canvas.getBoundingClientRect(); const d = Math.min(devicePixelRatio, 2); canvas.width = Math.max(1, Math.round(r.width * d)); canvas.height = Math.max(1, Math.round(r.height * d)); ctx.setTransform(d, 0, 0, d, 0, 0); drawBoard(); }
  function p(st: string, w: number, h: number): [number, number] { const bp = BOARD_POS[st as keyof typeof BOARD_POS]; return [bp.x / 100 * w, bp.y / 100 * h]; }
  function drawBoard(): void {
    const w = canvas.clientWidth || 800, h = canvas.clientHeight || 540; ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#226b37"); g.addColorStop(1, "#114d2a"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? "rgba(255,255,255,.045)" : "rgba(0,0,0,.035)"; ctx.fillRect(0, (h / 8) * i, w, h / 8); }
    ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = Math.max(2, w * 0.006); ctx.lineCap = "round";
    const lines = [["A","B","C","D","A"], ["B","d1","d2","O","d3","d4","D"], ["C","e1","e2","O","e3","e4","A"]];
    for (const line of lines) { ctx.beginPath(); line.forEach((s, i) => { const [x,y] = p(s,w,h); i ? ctx.lineTo(x,y) : ctx.moveTo(x,y); }); ctx.stroke(); }
    ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 2; ctx.strokeRect(w*.1,h*.12,w*.8,h*.76); ctx.beginPath(); ctx.arc(w*.5,h*.5,Math.min(w,h)*.095,0,Math.PI*2); ctx.stroke();
    for (const [name,bp] of Object.entries(BOARD_POS)) { const [x,y] = p(name,w,h); ctx.beginPath(); ctx.fillStyle = bp.center ? "#fff" : bp.corner ? "#ffd64d" : "#eff6ff"; ctx.strokeStyle = "#071433"; ctx.lineWidth = 3; ctx.arc(x,y,bp.corner ? 12 : bp.center ? 10 : 8,0,Math.PI*2); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#071433"; ctx.font = "700 10px system-ui"; ctx.textAlign = "center"; ctx.fillText(name, x, y - 14); }
    if (preview) { ctx.strokeStyle = "#ffe66b"; ctx.lineWidth = 7; ctx.beginPath(); const start = preview.from === "bench" ? p("A",w,h) : p(preview.from,w,h); ctx.moveTo(start[0], start[1]); for (const st of preview.path) { const [x,y] = p(st,w,h); ctx.lineTo(x,y); } ctx.stroke(); if (preview.to !== "home") { const [x,y] = p(preview.to,w,h); ctx.beginPath(); ctx.fillStyle = preview.captures ? "#ff6b6b" : preview.stacks ? "#7bf1a8" : preview.danger > .2 ? "#ffb86b" : "#ffe66b"; ctx.arc(x,y,18,0,Math.PI*2); ctx.fill(); } }
    drawPieces(w,h);
  }
  function drawPieces(w: number, h: number): void { const all = [...state.teams[0].groups, ...state.teams[1].groups]; const byPos = new Map<string, typeof all>(); for (const g of all) { const a = byPos.get(g.pos) || []; a.push(g); byPos.set(g.pos,a); }
    for (const [pos, groups] of byPos) groups.forEach((g, i) => { const [x,y] = p(pos,w,h); drawToken(g.team, x + (i - (groups.length-1)/2) * 20, y, g.count); });
  }
  function drawToken(team: TeamId, x: number, y: number, count: number): void { ctx.save(); ctx.translate(x,y); ctx.fillStyle = team === 0 ? "#f7c948" : "#71c7ec"; ctx.strokeStyle = "#071433"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0,0,16,0,Math.PI*2); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#071433"; ctx.font = "900 13px system-ui"; ctx.textAlign = "center"; ctx.fillText(team === 0 ? "L" : mode === "pass" ? "Y" : "R",0,5); if (count > 1) { ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.arc(13,-13,10,0,Math.PI*2); ctx.fill(); ctx.fillStyle = "#fff"; ctx.font = "900 11px system-ui"; ctx.fillText(String(count),13,-9); } ctx.restore(); }
  function render(): void { renderControls(); drawBoard(); }

  async function doThrow(): Promise<void> { if (busy || !state.mustThrow || state.winner !== null) return; busy = true; audio.unlock(); render(); const tr = applyThrow(state, rng); lastThrow = `${tr.ko} ${tr.roman} · ${tr.steps < 0 ? t.commentary.back : `${Math.abs(tr.steps)} ${locale === "pt" ? "casas" : "steps"}`}`; await thrower.animate(tr); if (tr.extra) { audio.cheer(); state.log.unshift(t.commentary.extra); } else state.mustThrow = false; discardIfNoMoves(state); busy = false; render(); if (mode === "rival" && state.turn === 1) void aiLoop(); }
  async function confirmPreview(): Promise<void> { if (!preview || busy) return; busy = true; const res = applyMove(state, preview); if (res.home) state.log.unshift(t.commentary.home); if (res.capture) state.log.unshift(t.commentary.capture); if (res.stack) state.log.unshift(t.commentary.stack); if (res.shortcut) state.log.unshift(t.commentary.shortcut); selectedGroup = null; selectedThrow = state.queue[0] || null; preview = null; keyboardIndex = -1; render(); await new Promise((r) => setTimeout(r, 220)); busy = false; if (state.winner !== null) finish(); else { discardIfNoMoves(state); render(); if (mode === "rival" && state.turn === 1) void aiLoop(); } }
  async function aiLoop(): Promise<void> { if (busy || state.winner !== null || mode !== "rival" || state.turn !== 1) return; busy = true; render(); await new Promise((r) => setTimeout(r, autoplay ? 40 : 450)); while (state.turn === 1 && state.winner === null) { while (state.mustThrow) { const tr = applyThrow(state, rng); lastThrow = `${tr.ko} ${tr.roman}`; await thrower.animate(tr); if (!tr.extra) state.mustThrow = false; if (!autoplay) await new Promise((r) => setTimeout(r, 180)); } discardIfNoMoves(state); while (state.queue.length && state.turn === 1 && state.winner === null) { const m = chooseMove(state, level, rng, 1); if (!m) { state.queue.shift(); continue; } preview = m; render(); if (!autoplay) await new Promise((r) => setTimeout(r, 260)); applyMove(state, m); preview = null; render(); if (state.mustThrow) break; } if (!state.mustThrow && !state.queue.length) break; }
    busy = false; if (state.winner !== null) finish(); else render(); }
  function finish(): void { const winner = state.winner ?? 0; const recKey = `${rival}:${level}`; const rec = save.rivals[recKey] || { wins: 0, losses: 0, streak: 0, best: 0 }; if (mode === "rival") { if (winner === 0) { rec.wins++; rec.streak++; rec.best = Math.max(rec.best, rec.streak); } else { rec.losses++; rec.streak = 0; } save.rivals[recKey] = rec; storeSave(save); }
    q("[data-yut-result-title]").textContent = winner === 0 ? `${labelTeam(0)} ${t.result}` : `${labelTeam(1)} ${t.result}`; q("[data-yut-result-score]").textContent = `${labelTeam(0)} ${state.teams[0].home} - ${state.teams[1].home} ${labelTeam(1)}`; q("[data-yut-record]").textContent = mode === "rival" ? `${t.save}: ${fmt.format(rec.wins)}-${fmt.format(rec.losses)}, streak ${fmt.format(rec.streak)}, best ${fmt.format(rec.best)}` : ""; setScreen("result"); }
  function start(opts: Partial<{ mode: Mode; rival: OpponentSlug; level: Level; seed: number }> = {}): void { mode = opts.mode || (q<HTMLButtonElement>("[data-mode-pass]").getAttribute("aria-pressed") === "true" ? "pass" : "rival"); rival = opts.rival || (q<HTMLSelectElement>("[data-rival]").value as OpponentSlug); level = opts.level || (q<HTMLSelectElement>("[data-level]").value as Level); const seed = opts.seed ?? Date.now() % 100000000; state = newGame(seed); rng = makeRng(seed); selectedThrow = null; selectedGroup = null; preview = null; keyboardIndex = -1; lastThrow = ""; busy = false; setScreen("play"); render(); if (mode === "rival" && state.turn === 1) void aiLoop(); }

  canvas.addEventListener("click", () => { if (preview) void confirmPreview(); });
  q("[data-yut-throw]").addEventListener("click", () => void doThrow());
  q("[data-yut-cancel]").addEventListener("click", () => { preview = null; selectedGroup = null; render(); });
  q("[data-yut-play]").addEventListener("click", () => start());
  for (const b of qa<HTMLButtonElement>("[data-mode-choice]")) b.addEventListener("click", () => { qa<HTMLButtonElement>("[data-mode-choice]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); });
  for (const b of qa<HTMLButtonElement>("[data-yut-menu]")) b.addEventListener("click", () => setScreen("menu")); q("[data-yut-restart]").addEventListener("click", () => start({ seed: state.seed + 1 }));
  let touchStart = 0; const throwCanvas = q<HTMLCanvasElement>("[data-yut-throw-canvas]");
  throwCanvas.addEventListener("pointerdown", (e) => { touchStart = e.clientY; audio.unlock(); });
  throwCanvas.addEventListener("pointerup", (e) => { if (touchStart - e.clientY > 18 || e.pointerType !== "touch") void doThrow(); });
  throwCanvas.addEventListener("touchstart", (e) => { touchStart = e.touches[0]?.clientY ?? 0; audio.unlock(); }, { passive: true });
  throwCanvas.addEventListener("touchend", (e) => { const y = e.changedTouches[0]?.clientY ?? touchStart; if (touchStart - y > 18) void doThrow(); }, { passive: true });
  addEventListener("keydown", (e) => {
    if (root.dataset.mode !== "play") return;
    if (e.code === "Tab" || e.code.startsWith("Arrow")) {
      e.preventDefault();
      const moves = legalMoves(state);
      if (moves.length) { keyboardIndex = (keyboardIndex + (e.code === "ArrowLeft" || e.code === "ArrowUp" ? -1 : 1) + moves.length) % moves.length; const m = moves[keyboardIndex]; selectedThrow = m.throwId; selectedGroup = m.groupId; preview = m; render(); }
      return;
    }
    if (e.code === "Space") { e.preventDefault(); void doThrow(); return; }
    if (e.code === "Enter") { e.preventDefault(); if (preview) void confirmPreview(); else void doThrow(); return; }
    if (e.code === "Escape") { preview = null; selectedGroup = null; keyboardIndex = -1; render(); }
  });
  q<HTMLSelectElement>("[data-rival]").innerHTML = RIVAL_CHOICES.map((r) => `<option value="${r.slug}">${r.name} · ${r.club}</option>`).join("");
  resize(); addEventListener("resize", resize); setScreen("menu"); render();
  if (isQa) (window as unknown as { __yut: unknown }).__yut = { start, autoplay: (v = true) => { autoplay = v; if (v && root.dataset.mode === "play" && mode === "rival" && state.turn === 1) void aiLoop(); }, throw: doThrow, state: () => cloneState(state), moves: () => legalMoves(state), selectFirst: () => { const m = legalMoves(state)[0]; if (m) { selectedThrow = m.throwId; selectedGroup = m.groupId; preview = m; render(); } return m; }, confirm: confirmPreview, finish: () => { state.teams[0].home = 4; state.winner = 0; finish(); }, captureSetup: () => { state = newGame(44); state.teams[0].off=3; state.teams[1].off=3; state.teams[0].groups=[{id:1,team:0,pos:"r1",count:1,route:"perimeter",history:["A"]}]; state.teams[1].groups=[{id:2,team:1,pos:"r2",count:1,route:"perimeter",history:["A","r1"]}]; state.nextId=3; state.queue=["do"]; state.mustThrow=false; selectedThrow="do"; selectedGroup=1; preview=previewMove(state,0,"do",1); setScreen("play"); render(); }, resultSetup: () => { state.teams[0].home=4; state.winner=0; finish(); } };
}
