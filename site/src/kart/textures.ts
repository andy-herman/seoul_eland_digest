// Mascot Kart canvas textures: road surfaces, curbs, verges, walls, ad boards, start line, boost
// pads and item boxes are drawn in code, so a track costs no texture downloads.
import * as THREE from "three";

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toTexture(c: HTMLCanvasElement, repeat = true, aniso = 8): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, colors: string[], count: number, size: [number, number], seed: number): void {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = size[0] + r() * (size[1] - size[0]);
    g.globalAlpha = 0.35 + r() * 0.5;
    g.fillRect(r() * w, r() * h, s, s);
  }
  g.globalAlpha = 1;
}

export type RoadKind = "asphalt" | "brick" | "wood" | "dirt" | "concrete";

// Road: u runs across the road (0 left edge .. 1 right edge), v along it (one tile = 10 m).
export function roadTexture(kind: RoadKind, edge: string): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  if (kind === "asphalt" || kind === "concrete") {
    g.fillStyle = kind === "asphalt" ? "#5b606c" : "#9aa0a8";
    g.fillRect(0, 0, 256, 256);
    speckle(g, 256, 256, kind === "asphalt" ? ["#4a4e58", "#6c717d", "#555a66"] : ["#8a9098", "#a8aeb6"], 2600, [1, 3], 11);
    g.fillStyle = "rgba(255,255,255,.08)";
    for (let y = 0; y < 256; y += 64) g.fillRect(0, y, 256, 2);
    g.fillStyle = "rgba(255,255,255,.85)";
    for (let y = 0; y < 256; y += 128) g.fillRect(125, y, 6, 64);
  } else if (kind === "brick") {
    g.fillStyle = "#b9a58a";
    g.fillRect(0, 0, 256, 256);
    const r = rng(5);
    for (let row = 0; row < 16; row++) {
      for (let col = -1; col < 8; col++) {
        const x = col * 32 + (row % 2 ? 16 : 0);
        const shade = 0.86 + r() * 0.2;
        g.fillStyle = `rgb(${Math.round(196 * shade)},${Math.round(176 * shade)},${Math.round(146 * shade)})`;
        g.fillRect(x + 2, row * 16 + 2, 28, 12);
      }
    }
  } else if (kind === "wood") {
    g.fillStyle = "#8a5a33";
    g.fillRect(0, 0, 256, 256);
    const r = rng(9);
    for (let y = 0; y < 256; y += 16) {
      const shade = 0.85 + r() * 0.25;
      g.fillStyle = `rgb(${Math.round(160 * shade)},${Math.round(104 * shade)},${Math.round(60 * shade)})`;
      g.fillRect(0, y + 1, 256, 14);
      g.fillStyle = "rgba(60,30,10,.35)";
      g.fillRect(r() * 200, y + 5, 40, 2);
    }
  } else {
    g.fillStyle = "#a07850";
    g.fillRect(0, 0, 256, 256);
    speckle(g, 256, 256, ["#8a6440", "#b88c60", "#704c30"], 3000, [1, 4], 21);
  }
  // coloured edge lines
  g.fillStyle = edge;
  g.fillRect(0, 0, 10, 256);
  g.fillRect(246, 0, 10, 256);
  g.fillStyle = "rgba(255,255,255,.9)";
  g.fillRect(10, 0, 4, 256);
  g.fillRect(242, 0, 4, 256);
  return toTexture(c);
}

// Curb: stripes along v, one tile = 4 m.
export function curbTexture(a: string, b: string): THREE.CanvasTexture {
  const [c, g] = canvas(32, 128);
  g.fillStyle = a;
  g.fillRect(0, 0, 32, 64);
  g.fillStyle = b;
  g.fillRect(0, 64, 32, 64);
  g.fillStyle = "rgba(0,0,0,.18)";
  g.fillRect(0, 0, 3, 128);
  return toTexture(c);
}

export type VergeKind = "grass" | "sand" | "dirt" | "pink" | "concrete" | "autumn";

export function vergeTexture(kind: VergeKind): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const base: Record<VergeKind, [string, string[]]> = {
    grass: ["#5fb052", ["#4f9a44", "#71c060", "#58a84a", "#86cf6c"]],
    sand: ["#e8d29a", ["#d8bf84", "#f2e0ac", "#cdb27a"]],
    dirt: ["#9a7650", ["#86623e", "#b08a60"]],
    pink: ["#7cc06a", ["#f7c4d6", "#f9d9e4", "#68ad58", "#ef9fbd"]],
    concrete: ["#a4a9b0", ["#949aa2", "#b4b9c0"]],
    autumn: ["#9fb055", ["#c9a040", "#8a9a48", "#d78a3a", "#b8b060"]],
  };
  const [fill, dots] = base[kind];
  g.fillStyle = fill;
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, dots, 3200, [2, 5], kind.length * 7);
  return toTexture(c);
}

