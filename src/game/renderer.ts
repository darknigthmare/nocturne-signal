/**
 * Canvas renderer for NOCTURNE SIGNAL's five-lane rhythm highway.
 *
 * The module owns no gameplay state: a React component can keep one renderer in
 * a ref and submit an immutable {@link RendererFrame} whenever the game clock
 * advances.  It can also let the renderer own `requestAnimationFrame` through
 * {@link NocturneSignalRenderer.start}.
 */

export const NOCTURNE_LANE_COUNT = 5 as const;

export type NoteKind = "tap" | "hold" | "pulse";
export type NoteStatus = "pending" | "holding" | "hit" | "missed";
export type JudgementGrade = "perfect" | "great" | "good" | "miss";
export type JudgementEffect = JudgementGrade | "feedback";
export type LaneSymbol = "triangle" | "split" | "eye" | "diamond" | "cross";

export interface LanePalette {
  color: string;
  glow: string;
  symbol: LaneSymbol;
}

export interface RendererPalette {
  background: string;
  backgroundGlow: string;
  road: string;
  roadAlternate: string;
  grid: string;
  rail: string;
  hitLine: string;
  fog: string;
  danger: string;
  ink: string;
  text: string;
  feedback: string;
  lanes: readonly LanePalette[];
}

export type PaletteOverride = Partial<Omit<RendererPalette, "lanes">> & {
  lanes?: readonly Partial<LanePalette>[];
};

/** Compact chapter palette: primary signal, danger accent, deep background. */
export type ChapterPalette = readonly [string, string, string];
export type PaletteInput = PaletteOverride | ChapterPalette;

/**
 * Visual note accepted by the renderer. `time`/`duration` and `type` are
 * aliases for engines that do not use the `*Ms`/`kind` naming convention.
 */
export interface RenderNote {
  id?: string;
  lane: number;
  timeMs?: number;
  time?: number;
  durationMs?: number;
  duration?: number;
  kind?: NoteKind;
  type?: NoteKind;
  chordId?: string | null;
  accent?: boolean;
  status?: NoteStatus;
  hit?: boolean;
  missed?: boolean;
  visible?: boolean;
  opacity?: number;
}

export interface JudgementVisual {
  grade: JudgementEffect;
  /** Song-clock timestamp at which the judgement happened. */
  atMs?: number;
  /** Alias used by the gameplay runtime. */
  startedAtMs?: number;
  lane?: number;
  text?: string;
  offsetMs?: number | null;
}

export interface FeedbackVisual {
  /** Meter charge, clamped to 0..100. */
  value: number;
  active?: boolean;
  activatedAtMs?: number;
  activeUntilMs?: number;
  label?: string;
}

/** All values needed to paint one frame; no React object is retained. */
export interface RendererFrame {
  /** Current song clock. `time` is accepted as an alias. */
  timeMs?: number;
  time?: number;
  songTimeMs?: number;
  nowMs?: number;
  durationMs?: number;
  duration?: number;
  bpm?: number;
  notes: readonly RenderNote[];
  health?: number;
  lucidity?: number;
  maxLucidity?: number;
  threat?: number;
  feedback?: number | FeedbackVisual;
  feedbackActive?: boolean;
  feedbackActivatedAtMs?: number;
  feedbackActiveUntilMs?: number;
  combo?: number;
  pressedLanes?: readonly (boolean | number)[] | ReadonlySet<number>;
  lanePressures?: readonly (boolean | number)[];
  /** Optional 0..1 pulse. When omitted it is derived from song time and BPM. */
  beatPulse?: number;
  /** A monotonic visual clock, useful when the song clock is paused. */
  visualTimeMs?: number;
  judgement?: JudgementGrade | JudgementVisual | null;
  reducedMotion?: boolean;
  highContrast?: boolean;
  palette?: PaletteInput;
  multiplier?: number;
  paused?: boolean;
}

export interface RendererOptions {
  /** Time taken by a note to travel from the horizon to the strike line. */
  travelTimeMs?: number;
  /** Clamp supersampling cost on very dense displays. Default: 2. */
  maxDpr?: number;
  /** Explicit DPR for screenshots/tests. */
  dpr?: number;
  autoResize?: boolean;
  reducedMotion?: boolean;
  highContrast?: boolean;
  /** Scales the procedural dust count; 0 disables dust. */
  particleDensity?: number;
  palette?: PaletteInput;
  /** Global note-head scale. Default: 1. */
  noteScale?: number;
}

export type RendererFrameProvider = (animationTimeMs: number) => RendererFrame;

export interface RendererController {
  render(frame: RendererFrame): void;
  resize(width?: number, height?: number): void;
  setOptions(options: Partial<RendererOptions>): void;
  start(provider: RendererFrameProvider): void;
  stop(): void;
  destroy(): void;
}

/** Compatibility name used by the React gameplay surface. */
export type GameRenderer = RendererController;

/** Runtime judgement payload accepted without adaptation. */
export type JudgementBurst = JudgementVisual;

const DEFAULT_LANES: readonly LanePalette[] = Object.freeze([
  Object.freeze({ color: "#4be7ee", glow: "#8cffff", symbol: "triangle" as const }),
  Object.freeze({ color: "#a8e85a", glow: "#dcff8f", symbol: "split" as const }),
  Object.freeze({ color: "#f2ca68", glow: "#fff0a3", symbol: "eye" as const }),
  Object.freeze({ color: "#d86ee5", glow: "#f5a0ff", symbol: "diamond" as const }),
  Object.freeze({ color: "#ed5365", glow: "#ff92a0", symbol: "cross" as const }),
]);

export const DEFAULT_NOCTURNE_PALETTE: Readonly<RendererPalette> = Object.freeze({
  background: "#030408",
  backgroundGlow: "#101427",
  road: "#090c14",
  roadAlternate: "#0d111c",
  grid: "#455266",
  rail: "#8799ac",
  hitLine: "#eef7f4",
  fog: "#a8bbc1",
  danger: "#e33a4f",
  ink: "#020205",
  text: "#f4f1e9",
  feedback: "#66f3d2",
  lanes: DEFAULT_LANES,
});

const HIGH_CONTRAST_PATCH: PaletteOverride = Object.freeze({
  background: "#000000",
  backgroundGlow: "#111827",
  road: "#030303",
  roadAlternate: "#101010",
  grid: "#a7b1bf",
  rail: "#ffffff",
  hitLine: "#ffffff",
  fog: "#d9edf0",
  danger: "#ff2646",
  text: "#ffffff",
  feedback: "#4dffd5",
  lanes: Object.freeze([
    Object.freeze({ color: "#00f5ff", glow: "#b8fdff" }),
    Object.freeze({ color: "#b6ff00", glow: "#ecffb8" }),
    Object.freeze({ color: "#ffd000", glow: "#fff3a8" }),
    Object.freeze({ color: "#f36cff", glow: "#ffd0ff" }),
    Object.freeze({ color: "#ff3757", glow: "#ffc2cc" }),
  ]),
});

const DEFAULT_OPTIONS: Required<
  Pick<RendererOptions, "travelTimeMs" | "maxDpr" | "autoResize" | "particleDensity">
> = Object.freeze({
  travelTimeMs: 2_150,
  maxDpr: 2,
  autoResize: true,
  particleDensity: 1,
});

const TAU = Math.PI * 2;

interface Layout {
  width: number;
  height: number;
  centerX: number;
  horizonY: number;
  hitY: number;
  bottomY: number;
  horizonHalfWidth: number;
  hitHalfWidth: number;
  bottomHalfWidth: number;
  compact: boolean;
}

interface Point {
  x: number;
  y: number;
  halfWidth: number;
  laneWidth: number;
  scale: number;
}

