import test from "node:test";
import assert from "node:assert/strict";

import {
  DIFFICULTIES,
  FEEDBACK_DURATION_MS,
  LANE_COUNT,
  TRACKS,
  activateFeedback,
  calculateRank,
  createGameState,
  generateCanonicalCharts,
  generateChart,
  getAccuracy,
  getFinalScore,
  getJudgementWindows,
  getRunRank,
  isFeedbackActive,
  isFeedbackReady,
  judgeTiming,
  multiplierForCombo,
  resolveJudgement,
} from "../src/game/core.mjs";

test("the three tracks produce nine deterministic, valid five-lane charts", () => {
  assert.equal(TRACKS.length, 3);
  assert.equal(generateCanonicalCharts().length, 9);

  for (const track of TRACKS) {
    const noteCounts = [];

    for (const difficulty of Object.keys(DIFFICULTIES)) {
      const first = generateChart(track.id, difficulty);
      const second = generateChart(track.id, difficulty);

      assert.deepEqual(first, second);
      assert.equal(first.laneCount, LANE_COUNT);
      assert.equal(first.trackId, track.id);
      assert.equal(first.difficulty, difficulty);
      assert.equal(first.totalNotes, first.notes.length);
      assert.ok(first.totalNotes > 100, `${first.id} should contain a complete song chart`);
      assert.deepEqual([...new Set(first.notes.map(({ lane }) => lane))].sort(), [0, 1, 2, 3, 4]);

      for (let index = 0; index < first.notes.length; index += 1) {
        const note = first.notes[index];
        assert.ok(note.timeMs >= 0 && note.timeMs < first.durationMs);
        assert.ok(Number.isInteger(note.lane) && note.lane >= 0 && note.lane < LANE_COUNT);
        assert.ok(["tap", "hold", "pulse"].includes(note.kind));
        if (index > 0) {
          const previous = first.notes[index - 1];
          assert.ok(
            note.timeMs > previous.timeMs ||
              (note.timeMs === previous.timeMs && note.lane >= previous.lane),
          );
        }
      }

      noteCounts.push(first.totalNotes);
    }

    assert.ok(noteCounts[0] < noteCounts[1], `${track.id}: Standard must be denser than Story`);
    assert.ok(noteCounts[1] < noteCounts[2], `${track.id}: Nightmare must be densest`);
  }
});

test("a custom chart seed is stable and actually changes the chart", () => {
  const canonical = generateChart("static-hunger", "standard");
  const remixA = generateChart("static-hunger", "standard", { seed: "nightly-42" });
  const remixB = generateChart("static-hunger", "standard", { seed: "nightly-42" });

  assert.deepEqual(remixA, remixB);
  assert.notEqual(remixA.seed, canonical.seed);
  assert.notDeepEqual(remixA.notes.slice(0, 20), canonical.notes.slice(0, 20));
});

test("timing windows judge signed offsets at their exact boundaries", () => {
  assert.deepEqual(getJudgementWindows("standard"), { perfect: 45, great: 90, good: 150 });
  assert.deepEqual(getJudgementWindows("nightmare"), { perfect: 36, great: 72, good: 120 });
  assert.deepEqual(getJudgementWindows("story"), { perfect: 61, great: 122, good: 203 });

  assert.equal(judgeTiming(-45).grade, "perfect");
  assert.equal(judgeTiming(46).grade, "great");
  assert.equal(judgeTiming(-90).grade, "great");
  assert.equal(judgeTiming(91).grade, "good");
  assert.equal(judgeTiming(150).grade, "good");
  assert.equal(judgeTiming(151).grade, "miss");
  assert.equal(judgeTiming(Number.NaN).grade, "miss");
  assert.equal(judgeTiming(200, "story").grade, "good");
  assert.equal(judgeTiming(204, "story").grade, "miss");
});

