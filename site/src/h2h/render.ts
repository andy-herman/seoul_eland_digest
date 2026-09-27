import { MASCOT_METRICS, OPPONENTS, PLAYER_METRICS, type Kit, type OpponentSlug, type SquadPlayer } from "./data";
import { CROSSBAR_Y, GOAL_LINE_L, GOAL_LINE_R, GROUND_Y, H2HMatch, NET_BACK_L, NET_BACK_R, WORLD_H, WORLD_W, headCenter, kickPoint, type Body, type PowerUp } from "./sim";

export interface H2HImages {
  ball?: HTMLImageElement;
  playerHead?: HTMLImageElement;
  playerStrip?: HTMLImageElement;
  playerSticker?: HTMLImageElement;
  mascot?: HTMLImageElement;
  stadium?: HTMLImageElement;
}

export class H2HRenderer {
  private dpr = 1;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private debug = false;
  constructor(private readonly canvas: HTMLCanvasElement, private readonly images: H2HImages, private readonly locale: "en" | "pt" = "en") {}

  setDebug(on: boolean): void {
    this.debug = on;
  }

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
    const shake = match.shakeT > 0 ? Math.sin(match.shakeT * 90) * 8 : 0;
    ctx.translate(this.ox + shake * this.scale, this.oy);
    ctx.scale(this.scale, this.scale);
    this.background(ctx, match);
    this.goalBacks(ctx, match);
    this.shadows(ctx, match);
    if (match.powerUp) this.powerUp(ctx, match.powerUp);
    this.player(ctx, match.left, match.player, match.kit, match.images?.playerHead ?? this.images.playerHead);
    this.mascot(ctx, match.right, match.opponent);
    this.ball(ctx, match);
    this.goalFronts(ctx);
    if (this.debug) this.hitboxOverlay(ctx, match);
    this.fx(ctx, match);
    ctx.restore();
  }

  private background(ctx: CanvasRenderingContext2D, match: H2HMatch): void {
    if (this.images.stadium) {
      ctx.drawImage(this.images.stadium, 0, 0, WORLD_W, WORLD_H);
    } else {
      const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      sky.addColorStop(0, match.kit === "home" ? "#9ed6ff" : "#dce8ff");
      sky.addColorStop(0.64, "#f9fdff");
      sky.addColorStop(0.65, "#d85142");
      sky.addColorStop(0.72, "#b83d35");
      sky.addColorStop(0.73, match.kit === "home" ? "#4f9d48" : "#5a9d5e");
      sky.addColorStop(1, "#3f873f");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      ctx.fillStyle = "rgba(20,32,58,.18)";
      for (let i = 0; i < 16; i++) ctx.fillRect(i * 112, 365 + (i % 3) * 18, 88, 130);
      ctx.fillStyle = "rgba(255,255,255,.45)";
      ctx.fillRect(0, 702, WORLD_W, 48);
    }
  }

  private goalBacks(ctx: CanvasRenderingContext2D, match: H2HMatch): void {
    this.net(ctx, NET_BACK_L, GOAL_LINE_L, 1, match.ball.netSide === "left");
    this.net(ctx, NET_BACK_R, GOAL_LINE_R, -1, match.ball.netSide === "right");
  }

  private goalFronts(ctx: CanvasRenderingContext2D): void {
    for (const [x, back] of [[GOAL_LINE_L, NET_BACK_L], [GOAL_LINE_R, NET_BACK_R]] as const) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1a1a24";
      ctx.lineWidth = 20;
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y);
      ctx.lineTo(x, CROSSBAR_Y);
      ctx.lineTo(back, CROSSBAR_Y);
      ctx.stroke();
      ctx.strokeStyle = "#f9fbff";
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y);
      ctx.lineTo(x, CROSSBAR_Y);
      ctx.lineTo(back, CROSSBAR_Y);
      ctx.stroke();
      ctx.fillStyle = "#f9fbff";
      ctx.strokeStyle = "#1a1a24";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(x, CROSSBAR_Y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private net(ctx: CanvasRenderingContext2D, back: number, front: number, dir: 1 | -1, bulge: boolean): void {
    const bend = bulge ? dir * 18 : 0;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.45)";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(front, CROSSBAR_Y);
    ctx.lineTo(back + bend, CROSSBAR_Y + 22);
    ctx.lineTo(back + bend, GROUND_Y);
    ctx.lineTo(front, GROUND_Y);
    ctx.closePath();
    ctx.stroke();
    ctx.clip();
    for (let i = -180; i < 260; i += 32) {
      ctx.beginPath();
      ctx.moveTo(back + i * dir, CROSSBAR_Y);
      ctx.lineTo(front + (i + 180) * dir, GROUND_Y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(front + i * dir, CROSSBAR_Y);
      ctx.lineTo(back + (i - 180) * dir, GROUND_Y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private shadows(ctx: CanvasRenderingContext2D, match: H2HMatch): void {
    this.shadow(ctx, match.left.x, match.left.y, 80, match.left.y - headCenter(match.left).y);
    this.shadow(ctx, match.right.x, match.right.y, 92, match.right.y - headCenter(match.right).y);
    this.shadow(ctx, match.ball.x, GROUND_Y, 40, GROUND_Y - match.ball.y);
  }

  private shadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, height: number): void {
    const s = Math.max(0.24, 1 - height / 620);
    ctx.save();
    ctx.globalAlpha = 0.26 * s;
    ctx.fillStyle = "#061020";
    ctx.beginPath();
    ctx.ellipse(x, y + 8, w * s, 12 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private player(ctx: CanvasRenderingContext2D, b: Body, player: SquadPlayer, kit: Kit, head?: HTMLImageElement): void {
    const strip = this.images.playerStrip;
    const meta = PLAYER_METRICS.players[`${player.num}-${kit}`];
    if (strip && meta) {
      this.playerStrip(ctx, b, strip, meta);
      return;
    }
    const bob = b.mood === "idle" ? Math.sin(b.anim) * 2.6 : 0;
    ctx.save();
    ctx.translate(b.x, b.y + bob);
    this.body(ctx, b, player, kit);
    const headH = 150 * (b.bigHeadT > 0 ? 1.3 : 1);
    const ratio = head ? head.naturalWidth / head.naturalHeight : 1;
    const headW = headH * ratio;
    const hx = 0;
    const hy = -130 + (b.mood === "sad" ? 12 : 0) + (b.mood === "header" ? -8 : 0);
    ctx.save();
    if (b.freezeT > 0) {
      ctx.globalAlpha = 0.75;
      ctx.filter = "sepia(.3) saturate(1.4) hue-rotate(155deg)";
    }
    if (head) ctx.drawImage(head, hx - headW / 2, hy - headH, headW, headH);
    else this.placeholderHead(ctx, player, hx, hy - headH / 2, headH * 0.45);
    ctx.restore();
    if (b.freezeT > 0) this.ice(ctx, hx, hy - 95);
    ctx.restore();
  }

  private playerStrip(ctx: CanvasRenderingContext2D, b: Body, strip: HTMLImageElement, meta: { boxes: [number, number, number, number][] }): void {
    const frame = b.mood === "kick" ? 4 : b.mood === "jump" || b.mood === "header" ? 3 : b.mood === "celebrate" ? 5 : b.mood === "run" ? (Math.floor(b.anim * 2) % 2) : 2;
    const idle = meta.boxes[2] ?? [70, 70, 240, 300];
    const scale = (b.bigHeadT > 0 ? 288 : 250) / idle[3];
    const anchorX = PLAYER_METRICS.players ? (meta as { anchors?: [number, number][] }).anchors?.[frame]?.[0] ?? PLAYER_METRICS.cell / 2 : PLAYER_METRICS.cell / 2;
    const cell = PLAYER_METRICS.cell;
    ctx.save();
    ctx.translate(b.x, b.y);
    if (!b.onGround) {
      const lean = Math.max(-0.1, Math.min(0.1, b.vx / 2600));
      ctx.rotate(lean);
      const sy = b.vy < 0 ? 1.04 : 0.97;
      ctx.scale(1 / sy, sy);
    } else if (b.mood === "idle") {
      ctx.translate(0, Math.sin(b.anim) * 1.5);
    }
    ctx.translate(-b.x, -b.y);
    if (b.mood === "sad") {
      ctx.translate(b.x, b.y);
      ctx.rotate(0.07);
      ctx.translate(-b.x, -b.y + 8);
    }
    if (b.freezeT > 0) {
      ctx.globalAlpha = 0.78;
      ctx.filter = "sepia(.3) saturate(1.4) hue-rotate(155deg)";
    }
    ctx.drawImage(strip, frame * cell, 0, cell, cell, b.x - anchorX * scale, b.y - PLAYER_METRICS.foot * scale, cell * scale, cell * scale);
    ctx.restore();
    if (b.freezeT > 0) this.ice(ctx, b.x, b.y - 135);
  }

  private placeholderHead(ctx: CanvasRenderingContext2D, player: SquadPlayer, x: number, y: number, r: number): void {
    ctx.fillStyle = player.skin;
    ctx.strokeStyle = "#1a1a24";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1a1a24";
    ctx.font = "900 40px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(player.num), x, y);
  }

  private body(ctx: CanvasRenderingContext2D, b: Body, player: SquadPlayer, kit: Kit): void {
    const isGk = player.gk;
    const home = kit === "home";
    const shirt = isGk ? (home ? "#ff7a1a" : "#22a45d") : home ? "#1b2446" : "#f7f8fb";
    const trim = isGk ? (home ? "#1b2446" : "#ffffff") : home ? "#ffffff" : "#1b2446";
    const shorts = isGk ? shirt : home ? "#1b2446" : "#f7f8fb";
    const socks = shorts;
    const run = b.mood === "run" ? Math.sin(b.anim) : 0;
    const jumpTuck = b.mood === "jump" || b.mood === "header" ? 18 : 0;
    const p = b.kickT > 0 ? 1 - b.kickT / 0.24 : 0;
    const foot = kickPoint(b, p);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (b.kickT > 0) {
      ctx.strokeStyle = "rgba(255,255,255,.55)";
      ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.moveTo(28, -38);
      ctx.lineTo(foot.x - b.x, foot.y - b.y);
      ctx.stroke();
    }
    ctx.strokeStyle = "#1a1a24";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(-34, -100);
    ctx.lineTo(-58, -78 + run * 12);
    ctx.moveTo(34, -100);
    ctx.lineTo(58, -78 - run * 12);
    if (b.mood === "celebrate") {
      ctx.moveTo(-31, -104); ctx.lineTo(-62, -148);
      ctx.moveTo(31, -104); ctx.lineTo(62, -148);
    }
    ctx.stroke();
    ctx.strokeStyle = player.skin;
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.fillStyle = shirt;
    ctx.strokeStyle = "#1a1a24";
    ctx.lineWidth = 5;
    roundRect(ctx, -45, -132, 90, 88, 22);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,.13)";
    ctx.fillRect(5, -128, 38, 76);
    ctx.fillStyle = trim;
    ctx.beginPath();
    ctx.moveTo(-20, -124); ctx.quadraticCurveTo(0, -112, 20, -124); ctx.lineTo(15, -116); ctx.quadraticCurveTo(0, -105, -15, -116); ctx.closePath();
    ctx.fill();
    if (!isGk && home) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-37, -123); ctx.quadraticCurveTo(-18, -136, -2, -126);
      ctx.moveTo(37, -123); ctx.quadraticCurveTo(18, -136, 2, -126);
      ctx.stroke();
    }
    if (!isGk && !home) {
      ctx.fillStyle = "#1b2446";
      ctx.beginPath();
      ctx.moveTo(-45, -126); ctx.lineTo(-25, -132); ctx.lineTo(-15, -47); ctx.lineTo(-45, -55); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(45, -126); ctx.lineTo(25, -132); ctx.lineTo(15, -47); ctx.lineTo(45, -55); ctx.closePath(); ctx.fill();
    }
    const grad = ctx.createLinearGradient(0, -82, 0, -44);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(1, home ? "rgba(255,255,255,.75)" : "rgba(210,215,225,.72)");
    ctx.fillStyle = grad;
    roundRect(ctx, -40, -82, 80, 37, 8);
    ctx.fill();
    if (player.captain) {
      ctx.fillStyle = "#ffd43b";
      roundRect(ctx, -55, -101, 14, 27, 4);
      ctx.fill();
      ctx.fillStyle = "#1a1a24";
      ctx.font = "900 11px system-ui";
      ctx.fillText("C", -48, -83);
    }
    ctx.fillStyle = shorts;
    ctx.strokeStyle = "#1a1a24";
    ctx.lineWidth = 5;
    roundRect(ctx, -40, -52, 80, 34, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = trim;
    ctx.font = "900 15px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(String(player.num), 24, -29);
    leg(ctx, -22, -20, -34 - run * 12, -3 + run * 8 - jumpTuck, socks, player.boots);
    if (b.kickT > 0) leg(ctx, 22, -20, foot.x - b.x, foot.y - b.y, socks, player.boots);
    else leg(ctx, 22, -20, 34 + run * 12, -3 - run * 8 - jumpTuck, socks, player.boots);
    if (isGk) {
      ctx.fillStyle = home ? "#d6ff2f" : "#ffffff";
      ctx.beginPath(); ctx.arc(-60, -78 + run * 12, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(60, -78 - run * 12, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    if (b.powerArmedT > 0) {
      ctx.strokeStyle = "rgba(255,214,74,.75)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(0, -52, 70, 110, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private mascot(ctx: CanvasRenderingContext2D, b: Body, slug: OpponentSlug): void {
    if (!this.images.mascot) {
      ctx.fillStyle = OPPONENTS[slug].color;
      ctx.beginPath();
      ctx.arc(b.x, b.y - 120, 92, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const frame = b.mood === "kick" ? 4 : b.mood === "jump" || b.mood === "header" ? 3 : b.mood === "celebrate" ? 5 : b.mood === "run" ? (Math.floor(b.anim * 2) % 2) : 2;
    const box = MASCOT_METRICS.clubs[slug]?.boxes[frame] ?? [70, 70, 240, 300];
    const idle = MASCOT_METRICS.clubs[slug]?.boxes[2] ?? box;
    const scale = 240 / idle[3];
    const cell = MASCOT_METRICS.cell;
    ctx.save();
    if (b.mood === "sad") {
      ctx.translate(b.x, b.y);
      ctx.rotate(-0.08);
      ctx.translate(-b.x, -b.y + 8);
    }
    if (b.freezeT > 0) {
      ctx.globalAlpha = 0.78;
      ctx.filter = "sepia(.3) saturate(1.4) hue-rotate(155deg)";
    }
    ctx.drawImage(this.images.mascot, frame * cell, 0, cell, cell, b.x - (cell / 2) * scale, b.y - MASCOT_METRICS.foot * scale, cell * scale, cell * scale);
    ctx.restore();
    if (b.freezeT > 0) this.ice(ctx, b.x, b.y - 130);
    if (b.powerArmedT > 0) {
      ctx.strokeStyle = `${OPPONENTS[slug].color}cc`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y - 120, 94, 126, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private ball(ctx: CanvasRenderingContext2D, match: H2HMatch): void {
    const b = match.ball;
    if (Math.abs(b.vx) + Math.abs(b.vy) > 900) {
      ctx.save();
      ctx.globalAlpha = 0.23;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(b.x - b.vx * 0.018 * i, b.y - b.vy * 0.018 * i, b.r, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }
      ctx.restore();
    }
    this.trail(ctx, match);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.spin);
    soccerBall(ctx, b.r);
    ctx.restore();
    if (b.y < 0) {
      ctx.fillStyle = "#ffd64a";
      ctx.strokeStyle = "#1a1a24";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(clamp(b.x, 34, WORLD_W - 34), 26);
      ctx.lineTo(clamp(b.x, 34, WORLD_W - 34) - 18, 58);
      ctx.lineTo(clamp(b.x, 34, WORLD_W - 34) + 18, 58);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  private trail(ctx: CanvasRenderingContext2D, match: H2HMatch): void {
    const b = match.ball;
    if (!b.powerKind || b.powerT <= 0) return;
    const dx = -Math.sign(b.vx || 1);
    if (b.powerKind === "leopard") {
      ctx.strokeStyle = "rgba(27,36,70,.75)";
      ctx.lineWidth = 15;
      ctx.beginPath(); ctx.moveTo(b.x + dx * 130, b.y + 8); ctx.quadraticCurveTo(b.x + dx * 65, b.y - 22, b.x, b.y); ctx.stroke();
      ctx.strokeStyle = "rgba(255,214,74,.85)";
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(b.x + dx * 118, b.y - 12); ctx.lineTo(b.x + dx * 12, b.y - 2); ctx.stroke();
      ctx.fillStyle = "rgba(255,214,74,.8)";
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(b.x + dx * (60 + i * 35), b.y + 18, 5, 0, Math.PI * 2); ctx.fill(); }
    } else if (b.powerKind === "freeze") {
      ctx.fillStyle = "rgba(158,231,255,.9)";
      for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(b.x + dx * (20 + i * 18), b.y + Math.sin(i) * 18, 3 + (i % 2) * 2, 0, Math.PI * 2); ctx.fill(); }
    } else if (b.powerKind === "lob") {
      ctx.fillStyle = "rgba(180,210,255,.78)";
      for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(b.x + dx * i * 20, b.y + i * i * 0.9, 4, 0, Math.PI * 2); ctx.fill(); }
    } else {
      ctx.fillStyle = "rgba(255,105,54,.74)";
      for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(b.x + dx * (22 + i * 16), b.y + Math.sin(i * 1.7) * 17, 6, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  private powerUp(ctx: CanvasRenderingContext2D, p: PowerUp): void {
    const bob = Math.sin(performance.now() / 220) * 5;
    ctx.save();
    ctx.translate(p.x, p.y - 35 + bob);
    ctx.fillStyle = "rgba(255,255,255,.7)";
    ctx.strokeStyle = "#ffd64a";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1b2446";
    ctx.strokeStyle = "#1b2446";
    ctx.lineWidth = 4;
    if (p.kind === "speed") {
      ctx.beginPath(); ctx.moveTo(-5, -23); ctx.lineTo(13, -4); ctx.lineTo(2, -4); ctx.lineTo(9, 23); ctx.lineTo(-14, -1); ctx.lineTo(-2, -1); ctx.closePath(); ctx.fill();
    } else if (p.kind === "bigHead") {
      ctx.beginPath(); ctx.arc(0, -2, 18, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(-6, -6, 2, 0, Math.PI * 2); ctx.arc(7, -6, 2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(0, 2, 9, 0, Math.PI); ctx.stroke();
    } else if (p.kind === "tinyBall") {
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-27, 0); ctx.lineTo(-15, 0); ctx.moveTo(27, 0); ctx.lineTo(15, 0); ctx.stroke();
    } else {
      for (let i = 0; i < 6; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(0, -23); ctx.lineTo(0, 23); ctx.stroke(); }
    }
    ctx.restore();
  }

  private fx(ctx: CanvasRenderingContext2D, match: H2HMatch): void {
    for (const p of match.popTexts) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.t);
      ctx.translate(p.x, p.y - (1.1 - p.t) * 36);
      ctx.scale(1 + Math.sin(p.t * 11) * 0.05, 1 + Math.sin(p.t * 11) * 0.05);
      ctx.font = "900 38px system-ui";
      ctx.textAlign = "center";
      ctx.lineWidth = 7;
      ctx.strokeStyle = "#1a1a24";
      ctx.fillStyle = p.color;
      ctx.strokeText(localizePop(p.text, this.locale), 0, 0);
      ctx.fillText(localizePop(p.text, this.locale), 0, 0);
      ctx.restore();
    }
    if (match.phase !== "goal" || !match.lastScorer) return;
    ctx.save();
    ctx.fillStyle = "rgba(11,16,38,.28)";
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    const txt = this.locale === "pt" ? "GOL!" : "GOAL!";
    ctx.font = "1000 124px system-ui";
    ctx.textAlign = "center";
    ctx.lineWidth = 9;
    ctx.strokeStyle = "#1a1a24";
    ctx.fillStyle = "#ffd64a";
    const y = 198 + Math.sin(performance.now() / 80) * 9;
    ctx.strokeText(txt, WORLD_W / 2, y);
    ctx.fillText(txt, WORLD_W / 2, y);
    this.confetti(ctx, match.lastScorer === "left" ? "#ffd64a" : OPPONENTS[match.opponent].color);
    this.scorerCard(ctx, match);
    ctx.restore();
  }

  private scorerCard(ctx: CanvasRenderingContext2D, match: H2HMatch): void {
    if (match.lastScorer === "left") {
      const sticker = match.images?.playerSticker ?? this.images.playerSticker;
      if (sticker) ctx.drawImage(sticker, 78, 360, 190, 285);
      ribbon(ctx, 84, 650, `#${match.player.num} ${match.player.ko} · ${match.player.en}`, "#1b2446");
    } else {
      this.mascot(ctx, { ...match.right, mood: "celebrate", x: 1320, y: 690 } as Body, match.opponent);
      ribbon(ctx, 1110, 650, `${OPPONENTS[match.opponent].name} · ${OPPONENTS[match.opponent].korean}`, OPPONENTS[match.opponent].color);
    }
  }

  private hitboxOverlay(ctx: CanvasRenderingContext2D, match: H2HMatch): void {
    ctx.save();
    ctx.lineWidth = 2;
    for (const b of [match.left, match.right]) {
      ctx.strokeStyle = "#22c55e";
      ctx.strokeRect(b.x - b.w / 2, b.y - b.h, b.w, b.h);
      const h = headCenter(b);
      ctx.strokeStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(h.x, h.y, b.headR * (b.bigHeadT > 0 ? 1.3 : 1), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = "#06b6d4";
    ctx.beginPath();
    ctx.arc(match.ball.x, match.ball.y, match.ball.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private confetti(ctx: CanvasRenderingContext2D, color: string): void {
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = i % 2 ? "#ffd64a" : color;
      ctx.save();
      ctx.translate((i * 97) % WORLD_W, 60 + ((i * 53) % 520));
      ctx.rotate(i);
      ctx.fillRect(-5, -2, 10, 4);
      ctx.restore();
    }
  }

  private ice(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.strokeStyle = "rgba(158,231,255,.9)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      const a = i * 1.26;
      ctx.moveTo(x + Math.cos(a) * 35, y + Math.sin(a) * 35);
      ctx.lineTo(x + Math.cos(a) * 58, y + Math.sin(a) * 58);
      ctx.stroke();
    }
  }
}

declare module "./sim" {
  interface H2HMatch {
    images?: H2HImages;
  }
}

function leg(ctx: CanvasRenderingContext2D, hipX: number, hipY: number, footX: number, footY: number, sock: string, boots: [string, string]): void {
  ctx.strokeStyle = "#1a1a24";
  ctx.lineWidth = 18;
  ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo((hipX + footX) / 2, hipY + 28); ctx.lineTo(footX, footY); ctx.stroke();
  ctx.strokeStyle = sock;
  ctx.lineWidth = 13;
  ctx.stroke();
  ctx.strokeStyle = boots[0];
  ctx.lineWidth = 11;
  ctx.beginPath(); ctx.moveTo(footX, footY); ctx.lineTo(footX + Math.sign(footX || 1) * 30, footY + 3); ctx.stroke();
  ctx.strokeStyle = boots[1];
  ctx.lineWidth = 3;
  ctx.stroke();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function ribbon(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string): void {
  ctx.fillStyle = color;
  roundRect(ctx, x, y, 360, 46, 14);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 22px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(text, x + 18, y + 30, 326);
}

function soccerBall(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.fillStyle = "#f8fafc";
  ctx.strokeStyle = "#1a1a24";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#111827";
  polygon(ctx, 0, 0, r * 0.34, 5, -Math.PI / 2);
  ctx.fill();
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
    const x = Math.cos(a) * r * 0.63;
    const y = Math.sin(a) * r * 0.63;
    polygon(ctx, x, y, r * 0.18, 5, a);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
}

function polygon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, sides: number, rot: number): void {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + i * Math.PI * 2 / sides;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function localizePop(text: string, locale: "en" | "pt"): string {
  if (locale !== "pt") return text;
  return { "GO!": "VAI!", "POWER SHOT!": "CHUTE ESPECIAL!", "COUNTER!": "CONTRA!", "CROSSBAR!": "TRAVESSÃO!", "FROZEN!": "CONGELADO!", "FULL TIME": "FIM DE JOGO", "SPEED!": "VELOCIDADE!", "BIG HEAD!": "CABEÇÃO!", "TINY BALL!": "BOLA PEQUENA!" }[text] ?? text;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
