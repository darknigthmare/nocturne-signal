import type { ChapterId, DifficultyId, UpgradeId } from "./content";

export interface GameSettings {
  masterVolume: number;
  musicVolume: number;
  effectsVolume: number;
  ambienceVolume: number;
  highContrast: boolean;
  reducedMotion: boolean;
  screenShake: boolean;
  noteSize: number;
  latencyOffset: number;
}

export interface ChapterRecord {
  score: number;
  accuracy: number;
  maxCombo: number;
  rank: string;
  completedAt: string;
}

export interface SaveData {
  version: 1;
  unlockedChapter: number;
  completed: ChapterId[];
  fragments: ChapterId[];
  records: Partial<Record<`${ChapterId}:${DifficultyId}`, ChapterRecord>>;
  upgrades: UpgradeId[];
  runs: number;
  settings: GameSettings;
}

const STORAGE_KEY = "nocturne-signal.save.v1";

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.72,
  musicVolume: 0.82,
  effectsVolume: 0.86,
  ambienceVolume: 0.58,
  highContrast: false,
  reducedMotion: false,
  screenShake: true,
  noteSize: 1,
  latencyOffset: 0,
};

export const DEFAULT_SAVE: SaveData = {
  version: 1,
  unlockedChapter: 0,
  completed: [],
  fragments: [],
  records: {},
  upgrades: [],
  runs: 0,
  settings: DEFAULT_SETTINGS,
};

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function loadSave(): SaveData {
  if (typeof window === "undefined") return DEFAULT_SAVE;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SAVE;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (parsed.version !== 1) return DEFAULT_SAVE;

    return {
      ...DEFAULT_SAVE,
      ...parsed,
      unlockedChapter: Math.min(2, Math.max(0, parsed.unlockedChapter ?? 0)),
      completed: unique(parsed.completed ?? []),
      fragments: unique(parsed.fragments ?? []),
      records: parsed.records ?? {},
      upgrades: unique(parsed.upgrades ?? []),
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
    };
  } catch {
    return DEFAULT_SAVE;
  }
}

export function persistSave(save: SaveData): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    // A private browsing quota must never prevent a run from continuing.
  }
}

export function resetSave(): SaveData {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore unavailable storage.
    }
  }
  return DEFAULT_SAVE;
}

export function recordKey(chapter: ChapterId, difficulty: DifficultyId): `${ChapterId}:${DifficultyId}` {
  return `${chapter}:${difficulty}`;
}
