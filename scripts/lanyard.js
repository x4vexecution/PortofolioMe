/**
 * LUMINICA — Complete Lanyard & ID Card Interactive System
 * Target: AddCard/scripts/lanyard.js
 *
 * Features:
 * - Single continuous woven strap (deep charcoal / midnight black with champagne gold & brushed titanium trim)
 * - Procedural woven textile + stitched edge + repeated "LUMINICA" branding texture following strap curvature
 * - Multi-part brushed champagne gold & titanium metallic hardware (anchor, swivel clasp, split ring, card clip)
 * - Verlet/spring pendulum physics with pointer/touch dragging, angular momentum, card flip, and responsive resize
 * - Preserves exact Front & Back ID card image URLs and aspect proportions
 */

(function () {
  "use strict";

  const FRONT_IMAGE_URL =
    "https://raw.githubusercontent.com/x4vexecution/Image/refs/heads/main/1bc02a650c14a95053c88a9166a1eb97.jpg";
  const BACK_IMAGE_URL =
    "https://raw.githubusercontent.com/x4vexecution/Image/refs/heads/main/1ad905ac00ce4dde1a796b5dcbc6060b.jpg";

  const PALETTE = {
    bgTop: "#090b10",
    bgBottom: "#121622",
    strapBase: "#161922",
    strapDeep: "#0c0e14",
    weaveLight: "#2a3040",
    weaveDark: "#090a0f",
    goldLight: "#f1d49c",
    goldMid: "#c89d54",
    goldDark: "#6e4f20",
    titaniumLight: "#cfd6e0",
    titaniumMid: "#8792a2",
    titaniumDark: "#3c434f",
    brandText: "#e6c382",
    brandShadow: "rgba(6, 7, 10, 0.85)",
  };

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /**
   * Generates a seamless high-DPI woven textile canvas pattern with LUMINICA branding
   * and stitched/metallic edge accents so the single continuous strap looks physically woven.
   */
  function createWovenStrapPattern(ctx) {
    const patCanvas = document.createElement("canvas");
    patCanvas.width = 256;
    patCanvas.height = 96;
    const pctx = patCanvas.getContext("2d");

    // Base midnight charcoal gradient across strap width (y: 0..96)
    const widthGrad = pctx.createLinearGradient(0, 0, 0, patCanvas.height);
    widthGrad.addColorStop(0.0, "#0c0e14");
    widthGrad.addColorStop(0.08, "#1b202c");
    widthGrad.addColorStop(0.5, "#151822");
    widthGrad.addColorStop(0.92, "#1b202c");
    widthGrad.addColorStop(1.0, "#0c0e14");
    pctx.fillStyle = widthGrad;
    pctx.fillRect(0, 0, patCanvas.width, patCanvas.height);

    // Fine warp & weft micro-weave grid
    for (let y = 6; y < patCanvas.height - 6; y += 4) {
      for (let x = 0; x < patCanvas.width; x += 4) {
        const isWarp = ((x + y) >> 2) % 2 === 0;
        pctx.fillStyle = isWarp
          ? "rgba(215, 224, 238, 0.045)"
          : "rgba(5, 6, 10, 0.28)";
        pctx.fillRect(x, y, 3, 2);

        // Subtle fiber sheen
        if (((x * 7 + y * 13) & 15) === 0) {
          pctx.fillStyle = "rgba(241, 212, 156, 0.06)";
          pctx.fillRect(x + 1, y, 1, 1);
        }
      }
    }

    // Refined metallic champagne-gold & brushed titanium edge pinstripe
    const edgeGrad = pctx.createLinearGradient(0, 0, 0, patCanvas.height);
    edgeGrad.addColorStop(0.0, PALETTE.goldMid);
    edgeGrad.addColorStop(0.035, PALETTE.goldLight);
    edgeGrad.addColorStop(0.065, PALETTE.goldDark);
    edgeGrad.addColorStop(0.075, "rgba(0,0,0,0)");
    edgeGrad.addColorStop(0.925, "rgba(0,0,0,0)");
    edgeGrad.addColorStop(0.935, PALETTE.goldDark);
    edgeGrad.addColorStop(0.965, PALETTE.goldLight);
    edgeGrad.addColorStop(1.0, PALETTE.goldMid);
    pctx.fillStyle = edgeGrad;
    pctx.fillRect(0, 0, patCanvas.width, patCanvas.height);

    // Precision saddle-stitching along both edges
    pctx.save();
    pctx.strokeStyle = "rgba(230, 195, 130, 0.42)";
    pctx.lineWidth = 1.25;
    pctx.setLineDash([5, 4]);
    pctx.beginPath();
    pctx.moveTo(0, 9.5);
    pctx.lineTo(patCanvas.width, 9.5);
    pctx.moveTo(0, patCanvas.height - 9.5);
    pctx.lineTo(patCanvas.width, patCanvas.height - 9.5);
    pctx.stroke();
    pctx.restore();

    // Subtle integrated LUMINICA text woven into the textile repeat
    pctx.save();
    pctx.font = "600 11px 'Inter', 'Segoe UI', system-ui, sans-serif";
    pctx.textAlign = "center";
    pctx.textBaseline = "middle";
    pctx.fillStyle = "rgba(241, 212, 156, 0.24)";
    const labels = ["LUMINICA", "LUMINICA"];
    labels.forEach((txt, idx) => {
      const cx = idx === 0 ? 64 : 192;
      const cy = patCanvas.height * 0.5;
      pctx.fillText(txt.split("").join(" "), cx, cy + 0.6);
      pctx.fillStyle = "rgba(255, 245, 220, 0.16)";
      pctx.fillText(txt.split("").join(" "), cx, cy - 0.5);
      pctx.fillStyle = "rgba(241, 212, 156, 0.24)";
    });
    pctx.restore();

    return ctx.createPattern(patCanvas, "repeat");
  }

  class VerletNode {
    constructor(x, y, pinned = false) {
      this.x = x;
      this.y = y;
      this.oldX = x;
      this.oldY = y;
      this.pinned = pinned;
    }

    update(dt, gravityY, damping) {
      if (this.pinned) return;
      const vx = (this.x - this.oldX) * damping;
      const vy = (this.y - this.oldY) * damping;
      this.oldX = this.x;
      this.oldY = this.y;
      const dtSq = dt * dt;
      this.x += vx;
      this.y += vy + gravityY * dtSq;
    }
  }

  class LuminicaLanyardApp {
    constructor(container) {
      this.container = container || document.body;
      this.canvas = document.createElement("canvas");
      this.canvas.className = "luminica-lanyard-canvas";
      this.canvas.style.cssText = [
        "display:block",
        "width:100%",
        "height:100%",
        "touch-action:none",
        "user-select:none",
        "-webkit-user-select:none",
        "cursor:grab",
      ].join(";");
      this.container.appendChild(this.canvas);
      this.ctx = this.canvas.getContext("2d");

      this.width = 0;
      this.height = 0;
      this.dpr = 1;
      this.strapPattern = null;

      // Images (strictly preserved URLs)
      this.frontImg = new Image();
      this.frontImg.crossOrigin = "anonymous";
      this.frontImg.src = FRONT_IMAGE_URL;
      this.frontLoaded = false;

      this.backImg = new Image();
      this.backImg.crossOrigin = "anonymous";
      this.backImg.src = BACK_IMAGE_URL;
      this.backLoaded = false;

      this.frontImg.onload = () => {
        this.frontLoaded = true;
      };
      this.backImg.onload = () => {
        this.backLoaded = true;
      };

      // Physics chain: single continuous strap from anchor -> lower hardware ring
      this.nodeCount = 16;
      this.nodes = [];
      this.segmentLength = 16;
      this.strapWidth = 34;

      // Card state
      this.cardX = 0;
      this.cardY = 0;
      this.cardAngle = 0;
      this.cardAngularVel = 0;
      this.cardWidth = 230;
      this.cardHeight = 350;

      // Flip state: 0 = front, Math.PI = back
      this.flipAngle = 0;
      this.targetFlipAngle = 0;
      this.isShowingBack = false;

      // Interaction state
      this.draggingTarget = null; // "card" | "strap" | null
      this.dragOffsetX = 0;
      this.dragOffsetY = 0;
      this.pointerDownPos = { x: 0, y: 0 };
      this.lastPointerPos = { x: 0, y: 0 };
      this.lastPointerTime = 0;
      this.pointerVel = { x: 0, y: 0 };
      this.hoveredTarget = null;

      // Animation loop
      this.rafId = null;
      this.lastFrameTime = performance.now();
      this.elapsed = 0;

      this._bindEvents();
      this.resize(true);
      this.start();
    }

    _bindEvents() {
      this._onResize = () => this.resize(false);
      this._onPointerDown = (e) => this.onPointerDown(e);
      this._onPointerMove = (e) => this.onPointerMove(e);
      this._onPointerUp = (e) => this.onPointerUp(e);
      this._onKeyDown = (e) => {
        if (e.key === "f" || e.key === "F" || e.key === " ") {
          this.flipCard();
        }
      };

      window.addEventListener("resize", this._onResize);
      this.canvas.addEventListener("pointerdown", this._onPointerDown);
      window.addEventListener("pointermove", this._onPointerMove);
      window.addEventListener("pointerup", this._onPointerUp);
      window.addEventListener("pointercancel", this._onPointerUp);
      window.addEventListener("keydown", this._onKeyDown);
    }

    destroy() {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      window.removeEventListener("resize", this._onResize);
      this.canvas.removeEventListener("pointerdown", this._onPointerDown);
      window.removeEventListener("pointermove", this._onPointerMove);
      window.removeEventListener("pointerup", this._onPointerUp);
      window.removeEventListener("pointercancel", this._onPointerUp);
      window.removeEventListener("keydown", this._onKeyDown);
      if (this.canvas.parentNode === this.container) {
        this.container.removeChild(this.canvas);
      }
    }

    resize(resetChain) {
      const rect = this.container.getBoundingClientRect();
      this.width = Math.max(320, rect.width || window.innerWidth);
      this.height = Math.max(420, rect.height || window.innerHeight);
      this.dpr = clamp(window.devicePixelRatio || 1, 1, 2);

      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      if (!this.strapPattern) {
        this.strapPattern = createWovenStrapPattern(this.ctx);
      }

      // Responsive card & strap sizing while keeping portrait ID card proportions (~0.64)
      const scale = clamp(Math.min(this.width / 900, this.height / 760), 0.72, 1.25);
      this.cardWidth = Math.round(224 * scale);
      this.cardHeight = Math.round(350 * scale);
      this.strapWidth = Math.round(34 * scale);

      const totalStrapSpan = Math.min(this.height * 0.36, 265 * scale);
      this.segmentLength = totalStrapSpan / (this.nodeCount - 1);

      if (resetChain || this.nodes.length === 0) {
        this._initChain();
      } else {
        this.nodes[0].x = this.width * 0.5;
        this.nodes[0].y = 18;
      }
    }

    _initChain() {
      const anchorX = this.width * 0.5;
      const anchorY = 18;
      this.nodes = [];
      for (let i = 0; i < this.nodeCount; i++) {
        // Gentle organic initial curve
        const sway = Math.sin((i / (this.nodeCount - 1)) * Math.PI) * 10;
        const x = anchorX + sway;
        const y = anchorY + i * this.segmentLength;
        this.nodes.push(new VerletNode(x, y, i === 0));
      }
      const tail = this.nodes[this.nodes.length - 1];
      this.cardX = tail.x;
      this.cardY = tail.y + 42 + this.cardHeight * 0.5;
      this.cardAngle = 0;
      this.cardAngularVel = 0;
    }

    flipCard() {
      this.isShowingBack = !this.isShowingBack;
      this.targetFlipAngle = this.isShowingBack ? Math.PI : 0;
      this.cardAngularVel += (this.isShowingBack ? 1 : -1) * 1.4;
    }

    _getPointerPos(e) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }

    _hitTest(x, y) {
      // Check card bounds (centered at cardX, cardY with rotation cardAngle)
      const dx = x - this.cardX;
      const dy = y - this.cardY;
      const cos = Math.cos(-this.cardAngle);
      const sin = Math.sin(-this.cardAngle);
      const localX = dx * cos - dy * sin;
      const localY = dx * sin + dy * cos;

      const halfW = this.cardWidth * 0.5 + 10;
      const halfH = this.cardHeight * 0.5 + 24;
      if (Math.abs(localX) <= halfW && Math.abs(localY) <= halfH) {
        return "card";
      }

      // Check continuous strap nodes
      for (let i = 1; i < this.nodes.length; i++) {
        const n = this.nodes[i];
        const dist = Math.hypot(x - n.x, y - n.y);
        if (dist <= this.strapWidth * 0.75) {
          return "strap";
        }
      }

      return null;
    }

    onPointerDown(e) {
      if (e.button !== undefined && e.button !== 0 && e.pointerType === "mouse") {
        return;
      }
      const pos = this._getPointerPos(e);
      this.pointerDownPos = { ...pos };
      this.lastPointerPos = { ...pos };
      this.lastPointerTime = performance.now();
      this.pointerVel = { x: 0, y: 0 };

      const hit = this._hitTest(pos.x, pos.y);
      if (hit) {
        this.draggingTarget = hit;
        this.dragOffsetX = this.cardX - pos.x;
        this.dragOffsetY = this.cardY - pos.y;
        this.canvas.style.cursor = "grabbing";
        if (this.canvas.setPointerCapture && e.pointerId !== undefined) {
          try {
            this.canvas.setPointerCapture(e.pointerId);
          } catch (_) {}
        }
      }
    }

    onPointerMove(e) {
      const pos = this._getPointerPos(e);
      const now = performance.now();
      const dtSec = Math.max(0.008, (now - this.lastPointerTime) / 1000);

      this.pointerVel.x = (pos.x - this.lastPointerPos.x) / dtSec;
      this.pointerVel.y = (pos.y - this.lastPointerPos.y) / dtSec;
      this.lastPointerPos = { ...pos };
      this.lastPointerTime = now;

      if (!this.draggingTarget) {
        const hover = this._hitTest(pos.x, pos.y);
        if (hover !== this.hoveredTarget) {
          this.hoveredTarget = hover;
          this.canvas.style.cursor = hover ? "grab" : "default";
        }
        return;
      }

      if (this.draggingTarget === "card") {
        const targetCardX = pos.x + this.dragOffsetX;
        const targetCardY = pos.y + this.dragOffsetY;

        // Constrain maximum reach from top anchor so strap never snaps unnaturally
        const anchor = this.nodes[0];
        const maxReach = this.nodeCount * this.segmentLength + this.cardHeight * 0.55;
        const vx = targetCardX - anchor.x;
        const vy = targetCardY - anchor.y;
        const dist = Math.hypot(vx, vy) || 1;
        if (dist > maxReach) {
          const ratio = maxReach / dist;
          this.cardX = anchor.x + vx * ratio;
          this.cardY = anchor.y + vy * ratio;
        } else {
          this.cardX = targetCardX;
          this.cardY = targetCardY;
        }

        // Tilt card naturally with horizontal drag velocity
        const targetTilt = clamp(this.pointerVel.x * 0.00035, -0.55, 0.55);
        this.cardAngle = lerp(this.cardAngle, targetTilt, 0.28);

        // Pull lower strap node toward top clip mount of the card
        const clipMount = this._getCardClipWorldPos();
        const tail = this.nodes[this.nodes.length - 1];
        tail.x = lerp(tail.x, clipMount.x, 0.75);
        tail.y = lerp(tail.y, clipMount.y - 26, 0.75);
        tail.oldX = tail.x - this.pointerVel.x * 0.012;
        tail.oldY = tail.y - this.pointerVel.y * 0.012;
      } else if (this.draggingTarget === "strap") {
        const midIdx = Math.floor(this.nodeCount * 0.55);
        const node = this.nodes[midIdx];
        node.x = pos.x;
        node.y = pos.y;
        node.oldX = pos.x - this.pointerVel.x * 0.012;
        node.oldY = pos.y - this.pointerVel.y * 0.012;
      }
    }

    onPointerUp(e) {
      if (!this.draggingTarget) return;
      const pos = this._getPointerPos(e);
      const moveDist = Math.hypot(
        pos.x - this.pointerDownPos.x,
        pos.y - this.pointerDownPos.y
      );

      if (this.draggingTarget === "card") {
        // Add release momentum
        const tail = this.nodes[this.nodes.length - 1];
        tail.oldX = tail.x - clamp(this.pointerVel.x, -900, 900) * 0.018;
        tail.oldY = tail.y - clamp(this.pointerVel.y, -900, 900) * 0.018;
        this.cardAngularVel += clamp(this.pointerVel.x * 0.004, -5.5, 5.5);

        // Quick tap/click on card flips front/back
        if (moveDist < 7) {
          this.flipCard();
        }
      }

      this.draggingTarget = null;
      this.canvas.style.cursor = this.hoveredTarget ? "grab" : "default";
    }

    _getCardClipWorldPos() {
      const topOffset = -(this.cardHeight * 0.5 + 14);
      const sin = Math.sin(this.cardAngle);
      const cos = Math.cos(this.cardAngle);
      return {
        x: this.cardX - topOffset * sin,
        y: this.cardY + topOffset * cos,
      };
    }

    _stepPhysics(dt) {
      const subSteps = 4;
      const subDt = dt / subSteps;
      const gravityY = 980;
      const damping = 0.992;

      // Pin top ceiling anchor
      const anchor = this.nodes[0];
      anchor.x = this.width * 0.5;
      anchor.y = 18;
      anchor.oldX = anchor.x;
      anchor.oldY = anchor.y;

      for (let s = 0; s < subSteps; s++) {
        for (let i = 1; i < this.nodes.length; i++) {
          this.nodes[i].update(subDt, gravityY, damping);
        }

        // Distance constraints along single continuous strap
        for (let iter = 0; iter < 5; iter++) {
          anchor.x = this.width * 0.5;
          anchor.y = 18;

          for (let i = 0; i < this.nodes.length - 1; i++) {
            const a = this.nodes[i];
            const b = this.nodes[i + 1];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy) || 0.0001;
            const diff = (dist - this.segmentLength) / dist;

            if (a.pinned && !b.pinned) {
              b.x -= dx * diff;
              b.y -= dy * diff;
            } else if (!a.pinned && b.pinned) {
              a.x += dx * diff;
              a.y += dy * diff;
            } else if (!a.pinned && !b.pinned) {
              a.x += dx * diff * 0.5;
              a.y += dy * diff * 0.5;
              b.x -= dx * diff * 0.5;
              b.y -= dy * diff * 0.5;
            }
          }
        }
      }

      // Couple card position & pendulum rotation smoothly to the lower hardware ring
      const tail = this.nodes[this.nodes.length - 1];
      const prev = this.nodes[this.nodes.length - 2];
      const strapDirX = tail.x - prev.x;
      const strapDirY = tail.y - prev.y;
      const strapSlopeAngle = Math.atan2(strapDirX, Math.max(4, strapDirY));

      const hardwareDrop = 46;
      const desiredCardX = tail.x + Math.sin(strapSlopeAngle) * (this.cardHeight * 0.45);
      const desiredCardY = tail.y + hardwareDrop + this.cardHeight * 0.5;

      if (this.draggingTarget !== "card") {
        this.cardX = lerp(this.cardX, desiredCardX, 0.26);
        this.cardY = lerp(this.cardY, desiredCardY, 0.26);

        // Spring-damper rotational pendulum toward strap slope
        const springK = 26;
        const rotDamping = 5.4;
        const angleDiff = strapSlopeAngle * 0.72 - this.cardAngle;
        const angularAcc = angleDiff * springK - this.cardAngularVel * rotDamping;
        this.cardAngularVel += angularAcc * dt;
        this.cardAngle += this.cardAngularVel * dt;
      }

      // Smoothly animate front/back flip angle
      this.flipAngle = lerp(this.flipAngle, this.targetFlipAngle, clamp(dt * 9.5, 0, 1));
    }

    _drawBackground() {
      const ctx = this.ctx;
      const grad = ctx.createLinearGradient(0, 0, 0, this.height);
      grad.addColorStop(0, PALETTE.bgTop);
      grad.addColorStop(0.55, "#0d1018");
      grad.addColorStop(1, PALETTE.bgBottom);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.width, this.height);

      // Subtle warm champagne ambient spotlight behind the ID card
      const glow = ctx.createRadialGradient(
        this.cardX,
        this.cardY - 30,
        20,
        this.cardX,
        this.cardY,
        Math.max(this.width, this.height) * 0.55
      );
      glow.addColorStop(0, "rgba(214, 174, 106, 0.11)");
      glow.addColorStop(0.5, "rgba(92, 112, 148, 0.05)");
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    /**
     * Renders ONE single continuous woven strap ribbon along the physics chain
     * with realistic thickness, edge lighting, and repeated LUMINICA branding.
     */
    _drawContinuousStrap() {
      const ctx = this.ctx;
      if (this.nodes.length < 2) return;

      const leftPts = [];
      const rightPts = [];
      const centers = [];

      for (let i = 0; i < this.nodes.length; i++) {
        const curr = this.nodes[i];
        const prev = this.nodes[Math.max(0, i - 1)];
        const next = this.nodes[Math.min(this.nodes.length - 1, i + 1)];

        const tx = next.x - prev.x;
        const ty = next.y - prev.y;
        const len = Math.hypot(tx, ty) || 1;
        // Normal perpendicular to tangent
        const nx = -ty / len;
        const ny = tx / len;

        // Slight perspective foreshortening along strap swing
        const halfW = this.strapWidth * 0.5;
        centers.push({ x: curr.x, y: curr.y, tx: tx / len, ty: ty / len, nx, ny });
        leftPts.push({ x: curr.x + nx * halfW, y: curr.y + ny * halfW });
        rightPts.push({ x: curr.x - nx * halfW, y: curr.y - ny * halfW });
      }

      // Drop shadow under continuous strap
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(leftPts[0].x + 6, leftPts[0].y + 10);
      for (let i = 1; i < leftPts.length; i++) {
        ctx.lineTo(leftPts[i].x + 6, leftPts[i].y + 10);
      }
      for (let i = rightPts.length - 1; i >= 0; i--) {
        ctx.lineTo(rightPts[i].x + 6, rightPts[i].y + 10);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
      ctx.filter = "blur(8px)";
      ctx.fill();
      ctx.restore();

      // Main continuous strap body with woven pattern
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(leftPts[0].x, leftPts[0].y);
      for (let i = 1; i < leftPts.length; i++) {
        ctx.lineTo(leftPts[i].x, leftPts[i].y);
      }
      for (let i = rightPts.length - 1; i >= 0; i--) {
        ctx.lineTo(rightPts[i].x, rightPts[i].y);
      }
      ctx.closePath();

      ctx.fillStyle = this.strapPattern || PALETTE.strapBase;
      ctx.fill();

      // Clip to strap ribbon for edge trim & curved LUMINICA branding
      ctx.clip();

      // Champagne gold & brushed titanium trim along left/right strap edges
      ctx.strokeStyle = PALETTE.goldMid;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      leftPts.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();

      ctx.strokeStyle = PALETTE.titaniumLight;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      rightPts.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();

      // Render LUMINICA branding aligned along the strap centerline
      this._drawCurvedStrapBranding(centers);

      ctx.restore();
    }

    _drawCurvedStrapBranding(centers) {
      const ctx = this.ctx;
      // Compute cumulative arc length along strap
      const arcDist = [0];
      for (let i = 1; i < centers.length; i++) {
        const d = Math.hypot(
          centers[i].x - centers[i - 1].x,
          centers[i].y - centers[i - 1].y
        );
        arcDist.push(arcDist[i - 1] + d);
      }
      const totalLen = arcDist[arcDist.length - 1];
      if (totalLen < 40) return;

      const label = "L U M I N I C A";
      const spacing = 92;
      const fontSize = clamp(Math.round(this.strapWidth * 0.34), 9, 13);

      ctx.save();
      ctx.font = `700 ${fontSize}px 'Inter', 'Segoe UI', system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (let dist = 48; dist < totalLen - 26; dist += spacing) {
        // Find segment containing `dist`
        let idx = 0;
        while (idx < arcDist.length - 2 && arcDist[idx + 1] < dist) {
          idx++;
        }
        const segLen = Math.max(0.001, arcDist[idx + 1] - arcDist[idx]);
        const t = clamp((dist - arcDist[idx]) / segLen, 0, 1);

        const cA = centers[idx];
        const cB = centers[idx + 1];
        const px = lerp(cA.x, cB.x, t);
        const py = lerp(cA.y, cB.y, t);
        const tx = lerp(cA.tx, cB.tx, t);
        const ty = lerp(cA.ty, cB.ty, t);
        const angle = Math.atan2(ty, tx);

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(angle);

        // Subtle recessed weave shadow + champagne gold embossed typography
        ctx.fillStyle = PALETTE.brandShadow;
        ctx.fillText(label, 0.8, 1.0);
        ctx.fillStyle = "rgba(241, 212, 156, 0.72)";
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
      ctx.restore();
    }

    _drawMetallicHardware() {
      const ctx = this.ctx;
      const anchor = this.nodes[0];
      const tail = this.nodes[this.nodes.length - 1];
      const prev = this.nodes[this.nodes.length - 2];

      // 1. Top ceiling/neck anchor mount (Brushed Titanium & Champagne Gold)
      ctx.save();
      ctx.translate(anchor.x, anchor.y - 6);
      const topGrad = ctx.createLinearGradient(-26, -10, 26, 12);
      topGrad.addColorStop(0, PALETTE.titaniumDark);
      topGrad.addColorStop(0.35, PALETTE.titaniumLight);
      topGrad.addColorStop(0.65, PALETTE.goldMid);
      topGrad.addColorStop(1, PALETTE.titaniumDark);

      ctx.fillStyle = topGrad;
      ctx.strokeStyle = PALETTE.goldLight;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(-24, -10, 48, 18, 6);
      ctx.fill();
      ctx.stroke();

      // Center precision screw accent
      ctx.fillStyle = "#12151d";
      ctx.beginPath();
      ctx.arc(0, -1, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 2. Lower Strap-to-Card Metallic Clasp, Split Ring & Clip Assembly
      const slopeAngle = Math.atan2(tail.x - prev.x, Math.max(4, tail.y - prev.y));
      ctx.save();
      ctx.translate(tail.x, tail.y);
      ctx.rotate(-slopeAngle);

      // Strap end-crimp collar (Champagne Gold)
      const collarGrad = ctx.createLinearGradient(-22, -6, 22, 10);
      collarGrad.addColorStop(0, PALETTE.goldDark);
      collarGrad.addColorStop(0.3, PALETTE.goldLight);
      collarGrad.addColorStop(0.6, PALETTE.goldMid);
      collarGrad.addColorStop(1, PALETTE.goldDark);

      ctx.fillStyle = collarGrad;
      ctx.beginPath();
      ctx.roundRect(-20, -6, 40, 14, 4);
      ctx.fill();

      // Swivel barrel housing (Brushed Titanium)
      const barrelGrad = ctx.createLinearGradient(-10, 8, 10, 24);
      barrelGrad.addColorStop(0, PALETTE.titaniumDark);
      barrelGrad.addColorStop(0.45, PALETTE.titaniumLight);
      barrelGrad.addColorStop(1, PALETTE.titaniumDark);

      ctx.fillStyle = barrelGrad;
      ctx.beginPath();
      ctx.roundRect(-8, 8, 16, 15, 3);
      ctx.fill();

      // Split ring (Champagne Gold)
      ctx.strokeStyle = PALETTE.goldLight;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(0, 30, 8.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = PALETTE.goldDark;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 30, 10.2, 0, Math.PI * 2);
      ctx.stroke();

      // Card jaw / clip connecting ring into top slot of ID card
      const clipGrad = ctx.createLinearGradient(-11, 38, 11, 56);
      clipGrad.addColorStop(0, PALETTE.goldMid);
      clipGrad.addColorStop(0.5, PALETTE.goldLight);
      clipGrad.addColorStop(1, PALETTE.goldDark);

      ctx.fillStyle = clipGrad;
      ctx.beginPath();
      ctx.roundRect(-9, 38, 18, 16, 4);
      ctx.fill();

      ctx.restore();
    }

    _drawIdCard() {
      const ctx = this.ctx;
      const hw = this.cardWidth * 0.5;
      const hh = this.cardHeight * 0.5;
      const radius = 14;

      // Cosine of flipAngle controls horizontal perspective width & which face is visible
      const cosFlip = Math.cos(this.flipAngle);
      const scaleX = Math.max(0.03, Math.abs(cosFlip));
      const showBack = cosFlip < 0;

      ctx.save();
      ctx.translate(this.cardX, this.cardY);
      ctx.rotate(this.cardAngle);

      // Card drop shadow
      ctx.save();
      ctx.translate(8, 14);
      ctx.scale(scaleX, 1);
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.filter = "blur(14px)";
      ctx.beginPath();
      ctx.roundRect(-hw, -hh, this.cardWidth, this.cardHeight, radius);
      ctx.fill();
      ctx.restore();

      // Apply 2.5D horizontal flip scale
      ctx.scale(scaleX, 1);

      // Card outer metallic/chamfered frame
      ctx.beginPath();
      ctx.roundRect(-hw, -hh, this.cardWidth, this.cardHeight, radius);
      ctx.fillStyle = "#141720";
      ctx.fill();

      // Clip inside rounded card face
      ctx.save();
      ctx.clip();

      const img = showBack ? this.backImg : this.frontImg;
      const loaded = showBack ? this.backLoaded : this.frontLoaded;

      if (loaded && img.naturalWidth > 0 && img.naturalHeight > 0) {
        // Fit image cleanly preserving aspect ratio without cropping/distorting
        const imgAspect = img.naturalWidth / img.naturalHeight;
        const boxAspect = this.cardWidth / this.cardHeight;

        let drawW = this.cardWidth;
        let drawH = this.cardHeight;
        if (imgAspect > boxAspect) {
          drawH = this.cardWidth / imgAspect;
        } else {
          drawW = this.cardHeight * imgAspect;
        }

        ctx.fillStyle = "#0e1118";
        ctx.fillRect(-hw, -hh, this.cardWidth, this.cardHeight);
        ctx.drawImage(img, -drawW * 0.5, -drawH * 0.5, drawW, drawH);
      } else {
        // Clean placeholder while original asset loads
        ctx.fillStyle = "#181d29";
        ctx.fillRect(-hw, -hh, this.cardWidth, this.cardHeight);
        ctx.fillStyle = PALETTE.goldLight;
        ctx.font = "600 13px 'Inter', system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("LUMINICA ID", 0, -6);
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.font = "400 11px 'Inter', system-ui, sans-serif";
        ctx.fillText(showBack ? "Loading back..." : "Loading front...", 0, 14);
      }

      // Subtle glass/metallic sheen across card surface
      const sheen = ctx.createLinearGradient(-hw, -hh, hw, hh);
      sheen.addColorStop(0, "rgba(255, 246, 224, 0.14)");
      sheen.addColorStop(0.45, "rgba(255, 255, 255, 0.02)");
      sheen.addColorStop(1, "rgba(10, 12, 18, 0.22)");
      ctx.fillStyle = sheen;
      ctx.fillRect(-hw, -hh, this.cardWidth, this.cardHeight);

      ctx.restore();

      // Precision champagne-gold & brushed edge border
      ctx.strokeStyle = "rgba(225, 190, 124, 0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-hw + 0.5, -hh + 0.5, this.cardWidth - 1, this.cardHeight - 1, radius);
      ctx.stroke();

      // Top slot punch cutout
      ctx.fillStyle = "#090b10";
      ctx.beginPath();
      ctx.roundRect(-22, -hh + 10, 44, 7, 3.5);
      ctx.fill();
      ctx.strokeStyle = PALETTE.goldMid;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();
    }

    render() {
      this._drawBackground();
      this._drawContinuousStrap();
      this._drawMetallicHardware();
      this._drawIdCard();
    }

    start() {
      const tick = (now) => {
        const rawDt = (now - this.lastFrameTime) / 1000;
        this.lastFrameTime = now;
        const dt = clamp(rawDt, 0.001, 0.033);
        this.elapsed += dt;

        this._stepPhysics(dt);
        this.render();

        this.rafId = requestAnimationFrame(tick);
      };
      this.rafId = requestAnimationFrame(tick);
    }
  }

  function initLuminicaLanyard() {
    const mountEl =
      document.getElementById("luminica-lanyard-root") ||
      document.querySelector("[data-luminica-lanyard]") ||
      document.body;
    if (window.__luminicaLanyardInstance) {
      window.__luminicaLanyardInstance.destroy();
    }
    window.__luminicaLanyardInstance = new LuminicaLanyardApp(mountEl);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLuminicaLanyard);
  } else {
    initLuminicaLanyard();
  }

  window.LuminicaLanyardApp = LuminicaLanyardApp;
  window.initLuminicaLanyard = initLuminicaLanyard;
})();
