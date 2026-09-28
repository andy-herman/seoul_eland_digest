export const TIFO_COLS = 48;
export const TIFO_ROWS = 20;
export const TIFO_CELLS = TIFO_COLS * TIFO_ROWS;
export const TIFO_MAX_FRAMES = 4;
export const SAVE_KEY = "tifo-master-v1";
export const PROGRESS_KEY = "tifo-card-check-v1";

export type Locale = "en" | "pt";
export type WaveMode = "left" | "center" | "bottom";
export type Tool = "brush" | "fill" | "line" | "rect" | "text" | "dropper";

export interface PaletteColor {
  id: string;
  name: string;
  hex: string;
}

export const PALETTE: PaletteColor[] = [
  { id: "navy", name: "Navy", hex: "#1b2446" },
  { id: "gold", name: "Gold", hex: "#ffc23a" },
  { id: "white", name: "White", hex: "#ffffff" },
  { id: "sky", name: "Sky", hex: "#58c6ff" },
  { id: "red", name: "Red", hex: "#e63946" },
  { id: "black", name: "Black", hex: "#151515" },
  { id: "green", name: "Green", hex: "#2a7f45" },
  { id: "orange", name: "Orange", hex: "#ff8a3d" },
] as const;

export interface SeatCell {
  index: number;
  col: number;
  row: number;
  usable: boolean;
  reason: "seat" | "aisle" | "pillar";
}

function unavailableReason(col: number, row: number): "seat" | "aisle" | "pillar" {
  if (col === 11 || col === 23 || col === 35) return "aisle";
  const p1 = col >= 15 && col <= 16 && row >= 13;
  const p2 = col >= 31 && col <= 32 && row >= 13;
  return p1 || p2 ? "pillar" : "seat";
}

export const SEAT_MAP: SeatCell[] = Array.from({ length: TIFO_CELLS }, (_, index) => {
  const col = index % TIFO_COLS;
  const row = Math.floor(index / TIFO_COLS);
  const reason = unavailableReason(col, row);
  return { index, col, row, usable: reason === "seat", reason };
});

export const USABLE = SEAT_MAP.filter((c) => c.usable).map((c) => c.index);
export const USABLE_SET = new Set(USABLE);

export interface TifoDesign {
  id: string;
  title: string;
  frames: Uint8Array[];
  wave: WaveMode;
  createdAt?: number;
}

export function blankFrame(fill = 0): Uint8Array {
  const f = new Uint8Array(TIFO_CELLS);
  f.fill(fill);
  for (const c of SEAT_MAP) if (!c.usable) f[c.index] = 0;
  return f;
}

export function cloneDesign(d: TifoDesign, id = d.id): TifoDesign {
  return { ...d, id, frames: d.frames.map((f) => new Uint8Array(f)), createdAt: Date.now() };
}

export function setCell(frame: Uint8Array, col: number, row: number, color: number): void {
  if (col < 0 || col >= TIFO_COLS || row < 0 || row >= TIFO_ROWS) return;
  const idx = row * TIFO_COLS + col;
  if (USABLE_SET.has(idx)) frame[idx] = color & 7;
}

function drawRect(frame: Uint8Array, x0: number, y0: number, x1: number, y1: number, color: number, fill = true): void {
  const xa = Math.max(0, Math.min(x0, x1));
  const xb = Math.min(TIFO_COLS - 1, Math.max(x0, x1));
  const ya = Math.max(0, Math.min(y0, y1));
  const yb = Math.min(TIFO_ROWS - 1, Math.max(y0, y1));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      if (fill || y === ya || y === yb || x === xa || x === xb) setCell(frame, x, y, color);
    }
  }
}

