import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { TRACKS, generateCanonicalCharts } from "../src/game/core.mjs";

const root = new URL("../", import.meta.url);

test("ships three complete original transmissions and nine charts", () => {
  assert.deepEqual(
    TRACKS.map(({ title }) => title),
    ["Static Hunger", "Pulse Below", "Choir in the Wires"],
  );
  assert.deepEqual(
    TRACKS.map(({ bpm }) => bpm),
    [100, 132, 156],
  );
  const charts = generateCanonicalCharts();
  assert.equal(charts.length, 9);
  assert.ok(charts.every(({ totalNotes }) => totalNotes > 100));
});

test("the game surface includes campaign, accessibility, touch, progression and endings", async () => {
  const [app, content, storage, layout, packageJson] = await Promise.all([
    readFile(new URL("app/GameApp.tsx", root), "utf8"),
    readFile(new URL("src/game/content.ts", root), "utf8"),
    readFile(new URL("src/game/storage.ts", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
  ]);

  assert.match(app, /A S D F G/);
  assert.match(app, /onPointerDown/);
  assert.match(app, /FEEDBACK/);
  assert.match(app, /AUBE SUR LES ONDES/);
  assert.match(content, /station-zero/);
  assert.match(content, /glass-tunnels/);
  assert.match(content, /last-frequency/);
  assert.match(storage, /localStorage/);
  assert.match(storage, /highContrast/);
  assert.match(storage, /reducedMotion/);
  assert.match(layout, /lang="fr"/);
  assert.match(packageJson, /"build": "next build"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
