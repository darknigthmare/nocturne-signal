/**
 * Pure gameplay rules for NOCTURNE SIGNAL.
 *
 * This module deliberately has no browser, React, audio, or timer dependency.
 * Every state transition returns a new value, so the same rules can be used by
 * the UI, replays, simulations, and Node tests.
 */

export const LANE_COUNT = 5;

export const TRACKS = Object.freeze([
  Object.freeze({
    id: "static-hunger",
    chapter: 1,
    title: "Static Hunger",
    subtitle: "Station Zero",
    bpm: 100,
    durationMs: 170_000,
    accentEveryBeats: 16,
    densityBias: -0.03,
    motif: Object.freeze([0, 1, 2, 1, 3, 2, 4, 2]),
  }),
  Object.freeze({
    id: "pulse-below",
    chapter: 2,
    title: "Pulse Below",
    subtitle: "The Glass Tunnels",
    bpm: 132,
    durationMs: 215_000,
    accentEveryBeats: 12,
    densityBias: 0.02,
    motif: Object.freeze([0, 2, 4, 3, 1, 3, 4, 2]),
  }),
  Object.freeze({
    id: "choir-in-the-wires",
    chapter: 3,
    title: "Choir in the Wires",
    subtitle: "The Last Frequency",
    bpm: 156,
    durationMs: 260_000,
    accentEveryBeats: 8,
    densityBias: 0.05,
    motif: Object.freeze([2, 0, 3, 1, 4, 2, 4, 1, 3, 0]),
  }),
]);

export const DIFFICULTIES = Object.freeze({
  story: Object.freeze({
    id: "story",
    label: "Histoire",
    subdivisions: 2,
    noteProbability: 0.59,
    chordChance: 0,
    holdChance: 0.08,
    timingScale: 1.35,
    scoreMultiplier: 0.85,
    missThreat: 5,
    missLucidity: 2.5,
    attackDamage: 12,
  }),
  standard: Object.freeze({
    id: "standard",
    label: "Standard",
    subdivisions: 2,
    noteProbability: 0.82,
    chordChance: 0.08,
    holdChance: 0.11,
    timingScale: 1,
    scoreMultiplier: 1,
    missThreat: 7,
    missLucidity: 4,
    attackDamage: 18,
  }),
  nightmare: Object.freeze({
    id: "nightmare",
    label: "Cauchemar",
    subdivisions: 4,
    noteProbability: 0.61,
    chordChance: 0.13,
    holdChance: 0.14,
    timingScale: 0.8,
    scoreMultiplier: 1.2,
    missThreat: 9,
    missLucidity: 5.5,
    attackDamage: 24,
  }),
});

export const BASE_JUDGEMENT_WINDOWS_MS = Object.freeze({
  perfect: 45,
  great: 90,
  good: 150,
});

export const JUDGEMENT_VALUES = Object.freeze({
  perfect: Object.freeze({ points: 100, accuracy: 1 }),
  great: Object.freeze({ points: 70, accuracy: 0.7 }),
  good: Object.freeze({ points: 40, accuracy: 0.4 }),
  miss: Object.freeze({ points: 0, accuracy: 0 }),
});

export const FEEDBACK_MAX = 100;
export const FEEDBACK_DURATION_MS = 4_000;
export const FEEDBACK_THREAT_REDUCTION = 45;

