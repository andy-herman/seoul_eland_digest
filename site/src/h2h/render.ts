import { MASCOT_METRICS, OPPONENTS, type Kit, type OpponentSlug, type SquadPlayer } from "./data";
import { CROSSBAR_Y, GOAL_LEFT, GOAL_RIGHT, GROUND_Y, H2HMatch, WORLD_H, WORLD_W, type Body } from "./sim";

export interface H2HImages {
  ball?: HTMLImageElement;
  playerHead?: HTMLImageElement;
  playerSticker?: HTMLImageElement;
  mascot?: HTMLImageElement;
  stadium?: HTMLImageElement;
}

export class H2HRenderer {
  private dpr = 1;
  private scale = 1;
  private ox = 0;
  private oy = 0;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly images: H2HImages) {}

  resize(cssWidth: number): void {
    const width = Math.max(320, Math.floor(cssWidth));
    const height = Math.round(width * 9 / 16);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.scale = (width * this.dpr) / WORLD_W;
    this.ox = 0;
    this.oy = ((height * this.dpr) - WORLD_H * this.scale) / 2;
  }

  draw(match: H2HMatch): void {
    const ctx = this.canvas.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.translate(this.ox, this.oy);
    ctx.scale(this.scale, this.scale);
    this.background(ctx, match);
    this.goals(ctx);
    if (match.powerUp) this.powerUp(ctx, match.powerUp.x, match.powerUp.y, match.powerUp.kind);
    this.player(ctx, match.left, match.player, match.kit, match.images?.playerHead ?? this.images.playerHead);
    this.mascot(ctx, match.right, match.opponent);
    this.ball(ctx, match);
    this.fx(ctx, match);
    ctx.restore();
  }

  private background(ctx: CanvasRenderingContext2D, match: H2HMatch): void {
    if (this.images.stadium) {
      ctx.drawImage(this.images.stadium, 0, 0, WORLD_W, WORLD_H);
      if (match.kit === "away") {
        ctx.fillStyle = OPPONENTS[match.opponent].color;
        ctx.globalAlpha = 0.18;
        ctx.fillRect(0, 585, WORLD_W, 70);
        ctx.globalAlpha = 1;
      }
    } else {
      const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      sky.addColorStop(0, match.kit === "home" ? "#9ed6ff" : "#d8e4ff");
      sky.addColorStop(1, "#f7fbff");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, WORLD_W, GROUND_Y);
      ctx.fillStyle = "#243251";
      for (let i = 0; i < 12; i++) ctx.fillRect(i * 145 - 10, 520 + (i % 2) * 14, 110, 34);
      ctx.fillStyle = match.kit === "home" ? "#4f9d48" : "#51935a";
      ctx.fillRect(0, GROUND_Y, WORLD_W, WORLD_H - GROUND_Y);
    }
    ctx.fillStyle = "rgba(255,255,255,.35)";
    ctx.fillRect(WORLD_W / 2 - 3, GROUND_Y - 250, 6, 250);
    ctx.beginPath();
    ctx.arc(WORLD_W / 2, GROUND_Y - 24, 96, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,.55)";
    ctx.lineWidth = 5;
    ctx.stroke();
  }

  private goals(ctx: CanvasRenderingContext2D): void {
    for (const [x, dir] of [[GOAL_LEFT, 1], [GOAL_RIGHT, -1]] as const) {
      ctx.save();
      ctx.strokeStyle = "#f8fafc";
      ctx.lineWidth = 12;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y);
      ctx.lineTo(x, CROSSBAR_Y);
      ctx.lineTo(x + dir * 116, CROSSBAR_Y);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.35)";
      ctx.lineWidth = 3;
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.moveTo(x + dir * 12, CROSSBAR_Y + i * 43);
        ctx.lineTo(x + dir * 104, CROSSBAR_Y + i * 43);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private player(ctx: CanvasRenderingContext2D, b: Body, player: SquadPlayer, kit: Kit, head?: HTMLImageElement): void {
    const mirror = b.facing < 0 ? -1 : 1;
    ctx.save();
    ctx.translate(b.x, b.y + Math.sin(b.anim) * 2);
    ctx.scale(mirror, 1);
    const isGk = player.gk;
    const shirt = isGk ? (kit === "home" ? "#f27626" : "#149b55") : kit === "home" ? "#1b2446" : "#fbfbf4";
    const trim = isGk ? (kit === "home" ? "#1b2446" : "#ffffff") : kit === "home" ? "#f8fbff" : "#1b2446";
    this.limbs(ctx, b, shirt, trim, player, kit);
    const r = b.headR * (b.bigHeadT > 0 ? 1.25 : 1);
    const hx = 0;
    const hy = -b.h + r + 6;
    if (head) {
      ctx.drawImage(head, hx - r, hy - r * 1.08, r * 2, r * 2.16);
    } else {
      ctx.fillStyle = player.skin;
      ctx.strokeStyle = "#17203a";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(hx, hy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#17203a";
      ctx.font = "900 42px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(player.num), hx, hy + 2);
    }
    ctx.restore();
  }

  private limbs(ctx: CanvasRenderingContext2D, b: Body, shirt: string, trim: string, player: SquadPlayer, kit: Kit): void {
    const run = Math.sin(b.anim) * (b.mood === "run" ? 18 : 6);
    const kick = b.kickT > 0 ? 44 : 0;
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#14203a";
    ctx.fillStyle = shirt;
    roundRect(ctx, -40, -130, 80, 82, 22);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = trim;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-22, -122);
    ctx.quadraticCurveTo(0, -108, 22, -122);
    ctx.stroke();
    ctx.fillStyle = trim;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(-38 + i * 15, -62);
      ctx.lineTo(-27 + i * 15, -44);
      ctx.lineTo(-15 + i * 15, -62);
      ctx.fill();
    }
    ctx.fillStyle = player.captain ? "#ffd43b" : player.vice ? "#f8fafc" : "transparent";
    if (player.captain || player.vice) ctx.fillRect(-52, -100, 13, 25);
    ctx.strokeStyle = "#14203a";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(-34, -96);
    ctx.lineTo(-66, -74 - run * 0.25);
    ctx.moveTo(34, -96);
    ctx.lineTo(64, -78 + run * 0.25);
    ctx.stroke();
    ctx.strokeStyle = kit === "home" || player.gk ? "#1b2446" : "#f8fafc";
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(-23, -48);
    ctx.lineTo(-32, -18 + run);
    ctx.moveTo(23, -48);
    ctx.lineTo(42 + kick, -18 - run);
    ctx.stroke();
    ctx.strokeStyle = player.boots[0];
    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.moveTo(-32, -18 + run);
    ctx.lineTo(-62, -13 + run);
    ctx.moveTo(42 + kick, -18 - run);
    ctx.lineTo(72 + kick, -16 - run);
    ctx.stroke();
    if (player.gk) {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(-69, -74 - run * 0.25, 13, 0, Math.PI * 2);
      ctx.arc(67, -78 + run * 0.25, 13, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private mascot(ctx: CanvasRenderingContext2D, b: Body, slug: OpponentSlug): void {
    if (!this.images.mascot) {
      ctx.fillStyle = OPPONENTS[slug].color;
      ctx.beginPath();
      ctx.arc(b.x, b.y - 115, 82, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const frame = b.mood === "kick" ? 4 : b.mood === "jump" ? 3 : b.mood === "celebrate" ? 5 : b.mood === "run" ? (Math.floor(b.anim * 2) % 2) : 2;
    const cell = MASCOT_METRICS.cell;
    const scale = 0.78;
    ctx.drawImage(this.images.mascot, frame * cell, 0, cell, cell, b.x - cell * scale / 2, b.y - MASCOT_METRICS.foot * scale, cell * scale, cell * scale);
  }

  private ball(ctx: CanvasRenderingContext2D, match: H2HMatch): void {
    const b = match.ball;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.spin);
    if (b.fireT > 0) {
      ctx.strokeStyle = b.poweredBy === "left" ? "rgba(255,214,74,.75)" : "rgba(255,90,54,.75)";
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(-Math.sign(b.vx || 1) * 95, 0);
      ctx.lineTo(0, 0);
      ctx.stroke();
    }
    if (this.images.ball) ctx.drawImage(this.images.ball, -b.r, -b.r, b.r * 2, b.r * 2);
    else {
      ctx.fillStyle = "#f8fafc";
      ctx.strokeStyle = "#17203a";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private powerUp(ctx: CanvasRenderingContext2D, x: number, y: number, kind: string): void {
    ctx.fillStyle = "#ffd64a";
    ctx.strokeStyle = "#17203a";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(x - 30, y - 56, 60, 48, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#17203a";
    ctx.font = "900 20px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(kind === "speed" ? "SPD" : kind === "bigHead" ? "BIG" : kind === "tinyBall" ? "SM" : "ICE", x, y - 25);
  }

  private fx(ctx: CanvasRenderingContext2D, match: H2HMatch): void {
    if (match.phase !== "goal" || !match.lastScorer) return;
    ctx.fillStyle = "rgba(11,16,38,.45)";
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.fillStyle = "#ffd64a";
    ctx.strokeStyle = "#17203a";
    ctx.lineWidth = 8;
    ctx.font = "900 118px system-ui";
    ctx.textAlign = "center";
    ctx.strokeText("GOAL!", WORLD_W / 2, 210);
    ctx.fillText("GOAL!", WORLD_W / 2, 210);
  }
}

declare module "./sim" {
  interface H2HMatch {
    images?: H2HImages;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
