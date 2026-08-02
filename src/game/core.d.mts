export type DifficultyKey = "story" | "standard" | "nightmare";
export type JudgementGrade = "perfect" | "great" | "good" | "miss";
export type NoteKind = "tap" | "hold" | "pulse";

export interface ChartNote {
  readonly id: string;
  readonly timeMs: number;
  readonly lane: number;
  readonly kind: NoteKind;
  readonly durationMs: number;
  readonly accent: boolean;
  readonly chordId: string | null;
}

export interface GeneratedChart {
  readonly id: string;
  readonly trackId: string;
  readonly title: string;
  readonly chapter: number;
  readonly difficulty: DifficultyKey;
  readonly bpm: number;
  readonly durationMs: number;
  readonly laneCount: 5;
  readonly seed: number;
  readonly notes: readonly ChartNote[];
  readonly totalNotes: number;
}

export interface Judgement {
  readonly grade: JudgementGrade;
  readonly offsetMs: number | null;
  readonly absoluteOffsetMs: number | null;
  readonly windowMs: number | null;
  readonly points: number;
  readonly accuracy: number;
}

export interface GameState {
  readonly difficulty: DifficultyKey;
  readonly score: number;
  readonly combo: number;
  readonly maxCombo: number;
  readonly multiplier: number;
  readonly processedNotes: number;
  readonly hits: number;
  readonly misses: number;
  readonly perfects: number;
  readonly greats: number;
  readonly goods: number;
  readonly weightedHits: number;
  readonly threat: number;
  readonly lucidity: number;
  readonly maxLucidity: number;
  readonly feedback: number;
  readonly feedbackActiveUntil: number;
  readonly feedbackUses: number;
  readonly attacks: number;
  readonly gameOver: boolean;
  readonly lastJudgement: JudgementGrade | null;
}

export const LANE_COUNT: 5;
export const FEEDBACK_MAX: 100;
export const TRACKS: readonly { id: string; title: string; bpm: number; durationMs: number }[];

export function generateChart(trackId: string, difficulty?: DifficultyKey, options?: { seed?: string }): GeneratedChart;
export function getJudgementWindows(difficulty?: DifficultyKey): Readonly<Record<"perfect" | "great" | "good", number>>;
export function judgeTiming(offsetMs: number, difficulty?: DifficultyKey): Judgement;
export function createGameState(options?: DifficultyKey | { difficulty?: DifficultyKey; maxLucidity?: number; lucidity?: number; threat?: number; feedback?: number }): GameState;
export function resolveJudgement(state: GameState, judgement: JudgementGrade | Judgement, context?: { note?: Partial<ChartNote>; atMs?: number }): GameState;
export function activateFeedback(state: GameState, atMs?: number): GameState;
export function isFeedbackReady(state: GameState): boolean;
export function isFeedbackActive(state: GameState, atMs: number): boolean;
export function getAccuracy(state: GameState): number;
export function getRunRank(state: GameState, options?: { cleared?: boolean }): string;
export function getFinalScore(state: GameState, options?: { cleared?: boolean; objectiveCompleted?: boolean }): number;
