import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { withBase } from "./paths";

type PreviewLocale = "en" | "pt";

export interface PreMatchPreview {
  slug: string;
  fileName: string;
  locale: PreviewLocale;
  title: string;
  description: string;
  body: string;
  data: Record<string, string>;
  forecast?: ForecastRead;
  predictedLineup?: PredictedLineup;
}

export interface ForecastProbability {
  key: "seoul" | "draw" | "opponent";
  label: string;
  value: number;
}

export interface ForecastRead {
  heading?: string;
  subheading?: string;
  options: ForecastProbability[];
  note?: string;
}

export interface PredictedLineupPlayer {
  name: string;
  role: string;
  line: "attack" | "midfield" | "defense" | "goalkeeper";
}

export interface PredictedLineup {
  label: string;
  statusLabel: string;
  teamName: string;
  formation: string;
  note?: string;
  players: PredictedLineupPlayer[];
}

const DEFAULT_PREVIEW_DIR = path.resolve(process.cwd(), "src", "content", "prematch-previews");
const DEFAULT_PREVIEW_PT_DIR = path.resolve(process.cwd(), "src", "content", "prematch-previews-pt");

function previewDir(locale: PreviewLocale = "en") {
  if (locale === "pt") {
    return String(import.meta.env.PREMATCH_PREVIEW_PT_DIR || process.env.PREMATCH_PREVIEW_PT_DIR || DEFAULT_PREVIEW_PT_DIR);
  }
  return String(import.meta.env.PREMATCH_PREVIEW_DIR || process.env.PREMATCH_PREVIEW_DIR || DEFAULT_PREVIEW_DIR);
}

function slugify(value: string) {
  return value
    .replace(/\.md$/i, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function parseFrontmatter(markdown: string) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const data: Record<string, string> = {};
  if (!match) {
    return { data, body: markdown };
  }

  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) continue;
    const value = pair[2].trim().replace(/^"|"$/g, "");
    data[pair[1]] = value;
  }

  return { data, body: markdown.slice(match[0].length) };
}

function firstHeading(body: string, fallback: string) {
  const heading = body.match(/^#\s+(.+)$/m);
  return heading?.[1]?.trim() || fallback.replace(/_/g, " ").replace(/\.md$/i, "");
}

function cleanPreviewBody(body: string) {
  return body
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return !/^>\s*Private draft/i.test(trimmed) && !/^Generated:/i.test(trimmed);
    })
    .join("\n");
}