export function groundTexture(kind: VergeKind | "water"): THREE.CanvasTexture {
  if (kind !== "water") return vergeTexture(kind);
  const [c, g] = canvas(256, 256);
  g.fillStyle = "#2f7fb8";
  g.fillRect(0, 0, 256, 256);
  const r = rng(3);
  g.strokeStyle = "rgba(255,255,255,.28)";
  g.lineWidth = 2;
  for (let i = 0; i < 60; i++) {
    const x = r() * 256;
    const y = r() * 256;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 8, y - 4, x + 16, y);
    g.stroke();
  }
  return toTexture(c);
}

export type WallKind = "tires" | "boards" | "rail" | "stone" | "fence" | "hedge" | "wood";

// Walls: u along the wall (one tile = 8 m), v up (0 bottom .. 1 top).
export function wallTexture(kind: WallKind, colors: [string, string][], texts: string[]): THREE.CanvasTexture {
  const [c, g] = canvas(512, 64);
  if (kind === "tires") {
    g.fillStyle = "#23262d";
    g.fillRect(0, 0, 512, 64);
    for (let x = 0; x < 512; x += 32) {
      for (let row = 0; row < 2; row++) {
        g.fillStyle = "#101216";
        g.beginPath();
        g.arc(x + 16 + (row ? 16 : 0), 16 + row * 32, 15, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = (x / 32 + row) % 2 ? "#e53935" : "#f5f5f5";
        g.lineWidth = 4;
        g.stroke();
      }
    }
  } else if (kind === "boards") {
    const n = 4;
    for (let i = 0; i < n; i++) {
      const [bg, fg] = colors[i % colors.length];
      g.fillStyle = bg;
      g.fillRect(i * 128, 0, 128, 64);
      g.fillStyle = fg;
      g.font = "900 22px system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(texts[i % texts.length] ?? "", i * 128 + 64, 33, 118);
      g.fillStyle = "rgba(0,0,0,.35)";
      g.fillRect(i * 128, 0, 3, 64);
    }
  } else if (kind === "rail") {
    g.fillStyle = "rgba(0,0,0,0)";
    g.clearRect(0, 0, 512, 64);
    g.fillStyle = "#c9ced6";
    g.fillRect(0, 10, 512, 16);
    g.fillRect(0, 34, 512, 10);
    g.fillStyle = "#7c828c";
    for (let x = 0; x < 512; x += 64) g.fillRect(x + 28, 0, 8, 64);
    g.fillStyle = "#eef1f5";
    g.fillRect(0, 12, 512, 3);
  } else if (kind === "stone") {
    g.fillStyle = "#8f8578";
    g.fillRect(0, 0, 512, 64);
    const r = rng(4);
    for (let row = 0; row < 4; row++) {
      for (let x = row % 2 ? -24 : 0; x < 512; x += 48) {
        const s = 0.85 + r() * 0.25;
        g.fillStyle = `rgb(${Math.round(178 * s)},${Math.round(166 * s)},${Math.round(148 * s)})`;
        g.fillRect(x + 2, row * 16 + 2, 44, 12);
      }
    }
  } else if (kind === "fence") {
    g.clearRect(0, 0, 512, 64);
    g.strokeStyle = "rgba(210,215,222,.9)";
    g.lineWidth = 2;
    for (let x = -64; x < 576; x += 12) {
      g.beginPath();
      g.moveTo(x, 64);
      g.lineTo(x + 40, 0);
      g.stroke();
      g.beginPath();
      g.moveTo(x + 40, 64);
      g.lineTo(x, 0);
      g.stroke();
    }
    g.fillStyle = "#6f7680";
    for (let x = 0; x < 512; x += 128) g.fillRect(x, 0, 6, 64);
    g.fillRect(0, 0, 512, 4);
  } else if (kind === "hedge") {
    g.fillStyle = "#3f8a3a";
    g.fillRect(0, 0, 512, 64);
    speckle(g, 512, 64, ["#2f7430", "#56a64a", "#6fbf5c"], 1800, [3, 7], 8);
  } else {
    g.fillStyle = "#9a6a3c";
    g.fillRect(0, 0, 512, 64);
    g.fillStyle = "#7a4e28";
    for (let x = 0; x < 512; x += 32) g.fillRect(x, 0, 4, 64);
    g.fillRect(0, 20, 512, 5);
    g.fillRect(0, 44, 512, 5);
  }
  return toTexture(c);
}

export function checkerTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y) % 2 ? "#111" : "#fff";
      g.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  const t = toTexture(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

export function padTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 128);
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "#ffb300");
  grad.addColorStop(1, "#ff5a00");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = "#fff6c2";
  for (let y = 0; y < 128; y += 64) {
    g.beginPath();
    g.moveTo(8, y + 44);
    g.lineTo(32, y + 16);
    g.lineTo(56, y + 44);
    g.lineTo(56, y + 58);
    g.lineTo(32, y + 30);
    g.lineTo(8, y + 58);
    g.closePath();
    g.fill();
  }
  return toTexture(c);
}

