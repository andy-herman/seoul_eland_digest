import { PAWS, PAW_TOTAL, CHAPTERS, localizedTarget } from "./hunt";
import { PAW_STRINGS } from "./strings";
import { withBase } from "../lib/paths";

const KEY = "paw-hunt-v1";
type Locale = "en" | "pt";

type Store = { started?: boolean; found: string[] };

function read(): Store {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { started: !!parsed.started, found: Array.isArray(parsed.found) ? parsed.found : [] };
  } catch {
    return { found: [] };
  }
}

function write(store: Store) {
  localStorage.setItem(KEY, JSON.stringify({ started: true, found: [...new Set(store.found)] }));
  window.dispatchEvent(new CustomEvent("paw-hunt:update"));
}

function chapterUnlocked(chapter: number, found: Set<string>) {
  if (chapter === 1) return true;
  return PAWS.filter((paw) => paw.chapter === chapter - 1).every((paw) => found.has(paw.id));
}

function drawCertificate(locale: Locale) {
  const canvas = document.querySelector<HTMLCanvasElement>("#paw-certificate");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const t = PAW_STRINGS[locale];
  const name = (document.querySelector<HTMLInputElement>("#paw-name")?.value || "Lenyang's friend").trim();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#07152f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, "#0f3d91");
  grad.addColorStop(1, "#06152d");
  ctx.fillStyle = grad;
  ctx.fillRect(24, 24, canvas.width - 48, canvas.height - 48);
  ctx.strokeStyle = "#f3c94f";
  ctx.lineWidth = 10;
  ctx.strokeRect(42, 42, canvas.width - 84, canvas.height - 84);
  ctx.fillStyle = "rgba(255,255,255,.08)";
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    ctx.arc(90 + i * 75, 500 + Math.sin(i) * 38, 22, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#f3c94f";
  ctx.font = "bold 54px Arial Rounded MT Bold, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(t.certificateTitle, canvas.width / 2, 130);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 34px Arial, sans-serif";
  ctx.fillText(name, canvas.width / 2, 220);
  ctx.font = "24px Arial, sans-serif";
  ctx.fillText(t.certificateSubtitle, canvas.width / 2, 265);
  ctx.fillStyle = "#f3c94f";
  ctx.font = "bold 30px Arial, sans-serif";
  ctx.fillText(t.certificateCount, canvas.width / 2, 330);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(510, 412, 60, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 20;
  ctx.beginPath();
  ctx.moveTo(555, 458);
  ctx.lineTo(635, 538);
  ctx.stroke();
  ctx.fillStyle = "#f3c94f";
  ctx.font = "bold 22px Arial, sans-serif";
  ctx.fillText(`${t.certificateDate}: ${new Date().toLocaleDateString(locale === "pt" ? "pt-BR" : "en-US")}`, canvas.width / 2, 570);
  const img = new Image();
  img.onload = () => ctx.drawImage(img, 95, 285, 230, 230);
  img.src = withBase("/play/lenyang-starry.webp");
}

function update() {
  const locale = document.documentElement.lang.startsWith("pt") ? "pt" : "en";
  const t = PAW_STRINGS[locale];
  const store = read();
  const found = new Set(store.found);
  const count = found.size;
  document.querySelectorAll<HTMLElement>("[data-paw-count]").forEach((el) => (el.textContent = String(count)));
  const bar = document.querySelector<HTMLElement>("[data-paw-progress]");
  if (bar) bar.style.width = `${(count / PAW_TOTAL) * 100}%`;

  CHAPTERS.forEach((chapter) => {
    const section = document.querySelector<HTMLElement>(`[data-chapter='${chapter.number}']`);
    if (!section) return;
    const unlocked = chapterUnlocked(chapter.number, found);
    section.toggleAttribute("data-locked", !unlocked);
    section.querySelectorAll<HTMLAnchorElement>("[data-paw-link]").forEach((link) => {
      const id = link.closest<HTMLElement>("[data-paw-card]")?.dataset.pawCard || "";
      const paw = PAWS.find((item) => item.id === id);
      const isFound = found.has(id);
      if (paw) link.href = withBase(localizedTarget(paw, locale));
      link.toggleAttribute("hidden", !isFound || !unlocked);
    });
  });

  document.querySelectorAll<HTMLElement>("[data-paw-card]").forEach((card) => {
    const id = card.dataset.pawCard || "";
    const isFound = found.has(id);
    card.toggleAttribute("data-found", isFound);
    const status = card.querySelector<HTMLElement>("[data-status]");
    if (status) status.textContent = isFound ? t.found : t.notFound;
  });

  const reward = document.querySelector<HTMLElement>("[data-reward]");
  if (reward) reward.toggleAttribute("data-unlocked", count === PAW_TOTAL);
  if (count === PAW_TOTAL) drawCertificate(locale);
}

function setup() {
  const locale = document.documentElement.lang.startsWith("pt") ? "pt" : "en";
  document.querySelectorAll<HTMLButtonElement>("[data-hint-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest<HTMLElement>("[data-paw-card]");
      const hint = card?.querySelector<HTMLElement>("[data-hint]");
      if (!hint) return;
      const show = hint.hasAttribute("hidden");
      hint.toggleAttribute("hidden", !show);
      button.textContent = show ? PAW_STRINGS[locale].hideHint : PAW_STRINGS[locale].showHint;
    });
  });

  let armed = false;
  document.querySelector<HTMLButtonElement>("[data-reset]")?.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    if (!armed) {
      armed = true;
      button.textContent = PAW_STRINGS[locale].confirmReset;
      window.setTimeout(() => {
        armed = false;
        button.textContent = PAW_STRINGS[locale].reset;
      }, 3500);
      return;
    }
    localStorage.removeItem(KEY);
    armed = false;
    button.textContent = PAW_STRINGS[locale].reset;
    update();
  });

  document.querySelector<HTMLInputElement>("#paw-name")?.addEventListener("input", () => drawCertificate(locale));
  document.querySelector<HTMLButtonElement>("[data-draw]")?.addEventListener("click", () => drawCertificate(locale));
  document.querySelector<HTMLButtonElement>("[data-download]")?.addEventListener("click", () => {
    const canvas = document.querySelector<HTMLCanvasElement>("#paw-certificate");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "detective-lenyang.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  });
  document.querySelector<HTMLButtonElement>("[data-share]")?.addEventListener("click", async () => {
    const canvas = document.querySelector<HTMLCanvasElement>("#paw-certificate");
    if (!canvas || !("share" in navigator)) return;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    const file = new File([blob], "detective-lenyang.png", { type: "image/png" });
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (!nav.canShare || nav.canShare({ files: [file] })) await navigator.share({ title: PAW_STRINGS[locale].certificateTitle, files: [file] });
  });

  if (new URLSearchParams(location.search).has("qa")) {
    (window as any).__paw = {
      reset() { localStorage.removeItem(KEY); update(); },
      collect(id: string) { const s = read(); if (!s.found.includes(id)) s.found.push(id); write(s); update(); },
      collectAll() { write({ started: true, found: PAWS.map((paw) => paw.id) }); update(); },
      list() { return { store: read(), paws: PAWS }; },
    };
  }

  window.addEventListener("paw-hunt:update", update);
  update();
}

setup();