function descriptionFromBody(body: string) {
  const paragraph = body
    .replace(/^# .+$/m, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && !line.startsWith(">") && !line.startsWith("|"));
  // The description feeds meta, OG tags and JSON-LD, so strip the markdown
  // rather than shipping link and emphasis syntax into search results.
  const plain = paragraph
    ?.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links keep their text
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2") // aliased wikilinks
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\*\*|\*|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain?.slice(0, 180) || "Pre-match notes, matchup keys, and what to watch before kickoff.";
}

function parseJsonField<T>(data: Record<string, string>, key: string): T | undefined {
  const raw = data[key];
  if (!raw) return undefined;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function normalizedPercent(value: unknown) {
  const number =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").trim().replace(/%$/, ""));

  if (!Number.isFinite(number)) return undefined;
  const percent = number <= 1 ? number * 100 : number;
  return Math.max(0, Math.min(100, percent));
}

function parseForecast(data: Record<string, string>): ForecastRead | undefined {
  const probabilities = parseJsonField<Record<string, unknown>>(data, "forecast_probabilities");
  if (!probabilities) return undefined;

  const labels = parseJsonField<Record<string, string>>(data, "forecast_labels") || {};
  const options = [
    {
      key: "seoul" as const,
      label: labels.seoul_eland_win || "Seoul E-Land win",
      value: normalizedPercent(probabilities.seoul_eland_win),
    },
    {
      key: "draw" as const,
      label: labels.draw || "Draw",
      value: normalizedPercent(probabilities.draw),
    },
    {
      key: "opponent" as const,
      label: labels.opponent_win || `${data.opponent || "Opponent"} win`,
      value: normalizedPercent(probabilities.opponent_win),
    },
  ].filter((option): option is ForecastProbability => typeof option.value === "number");

  if (options.length === 0) return undefined;
  return {
    heading: data.forecast_heading,
    subheading: data.forecast_subheading,
    options,
    note: data.forecast_note,
  };
}

function parsePredictedLineup(data: Record<string, string>): PredictedLineup | undefined {
  const players = parseJsonField<PredictedLineupPlayer[]>(data, "predicted_lineup");
  if (!Array.isArray(players) || players.length === 0) return undefined;

  const allowedLines = new Set(["attack", "midfield", "defense", "goalkeeper"]);
  const cleanPlayers = players
    .map((player) => ({
      name: String(player.name || "").trim(),
      role: String(player.role || "").trim(),
      line: String(player.line || "").trim().toLowerCase(),
    }))
    .filter((player) => player.name && player.role && allowedLines.has(player.line))
    .map((player) => player as PredictedLineupPlayer);

  if (cleanPlayers.length === 0) return undefined;

  return {
    label: data.predicted_lineup_label || "Predicted Seoul XI",
    statusLabel: data.predicted_lineup_status || "Predicted",
    teamName: data.predicted_lineup_team || "Seoul E-Land",
    formation: data.predicted_formation || "Predicted shape",
    note: data.predicted_lineup_note,
    players: cleanPlayers,
  };
}

export function getPreMatchPreviews(locale: PreviewLocale = "en"): PreMatchPreview[] {
  const dir = previewDir(locale);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((fileName) => fileName.endsWith(".md"))
    .sort((a, b) => b.localeCompare(a))
    .map((fileName) => {
      const raw = readFileSync(path.join(dir, fileName), "utf-8");
      const { data, body } = parseFrontmatter(raw);
      const cleanBody = cleanPreviewBody(body);
      const slug = slugify(fileName);
      const title = firstHeading(cleanBody, fileName);
      const forecast = parseForecast(data);
      const predictedLineup = parsePredictedLineup(data);
      return {
        slug,
        fileName,
        locale,
        title,
        description: descriptionFromBody(cleanBody),
        body: cleanBody,
        data,
        forecast,
        predictedLineup,
      };
    });
}

export function getPreMatchPreviewForRound(round: number, locale: PreviewLocale = "en") {
  return getPreMatchPreviews(locale).find((preview) => Number(preview.data.round) === round);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeEscapedUrl(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function safeHttpUrl(value: string) {
  const decoded = decodeEscapedUrl(value);
  if (/[\s"'<>]/.test(decoded)) return undefined;

  try {
    const url = new URL(decoded);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return escapeHtml(url.href);
  } catch {
    return undefined;
  }
}

// Headings that the forecast bar and predicted-XI graphic get injected under.
// The Portuguese previews are authored with "Visão Geral", so leaving this at
// just "panorama" silently dropped both graphics from every PT preview.
const GLANCE_HEADINGS = new Set([
  "at a glance",
  "panorama",
  "visão geral",
  "visao geral",
]);

function inlineMarkdown(value: string) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    (_match, text: string, url: string) => {
      const safeUrl = safeHttpUrl(url);
      return safeUrl ? `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${text}</a>` : text;
    },
  );
  // Site-relative links, e.g. [Tracker](/tracker). Kept separate from the
  // external-link rule above so they stay in-tab and pick up the base path.
  html = html.replace(
    /\[([^\]]+)\]\((\/[A-Za-z0-9\-._~/]*)\)/g,
    (_match, text: string, href: string) => `<a href="${escapeHtml(withBase(href))}">${text}</a>`,
  );
  html = html.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "<span>$2</span>");
  html = html.replace(/\[\[([^\]]+)\]\]/g, "<span>$1</span>");
  return html;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function renderForecastBar(forecast: ForecastRead, locale: PreviewLocale = "en") {
  const total = forecast.options.reduce((sum, option) => sum + option.value, 0) || 100;
  const aria = forecast.options
    .map((option) => `${option.label} ${formatPercent(option.value)}`)
    .join(", ");
  const segments = forecast.options
    .map((option) => {
      const share = (option.value / total) * 100;
      return `<span class="preview-forecast-segment preview-forecast-${option.key}" style="--share: ${share.toFixed(
        2,
      )}%"><strong>${escapeHtml(option.label)}</strong><span>${formatPercent(option.value)}</span></span>`;
    })
    .join("");
  const legend = forecast.options
    .map(
      (option) =>
        `<span class="preview-forecast-legend-item preview-forecast-${option.key}"><span></span>${escapeHtml(
          option.label,
        )}: ${formatPercent(option.value)}</span>`,
    )
    .join("");

  const ariaLabel = locale === "pt" ? "Probabilidades da previsão" : "Forecast probabilities";
  const defaultHeading = locale === "pt" ? "Leitura do modelo" : "Forecast read";
  const defaultSubheading = locale === "pt" ? "Probabilidades de vitória/empate" : "Win/draw probabilities";

  return `<section class="preview-forecast-card" aria-label="${ariaLabel}">
    <div class="preview-forecast-heading">
      <p>${escapeHtml(forecast.heading || defaultHeading)}</p>
      <span>${escapeHtml(forecast.subheading || defaultSubheading)}</span>
    </div>
    <div class="preview-forecast-bar" role="img" aria-label="${escapeHtml(aria)}">${segments}</div>
    <div class="preview-forecast-legend">${legend}</div>
    ${forecast.note ? `<p class="preview-forecast-note">${escapeHtml(forecast.note)}</p>` : ""}
  </section>`;
}

function renderLineupPitch(lineup: PredictedLineup, locale: PreviewLocale = "en") {
  const labels =
    locale === "pt"
      ? {
          attack: "Linha de frente",
          midfield: "Meio-campo",
          defense: "Linha defensiva",
          goalkeeper: "Goleiro",
        }
      : {
          attack: "Front line",
          midfield: "Midfield",
          defense: "Back line",
          goalkeeper: "Goalkeeper",
        };
  const rows = [
    { id: "attack", label: labels.attack },
    { id: "midfield", label: labels.midfield },
    { id: "defense", label: labels.defense },
    { id: "goalkeeper", label: labels.goalkeeper },
  ] as const;
  const aria = lineup.players.map((player) => `${player.role} ${player.name}`).join(", ");
  const playerRows = rows
    .map((row) => {
      const players = lineup.players.filter((player) => player.line === row.id);
      if (players.length === 0) return "";
      return `<div class="preview-lineup-row preview-lineup-row-${row.id}" aria-label="${escapeHtml(row.label)}">
        ${players
          .map(
            (player) => `<div class="preview-player-marker">
              <span class="preview-player-role">${escapeHtml(player.role)}</span>
              <span class="preview-player-dot" aria-hidden="true"></span>
              <span class="preview-player-name">${escapeHtml(player.name)}</span>
            </div>`,
          )
          .join("")}
      </div>`;
    })
    .join("");

  return `<section class="preview-lineup-card" aria-label="${escapeHtml(lineup.label)}">
    <div class="preview-lineup-header">
      <div>
        <p>${escapeHtml(lineup.label)}</p>
        <h3>${escapeHtml(lineup.teamName)} · ${escapeHtml(lineup.formation)}</h3>
      </div>
      <span>${escapeHtml(lineup.statusLabel)}</span>
    </div>
    <div class="preview-pitch" role="img" aria-label="${escapeHtml(
      `${lineup.label}: ${lineup.formation}. ${aria}`,
    )}">
      <span class="preview-pitch-center-circle" aria-hidden="true"></span>
      <span class="preview-pitch-box preview-pitch-box-top" aria-hidden="true"></span>
      <span class="preview-pitch-box preview-pitch-box-bottom" aria-hidden="true"></span>
      ${playerRows}
    </div>
    ${
      lineup.note
        ? `<aside class="preview-lineup-note" role="note" style="color: #fff8e8; -webkit-text-fill-color: #fff8e8;"><span>${escapeHtml(
            lineup.note,
          )}</span></aside>`
        : ""
    }
  </section>`;
}

function renderTable(lines: string[], options?: { hideForecastRead?: boolean }) {
  const rows = lines
    .filter((line) => !/^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line))
    .map((line) =>
      line
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => inlineMarkdown(cell.trim())),
    );

  if (rows.length === 0) return "";
  const [head, ...body] = rows;
  const filteredBody = options?.hideForecastRead
    ? body.filter((row) => !["forecast read", "leitura do modelo"].includes(row[0]?.trim().toLowerCase() || ""))
    : body;
  return `<div class="preview-table-wrap"><table><thead><tr>${head
    .map((cell) => `<th>${cell}</th>`)
    .join("")}</tr></thead><tbody>${filteredBody
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
}

export function renderPreviewMarkdown(
  markdown: string,
  preview?: Pick<PreMatchPreview, "forecast" | "predictedLineup" | "locale">,
) {
  const lines = markdown.replace(/^\s*# .+\r?\n+/, "").split(/\r?\n/);
  const html: string[] = [];
  let currentHeading = "";
  let renderedGlanceVisuals = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line === "---") {
      html.push("<hr />");
      continue;
    }

    if (line.startsWith("|")) {
      const tableLines = [line];
      while (lines[i + 1]?.trim().startsWith("|")) {
        i += 1;
        tableLines.push(lines[i].trim());
      }
      const normalizedHeading = currentHeading.toLowerCase();
      const isAtAGlance = GLANCE_HEADINGS.has(normalizedHeading);
      html.push(renderTable(tableLines, { hideForecastRead: isAtAGlance && Boolean(preview?.forecast) }));
      if (isAtAGlance && !renderedGlanceVisuals) {
        if (preview?.forecast) {
          html.push(renderForecastBar(preview.forecast, preview.locale));
        }
        if (preview?.predictedLineup) {
          html.push(renderLineupPitch(preview.predictedLineup, preview.locale));
        }
        renderedGlanceVisuals = true;
      }
      continue;
    }

    if (line.startsWith("### ")) {
      html.push(`<h3>${inlineMarkdown(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith("## ")) {
      currentHeading = line.slice(3).trim();
      html.push(`<h2>${inlineMarkdown(currentHeading)}</h2>`);
      continue;
    }
    if (line.startsWith("> ")) {
      html.push(`<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`);
      continue;
    }

    if (line.startsWith("- ")) {
      const items = [line.slice(2)];
      while (lines[i + 1]?.trim().startsWith("- ")) {
        i += 1;
        items.push(lines[i].trim().slice(2));
      }
      html.push(`<ul>${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items = [line.replace(/^\d+\.\s+/, "")];
      while (/^\d+\.\s+/.test(lines[i + 1]?.trim() || "")) {
        i += 1;
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
      }
      html.push(`<ol>${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ol>`);
      continue;
    }

    html.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  return html.join("\n");
}