interface VisibleNote {
  note: RenderNote;
  lane: number;
  kind: NoteKind;
  status: NoteStatus;
  timeMs: number;
  durationMs: number;
  progress: number;
  tailProgress: number;
  alpha: number;
  point: Point;
  tailPoint: Point;
}

interface DustParticle {
  x: number;
  y: number;
  depth: number;
  speed: number;
  size: number;
  phase: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = clamp((value - edge0) / (edge1 - edge0 || 1), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const safeRadius = Math.min(Math.abs(width) / 2, Math.abs(height) / 2, Math.max(0, radius));
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function rgba(hex: string, alpha: number): string {
  const normalized = hex.trim();
  const short = /^#([\da-f])([\da-f])([\da-f])$/i.exec(normalized);
  if (short) {
    const red = Number.parseInt(short[1] + short[1], 16);
    const green = Number.parseInt(short[2] + short[2], 16);
    const blue = Number.parseInt(short[3] + short[3], 16);
    return `rgba(${red}, ${green}, ${blue}, ${clamp(alpha, 0, 1)})`;
  }
  const full = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(normalized);
  if (full) {
    return `rgba(${Number.parseInt(full[1], 16)}, ${Number.parseInt(full[2], 16)}, ${Number.parseInt(full[3], 16)}, ${clamp(alpha, 0, 1)})`;
  }
  return normalized;
}

function isChapterPalette(value: PaletteInput): value is ChapterPalette {
  return Array.isArray(value);
}

function isLaneSet(
  value: RendererFrame["pressedLanes"],
): value is ReadonlySet<number> {
  return value !== undefined && typeof (value as ReadonlySet<number>).has === "function";
}

function mergePalette(
  base: RendererPalette,
  ...overrides: (PaletteInput | undefined)[]
): RendererPalette {
  let result: RendererPalette = {
    ...base,
    lanes: base.lanes.map((lane) => ({ ...lane })),
  };
  for (const override of overrides) {
    if (!override) continue;
    if (isChapterPalette(override)) {
      const [signal, danger, background] = override;
      result = {
        ...result,
        background,
        backgroundGlow: background,
        danger,
        feedback: signal,
        rail: signal,
        lanes: result.lanes.map((lane, index) => ({
          ...lane,
          color: index === 4 ? danger : index === 2 ? signal : lane.color,
          glow: index === 4 ? danger : index === 2 ? signal : lane.glow,
        })),
      };
      continue;
    }
    const { lanes, ...colors } = override;
    result = {
      ...result,
      ...colors,
      lanes: result.lanes.map((lane, index) => ({ ...lane, ...lanes?.[index] })),
    };
  }
  return result;
}

function getNoteTime(note: RenderNote): number {
  return finite(note.timeMs, finite(note.time, Number.NaN));
}

function getNoteDuration(note: RenderNote): number {
  return Math.max(0, finite(note.durationMs, finite(note.duration, 0)));
}

function getNoteKind(note: RenderNote): NoteKind {
  if (note.kind === "hold" || note.type === "hold" || getNoteDuration(note) > 0) return "hold";
  if (note.kind === "pulse" || note.type === "pulse" || note.accent) return "pulse";
  return "tap";
}

function getNoteStatus(note: RenderNote): NoteStatus {
  if (note.status) return note.status;
  if (note.missed) return "missed";
  if (note.hit) return "hit";
  return "pending";
}

function getFrameTime(frame: RendererFrame): number {
  return finite(frame.songTimeMs, finite(frame.timeMs, finite(frame.time, 0)));
}

function pressureAt(frame: RendererFrame, lane: number): number {
  if (isLaneSet(frame.pressedLanes)) return frame.pressedLanes.has(lane) ? 1 : 0;
  const pressed = frame.pressedLanes as readonly (boolean | number)[] | undefined;
  const value = frame.lanePressures?.[lane] ?? pressed?.[lane] ?? 0;
  return typeof value === "boolean" ? (value ? 1 : 0) : clamp(finite(value), 0, 1);
}

function percentValue(value: unknown): number {
  const amount = finite(value);
  return clamp(amount >= 0 && amount <= 1 ? amount * 100 : amount, 0, 100);
}

function project(layout: Layout, lane: number, progress: number, centerOffset = 0): Point {
  let y: number;
  let halfWidth: number;
  let scale: number;
  if (progress <= 1) {
    const depth = Math.pow(clamp(progress, 0, 1), 1.58);
    y = lerp(layout.horizonY, layout.hitY, depth);
    halfWidth = lerp(layout.horizonHalfWidth, layout.hitHalfWidth, Math.pow(depth, 0.82));
    scale = lerp(0.17, 1, Math.pow(depth, 0.8));
  } else {
    const overshoot = clamp((progress - 1) / 0.2, 0, 1);
    y = lerp(layout.hitY, layout.bottomY, overshoot);
    halfWidth = lerp(layout.hitHalfWidth, layout.bottomHalfWidth, overshoot);
    scale = lerp(1, 1.18, overshoot);
  }
  const laneWidth = (halfWidth * 2) / NOCTURNE_LANE_COUNT;
  const lanePosition = clamp(lane, 0, NOCTURNE_LANE_COUNT - 1) - 2;
  return {
    x: layout.centerX + centerOffset + lanePosition * laneWidth,
    y,
    halfWidth,
    laneWidth,
    scale,
  };
}

function boundaryX(layout: Layout, boundary: number, progress: number): number {
  const point = project(layout, 2, progress);
  return layout.centerX + (boundary - NOCTURNE_LANE_COUNT / 2) * point.laneWidth;
}

function drawSymbol(
  context: CanvasRenderingContext2D,
  symbol: LaneSymbol,
  x: number,
  y: number,
  radius: number,
  color: string,
  lineWidth: number,
): void {
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = Math.max(1, lineWidth);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  if (symbol === "triangle") {
    context.moveTo(x, y - radius * 0.62);
    context.lineTo(x + radius * 0.62, y + radius * 0.48);
    context.lineTo(x - radius * 0.62, y + radius * 0.48);
    context.closePath();
    context.stroke();
    context.beginPath();
    context.moveTo(x, y - radius * 0.24);
    context.lineTo(x, y + radius * 0.28);
    context.stroke();
  } else if (symbol === "split") {
    context.rect(x - radius * 0.56, y - radius * 0.5, radius * 1.12, radius);
    context.stroke();
    context.beginPath();
    context.moveTo(x, y - radius * 0.5);
    context.lineTo(x, y + radius * 0.5);
    context.stroke();
  } else if (symbol === "eye") {
    context.ellipse(x, y, radius * 0.7, radius * 0.42, 0, 0, TAU);
    context.stroke();
    context.beginPath();
    context.arc(x, y, radius * 0.16, 0, TAU);
    context.fill();
  } else if (symbol === "diamond") {
    context.moveTo(x, y - radius * 0.66);
    context.lineTo(x + radius * 0.56, y);
    context.lineTo(x, y + radius * 0.66);
    context.lineTo(x - radius * 0.56, y);
    context.closePath();
    context.stroke();
    context.beginPath();
    context.moveTo(x - radius * 0.24, y);
    context.lineTo(x + radius * 0.24, y);
    context.stroke();
  } else {
    context.moveTo(x - radius * 0.5, y - radius * 0.5);
    context.lineTo(x + radius * 0.5, y + radius * 0.5);
    context.moveTo(x + radius * 0.5, y - radius * 0.5);
    context.lineTo(x - radius * 0.5, y + radius * 0.5);
    context.stroke();
    context.beginPath();
    context.arc(x, y, radius * 0.68, 0, TAU);
    context.stroke();
  }
  context.restore();
}

/**
 * Stateful drawing surface. It stores only resize/particle/RAF resources; all
 * score, timing and note state remains in the submitted frame.
 */
export class NocturneSignalRenderer implements RendererController {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private options: RendererOptions;
  private layout: Layout;
  private dpr = 1;
  private resizeObserver: ResizeObserver | null = null;
  private mediaQuery: MediaQueryList | null = null;
  private motionPreferenceListener: ((event: MediaQueryListEvent) => void) | null = null;
  private systemReducedMotion = false;
  private rafId: number | null = null;
  private provider: RendererFrameProvider | null = null;
  private particles: DustParticle[] = [];
  private lastVisualTimeMs = 0;
  private grainPattern: CanvasPattern | null = null;
  private scanlinePattern: CanvasPattern | null = null;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement, options: RendererOptions = {}) {
    const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!context) throw new Error("NOCTURNE SIGNAL requires a Canvas 2D context.");
    this.canvas = canvas;
    this.context = context;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.layout = this.makeLayout(1, 1);

    const view = canvas.ownerDocument?.defaultView;
    if (view?.matchMedia) {
      this.mediaQuery = view.matchMedia("(prefers-reduced-motion: reduce)");
      this.systemReducedMotion = this.mediaQuery.matches;
      const onMotionPreference = (event: MediaQueryListEvent): void => {
        this.systemReducedMotion = event.matches;
      };
      this.motionPreferenceListener = onMotionPreference;
      this.mediaQuery.addEventListener?.("change", onMotionPreference);
    }

    this.resize();
    this.createTexturePatterns();

    if (this.options.autoResize !== false && typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) this.resize(entry.contentRect.width, entry.contentRect.height);
      });
      this.resizeObserver.observe(canvas);
    }
  }

  /** Draw one complete frame immediately. Safe to call from a React effect. */
  render(frame: RendererFrame): void {
    if (this.destroyed) return;
    this.ensureResolution();

    const width = this.layout.width;
    const height = this.layout.height;
    if (width <= 1 || height <= 1) return;

    const context = this.context;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    context.imageSmoothingEnabled = true;

    const timeMs = getFrameTime(frame);
    const visualTimeMs = finite(frame.visualTimeMs, finite(frame.nowMs, timeMs));
    const reducedMotion = frame.reducedMotion ?? this.options.reducedMotion ?? this.systemReducedMotion;
    const highContrast = frame.highContrast ?? this.options.highContrast ?? false;
    const palette = mergePalette(
      DEFAULT_NOCTURNE_PALETTE,
      this.options.palette,
      frame.palette,
      highContrast ? HIGH_CONTRAST_PATCH : undefined,
    );
    const threat = percentValue(frame.threat);
    const rawHealth = finite(frame.lucidity, finite(frame.health, 1));
    const healthMaximum = frame.maxLucidity === undefined
      ? rawHealth >= 0 && rawHealth <= 1 ? 1 : 100
      : Math.max(1, finite(frame.maxLucidity, 100));
    const health = clamp(rawHealth / healthMaximum, 0, 1);
    const bpm = clamp(finite(frame.bpm, 120), 20, 360);
    const beatPulse = frame.beatPulse === undefined
      ? this.deriveBeatPulse(timeMs, bpm, reducedMotion)
      : clamp(finite(frame.beatPulse), 0, 1);

    this.updateParticles(visualTimeMs, reducedMotion);
    this.drawBackdrop(context, palette, visualTimeMs, threat, beatPulse, reducedMotion);
    this.drawThreat(context, palette, visualTimeMs, threat, beatPulse, reducedMotion);
    this.drawRearFog(context, palette, visualTimeMs, threat, reducedMotion);
    this.drawHighway(context, palette, timeMs, bpm, beatPulse, highContrast);
    this.drawDust(context, palette, visualTimeMs, threat, reducedMotion);

    const visibleNotes = this.collectVisibleNotes(frame, timeMs);
    this.drawHolds(context, visibleNotes, palette, highContrast);
    this.drawChordConnectors(context, visibleNotes, palette, beatPulse, highContrast);
    this.drawNotes(context, visibleNotes, palette, visualTimeMs, beatPulse, reducedMotion, highContrast);
    this.drawStrikeLine(context, frame, palette, visualTimeMs, beatPulse, reducedMotion, highContrast);
    this.drawFeedback(context, frame, palette, timeMs, visualTimeMs, reducedMotion, highContrast);
    this.drawJudgement(context, frame, palette, timeMs, reducedMotion, highContrast);
    this.drawFrontAtmosphere(context, palette, visualTimeMs, threat, health, reducedMotion);
    this.drawPostEffects(context, palette, threat, health, beatPulse, reducedMotion, highContrast);

    context.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Resize using CSS pixels. Omit dimensions to read the canvas box. */
  resize(width?: number, height?: number): void {
    if (this.destroyed) return;
    const box = this.canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.round(finite(width, this.canvas.clientWidth || box.width || 960)));
    const cssHeight = Math.max(1, Math.round(finite(height, this.canvas.clientHeight || box.height || 540)));
    const nextDpr = this.resolveDpr();
    const pixelWidth = Math.max(1, Math.round(cssWidth * nextDpr));
    const pixelHeight = Math.max(1, Math.round(cssHeight * nextDpr));
    if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth;
    if (this.canvas.height !== pixelHeight) this.canvas.height = pixelHeight;
    this.dpr = nextDpr;
    this.layout = this.makeLayout(cssWidth, cssHeight);
    this.resetParticles();
    this.createTexturePatterns();
  }

  /** Update visual settings without reconstructing the renderer. */
  setOptions(options: Partial<RendererOptions>): void {
    if (this.destroyed) return;
    const previousAutoResize = this.options.autoResize;
    this.options = { ...this.options, ...options };
    if (options.dpr !== undefined || options.maxDpr !== undefined || options.particleDensity !== undefined) {
      this.resize();
    }
    if (previousAutoResize !== this.options.autoResize) {
      if (this.options.autoResize === false) {
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
      } else if (!this.resizeObserver && typeof ResizeObserver !== "undefined") {
        this.resizeObserver = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry) this.resize(entry.contentRect.width, entry.contentRect.height);
        });
        this.resizeObserver.observe(this.canvas);
      }
    }
  }

  /** Start an internal RAF loop. Calling it again replaces the frame provider. */
  start(provider: RendererFrameProvider): void {
    if (this.destroyed) return;
    this.provider = provider;
    if (this.rafId !== null) return;
    const view = this.canvas.ownerDocument?.defaultView;
    if (!view) return;
    const tick = (animationTimeMs: number): void => {
      if (this.destroyed || !this.provider) {
        this.rafId = null;
        return;
      }
      this.render(this.provider(animationTimeMs));
      this.rafId = view.requestAnimationFrame(tick);
    };
    this.rafId = view.requestAnimationFrame(tick);
  }

  stop(): void {
    const view = this.canvas.ownerDocument?.defaultView;
    if (this.rafId !== null && view) view.cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.provider = null;
  }

  /** Release RAF and ResizeObserver resources (call from React effect cleanup). */
  destroy(): void {
    if (this.destroyed) return;
    this.stop();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.mediaQuery && this.motionPreferenceListener) {
      this.mediaQuery.removeEventListener?.("change", this.motionPreferenceListener);
    }
    this.motionPreferenceListener = null;
    this.mediaQuery = null;
    this.destroyed = true;
    this.particles.length = 0;
    this.grainPattern = null;
    this.scanlinePattern = null;
  }

  private makeLayout(width: number, height: number): Layout {
    const compact = width < 620 || height < 420;
    const bottomHalfWidth = Math.min(width * (compact ? 0.52 : 0.48), height * 0.86);
    const hitHalfWidth = bottomHalfWidth * 0.91;
    return {
      width,
      height,
      centerX: width / 2,
      horizonY: height * (compact ? 0.16 : 0.13),
      hitY: height * (compact ? 0.82 : 0.84),
      bottomY: height * 1.02,
      horizonHalfWidth: Math.max(24, bottomHalfWidth * 0.12),
      hitHalfWidth,
      bottomHalfWidth,
      compact,
    };
  }

  private resolveDpr(): number {
    const viewDpr = this.canvas.ownerDocument?.defaultView?.devicePixelRatio ?? 1;
    const requested = finite(this.options.dpr, viewDpr);
    return clamp(requested, 0.75, Math.max(0.75, finite(this.options.maxDpr, DEFAULT_OPTIONS.maxDpr)));
  }

  private ensureResolution(): void {
    const width = Math.max(1, Math.round(this.canvas.clientWidth || this.layout.width));
    const height = Math.max(1, Math.round(this.canvas.clientHeight || this.layout.height));
    const dpr = this.resolveDpr();
    if (
      width !== this.layout.width ||
      height !== this.layout.height ||
      Math.abs(dpr - this.dpr) > 0.01 ||
      this.canvas.width !== Math.round(width * dpr) ||
      this.canvas.height !== Math.round(height * dpr)
    ) {
      this.resize(width, height);
    }
  }

  private deriveBeatPulse(timeMs: number, bpm: number, reducedMotion: boolean): number {
    const beatMs = 60_000 / bpm;
    const phase = ((timeMs % beatMs) + beatMs) % beatMs / beatMs;
    const pulse = Math.exp(-phase * (reducedMotion ? 9 : 6.2));
    return reducedMotion ? pulse * 0.3 : pulse;
  }

  private createTexturePatterns(): void {
    const document = this.canvas.ownerDocument;
    if (!document) return;

    const scanlines = document.createElement("canvas");
    scanlines.width = 4;
    scanlines.height = 4;
    const scanContext = scanlines.getContext("2d");
    if (scanContext) {
      scanContext.clearRect(0, 0, 4, 4);
      scanContext.fillStyle = "rgba(0, 0, 0, 0.32)";
      scanContext.fillRect(0, 2, 4, 1);
      this.scanlinePattern = this.context.createPattern(scanlines, "repeat");
    }

    const grain = document.createElement("canvas");
    grain.width = 64;
    grain.height = 64;
    const grainContext = grain.getContext("2d");
    if (grainContext) {
      const image = grainContext.createImageData(64, 64);
      let seed = 0x87c4a2d1;
      for (let index = 0; index < image.data.length; index += 4) {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        const value = seed & 0xff;
        image.data[index] = value;
        image.data[index + 1] = value;
        image.data[index + 2] = value;
        image.data[index + 3] = 22;
      }
      grainContext.putImageData(image, 0, 0);
      this.grainPattern = this.context.createPattern(grain, "repeat");
    }
  }

  private resetParticles(): void {
    const areaScale = (this.layout.width * this.layout.height) / (1280 * 720);
    const count = Math.round(clamp(70 * areaScale * finite(this.options.particleDensity, 1), 0, 150));
    this.particles = [];
    let seed = 0x6d2b79f5 ^ this.canvas.width ^ (this.canvas.height << 8);
    const random = (): number => {
      seed += 0x6d2b79f5;
      let result = seed;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
    };
    for (let index = 0; index < count; index += 1) {
      this.particles.push({
        x: random(),
        y: random(),
        depth: random(),
        speed: 0.025 + random() * 0.08,
        size: 0.4 + random() * 1.8,
        phase: random() * TAU,
      });
    }
  }

  private updateParticles(visualTimeMs: number, reducedMotion: boolean): void {
    if (!this.lastVisualTimeMs) this.lastVisualTimeMs = visualTimeMs;
    const deltaSeconds = clamp((visualTimeMs - this.lastVisualTimeMs) / 1_000, 0, 0.05);
    this.lastVisualTimeMs = visualTimeMs;
    if (reducedMotion) return;
    for (const particle of this.particles) {
      particle.y += particle.speed * deltaSeconds * (0.35 + particle.depth);
      particle.x += Math.sin(visualTimeMs * 0.00018 + particle.phase) * deltaSeconds * 0.006;
      if (particle.y > 1.04) {
        particle.y = -0.04;
        particle.x = (particle.x * 1.731 + 0.173) % 1;
      }
    }
  }

  private drawBackdrop(
    context: CanvasRenderingContext2D,
    palette: RendererPalette,
    visualTimeMs: number,
    threat: number,
    beatPulse: number,
    reducedMotion: boolean,
  ): void {
    const { width, height, centerX, horizonY } = this.layout;
    context.fillStyle = palette.background;
    context.fillRect(0, 0, width, height);

    const glowX = centerX + (reducedMotion ? 0 : Math.sin(visualTimeMs * 0.00017) * width * 0.035);
    const glow = context.createRadialGradient(glowX, horizonY, 0, glowX, horizonY, Math.max(width, height) * 0.72);
    glow.addColorStop(0, rgba(palette.backgroundGlow, 0.72 + beatPulse * 0.08));
    glow.addColorStop(0.42, rgba(palette.backgroundGlow, 0.22));
    glow.addColorStop(1, rgba(palette.background, 0));
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);

    const dangerStrength = threat / 100;
    if (dangerStrength > 0.2) {
      const dangerGlow = context.createRadialGradient(centerX, horizonY * 0.75, 0, centerX, horizonY, width * 0.55);
      dangerGlow.addColorStop(0, rgba(palette.danger, (dangerStrength - 0.2) * 0.18));
      dangerGlow.addColorStop(1, rgba(palette.danger, 0));
      context.fillStyle = dangerGlow;
      context.fillRect(0, 0, width, height * 0.75);
    }

    context.save();
    context.globalAlpha = 0.14;
    context.strokeStyle = palette.grid;
    context.lineWidth = 1;
    for (let index = 0; index < 8; index += 1) {
      const y = horizonY * (0.24 + index * 0.105);
      const offset = Math.sin(index * 2.7 + visualTimeMs * 0.0001) * width * 0.025;
      context.beginPath();
      context.moveTo(0, y + offset * 0.04);
      context.bezierCurveTo(width * 0.25, y - 8, width * 0.7, y + 10, width, y - offset * 0.03);
      context.stroke();
    }
    context.restore();
  }

  private drawThreat(
    context: CanvasRenderingContext2D,
    palette: RendererPalette,
    visualTimeMs: number,
    threat: number,
    beatPulse: number,
    reducedMotion: boolean,
  ): void {
    const amount = smoothstep(4, 100, threat);
    if (amount <= 0.005) return;
    const { centerX, horizonY, width, height } = this.layout;
    const sway = reducedMotion ? 0 : Math.sin(visualTimeMs * 0.0007) * width * 0.012 * amount;
    const center = centerX + sway;
    const headRadius = height * lerp(0.035, 0.14, amount);
    const headY = horizonY - headRadius * lerp(0.35, 0.06, amount);
    const shoulderY = headY + headRadius * 1.2;
    const shoulderWidth = headRadius * lerp(2.2, 3.15, amount);

    context.save();
    const aura = context.createRadialGradient(center, headY, 0, center, headY, shoulderWidth * 1.65);
    aura.addColorStop(0, rgba(palette.danger, 0.1 * amount + beatPulse * 0.025));
    aura.addColorStop(0.42, rgba(palette.ink, 0.42 * amount));
    aura.addColorStop(1, rgba(palette.ink, 0));
    context.fillStyle = aura;
    context.fillRect(center - shoulderWidth * 1.8, 0, shoulderWidth * 3.6, horizonY * 2.2);

    context.globalAlpha = lerp(0.22, 0.88, amount);
    context.fillStyle = palette.ink;
    context.shadowColor = rgba(palette.danger, amount * 0.36);
    context.shadowBlur = headRadius * (0.25 + beatPulse * 0.12);
    context.beginPath();
    context.moveTo(center - shoulderWidth, horizonY * 1.28);
    context.quadraticCurveTo(center - shoulderWidth * 0.74, shoulderY, center - headRadius * 0.78, headY + headRadius * 0.54);
    context.bezierCurveTo(
      center - headRadius * 1.03,
      headY - headRadius * 0.25,
      center - headRadius * 0.7,
      headY - headRadius * 1.05,
      center,
      headY - headRadius * 1.12,
    );
    context.bezierCurveTo(
      center + headRadius * 0.72,
      headY - headRadius,
      center + headRadius * 1.02,
      headY - headRadius * 0.22,
      center + headRadius * 0.76,
      headY + headRadius * 0.58,
    );
    context.quadraticCurveTo(center + shoulderWidth * 0.76, shoulderY, center + shoulderWidth, horizonY * 1.28);
    context.closePath();
    context.fill();

    context.shadowBlur = 0;
    context.globalAlpha = amount * 0.36;
    context.strokeStyle = palette.ink;
    context.lineWidth = Math.max(2, headRadius * 0.1);
    context.lineCap = "round";
    for (let index = 0; index < 5; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const startX = center + side * headRadius * (0.4 + index * 0.24);
      const wave = reducedMotion ? 0 : Math.sin(visualTimeMs * 0.0005 + index * 1.7) * headRadius * 0.25;
      context.beginPath();
      context.moveTo(startX, shoulderY);
      context.bezierCurveTo(
        startX + side * headRadius + wave,
        shoulderY + headRadius * 0.55,
        center + side * shoulderWidth * 0.75 - wave,
        horizonY * 1.3,
        center + side * shoulderWidth * (0.9 + index * 0.04),
        horizonY * 1.52,
      );
      context.stroke();
    }

    if (amount > 0.4) {
      const eyeAlpha = smoothstep(0.4, 0.9, amount) * (0.58 + beatPulse * 0.32);
      const eyeY = headY - headRadius * 0.18;
      const eyeGap = headRadius * 0.34;
      context.globalAlpha = eyeAlpha;
      context.fillStyle = palette.danger;
      context.shadowColor = palette.danger;
      context.shadowBlur = 10 + headRadius * 0.2;
      context.beginPath();
      context.ellipse(center - eyeGap, eyeY, headRadius * 0.11, headRadius * 0.035, -0.12, 0, TAU);
      context.ellipse(center + eyeGap, eyeY, headRadius * 0.11, headRadius * 0.035, 0.12, 0, TAU);
      context.fill();
    }
    context.restore();
  }

  private drawRearFog(
    context: CanvasRenderingContext2D,
    palette: RendererPalette,
    visualTimeMs: number,
    threat: number,
    reducedMotion: boolean,
  ): void {
    const { width, height, horizonY } = this.layout;
    context.save();
    context.globalCompositeOperation = "screen";
    for (let layer = 0; layer < 3; layer += 1) {
      const drift = reducedMotion ? 0 : Math.sin(visualTimeMs * (0.00008 + layer * 0.000025) + layer * 2.1) * width * 0.16;
      const centerX = width * (0.22 + layer * 0.29) + drift;
      const centerY = horizonY * (0.82 + layer * 0.2);
      const radius = width * (0.24 + layer * 0.035);
      const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
      gradient.addColorStop(0, rgba(palette.fog, 0.065 + threat * 0.0002));
      gradient.addColorStop(0.48, rgba(palette.fog, 0.025));
      gradient.addColorStop(1, rgba(palette.fog, 0));
      context.fillStyle = gradient;
      context.fillRect(centerX - radius, 0, radius * 2, height * 0.55);
    }
    context.restore();
  }

  private drawHighway(
    context: CanvasRenderingContext2D,
    palette: RendererPalette,
    timeMs: number,
    bpm: number,
    beatPulse: number,
    highContrast: boolean,
  ): void {
    const { centerX, horizonY, bottomY, horizonHalfWidth, bottomHalfWidth } = this.layout;
    context.save();
    context.beginPath();
    context.moveTo(centerX - horizonHalfWidth, horizonY);
    context.lineTo(centerX + horizonHalfWidth, horizonY);
    context.lineTo(centerX + bottomHalfWidth, bottomY);
    context.lineTo(centerX - bottomHalfWidth, bottomY);
    context.closePath();
    const roadGradient = context.createLinearGradient(0, horizonY, 0, bottomY);
    roadGradient.addColorStop(0, rgba(palette.road, 0.72));
    roadGradient.addColorStop(0.45, palette.road);
    roadGradient.addColorStop(1, rgba(palette.roadAlternate, 0.98));
    context.fillStyle = roadGradient;
    context.fill();
    context.clip();

    for (let lane = 0; lane < NOCTURNE_LANE_COUNT; lane += 1) {
      context.beginPath();
      context.moveTo(boundaryX(this.layout, lane, 0), horizonY);
      context.lineTo(boundaryX(this.layout, lane + 1, 0), horizonY);
      context.lineTo(boundaryX(this.layout, lane + 1, 1.2), bottomY);
      context.lineTo(boundaryX(this.layout, lane, 1.2), bottomY);
      context.closePath();
      context.fillStyle = lane % 2 === 0 ? rgba(palette.roadAlternate, 0.5) : rgba(palette.road, 0.18);
      context.fill();
    }

    const beatMs = 60_000 / bpm;
    const beatPosition = ((timeMs % beatMs) + beatMs) % beatMs / beatMs;
    const gridCount = 15;
    for (let index = 0; index < gridCount; index += 1) {
      const progress = ((index / gridCount + beatPosition / gridCount) % 1) * 1.12;
      const point = project(this.layout, 2, progress);
      const left = this.layout.centerX - point.halfWidth;
      const right = this.layout.centerX + point.halfWidth;
      context.strokeStyle = rgba(palette.grid, (highContrast ? 0.42 : 0.2) + progress * 0.18);
      context.lineWidth = Math.max(0.6, progress * (highContrast ? 1.8 : 1.15));
      context.beginPath();
      context.moveTo(left, point.y);
      context.lineTo(right, point.y);
      context.stroke();
    }

    for (let boundary = 1; boundary < NOCTURNE_LANE_COUNT; boundary += 1) {
      context.strokeStyle = rgba(palette.grid, highContrast ? 0.72 : 0.33);
      context.lineWidth = highContrast ? 1.5 : 1;
      context.beginPath();
      context.moveTo(boundaryX(this.layout, boundary, 0), horizonY);
      context.lineTo(boundaryX(this.layout, boundary, 1.2), bottomY);
      context.stroke();
    }
    context.restore();

    context.save();
    context.strokeStyle = rgba(palette.rail, 0.72 + beatPulse * 0.18);
    context.shadowColor = palette.rail;
    context.shadowBlur = 5 + beatPulse * 8;
    context.lineWidth = highContrast ? 3 : 2;
    for (const side of [-1, 1]) {
      context.beginPath();
      context.moveTo(centerX + side * horizonHalfWidth, horizonY);
      context.lineTo(centerX + side * bottomHalfWidth, bottomY);
      context.stroke();
    }
    context.restore();
  }

  private drawDust(
    context: CanvasRenderingContext2D,
    palette: RendererPalette,
    visualTimeMs: number,
    threat: number,
    reducedMotion: boolean,
  ): void {
    const { width, height, horizonY } = this.layout;
    context.save();
    context.fillStyle = palette.fog;
    for (const particle of this.particles) {
      const twinkle = reducedMotion ? 0.56 : 0.38 + Math.sin(visualTimeMs * 0.0014 + particle.phase) * 0.2;
      const alpha = clamp((0.08 + particle.depth * 0.18 + threat * 0.00035) * twinkle, 0.02, 0.28);
      const x = particle.x * width;
      const y = horizonY * 0.45 + particle.y * (height - horizonY * 0.25);
      const size = particle.size * (0.45 + particle.depth) * (this.layout.compact ? 0.78 : 1);
      context.globalAlpha = alpha;
      context.beginPath();
      context.arc(x, y, size, 0, TAU);
      context.fill();
    }
    context.restore();
  }

  private collectVisibleNotes(frame: RendererFrame, timeMs: number): VisibleNote[] {
    const travelTimeMs = Math.max(500, finite(this.options.travelTimeMs, DEFAULT_OPTIONS.travelTimeMs));
    const visible: VisibleNote[] = [];
    for (const note of frame.notes) {
      if (note.visible === false) continue;
      const noteTimeMs = getNoteTime(note);
      if (!Number.isFinite(noteTimeMs)) continue;
      const lane = Math.round(finite(note.lane, -1));
      if (lane < 0 || lane >= NOCTURNE_LANE_COUNT) continue;
      const durationMs = getNoteDuration(note);
      const kind = getNoteKind(note);
      const status = getNoteStatus(note);
      let progress = 1 - (noteTimeMs - timeMs) / travelTimeMs;
      const tailProgress = 1 - (noteTimeMs + durationMs - timeMs) / travelTimeMs;
      if (status === "holding" && kind === "hold") progress = 1;
      if (progress < -0.05 || tailProgress > 1.22) continue;
      if (status === "hit" && progress > 1.08) continue;
      const passedFade = progress > 1 ? 1 - smoothstep(1.02, 1.2, progress) : 1;
      const statusAlpha = status === "hit" ? 0.45 : status === "missed" ? 0.52 : 1;
      const alpha = clamp(finite(note.opacity, 1), 0, 1) * passedFade * statusAlpha;
      if (alpha <= 0.01) continue;
      visible.push({
        note,
        lane,
        kind,
        status,
        timeMs: noteTimeMs,
        durationMs,
        progress,
        tailProgress,
        alpha,
        point: project(this.layout, lane, progress),
        tailPoint: project(this.layout, lane, tailProgress),
      });
    }
    visible.sort((left, right) => left.progress - right.progress || left.lane - right.lane);
    return visible;
  }

  private drawHolds(
    context: CanvasRenderingContext2D,
    notes: readonly VisibleNote[],
    palette: RendererPalette,
    highContrast: boolean,
  ): void {
    for (const visual of notes) {
      if (visual.kind !== "hold" || visual.durationMs <= 0) continue;
      const lanePalette = palette.lanes[visual.lane] ?? palette.lanes[0];
      const head = visual.point;
      const tail = visual.tailPoint;
      const headHalf = Math.max(2.5, head.laneWidth * 0.19);
      const tailHalf = Math.max(1.5, tail.laneWidth * 0.19);
      context.save();
      context.globalAlpha = visual.alpha;
      const ribbon = context.createLinearGradient(0, tail.y, 0, head.y);
      ribbon.addColorStop(0, rgba(lanePalette.color, 0.12));
      ribbon.addColorStop(0.28, rgba(lanePalette.color, 0.42));
      ribbon.addColorStop(1, rgba(lanePalette.glow, visual.status === "holding" ? 0.9 : 0.67));
      context.fillStyle = ribbon;
      context.strokeStyle = rgba(lanePalette.glow, highContrast ? 0.9 : 0.55);
      context.lineWidth = highContrast ? 2 : 1;
      context.shadowColor = lanePalette.glow;
      context.shadowBlur = visual.status === "holding" ? 14 : 6;
      context.beginPath();
      context.moveTo(tail.x - tailHalf, tail.y);
      context.lineTo(tail.x + tailHalf, tail.y);
      context.lineTo(head.x + headHalf, head.y);
      context.lineTo(head.x - headHalf, head.y);
      context.closePath();
      context.fill();
      context.stroke();

      context.shadowBlur = 0;
      context.globalAlpha = visual.alpha * 0.8;
      context.fillStyle = lanePalette.glow;
      context.beginPath();
      context.ellipse(tail.x, tail.y, tailHalf, Math.max(1.2, tailHalf * 0.22), 0, 0, TAU);
      context.fill();
      context.restore();
    }
  }

  private drawChordConnectors(
    context: CanvasRenderingContext2D,
    notes: readonly VisibleNote[],
    palette: RendererPalette,
    beatPulse: number,
    highContrast: boolean,
  ): void {
    const chords = new Map<string, VisibleNote[]>();
    for (const note of notes) {
      if (!note.note.chordId) continue;
      const group = chords.get(note.note.chordId);
      if (group) group.push(note);
      else chords.set(note.note.chordId, [note]);
    }
    context.save();
    context.lineCap = "round";
    for (const group of chords.values()) {
      if (group.length < 2) continue;
      group.sort((left, right) => left.point.x - right.point.x);
      const alpha = Math.min(...group.map((note) => note.alpha));
      const y = group.reduce((sum, note) => sum + note.point.y, 0) / group.length;
      const start = group[0].point;
      const end = group[group.length - 1].point;
      context.globalAlpha = alpha;
      context.strokeStyle = rgba(palette.hitLine, highContrast ? 0.92 : 0.55 + beatPulse * 0.12);
      context.lineWidth = Math.max(highContrast ? 2 : 1.2, start.scale * 3.2);
      context.shadowColor = palette.hitLine;
      context.shadowBlur = 6 + beatPulse * 5;
      context.beginPath();
      context.moveTo(start.x, y);
      context.lineTo(end.x, y);
      context.stroke();
    }
    context.restore();
  }

  private drawNotes(
    context: CanvasRenderingContext2D,
    notes: readonly VisibleNote[],
    palette: RendererPalette,
    visualTimeMs: number,
    beatPulse: number,
    reducedMotion: boolean,
    highContrast: boolean,
  ): void {
    for (const visual of notes) {
      const lanePalette = palette.lanes[visual.lane] ?? palette.lanes[0];
      const { x, y, laneWidth, scale } = visual.point;
      const noteScale = clamp(finite(this.options.noteScale, 1), 0.65, 1.6);
      const radius = clamp(laneWidth * 0.31 * noteScale, 4.5, (this.layout.compact ? 33 : 42) * noteScale);
      const isPulse = visual.kind === "pulse" || visual.note.accent;
      const wobble = isPulse && !reducedMotion
        ? 1 + Math.sin(visualTimeMs * 0.009 + visual.timeMs * 0.002) * 0.055
        : 1;
      const missed = visual.status === "missed";
      const color = missed ? palette.danger : lanePalette.color;
      const glow = missed ? palette.danger : lanePalette.glow;

      context.save();
      context.translate(x, y);
      context.scale(wobble, 0.48 * wobble);
      context.globalAlpha = visual.alpha;
      context.shadowColor = glow;
      context.shadowBlur = (isPulse ? 18 : 9) * scale + beatPulse * 3;
      const headGradient = context.createRadialGradient(-radius * 0.18, -radius * 0.28, 0, 0, 0, radius);
      headGradient.addColorStop(0, rgba("#ffffff", missed ? 0.44 : 0.86));
      headGradient.addColorStop(0.24, glow);
      headGradient.addColorStop(0.7, color);
      headGradient.addColorStop(1, rgba(palette.ink, 0.92));
      context.fillStyle = headGradient;
      context.strokeStyle = missed ? palette.danger : rgba(palette.hitLine, highContrast ? 1 : 0.66);
      context.lineWidth = (highContrast ? 2.5 : 1.45) / 0.48;
      context.beginPath();
      context.arc(0, 0, radius, 0, TAU);
      context.fill();
      context.stroke();

      if (isPulse) {
        context.shadowBlur = 0;
        context.strokeStyle = rgba(glow, 0.86);
        context.lineWidth = Math.max(1.5, radius * 0.1) / 0.48;
        context.beginPath();
        context.arc(0, 0, radius * 1.22, 0, TAU);
        context.stroke();
      }
      context.restore();

      context.save();
      context.globalAlpha = visual.alpha * (missed ? 0.58 : 0.95);
      context.shadowColor = glow;
      context.shadowBlur = highContrast ? 4 : 7;
      drawSymbol(
        context,
        lanePalette.symbol,
        x,
        y,
        radius * 0.62,
        missed ? palette.text : palette.ink,
        Math.max(1.2, radius * 0.09),
      );
      context.restore();
    }
  }

  private drawStrikeLine(
    context: CanvasRenderingContext2D,
    frame: RendererFrame,
    palette: RendererPalette,
    visualTimeMs: number,
    beatPulse: number,
    reducedMotion: boolean,
    highContrast: boolean,
  ): void {
    const { centerX, hitY, hitHalfWidth } = this.layout;
    context.save();
    context.lineCap = "round";
    context.strokeStyle = rgba(palette.hitLine, 0.84 + beatPulse * 0.16);
    context.lineWidth = highContrast ? 4 : 2.4;
    context.shadowColor = palette.hitLine;
    context.shadowBlur = 8 + beatPulse * (reducedMotion ? 2 : 9);
    context.beginPath();
    context.moveTo(centerX - hitHalfWidth, hitY);
    context.lineTo(centerX + hitHalfWidth, hitY);
    context.stroke();

    for (let lane = 0; lane < NOCTURNE_LANE_COUNT; lane += 1) {
      const point = project(this.layout, lane, 1);
      const pressure = pressureAt(frame, lane);
      const lanePalette = palette.lanes[lane] ?? palette.lanes[0];
      const padWidth = point.laneWidth * 0.72;
      const padHeight = clamp(this.layout.height * 0.027, 10, 23);
      context.save();
      context.translate(point.x, hitY);
      if (pressure > 0) {
        context.shadowColor = lanePalette.glow;
        context.shadowBlur = 10 + pressure * 18;
      }
      const padGradient = context.createLinearGradient(0, -padHeight, 0, padHeight);
      padGradient.addColorStop(0, rgba(lanePalette.glow, 0.18 + pressure * 0.72));
      padGradient.addColorStop(0.5, rgba(lanePalette.color, 0.28 + pressure * 0.62));
      padGradient.addColorStop(1, rgba(palette.ink, 0.86));
      context.fillStyle = padGradient;
      context.strokeStyle = rgba(lanePalette.glow, highContrast ? 1 : 0.62 + pressure * 0.28);
      context.lineWidth = highContrast ? 2.2 : 1.2;
      roundedRect(context, -padWidth / 2, -padHeight / 2, padWidth, padHeight, padHeight * 0.35);
      context.fill();
      context.stroke();
      context.restore();

      context.save();
      context.globalAlpha = 0.5 + pressure * 0.5;
      const symbolLift = pressure > 0 && !reducedMotion
        ? Math.sin(visualTimeMs * 0.02) * 1.4
        : 0;
      drawSymbol(
        context,
        lanePalette.symbol,
        point.x,
        hitY + symbolLift,
        padHeight * 0.38,
        pressure > 0 ? palette.ink : lanePalette.glow,
        highContrast ? 1.8 : 1.2,
      );
      context.restore();
    }
    context.restore();
  }

  private normalizeFeedback(frame: RendererFrame): FeedbackVisual {
    const input = frame.feedback;
    if (typeof input === "number") {
      return {
        value: input,
        active: frame.feedbackActive,
        activatedAtMs: frame.feedbackActivatedAtMs,
        activeUntilMs: frame.feedbackActiveUntilMs,
      };
    }
    return {
      value: finite(input?.value),
      active: input?.active ?? frame.feedbackActive,
      activatedAtMs: input?.activatedAtMs ?? frame.feedbackActivatedAtMs,
      activeUntilMs: input?.activeUntilMs ?? frame.feedbackActiveUntilMs,
      label: input?.label,
    };
  }

  private drawFeedback(
    context: CanvasRenderingContext2D,
    frame: RendererFrame,
    palette: RendererPalette,
    timeMs: number,
    visualTimeMs: number,
    reducedMotion: boolean,
    highContrast: boolean,
  ): void {
    const feedback = this.normalizeFeedback(frame);
    const charge = percentValue(feedback.value) / 100;
    const active = feedback.active === true || finite(feedback.activeUntilMs, -1) > timeMs;
    const { centerX, hitY, width, compact } = this.layout;
    const meterWidth = Math.min(width * (compact ? 0.37 : 0.25), compact ? 190 : 260);
    const meterY = Math.min(this.layout.height - 14, hitY + (compact ? 32 : 42));

    if (active) {
      const elapsed = feedback.activatedAtMs === undefined
        ? Math.max(0, visualTimeMs)
        : Math.max(0, timeMs - finite(feedback.activatedAtMs, timeMs));
      context.save();
      context.globalCompositeOperation = "screen";
      const aura = context.createRadialGradient(centerX, hitY, 0, centerX, hitY, width * 0.58);
      aura.addColorStop(0, rgba(palette.feedback, reducedMotion ? 0.09 : 0.16));
      aura.addColorStop(0.55, rgba(palette.feedback, 0.045));
      aura.addColorStop(1, rgba(palette.feedback, 0));
      context.fillStyle = aura;
      context.fillRect(0, 0, width, this.layout.height);

      const waveCount = reducedMotion ? 1 : 3;
      context.strokeStyle = palette.feedback;
      for (let wave = 0; wave < waveCount; wave += 1) {
        const phase = ((elapsed * 0.00115 + wave / waveCount) % 1);
        context.globalAlpha = (1 - phase) * (reducedMotion ? 0.25 : 0.48);
        context.lineWidth = highContrast ? 2.5 : 1.5;
        context.beginPath();
        context.ellipse(centerX, hitY, lerp(meterWidth * 0.35, width * 0.48, phase), lerp(8, 86, phase), 0, 0, TAU);
        context.stroke();
      }
      context.restore();
    }

    context.save();
    const label = feedback.label ?? "FEEDBACK";
    context.font = `${highContrast ? 700 : 600} ${compact ? 9 : 10}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.letterSpacing = compact ? "1px" : "2px";
    context.fillStyle = active ? palette.feedback : rgba(palette.text, 0.64);
    context.fillText(active ? `${label} // ACTIF` : label, centerX, meterY - 6);

    roundedRect(context, centerX - meterWidth / 2, meterY, meterWidth, compact ? 4 : 5, 3);
    context.fillStyle = rgba(palette.ink, 0.86);
    context.fill();
    context.strokeStyle = rgba(active ? palette.feedback : palette.text, highContrast ? 0.9 : 0.42);
    context.lineWidth = highContrast ? 1.5 : 1;
    context.stroke();

    if (charge > 0) {
      const innerWidth = Math.max(0, (meterWidth - 2) * charge);
      const meterGradient = context.createLinearGradient(centerX - meterWidth / 2, 0, centerX + meterWidth / 2, 0);
      meterGradient.addColorStop(0, rgba(palette.feedback, 0.48));
      meterGradient.addColorStop(0.75, palette.feedback);
      meterGradient.addColorStop(1, palette.text);
      context.fillStyle = meterGradient;
      context.shadowColor = palette.feedback;
      context.shadowBlur = active || charge >= 1 ? 11 : 4;
      context.fillRect(centerX - meterWidth / 2 + 1, meterY + 1, innerWidth, compact ? 2 : 3);
    }

    context.shadowBlur = 0;
    context.strokeStyle = rgba(palette.ink, 0.9);
    context.lineWidth = 1;
    for (let tick = 1; tick < 4; tick += 1) {
      const x = centerX - meterWidth / 2 + meterWidth * tick / 4;
      context.beginPath();
      context.moveTo(x, meterY);
      context.lineTo(x, meterY + (compact ? 4 : 5));
      context.stroke();
    }
    context.restore();

    if (active && !reducedMotion) {
      context.save();
      context.globalAlpha = 0.08 + Math.sin(visualTimeMs * 0.014) * 0.025;
      context.fillStyle = palette.feedback;
      context.fillRect(0, 0, this.layout.width, this.layout.height);
      context.restore();
    }
  }

  private drawJudgement(
    context: CanvasRenderingContext2D,
    frame: RendererFrame,
    palette: RendererPalette,
    timeMs: number,
    reducedMotion: boolean,
    highContrast: boolean,
  ): void {
    if (!frame.judgement) return;
    const judgement: JudgementVisual = typeof frame.judgement === "string"
      ? { grade: frame.judgement, atMs: timeMs }
      : frame.judgement;
    const atMs = finite(judgement.atMs, finite(judgement.startedAtMs, timeMs));
    const age = Math.max(0, timeMs - atMs);
    const duration = judgement.grade === "miss" ? 880 : judgement.grade === "feedback" ? 1_050 : 720;
    if (age > duration) return;
    const life = clamp(age / duration, 0, 1);
    const alpha = 1 - smoothstep(0.58, 1, life);
    const gradeColor = judgement.grade === "miss"
      ? palette.danger
      : judgement.grade === "perfect" || judgement.grade === "feedback"
        ? palette.feedback
        : judgement.grade === "great"
          ? palette.lanes[0].glow
          : palette.lanes[2].glow;
    const labels: Record<JudgementEffect, string> = {
      perfect: "PARFAIT",
      great: "EXCELLENT",
      good: "BON",
      miss: "MANQUÉ",
      feedback: "FEEDBACK",
    };
    const lift = reducedMotion ? 0 : life * this.layout.height * 0.035;
    const scale = reducedMotion ? 1 : 0.92 + Math.sin(Math.min(1, life * 4) * Math.PI * 0.5) * 0.12;
    const y = this.layout.hitY - (this.layout.compact ? 58 : 76) - lift;
    const fontSize = clamp(this.layout.width * 0.032, this.layout.compact ? 20 : 24, 42);

    context.save();
    context.translate(this.layout.centerX, y);
    context.scale(scale, scale);
    context.globalAlpha = alpha;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `${highContrast ? 900 : 800} ${fontSize}px system-ui, sans-serif`;
    context.fillStyle = gradeColor;
    context.strokeStyle = rgba(palette.ink, 0.94);
    context.lineWidth = highContrast ? 6 : 4;
    context.shadowColor = gradeColor;
    context.shadowBlur = reducedMotion ? 5 : 12;
    const label = judgement.text ?? labels[judgement.grade];
    context.strokeText(label, 0, 0);
    context.fillText(label, 0, 0);

    if (judgement.offsetMs !== undefined && judgement.offsetMs !== null) {
      context.shadowBlur = 0;
      context.font = `600 ${Math.max(9, fontSize * 0.3)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      context.fillStyle = rgba(palette.text, 0.8);
      const offset = Math.round(judgement.offsetMs);
      context.fillText(`${offset > 0 ? "+" : ""}${offset} ms`, 0, fontSize * 0.78);
    }
    context.restore();
  }

  private drawFrontAtmosphere(
    context: CanvasRenderingContext2D,
    palette: RendererPalette,
    visualTimeMs: number,
    threat: number,
    health: number,
    reducedMotion: boolean,
  ): void {
    const { width, height } = this.layout;
    const danger = Math.max(threat / 100, 1 - health);
    context.save();
    context.globalCompositeOperation = "screen";
    for (let layer = 0; layer < 2; layer += 1) {
      const drift = reducedMotion ? 0 : Math.sin(visualTimeMs * (0.00014 + layer * 0.00004) + layer * 2.8) * width * 0.1;
      const centerX = width * (layer === 0 ? 0.16 : 0.84) + drift;
      const centerY = height * (0.67 + layer * 0.11);
      const radius = width * 0.34;
      const fog = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
      fog.addColorStop(0, rgba(palette.fog, 0.045 + danger * 0.035));
      fog.addColorStop(0.55, rgba(palette.fog, 0.018));
      fog.addColorStop(1, rgba(palette.fog, 0));
      context.fillStyle = fog;
      context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
    }
    context.restore();
  }

  private drawPostEffects(
    context: CanvasRenderingContext2D,
    palette: RendererPalette,
    threat: number,
    health: number,
    beatPulse: number,
    reducedMotion: boolean,
    highContrast: boolean,
  ): void {
    const { width, height, centerX } = this.layout;
    const danger = Math.max(threat / 100, 1 - health);
    const vignette = context.createRadialGradient(centerX, height * 0.48, height * 0.14, centerX, height * 0.5, Math.max(width, height) * 0.72);
    vignette.addColorStop(0.35, rgba(palette.ink, 0));
    vignette.addColorStop(0.74, rgba(palette.ink, highContrast ? 0.24 : 0.38));
    vignette.addColorStop(1, rgba(danger > 0.56 ? palette.danger : palette.ink, 0.58 + danger * 0.22));
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);

    if (this.scanlinePattern) {
      context.save();
      context.globalAlpha = highContrast ? 0.1 : reducedMotion ? 0.12 : 0.17;
      context.fillStyle = this.scanlinePattern;
      context.fillRect(0, 0, width, height);
      context.restore();
    }

    if (this.grainPattern) {
      context.save();
      context.globalAlpha = highContrast ? 0.1 : 0.18 + danger * 0.08;
      context.fillStyle = this.grainPattern;
      context.fillRect(0, 0, width, height);
      context.restore();
    }

    if (danger > 0.65) {
      context.save();
      context.globalAlpha = (danger - 0.65) * (reducedMotion ? 0.08 : 0.17) * (0.7 + beatPulse * 0.3);
      context.strokeStyle = palette.danger;
      context.lineWidth = highContrast ? 2 : 1;
      const crackLength = Math.min(width, height) * 0.12;
      for (let side = 0; side < 2; side += 1) {
        const x = side === 0 ? 0 : width;
        const direction = side === 0 ? 1 : -1;
        context.beginPath();
        context.moveTo(x, height * (0.3 + side * 0.24));
        context.lineTo(x + direction * crackLength * 0.4, height * (0.34 + side * 0.22));
        context.lineTo(x + direction * crackLength * 0.25, height * (0.39 + side * 0.2));
        context.lineTo(x + direction * crackLength, height * (0.43 + side * 0.17));
        context.stroke();
      }
      context.restore();
    }
  }
}

/** Preferred factory for React refs and other component-driven integrations. */
export function createNocturneRenderer(
  canvas: HTMLCanvasElement,
  options: RendererOptions = {},
): NocturneSignalRenderer {
  return new NocturneSignalRenderer(canvas, options);
}

/** Short alias when the game module already provides the NOCTURNE namespace. */
export const createGameRenderer = createNocturneRenderer;

export default createNocturneRenderer;