const TRACK_BY_ID = new Map(TRACKS.map((track) => [track.id, track]));
const NOTE_KIND_SCORE_MULTIPLIER = Object.freeze({ tap: 1, hold: 1.25, pulse: 1.5 });
const SUCCESS_EFFECTS = Object.freeze({
  perfect: Object.freeze({ threat: -3, lucidity: 0.2, feedback: 6 }),
  great: Object.freeze({ threat: -1.5, lucidity: 0.05, feedback: 4 }),
  good: Object.freeze({ threat: -0.5, lucidity: 0, feedback: 2 }),
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hashString(value) {
  let hash = 2_166_136_261;
  const input = String(value);
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function makeRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function getTrackOrThrow(trackId) {
  const track = TRACK_BY_ID.get(trackId);
  if (!track) {
    throw new RangeError(`Unknown track "${trackId}". Expected one of: ${TRACKS.map(({ id }) => id).join(", ")}`);
  }
  return track;
}

function getDifficultyOrThrow(difficultyId) {
  const difficulty = DIFFICULTIES[difficultyId];
  if (!difficulty) {
    throw new RangeError(
      `Unknown difficulty "${difficultyId}". Expected one of: ${Object.keys(DIFFICULTIES).join(", ")}`,
    );
  }
  return difficulty;
}

/** Return immutable metadata for one of the three original tracks. */
export function getTrack(trackId) {
  return getTrackOrThrow(trackId);
}

/**
 * Generate an authored-feeling but deterministic five-lane chart.
 * The optional seed is useful for daily/remix charts; omitting it always returns
 * the canonical chart for a track/difficulty pair.
 */
export function generateChart(trackId, difficultyId = "standard", options = {}) {
  const track = getTrackOrThrow(trackId);
  const difficulty = getDifficultyOrThrow(difficultyId);
  const customSeed = options?.seed ?? "canonical-v1";
  const seed = hashString(`${track.id}:${difficulty.id}:${customSeed}`);
  const random = makeRandom(seed);
  const beatMs = 60_000 / track.bpm;
  const stepMs = beatMs / difficulty.subdivisions;
  const startOffsetMs = 1_800;
  const playableEndMs = track.durationMs - 2_500;
  const totalTicks = Math.floor((playableEndMs - startOffsetMs) / stepMs);
  const notes = [];
  let previousLane = -1;
  let previousTimeMs = -Infinity;
  let serial = 0;

  for (let tick = 0; tick <= totalTicks; tick += 1) {
    const timeMs = Math.round(startOffsetMs + tick * stepMs);
    const isBeat = tick % difficulty.subdivisions === 0;
    const beatIndex = Math.floor(tick / difficulty.subdivisions);
    const isIntro = beatIndex < 8;
    const forceAfterGap = timeMs - previousTimeMs > beatMs * (isIntro ? 1 : 1.55);
    const probability = clamp(
      difficulty.noteProbability + track.densityBias + (isBeat ? 0.12 : -0.06) - (isIntro ? 0.24 : 0),
      0.15,
      0.96,
    );

    if (!forceAfterGap && random() > probability) continue;

    const motifIndex = (tick + Math.floor(beatIndex / 8)) % track.motif.length;
    let lane = (track.motif[motifIndex] + Math.floor(random() * LANE_COUNT)) % LANE_COUNT;
    if (lane === previousLane && random() < 0.72) lane = (lane + 1 + Math.floor(random() * 3)) % LANE_COUNT;

    const isPulse =
      isBeat && beatIndex >= 8 && beatIndex % track.accentEveryBeats === 0;
    const canHold = !isPulse && timeMs + beatMs * 1.5 < playableEndMs;
    const isHold = canHold && random() < difficulty.holdChance;
    const kind = isPulse ? "pulse" : isHold ? "hold" : "tap";
    const holdBeats = isHold ? (random() < 0.25 ? 1.5 : 1) : 0;
    const chordRoll = random();
    const chordEligible = !isIntro && !isHold && isBeat && chordRoll < difficulty.chordChance;
    const chordId = chordEligible ? `${track.id}:${difficulty.id}:chord-${serial}` : null;

    notes.push({
      id: `${track.id}:${difficulty.id}:${serial}`,
      timeMs,
      lane,
      kind,
      durationMs: Math.round(holdBeats * beatMs),
      accent: isPulse,
      chordId,
    });
    serial += 1;

    if (chordEligible) {
      const secondLane = (lane + 2 + Math.floor(random() * 2)) % LANE_COUNT;
      notes.push({
        id: `${track.id}:${difficulty.id}:${serial}`,
        timeMs,
        lane: secondLane,
        kind: "tap",
        durationMs: 0,
        accent: false,
        chordId,
      });
      serial += 1;
    }

    previousLane = lane;
    previousTimeMs = timeMs;
  }

  notes.sort((left, right) => left.timeMs - right.timeMs || left.lane - right.lane);
  const immutableNotes = Object.freeze(notes.map((note) => Object.freeze(note)));

  return Object.freeze({
    id: `${track.id}:${difficulty.id}`,
    trackId: track.id,
    title: track.title,
    chapter: track.chapter,
    difficulty: difficulty.id,
    bpm: track.bpm,
    durationMs: track.durationMs,
    laneCount: LANE_COUNT,
    seed,
    notes: immutableNotes,
    totalNotes: immutableNotes.length,
  });
}

/** Generate the nine canonical charts in chapter then difficulty order. */
export function generateCanonicalCharts() {
  return Object.freeze(
    TRACKS.flatMap((track) =>
      Object.keys(DIFFICULTIES).map((difficulty) => generateChart(track.id, difficulty)),
    ),
  );
}

export function getJudgementWindows(difficultyId = "standard") {
  const difficulty = getDifficultyOrThrow(difficultyId);
  return Object.freeze(
    Object.fromEntries(
      Object.entries(BASE_JUDGEMENT_WINDOWS_MS).map(([grade, windowMs]) => [
        grade,
        Math.round(windowMs * difficulty.timingScale),
      ]),
    ),
  );
}

/** Judge a signed early/late offset in milliseconds. */
export function judgeTiming(offsetMs, difficultyId = "standard") {
  const windows = getJudgementWindows(difficultyId);
  const numericOffset = Number(offsetMs);
  const absoluteOffsetMs = Math.abs(numericOffset);
  let grade = "miss";
  let windowMs = null;

  if (Number.isFinite(absoluteOffsetMs)) {
    if (absoluteOffsetMs <= windows.perfect) {
      grade = "perfect";
      windowMs = windows.perfect;
    } else if (absoluteOffsetMs <= windows.great) {
      grade = "great";
      windowMs = windows.great;
    } else if (absoluteOffsetMs <= windows.good) {
      grade = "good";
      windowMs = windows.good;
    }
  }

  return Object.freeze({
    grade,
    offsetMs: Number.isFinite(numericOffset) ? numericOffset : null,
    absoluteOffsetMs: Number.isFinite(absoluteOffsetMs) ? absoluteOffsetMs : null,
    windowMs,
    ...JUDGEMENT_VALUES[grade],
  });
}

export function multiplierForCombo(combo) {
  const safeCombo = Math.max(0, Math.floor(Number(combo) || 0));
  if (safeCombo >= 60) return 4;
  if (safeCombo >= 30) return 3;
  if (safeCombo >= 10) return 2;
  return 1;
}

export function createGameState(options = {}) {
  const normalizedOptions = typeof options === "string" ? { difficulty: options } : options;
  const difficulty = getDifficultyOrThrow(normalizedOptions.difficulty ?? "standard");
  const maxLucidity = Math.max(1, Number(normalizedOptions.maxLucidity) || 100);
  const initialLucidity = clamp(
    Number(normalizedOptions.lucidity ?? maxLucidity),
    0,
    maxLucidity,
  );

  return Object.freeze({
    difficulty: difficulty.id,
    score: 0,
    combo: 0,
    maxCombo: 0,
    multiplier: 1,
    processedNotes: 0,
    hits: 0,
    misses: 0,
    perfects: 0,
    greats: 0,
    goods: 0,
    weightedHits: 0,
    threat: clamp(Number(normalizedOptions.threat ?? 15), 0, 100),
    lucidity: initialLucidity,
    maxLucidity,
    feedback: clamp(Number(normalizedOptions.feedback ?? 0), 0, FEEDBACK_MAX),
    feedbackActiveUntil: 0,
    feedbackUses: 0,
    attacks: 0,
    gameOver: initialLucidity <= 0,
    lastJudgement: null,
  });
}

function normalizeGrade(judgement) {
  const grade = typeof judgement === "string" ? judgement : judgement?.grade;
  if (!Object.hasOwn(JUDGEMENT_VALUES, grade)) {
    throw new RangeError(`Unknown judgement "${grade}". Expected perfect, great, good, or miss.`);
  }
  return grade;
}

export function isFeedbackReady(state) {
  return !state.gameOver && state.feedback >= FEEDBACK_MAX;
}

export function isFeedbackActive(state, atMs) {
  return Number.isFinite(atMs) && atMs < state.feedbackActiveUntil;
}

/**
 * Apply a note result and return the next immutable run state.
 * Context accepts the chart note and the song clock (`atMs`) for Feedback armor.
 */
export function resolveJudgement(state, judgement, context = {}) {
  if (state.gameOver) return state;

  const grade = normalizeGrade(judgement);
  const noteKind = NOTE_KIND_SCORE_MULTIPLIER[context.note?.kind] ? context.note.kind : "tap";
  const isPulse = noteKind === "pulse" || context.note?.accent === true;
  const difficulty = getDifficultyOrThrow(state.difficulty);
  const nextProcessedNotes = state.processedNotes + 1;

  if (grade !== "miss") {
    const values = JUDGEMENT_VALUES[grade];
    const effects = SUCCESS_EFFECTS[grade];
    const combo = state.combo + 1;
    const multiplier = multiplierForCombo(combo);
    const kindMultiplier = NOTE_KIND_SCORE_MULTIPLIER[noteKind];
    const pulseCharge = isPulse ? 3 : 0;
    const points = Math.round(
      values.points * multiplier * difficulty.scoreMultiplier * kindMultiplier,
    );

    return Object.freeze({
      ...state,
      score: state.score + points,
      combo,
      maxCombo: Math.max(state.maxCombo, combo),
      multiplier,
      processedNotes: nextProcessedNotes,
      hits: state.hits + 1,
      perfects: state.perfects + (grade === "perfect" ? 1 : 0),
      greats: state.greats + (grade === "great" ? 1 : 0),
      goods: state.goods + (grade === "good" ? 1 : 0),
      weightedHits: state.weightedHits + values.accuracy,
      threat: clamp(state.threat + effects.threat, 0, 100),
      lucidity: clamp(state.lucidity + effects.lucidity, 0, state.maxLucidity),
      feedback: clamp(state.feedback + effects.feedback + pulseCharge, 0, FEEDBACK_MAX),
      lastJudgement: grade,
    });
  }

  const shielded = isFeedbackActive(state, context.atMs);
  const armorMultiplier = shielded ? 0.5 : 1;
  const pulseMultiplier = isPulse ? 1.6 : 1;
  const threatDamage = difficulty.missThreat * pulseMultiplier * armorMultiplier;
  let threat = state.threat + threatDamage;
  let lucidityDamage = difficulty.missLucidity * pulseMultiplier * armorMultiplier;
  let attacks = state.attacks;

  if (threat >= 100) {
    threat = 55;
    lucidityDamage += difficulty.attackDamage * armorMultiplier;
    attacks += 1;
  }

  const lucidity = clamp(state.lucidity - lucidityDamage, 0, state.maxLucidity);
  return Object.freeze({
    ...state,
    combo: 0,
    multiplier: 1,
    processedNotes: nextProcessedNotes,
    misses: state.misses + 1,
    threat,
    lucidity,
    attacks,
    gameOver: lucidity <= 0,
    lastJudgement: grade,
  });
}

export const applyJudgement = resolveJudgement;

/** Spend a full meter: push the threat back and gain four seconds of armor. */
export function activateFeedback(state, atMs = 0) {
  if (!isFeedbackReady(state) || !Number.isFinite(atMs)) return state;

  return Object.freeze({
    ...state,
    feedback: 0,
    threat: clamp(state.threat - FEEDBACK_THREAT_REDUCTION, 0, 100),
    feedbackActiveUntil: atMs + FEEDBACK_DURATION_MS,
    feedbackUses: state.feedbackUses + 1,
  });
}

export function getAccuracy(state) {
  if (!state.processedNotes) return 0;
  return state.weightedHits / state.processedNotes;
}

export function calculateRank({ accuracy, lucidity = 100, misses = 0, cleared = true }) {
  if (!cleared) return "ECHEC";
  const safeAccuracy = clamp(Number(accuracy) || 0, 0, 1);
  const safeLucidity = Math.max(0, Number(lucidity) || 0);
  if (safeAccuracy >= 0.95 && safeLucidity >= 60 && misses === 0) return "S";
  if (safeAccuracy >= 0.9) return "A";
  if (safeAccuracy >= 0.78) return "B";
  if (safeAccuracy >= 0.65) return "C";
  return "SURVIE";
}

export function getRunRank(state, options = {}) {
  return calculateRank({
    accuracy: getAccuracy(state),
    lucidity: state.lucidity,
    misses: state.misses,
    cleared: options.cleared ?? !state.gameOver,
  });
}

/** Add finite end-of-song bonuses without mutating the live score. */
export function getFinalScore(state, options = {}) {
  const cleared = options.cleared ?? !state.gameOver;
  const survivalBonus = cleared ? Math.round(state.lucidity * 100) : 0;
  const objectiveBonus = cleared && options.objectiveCompleted ? 5_000 : 0;
  return state.score + survivalBonus + objectiveBonus;
}