test("combo thresholds, score multipliers, and misses follow the rhythm rules", () => {
  assert.equal(multiplierForCombo(0), 1);
  assert.equal(multiplierForCombo(9), 1);
  assert.equal(multiplierForCombo(10), 2);
  assert.equal(multiplierForCombo(30), 3);
  assert.equal(multiplierForCombo(60), 4);

  const initial = createGameState("standard");
  let state = initial;
  for (let index = 0; index < 10; index += 1) {
    state = resolveJudgement(state, "perfect", { note: { kind: "tap" }, atMs: index * 100 });
  }

  assert.equal(initial.score, 0, "state transitions must not mutate their input");
  assert.equal(state.combo, 10);
  assert.equal(state.maxCombo, 10);
  assert.equal(state.multiplier, 2);
  assert.equal(state.score, 1_100);
  assert.equal(getAccuracy(state), 1);

  state = resolveJudgement(state, judgeTiming(999), { note: { kind: "tap" }, atMs: 1_500 });
  assert.equal(state.combo, 0);
  assert.equal(state.multiplier, 1);
  assert.equal(state.misses, 1);
  assert.equal(state.maxCombo, 10);
  assert.equal(getAccuracy(state), 10 / 11);

  const pulse = resolveJudgement(createGameState("standard"), "perfect", {
    note: { kind: "pulse" },
  });
  assert.equal(pulse.score, 150, "pulse notes carry a 1.5 score value");
});

test("misses raise threat, drain lucidity, trigger attacks, and can end a run", () => {
  const exposed = createGameState({ difficulty: "standard", threat: 95, lucidity: 100 });
  const attacked = resolveJudgement(exposed, "miss", {
    note: { kind: "tap" },
    atMs: 1_000,
  });

  assert.equal(attacked.threat, 55);
  assert.equal(attacked.lucidity, 78);
  assert.equal(attacked.attacks, 1);
  assert.equal(attacked.gameOver, false);

  let doomed = createGameState({ difficulty: "nightmare", threat: 99, lucidity: 10 });
  doomed = resolveJudgement(doomed, "miss", { note: { kind: "pulse" }, atMs: 2_000 });
  assert.equal(doomed.lucidity, 0);
  assert.equal(doomed.gameOver, true);
  assert.strictEqual(
    resolveJudgement(doomed, "perfect", { atMs: 3_000 }),
    doomed,
    "a finished run ignores later input",
  );
});

test("Feedback charges, pushes back the threat, and halves damage while active", () => {
  const charged = createGameState({ difficulty: "standard", feedback: 100, threat: 90 });
  assert.equal(isFeedbackReady(charged), true);

  const active = activateFeedback(charged, 1_000);
  assert.equal(active.feedback, 0);
  assert.equal(active.threat, 45);
  assert.equal(active.feedbackUses, 1);
  assert.equal(active.feedbackActiveUntil, 1_000 + FEEDBACK_DURATION_MS);
  assert.equal(isFeedbackActive(active, 4_999), true);
  assert.equal(isFeedbackActive(active, 5_000), false);

  const shieldedMiss = resolveJudgement(active, "miss", {
    note: { kind: "tap" },
    atMs: 2_000,
  });
  assert.equal(shieldedMiss.threat, 48.5);
  assert.equal(shieldedMiss.lucidity, 98);

  const unshieldedMiss = resolveJudgement(shieldedMiss, "miss", {
    note: { kind: "tap" },
    atMs: 6_000,
  });
  assert.equal(unshieldedMiss.threat, 55.5);
  assert.equal(unshieldedMiss.lucidity, 94);
});

test("ranks and final bonuses reflect accuracy, survival, and completion", () => {
  assert.equal(calculateRank({ accuracy: 0.97, lucidity: 80, misses: 0 }), "S");
  assert.equal(calculateRank({ accuracy: 0.96, lucidity: 80, misses: 1 }), "A");
  assert.equal(calculateRank({ accuracy: 0.8, lucidity: 20 }), "B");
  assert.equal(calculateRank({ accuracy: 0.7, lucidity: 20 }), "C");
  assert.equal(calculateRank({ accuracy: 0.5, lucidity: 5 }), "SURVIE");
  assert.equal(calculateRank({ accuracy: 1, lucidity: 100, cleared: false }), "ECHEC");

  let state = createGameState({ difficulty: "standard", lucidity: 80 });
  state = resolveJudgement(state, "perfect");
  assert.equal(getRunRank(state), "S");
  assert.equal(getFinalScore(state), state.score + Math.round(state.lucidity * 100));
  assert.equal(getFinalScore(state, { objectiveCompleted: true }), state.score + Math.round(state.lucidity * 100) + 5_000);
  assert.equal(getFinalScore(state, { cleared: false, objectiveCompleted: true }), state.score);
});

test("invalid track, difficulty, and judgement identifiers fail explicitly", () => {
  assert.throws(() => generateChart("missing", "standard"), /Unknown track/);
  assert.throws(() => generateChart("static-hunger", "impossible"), /Unknown difficulty/);
  assert.throws(() => resolveJudgement(createGameState(), "almost"), /Unknown judgement/);
});