function drawText(frame: Uint8Array, text: string, x: number, y: number, color: number, size = 18): void {
  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  if (!canvas) return;
  canvas.width = TIFO_COLS;
  canvas.height = TIFO_ROWS;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.font = `900 ${size}px Arial Rounded MT Bold, Arial, Apple SD Gothic Neo, sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText(text, x, y);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let yy = 0; yy < TIFO_ROWS; yy++) for (let xx = 0; xx < TIFO_COLS; xx++) if (data[(yy * TIFO_COLS + xx) * 4] > 80) setCell(frame, xx, yy, color);
}

export function makeTextFrame(text: string, color = 1): Uint8Array {
  const f = blankFrame(0);
  const t = text.toUpperCase();
  if (t === "서울") {
    drawRect(f, 5, 4, 18, 7, color); drawRect(f, 5, 8, 8, 15, color); drawRect(f, 15, 8, 18, 15, color); drawRect(f, 7, 15, 18, 17, color);
    drawRect(f, 27, 3, 40, 6, color); drawRect(f, 31, 6, 35, 12, color); drawRect(f, 25, 13, 42, 16, color);
    return f;
  }
  if (t === "E-LAND") {
    drawRect(f, 2, 3, 8, 16, color); drawRect(f, 8, 3, 14, 5, color); drawRect(f, 8, 9, 13, 11, color); drawRect(f, 8, 14, 14, 16, color);
    drawRect(f, 16, 10, 21, 12, color);
    drawRect(f, 23, 3, 28, 16, color); drawRect(f, 28, 14, 33, 16, color);
    drawRect(f, 35, 14, 44, 16, color); drawRect(f, 38, 3, 41, 16, color); drawRect(f, 35, 3, 44, 5, color);
    return f;
  }
  if (t === "12") {
    drawRect(f, 12, 4, 17, 6, color); drawRect(f, 16, 4, 19, 16, color); drawRect(f, 11, 14, 21, 17, color);
    drawRect(f, 27, 4, 37, 6, color); drawRect(f, 34, 7, 37, 10, color); drawRect(f, 28, 10, 37, 12, color); drawRect(f, 27, 12, 30, 15, color); drawRect(f, 27, 15, 38, 17, color);
    return f;
  }
  drawText(f, text, 3, 1, color, text.length <= 3 ? 18 : 14);
  return f;
}

function makeIcon(kind: string): Uint8Array {
  const f = blankFrame(0);
  if (kind === "crown") {
    drawRect(f, 10, 12, 37, 15, 1);
    for (let i = 0; i < 5; i++) drawRect(f, 11 + i * 6, 6 + (i % 2), 15 + i * 6, 12, 1);
    drawRect(f, 12, 16, 35, 17, 2);
  } else if (kind === "paw") {
    for (const [cx, cy, r] of [[18, 7, 3], [24, 5, 3], [30, 7, 3], [20, 13, 5], [28, 13, 5]]) drawRect(f, cx - r, cy - r, cx + r, cy + r, 1, true);
    drawRect(f, 19, 11, 29, 18, 1);
  } else if (kind === "star") {
    for (let y = 3; y < 17; y++) {
      const w = y < 8 ? y - 2 : y < 12 ? 8 : 18 - y;
      drawRect(f, 24 - w, y, 24 + w, y, 2);
    }
    drawRect(f, 8, 8, 40, 10, 2);
  } else if (kind === "heart") {
    for (let y = 4; y < 18; y++) {
      const w = y < 9 ? y * 2 - 3 : 29 - y;
      drawRect(f, 24 - w, y, 24 + w, y, 4);
    }
    drawText(f, "서울", 16, 7, 2, 9);
  }
  return f;
}

export const GALLERY: TifoDesign[] = [
  { id: "seoul", title: "서울", frames: [makeTextFrame("서울", 1)], wave: "center" },
  { id: "eland", title: "E-LAND", frames: [makeTextFrame("E-LAND", 2)], wave: "left" },
  { id: "crown", title: "Gold crown", frames: [makeIcon("crown")], wave: "bottom" },
  { id: "paw", title: "Lenyang paw", frames: [makeIcon("paw")], wave: "center" },
  { id: "twelve", title: "12th player", frames: [makeTextFrame("12", 1)], wave: "bottom" },
  { id: "star", title: "Star night", frames: [makeIcon("star")], wave: "center" },
  { id: "heart", title: "Heart Seoul", frames: [makeIcon("heart")], wave: "left" },
  {
    id: "clap",
    title: "짝짝 짝짝짝",
    frames: [(() => { const f = blankFrame(0); for (let x = 0; x < TIFO_COLS; x += 4) drawRect(f, x, 0, x + 1, TIFO_ROWS - 1, 1); return f; })(), (() => { const f = blankFrame(0); for (let x = 2; x < TIFO_COLS; x += 4) drawRect(f, x, 0, x + 1, TIFO_ROWS - 1, 2); return f; })()],
    wave: "left",
  },
];

export interface CardCheckLevel {
  id: string;
  chapter: 1 | 2 | 3;
  title: string;
  design: string;
  cols: number;
  rows: number;
  errors: number;
  seconds: number;
  target: number;
  seed: number;
  subtle?: boolean;
  wave?: boolean;
  sway?: boolean;
  twoFrame?: boolean;
}

export const CARD_LEVELS: CardCheckLevel[] = Array.from({ length: 12 }, (_, i) => {
  const chapter = (i < 4 ? 1 : i < 8 ? 2 : 3) as 1 | 2 | 3;
  const dims = [
    [16, 8], [20, 10], [24, 12], [28, 12],
    [32, 14], [36, 15], [40, 16], [44, 18],
    [46, 18], [48, 20], [48, 20], [48, 20],
  ][i];
  return {
    id: `l${i + 1}`,
    chapter,
    title: `Card Check ${i + 1}`,
    design: GALLERY[i % GALLERY.length].id,
    cols: dims[0],
    rows: dims[1],
    errors: 3 + Math.floor(i * 0.8),
    seconds: Math.max(22, 45 - i * 2),
    target: Math.max(10, 24 - i),
    seed: 6200 + i * 97,
    subtle: i >= 5,
    wave: i >= 6,
    sway: i >= 7,
    twoFrame: i >= 8,
  };
});

export const TIFO_STRINGS = {
  en: {
    pageTitle: "Tifo Master | Seoul E-Land Digest",
    pageDescription: "Design Seoul E-Land card stunts, watch them rise in 3D at Mokdong, and solve Card Check puzzles.",
    eyebrow: "Supporters' end lab",
    heading: "Tifo Master",
    ko: "카드섹션 마스터",
    intro: "Design a card stunt for the Mokdong north stand, count it in with Leoul, and watch every fan flip on the beat.",
    history: "Korean card stunts became famous worldwide at the 2002 World Cup, when whole stands became giant pictures.",
    translateLabel: "Português",
    translateAria: "Abrir a versão em português",
    howTitle: "How to play",
    how: ["Paint the seat grid with eight card colours.", "Use text, mirror, fill and imported images to make a readable stand design.", "Open Card Check and tap the fans holding the wrong card before kick-off."],
    credits: "Leoul, Lenyang and the song 서울의 노래 (2024 ver) belong to Seoul E-Land FC and are used with permission.",
    designer: "Designer",
    check: "Card Check",
    gallery: "Gallery",
    make: "Make your own",
    edit: "Edit a copy",
    show: "Show it",
    share: "Share this tifo",
    download: "Download picture",
    mute: "Sound",
    brush: "Brush",
    fill: "Fill",
    line: "Line",
    rect: "Rect",
    text: "Text",
    dropper: "Eye",
    mirror: "Mirror",
    dither: "Dither",
    import: "Image",
    undo: "Undo",
    redo: "Redo",
    clear: "Clear",
    addFrame: "Add frame",
    dupFrame: "Duplicate",
    delFrame: "Delete",
    save: "Save",
    saved: "Saved",
    wave: "Wave",
    menu: "Menu",
    count: ["하나", "둘", "셋"],
    wrong: "wrong cards",
    fixed: "fixed",
    stars: "stars",
    time: "time",
    noMistakes: "no wrong taps",
    fast: "under target",
    qaReady: "Tifo QA ready",
  },
  pt: {
    pageTitle: "Tifo Master | Seoul E-Land Digest",
    pageDescription: "Crie mosaicos da torcida do Seoul E-Land, veja no Mokdong em 3D e resolva desafios Card Check.",
    eyebrow: "Laboratório da arquibancada",
    heading: "Tifo Master",
    ko: "카드섹션 마스터",
    intro: "Crie um mosaico de cartões para a norte do Mokdong, conte com o Leoul e veja a torcida levantar no ritmo.",
    history: "As card stunts coreanas ficaram famosas mundialmente na Copa de 2002, quando arquibancadas inteiras viraram imagens gigantes.",
    translateLabel: "English",
    translateAria: "Open the English version",
    howTitle: "Como jogar",
    how: ["Pinte a grade de assentos com oito cores de cartão.", "Use texto, espelho, preenchimento e imagens importadas para criar um desenho legível.", "No Card Check, toque nos torcedores com o cartão errado antes do apito inicial."],
    credits: "Leoul, Lenyang e a música 서울의 노래 (2024 ver) pertencem ao Seoul E-Land FC e são usados com permissão.",
    designer: "Designer",
    check: "Card Check",
    gallery: "Galeria",
    make: "Criar o seu",
    edit: "Editar cópia",
    show: "Mostrar",
    share: "Compartilhar tifo",
    download: "Baixar imagem",
    mute: "Som",
    brush: "Pincel",
    fill: "Preencher",
    line: "Linha",
    rect: "Retângulo",
    text: "Texto",
    dropper: "Conta-gotas",
    mirror: "Espelho",
    dither: "Dither",
    import: "Imagem",
    undo: "Desfazer",
    redo: "Refazer",
    clear: "Limpar",
    addFrame: "Adicionar quadro",
    dupFrame: "Duplicar",
    delFrame: "Excluir",
    save: "Salvar",
    saved: "Salvo",
    wave: "Onda",
    menu: "Menu",
    count: ["하나", "둘", "셋"],
    wrong: "cartões errados",
    fixed: "corrigidos",
    stars: "estrelas",
    time: "tempo",
    noMistakes: "sem toques errados",
    fast: "abaixo da meta",
    qaReady: "Tifo QA pronto",
  },
} as const;
