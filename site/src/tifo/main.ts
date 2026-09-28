import { GameAudio } from "../game/audio";
import { allFixed, makeCheck, starsFor, tapCard, type CheckState } from "./check";
import { decodeDesign, encodeDesign, loadDesignString, saveDesignString } from "./codec";
import { GALLERY, PALETTE, PROGRESS_KEY, SAVE_KEY, SEAT_MAP, TIFO_CELLS, TIFO_COLS, TIFO_ROWS, TIFO_STRINGS, blankFrame, cloneDesign, type Locale, type TifoDesign, type Tool, type WaveMode } from "./data";
import { drawLine, drawRect, floodFill, paint, quantizeImageData, stampText } from "./editor";
import type { TifoRenderer } from "./render";

interface SaveState {
  designs: { title: string; data: string; thumb: string; savedAt: number }[];
  last?: string;
}

const emptySave = (): SaveState => ({ designs: [] });
const loadSave = (): SaveState => {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "{}");
    return { designs: Array.isArray(raw.designs) ? raw.designs : [], last: raw.last };
  } catch {
    return emptySave();
  }
};
const storeSave = (s: SaveState) => {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* private mode */ }
};

function drawThumb(frame: Uint8Array, w = 156, h = 70): string {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#071228"; ctx.fillRect(0, 0, w, h);
  const cell = Math.min(w / TIFO_COLS, h / TIFO_ROWS);
  const ox = (w - cell * TIFO_COLS) / 2;
  const oy = (h - cell * TIFO_ROWS) / 2;
  for (const seat of SEAT_MAP) {
    ctx.fillStyle = seat.usable ? PALETTE[frame[seat.index]].hex : seat.reason === "aisle" ? "#77808f" : "#20283d";
    ctx.fillRect(ox + seat.col * cell, oy + seat.row * cell, Math.ceil(cell), Math.ceil(cell));
  }
  return c.toDataURL("image/webp", 0.82);
}