export function itemBoxTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const grad = g.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, "#ffe066");
  grad.addColorStop(0.5, "#ff7ab6");
  grad.addColorStop(1, "#5ad1ff");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "#ffffff";
  g.lineWidth = 8;
  g.strokeRect(6, 6, 116, 116);
  g.fillStyle = "#ffffff";
  g.strokeStyle = "#1b2446";
  g.lineWidth = 6;
  g.font = "900 88px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.strokeText("?", 64, 70);
  g.fillText("?", 64, 70);
  return toTexture(c, false);
}

// Soft round shadow for karts and props.
export function shadowTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 31);
  grad.addColorStop(0, "rgba(0,0,0,.55)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return toTexture(c, false);
}

// Vertical sky gradient for a big dome.
export function skyTexture(top: string, horizon: string, bottom: string): THREE.CanvasTexture {
  const [c, g] = canvas(4, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(0.5, horizon);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  return toTexture(c, false, 1);
}

export function flameTexture(blue = false): THREE.CanvasTexture {
  const [c, g] = canvas(64, 128);
  const grad = g.createRadialGradient(32, 96, 2, 32, 80, 60);
  grad.addColorStop(0, blue ? "rgba(235,250,255,1)" : "rgba(255,255,230,1)");
  grad.addColorStop(0.3, blue ? "rgba(90,200,255,.95)" : "rgba(255,200,60,.95)");
  grad.addColorStop(0.65, blue ? "rgba(40,110,255,.7)" : "rgba(255,90,20,.7)");
  grad.addColorStop(1, blue ? "rgba(20,60,255,0)" : "rgba(255,40,0,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(32, 72, 26, 56, 0, 0, Math.PI * 2);
  g.fill();
  return toTexture(c, false);
}

export function sparkTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(32, 32);
  const grad = g.createRadialGradient(16, 16, 1, 16, 16, 15);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,230,120,.9)");
  grad.addColorStop(1, "rgba(255,160,40,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return toTexture(c, false);
}

// Distant skyline for a ring around the track: mountains, city blocks (lit at night), optional towers.
export function skylineTexture(opts: { night?: boolean; mountains: string; city: string; windows: string; density: number; seed: number; towers?: ("nseoul" | "lotte" | "63")[]; sea?: boolean }): THREE.CanvasTexture {
  const W = 2048;
  const H = 256;
  const [c, g] = canvas(W, H);
  const r = rng(opts.seed);
  g.clearRect(0, 0, W, H);
  // mountains
  g.fillStyle = opts.mountains;
  g.beginPath();
  g.moveTo(0, H);
  for (let x = 0; x <= W; x += 16) {
    const y = H * 0.52 - Math.sin(x / 190 + opts.seed) * 30 - Math.sin(x / 67 + opts.seed * 2) * 14 - Math.sin(x / 31) * 5;
    g.lineTo(x, y);
  }
  g.lineTo(W, H);
  g.closePath();
  g.fill();
  if (opts.sea) {
    g.fillStyle = opts.night ? "#162a55" : "#4aa3df";
    g.fillRect(0, H * 0.82, W, H * 0.18);
  }
  // city blocks
  let x = 0;
  while (x < W) {
    const w = 18 + r() * 46;
    const h = (20 + r() * 90) * opts.density;
    if (r() < 0.85) {
      g.fillStyle = opts.city;
      g.fillRect(x, H * 0.86 - h, w, h + H * 0.2);
      g.fillStyle = opts.windows;
      for (let yy = H * 0.86 - h + 6; yy < H * 0.84; yy += 9) {
        for (let xx = x + 4; xx < x + w - 5; xx += 8) if (r() < (opts.night ? 0.55 : 0.35)) g.fillRect(xx, yy, 4, 4);
      }
    }
    x += w + r() * 10;
  }
  const tower = (kind: string, tx: number) => {
    g.fillStyle = opts.city;
    if (kind === "nseoul") {
      g.fillRect(tx - 5, H * 0.24, 10, H * 0.4);
      g.fillRect(tx - 16, H * 0.3, 32, 10);
      g.fillRect(tx - 2, H * 0.08, 4, H * 0.18);
      g.fillStyle = opts.night ? "#60a5fa" : opts.windows;
      g.fillRect(tx - 14, H * 0.305, 28, 4);
    } else if (kind === "lotte") {
      g.beginPath();
      g.moveTo(tx - 16, H * 0.88);
      g.lineTo(tx - 3, H * 0.06);
      g.lineTo(tx + 3, H * 0.06);
      g.lineTo(tx + 16, H * 0.88);
      g.fill();
    } else {
      g.fillStyle = opts.night ? "#fbbf24" : "#e3b448";
      g.beginPath();
      g.moveTo(tx - 18, H * 0.88);
      g.quadraticCurveTo(tx - 16, H * 0.3, tx - 6, H * 0.2);
      g.lineTo(tx + 12, H * 0.22);
      g.lineTo(tx + 16, H * 0.88);
      g.fill();
    }
  };
  (opts.towers ?? []).forEach((k, i) => tower(k, W * (0.18 + i * 0.3)));
  const t = toTexture(c, true, 4);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