export function mountTifoMaster(root: HTMLElement): void {
  const locale = (root.dataset.locale as Locale) ?? "en";
  const t = TIFO_STRINGS[locale];
  const qaMode = new URLSearchParams(location.search).has("qa");
  const coarse = matchMedia("(pointer: coarse)").matches;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const $$ = <T extends HTMLElement = HTMLElement>(s: string) => [...root.querySelectorAll<T>(s)];
  const grid = $<HTMLCanvasElement>("[data-tifo-grid]");
  const ctx = grid.getContext("2d")!;
  const refCanvas = $<HTMLCanvasElement>("[data-tifo-ref]");
  const audio = new GameAudio(root.dataset.song!);
  const save = loadSave();
  let design: TifoDesign = { id: "new", title: "My Mokdong tifo", frames: [blankFrame(0)], wave: "left", createdAt: Date.now() };
  let frameIndex = 0;
  let tool: Tool = "brush";
  let color = 1;
  let brush = 1;
  let mirror = false;
  let rectFilled = true;
  let dither = false;
  let down = false;
  let startCell = -1;
  let undoHistory: Uint8Array[][] = [];
  let redo: Uint8Array[][] = [];
  let renderer: TifoRenderer | null = null;
  let check: CheckState | null = null;
  let checkTimer = 0;
  let checkEnd = 0;
  let checkFrame = 0;
  let skipTimers = false;

  const pushHistory = () => {
    undoHistory.push(design.frames.map((f) => new Uint8Array(f)));
    if (undoHistory.length > 50) undoHistory.shift();
    redo = [];
  };

  const setMode = (mode: string) => {
    root.dataset.mode = mode;
    for (const s of $$("[data-tifo-screen]")) s.hidden = s.dataset.tifoScreen !== mode;
    const immersive = coarse && (mode === "show" || mode === "check3d");
    document.body.classList.toggle("tf-lock-scroll", immersive);
    document.documentElement.classList.toggle("tf-lock-scroll", immersive);
    if (mode !== "show" && mode !== "check3d") {
      renderer?.dispose();
      renderer = null;
    }
    requestAnimationFrame(() => { drawGrid(); renderer?.resize(); });
  };

  const drawGrid = () => {
    const rect = grid.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    grid.width = Math.max(1, Math.round(rect.width * dpr));
    grid.height = Math.max(1, Math.round(rect.width * 0.48 * dpr));
    grid.style.height = `${Math.round(rect.width * 0.48)}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = grid.width / dpr, h = grid.height / dpr;
    ctx.fillStyle = "#071228"; ctx.fillRect(0, 0, w, h);
    const cell = Math.min(w / TIFO_COLS, h / TIFO_ROWS);
    const ox = (w - cell * TIFO_COLS) / 2;
    const oy = (h - cell * TIFO_ROWS) / 2;
    const frame = design.frames[frameIndex];
    for (const seat of SEAT_MAP) {
      ctx.fillStyle = seat.usable ? PALETTE[frame[seat.index]].hex : seat.reason === "aisle" ? "#87909c" : "#12182a";
      ctx.fillRect(ox + seat.col * cell + 0.35, oy + seat.row * cell + 0.35, Math.max(1, cell - 0.7), Math.max(1, cell - 0.7));
    }
    ctx.strokeStyle = "rgba(255,255,255,.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, cell * TIFO_COLS, cell * TIFO_ROWS);
    updateMeta();
  };

  const cellAt = (e: PointerEvent): number => {
    const r = grid.getBoundingClientRect();
    const w = r.width, h = r.width * 0.48;
    const cell = Math.min(w / TIFO_COLS, h / TIFO_ROWS);
    const ox = (w - cell * TIFO_COLS) / 2;
    const oy = (h - cell * TIFO_ROWS) / 2;
    const x = Math.floor((e.clientX - r.left - ox) / cell);
    const y = Math.floor((e.clientY - r.top - oy) / cell);
    return x < 0 || x >= TIFO_COLS || y < 0 || y >= TIFO_ROWS ? -1 : y * TIFO_COLS + x;
  };

  const applyCell = (idx: number) => {
    if (idx < 0) return;
    const f = design.frames[frameIndex];
    const col = idx % TIFO_COLS, row = Math.floor(idx / TIFO_COLS);
    if (tool === "brush") paint(f, col, row, color, brush, mirror);
    else if (tool === "fill") design.frames[frameIndex] = floodFill(f, idx, color);
    else if (tool === "dropper") color = f[idx] ?? color;
    drawGrid();
    refreshToolbar();
  };

  grid.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    audio.unlock(); audio.click();
    down = true; startCell = cellAt(e);
    pushHistory();
    if (tool === "text") {
      const txt = prompt(locale === "pt" ? "Texto do mosaico" : "Tifo text", locale === "pt" ? "서울" : "SEOUL") ?? "";
      if (txt.trim()) {
        const stamp = stampText(txt.trim(), color, Math.max(0, startCell % TIFO_COLS), Math.max(0, Math.floor(startCell / TIFO_COLS)));
        for (let i = 0; i < TIFO_CELLS; i++) if (stamp[i]) design.frames[frameIndex][i] = stamp[i];
        drawGrid();
      }
      return;
    }
    applyCell(startCell);
  });
  grid.addEventListener("pointermove", (e) => { if (down && tool === "brush") applyCell(cellAt(e)); });
  grid.addEventListener("pointerup", (e) => {
    if (!down) return;
    down = false;
    const end = cellAt(e);
    if (tool === "line" && startCell >= 0 && end >= 0) design.frames[frameIndex] = drawLine(design.frames[frameIndex], startCell, end, color, brush);
    if (tool === "rect" && startCell >= 0 && end >= 0) design.frames[frameIndex] = drawRect(design.frames[frameIndex], startCell, end, color, rectFilled);
    drawGrid();
  });

  const updateMeta = () => {
    $("[data-tifo-frame-label]").textContent = `${frameIndex + 1} / ${design.frames.length}`;
    $("[data-tifo-wave-label]").textContent = design.wave;
  };
  const refreshToolbar = () => {
    for (const b of $$<HTMLButtonElement>("[data-tool]")) b.dataset.on = String(b.dataset.tool === tool);
    for (const b of $$<HTMLButtonElement>("[data-palette]")) b.dataset.on = String(Number(b.dataset.palette) === color);
    $<HTMLButtonElement>("[data-mirror]").dataset.on = String(mirror);
    $<HTMLButtonElement>("[data-dither]").dataset.on = String(dither);
  };

  for (const b of $$<HTMLButtonElement>("[data-menu-mode]")) b.addEventListener("click", () => {
    audio.unlock(); audio.click();
    const m = b.dataset.menuMode!;
    if (m === "designer") setMode("designer");
    else if (m === "gallery") { renderGallery(); setMode("gallery"); }
    else { renderLevels(); setMode("check"); }
  });
  for (const b of $$<HTMLButtonElement>("[data-tool]")) b.addEventListener("click", () => { tool = b.dataset.tool as Tool; refreshToolbar(); });
  for (const b of $$<HTMLButtonElement>("[data-palette]")) b.addEventListener("click", () => { color = Number(b.dataset.palette); refreshToolbar(); });
  $<HTMLInputElement>("[data-brush]").addEventListener("input", (e) => { brush = Number((e.target as HTMLInputElement).value); });
  $<HTMLButtonElement>("[data-mirror]").addEventListener("click", () => { mirror = !mirror; refreshToolbar(); });
  $<HTMLButtonElement>("[data-dither]").addEventListener("click", () => { dither = !dither; refreshToolbar(); });
  $<HTMLButtonElement>("[data-rect-fill]").addEventListener("click", () => { rectFilled = !rectFilled; $("[data-rect-fill]").textContent = rectFilled ? "Filled" : "Outline"; });
  $<HTMLButtonElement>("[data-clear]").addEventListener("click", () => { pushHistory(); design.frames[frameIndex] = blankFrame(0); drawGrid(); });
  $<HTMLButtonElement>("[data-undo]").addEventListener("click", () => { const h = undoHistory.pop(); if (!h) return; redo.push(design.frames.map((f) => new Uint8Array(f))); design.frames = h; frameIndex = Math.min(frameIndex, design.frames.length - 1); drawGrid(); });
  $<HTMLButtonElement>("[data-redo]").addEventListener("click", () => { const h = redo.pop(); if (!h) return; undoHistory.push(design.frames.map((f) => new Uint8Array(f))); design.frames = h; drawGrid(); });
  $<HTMLButtonElement>("[data-add-frame]").addEventListener("click", () => { if (design.frames.length >= 4) return; pushHistory(); design.frames.push(blankFrame(0)); frameIndex = design.frames.length - 1; drawGrid(); });
  $<HTMLButtonElement>("[data-dup-frame]").addEventListener("click", () => { if (design.frames.length >= 4) return; pushHistory(); design.frames.splice(frameIndex + 1, 0, new Uint8Array(design.frames[frameIndex])); frameIndex++; drawGrid(); });
  $<HTMLButtonElement>("[data-del-frame]").addEventListener("click", () => { if (design.frames.length <= 1) return; pushHistory(); design.frames.splice(frameIndex, 1); frameIndex = Math.max(0, frameIndex - 1); drawGrid(); });
  for (const b of $$<HTMLButtonElement>("[data-frame-step]")) b.addEventListener("click", () => { frameIndex = (frameIndex + Number(b.dataset.frameStep) + design.frames.length) % design.frames.length; drawGrid(); });
  $<HTMLSelectElement>("[data-wave]").addEventListener("change", (e) => { design.wave = (e.target as HTMLSelectElement).value as WaveMode; drawGrid(); });
  $<HTMLInputElement>("[data-title]").addEventListener("input", (e) => { design.title = (e.target as HTMLInputElement).value || "My Mokdong tifo"; });

  $<HTMLInputElement>("[data-import]").addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 220; c.height = Math.max(1, Math.round(img.height * 220 / img.width));
    const ictx = c.getContext("2d")!;
    ictx.drawImage(img, 0, 0, c.width, c.height);
    pushHistory();
    design.frames[frameIndex] = quantizeImageData(ictx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, dither);
    URL.revokeObjectURL(img.src);
    drawGrid();
  });

  $<HTMLButtonElement>("[data-save]").addEventListener("click", () => {
    const entry = { title: design.title, data: saveDesignString(design), thumb: drawThumb(design.frames[0]), savedAt: Date.now() };
    save.designs = [entry, ...save.designs.filter((x) => x.data !== entry.data)].slice(0, 12);
    save.last = entry.data;
    storeSave(save);
    renderSaves();
    $("[data-save-msg]").textContent = t.saved;
  });

  const openShow = async (d = design, highSpeed = false) => {
    audio.unlock(); audio.startMusic(); audio.card();
    setMode("show");
    const showCanvas = root.querySelector<HTMLCanvasElement>('[data-tifo-screen="show"] [data-tifo-show-canvas]')!;
    const { TifoRenderer } = await import("./render");
    renderer = new TifoRenderer(showCanvas, { assets: root.dataset.assets! });
    await renderer.init();
    renderer.play(d, highSpeed || skipTimers ? 12 : 1);
    const count = $("[data-count]");
    let i = 0;
    const countTick = () => {
      count.textContent = t.count[i++] ?? "";
      if (i <= 3 && !skipTimers) setTimeout(countTick, 430);
      else setTimeout(() => { count.textContent = ""; }, 550);
    };
    countTick();
  };
  $<HTMLButtonElement>("[data-show]").addEventListener("click", () => void openShow());
  $<HTMLButtonElement>("[data-close-show]").addEventListener("click", () => { audio.stopMusic(); setMode("designer"); });
  $<HTMLButtonElement>("[data-download]").addEventListener("click", () => {
    if (!renderer) return;
    const a = document.createElement("a");
    a.href = renderer.screenshot();
    a.download = "tifo-master.png";
    a.click();
  });
  $<HTMLButtonElement>("[data-share]").addEventListener("click", async () => {
    const code = await encodeDesign(design);
    const url = `${location.origin}${location.pathname}#t=${code}`;
    await navigator.clipboard?.writeText(url).catch(() => {});
    window.history.replaceState(null, "", `#t=${code}`);
    $("[data-share-msg]").textContent = `${code.length} chars`;
  });
  $<HTMLButtonElement>("[data-mute]").addEventListener("click", () => { audio.setMuted(!audio.muted); $("[data-mute]").textContent = audio.muted ? "🔇" : "🔊"; });
  $<HTMLButtonElement>("[data-menu]").addEventListener("click", () => setMode("menu"));
  for (const b of $$<HTMLButtonElement>("[data-back-menu]")) b.addEventListener("click", () => setMode("menu"));

  function renderGallery(): void {
    const g = $("[data-gallery]");
    g.innerHTML = "";
    for (const item of GALLERY) {
      const card = document.createElement("article");
      card.className = "tf-mini";
      card.innerHTML = `<img alt="" src="${drawThumb(item.frames[0])}"><b></b><div><button data-act="edit">${t.edit}</button><button data-act="show">${t.show}</button></div>`;
      card.querySelector("b")!.textContent = item.title;
      card.querySelector<HTMLButtonElement>('[data-act="edit"]')!.onclick = () => { design = cloneDesign(item, "copy"); frameIndex = 0; $<HTMLInputElement>("[data-title]").value = design.title; setMode("designer"); drawGrid(); };
      card.querySelector<HTMLButtonElement>('[data-act="show"]')!.onclick = () => void openShow(item);
      g.appendChild(card);
    }
  }
  function renderSaves(): void {
    const list = $("[data-saves]");
    list.innerHTML = "";
    for (const item of save.designs) {
      const b = document.createElement("button");
      b.className = "tf-save";
      b.innerHTML = `<img alt="" src="${item.thumb}"><span></span>`;
      b.querySelector("span")!.textContent = item.title;
      b.onclick = () => { design = loadDesignString(item.data); frameIndex = 0; $<HTMLInputElement>("[data-title]").value = design.title; drawGrid(); };
      list.appendChild(b);
    }
  }

  function drawReference(frame: Uint8Array): void {
    const rctx = refCanvas.getContext("2d")!;
    refCanvas.width = 240; refCanvas.height = 120;
    rctx.fillStyle = "#071228"; rctx.fillRect(0, 0, 240, 120);
    const cell = Math.min(240 / TIFO_COLS, 120 / TIFO_ROWS);
    for (const seat of SEAT_MAP) {
      rctx.fillStyle = seat.usable ? PALETTE[frame[seat.index]].hex : "#3b4455";
      rctx.fillRect(seat.col * cell, seat.row * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }
  function renderLevels(): void {
    const el = $("[data-levels]");
    el.innerHTML = "";
    const progress = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}") as Record<string, number>;
    for (let i = 0; i < 12; i++) {
      const open = qaMode || i === 0 || (progress[`l${i}`] ?? 0) > 0 || i < 4 || (i < 8 && (progress.l4 ?? 0) > 0) || (i >= 8 && (progress.l8 ?? 0) > 0);
      const b = document.createElement("button");
      b.className = "tf-level";
      b.disabled = !open;
      b.textContent = `${i + 1}. ${open ? "Card Check" : "🔒"} ${progress[`l${i + 1}`] ? "★".repeat(progress[`l${i + 1}`]) : ""}`;
      b.onclick = () => void startCheck(`l${i + 1}`);
      el.appendChild(b);
    }
  }
  async function startCheck(id: string): Promise<void> {
    audio.unlock(); audio.whistle();
    check = makeCheck(id);
    checkFrame = check.level.twoFrame ? 1 : 0;
    drawReference(check.target.frames[checkFrame]);
    setMode("check3d");
    const showCanvas = root.querySelector<HTMLCanvasElement>('[data-tifo-screen="check3d"] [data-tifo-show-canvas]')!;
    const { TifoRenderer } = await import("./render");
    renderer = new TifoRenderer(showCanvas, { assets: root.dataset.assets!, onPick: (index) => {
      if (!check) return;
      const ok = tapCard(check, index, checkFrame);
      if (ok) audio.card(); else audio.miss();
      renderer?.setFrame(check.shown[checkFrame]);
      updateCheckHud();
      if (check && allFixed(check)) finishCheck();
    } });
    await renderer.init();
    renderer.setFrame(check.shown[checkFrame]);
    checkEnd = performance.now() + check.level.seconds * 1000;
    updateCheckHud();
    clearInterval(checkTimer);
    checkTimer = window.setInterval(() => {
      if (skipTimers) checkEnd = performance.now() + 999000;
      updateCheckHud();
      if (performance.now() > checkEnd && check && !allFixed(check)) finishCheck();
    }, 200);
  }
  function updateCheckHud(): void {
    if (!check) return;
    const left = Math.max(0, Math.ceil((checkEnd - performance.now()) / 1000));
    $("[data-check-hud]").textContent = `${check.errors.filter((e) => e.fixed).length}/${check.errors.length} ${t.fixed} · ${left}s`;
  }
  function finishCheck(): void {
    if (!check) return;
    clearInterval(checkTimer);
    const left = Math.max(0, Math.ceil((checkEnd - performance.now()) / 1000));
    const stars = starsFor(check, left);
    const progress = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}") as Record<string, number>;
    progress[check.level.id] = Math.max(progress[check.level.id] ?? 0, stars);
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    $("[data-check-result]").textContent = `${"★".repeat(stars)}${"☆".repeat(3 - stars)} · ${check.wrongTaps ? check.wrongTaps + " wrong taps" : t.noMistakes}`;
  }
  $<HTMLButtonElement>("[data-check-back]").addEventListener("click", () => { clearInterval(checkTimer); setMode("check"); renderLevels(); });

  addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && key === "z") { e.preventDefault(); (e.shiftKey ? $<HTMLButtonElement>("[data-redo]") : $<HTMLButtonElement>("[data-undo]")).click(); return; }
    const map: Record<string, Tool> = { b: "brush", f: "fill", l: "line", r: "rect", i: "dropper", t: "text" };
    if (map[key]) { tool = map[key]; refreshToolbar(); }
    if (/^[1-8]$/.test(key)) { color = Number(key) - 1; refreshToolbar(); }
  });

  async function openHash(): Promise<void> {
    const m = location.hash.match(/#t=([^&]+)/);
    if (!m) return;
    design = await decodeDesign(m[1]);
    $<HTMLInputElement>("[data-title]").value = design.title;
    await openShow(design);
  }

  if (qaMode) {
    (window as unknown as { __tifo: unknown }).__tifo = {
      state: () => ({ mode: root.dataset.mode, design: design.frames.map((f) => [...f]), frameIndex, check: check ? { level: check.level.id, errors: check.errors, wrongTaps: check.wrongTaps } : null }),
      loadGallery: (id: string) => { const item = GALLERY.find((g) => g.id === id) ?? GALLERY[0]; design = cloneDesign(item, "qa-gallery"); frameIndex = 0; drawGrid(); },
      loadDesign: (frames: number[][], wave: WaveMode = "left") => { design = { id: "qa", title: "QA", frames: frames.map((f) => Uint8Array.from(f)), wave }; frameIndex = 0; drawGrid(); },
      paint: (index: number, c: number) => { design.frames[frameIndex][index] = c; drawGrid(); },
      showFast: () => openShow(design, true),
      openLevel: (id: string) => startCheck(id),
      errors: () => check?.errors ?? [],
      cardPoint: (index: number) => renderer?.screenOf(index) ?? null,
      rayFirst: (index: number) => renderer?.rayFirst(index) ?? false,
      tap: (index: number) => { if (check) { tapCard(check, index, checkFrame); renderer?.setFrame(check.shown[checkFrame]); updateCheckHud(); } },
      skipTimers: () => { skipTimers = true; },
      share: () => encodeDesign(design),
    };
    console.info(t.qaReady);
  }

  for (const [i, p] of PALETTE.entries()) {
    const b = document.createElement("button");
    b.type = "button"; b.dataset.palette = String(i); b.style.background = p.hex; b.title = p.name;
    $("[data-palette-row]").appendChild(b);
  }
  $<HTMLSelectElement>("[data-wave]").value = design.wave;
  $<HTMLInputElement>("[data-title]").value = design.title;
  renderSaves();
  refreshToolbar();
  drawGrid();
  void openHash();
  if (!location.hash) setMode("menu");
}
