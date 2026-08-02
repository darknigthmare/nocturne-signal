"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  activateFeedback,
  createGameState,
  generateChart,
  getAccuracy,
  getFinalScore,
  getJudgementWindows,
  getRunRank,
  isFeedbackActive,
  isFeedbackReady,
  resolveJudgement,
  type ChartNote,
  type GameState,
  type GeneratedChart,
  type JudgementGrade,
} from "@/src/game/core.mjs";
import {
  CHAPTERS,
  DIFFICULTIES,
  LANE_DEFINITIONS,
  MENU_QUOTES,
  UPGRADES,
  formatDuration,
  getChapter,
  type ChapterId,
  type DifficultyId,
  type UpgradeId,
} from "@/src/game/content";
import {
  createNocturneAudioEngine,
  type AudioTheme,
  type NocturneAudioEngine,
} from "@/src/game/audio";
import {
  DEFAULT_SAVE,
  loadSave,
  persistSave,
  recordKey,
  resetSave,
  type GameSettings,
  type SaveData,
} from "@/src/game/storage";
import {
  createGameRenderer,
  type GameRenderer,
  type JudgementBurst,
  type RenderNote,
} from "@/src/game/renderer";

type Screen =
  | "menu"
  | "difficulty"
  | "chapters"
  | "intro"
  | "playing"
  | "result"
  | "upgrade"
  | "archives"
  | "settings"
  | "ending";
type NoteStatus = "pending" | "holding" | "hit" | "missed";

interface LiveNote extends ChartNote {
  status: NoteStatus;
  holdGrade?: Exclude<JudgementGrade, "miss">;
  hitOffsetMs?: number;
}

interface Runtime {
  chart: GeneratedChart;
  notes: LiveNote[];
  state: GameState;
  startedAt: number;
  timeMs: number;
  finished: boolean;
  anchors: number;
  objectiveCompleted: boolean;
  judgement?: JudgementBurst;
}

interface RunView {
  timeMs: number;
  durationMs: number;
  score: number;
  combo: number;
  maxCombo: number;
  multiplier: number;
  lucidity: number;
  maxLucidity: number;
  threat: number;
  feedback: number;
  feedbackReady: boolean;
  feedbackActive: boolean;
  accuracy: number;
  judgement: JudgementGrade | null;
  offsetMs: number | null;
  anchors: number;
  attacks: number;
}

interface RunResult {
  cleared: boolean;
  chapterId: ChapterId;
  score: number;
  rawScore: number;
  accuracy: number;
  maxCombo: number;
  misses: number;
  perfects: number;
  greats: number;
  goods: number;
  rank: string;
  lucidity: number;
  objectiveCompleted: boolean;
  fragmentFound: boolean;
  anchors: number;
  newRecord: boolean;
}

interface EndingDefinition {
  title: string;
  eyebrow: string;
  text: string;
}

const INITIAL_VIEW: RunView = {
  timeMs: 0,
  durationMs: 1,
  score: 0,
  combo: 0,
  maxCombo: 0,
  multiplier: 1,
  lucidity: 100,
  maxLucidity: 100,
  threat: 15,
  feedback: 0,
  feedbackReady: false,
  feedbackActive: false,
  accuracy: 0,
  judgement: null,
  offsetMs: null,
  anchors: 0,
  attacks: 0,
};

const THEME_BY_CHAPTER: readonly AudioTheme[] = ["station", "tunnels", "choir"];
const GRADE_LABELS: Record<JudgementGrade, string> = {
  perfect: "PARFAIT",
  great: "EXCELLENT",
  good: "BON",
  miss: "RATÉ",
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function percent(value: number): string {
  return `${Math.round(value * 100)} %`;
}

function formatScore(value: number): string {
  return Math.round(value).toLocaleString("fr-FR");
}

function gradeOffset(
  offsetMs: number,
  difficulty: DifficultyId,
  hasAccord: boolean,
): JudgementGrade {
  const windows = getJudgementWindows(difficulty);
  const extension = hasAccord ? 18 : 0;
  const absolute = Math.abs(offsetMs);
  if (absolute <= windows.perfect + extension) return "perfect";
  if (absolute <= windows.great + extension) return "great";
  if (absolute <= windows.good + extension) return "good";
  return "miss";
}

function viewFromRuntime(runtime: Runtime): RunView {
  const state = runtime.state;
  return {
    timeMs: runtime.timeMs,
    durationMs: runtime.chart.durationMs,
    score: state.score,
    combo: state.combo,
    maxCombo: state.maxCombo,
    multiplier: state.multiplier,
    lucidity: state.lucidity,
    maxLucidity: state.maxLucidity,
    threat: state.threat,
    feedback: state.feedback,
    feedbackReady: isFeedbackReady(state),
    feedbackActive: isFeedbackActive(state, runtime.timeMs),
    accuracy: getAccuracy(state),
    judgement: state.lastJudgement,
    offsetMs: runtime.judgement?.offsetMs ?? null,
    anchors: runtime.anchors,
    attacks: state.attacks,
  };
}

function getEnding(save: SaveData, result: RunResult | null): EndingDefinition {
  const allFragments = save.fragments.length === CHAPTERS.length;
  if (allFragments && result?.anchors === 3 && result.accuracy >= 0.8) {
    return {
      eyebrow: "FIN VÉRITABLE · AUBE SUR LES ONDES",
      title: "Le signal se souvient.",
      text: "Les trois fragments forment votre propre voix, enregistrée dix-neuf jours dans le futur. Vous coupez la boucle avant sa naissance. Pour la première fois, le jour se lève en silence.",
    };
  }
  if (result?.anchors === 3) {
    return {
      eyebrow: "FIN · LE GRAND SILENCE",
      title: "Plus rien ne répond.",
      text: "Les Ancres cèdent. La chose disparaît des câbles, des murs et de votre mémoire. Au matin, la station est vide — mais toutes les radios du pays affichent 108.7.",
    };
  }
  return {
    eyebrow: "FIN · ÉVASION",
    title: "L'aube vous trouve encore debout.",
    text: "Votre dernière note ouvre un passage dans le signal. Vous quittez K-27 avant l'effondrement de l'antenne. Derrière vous, la fréquence continue de jouer sans musicien.",
  };
}

export function GameApp() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [save, setSave] = useState<SaveData>(DEFAULT_SAVE);
  const [difficulty, setDifficulty] = useState<DifficultyId>("standard");
  const [chapterIndex, setChapterIndex] = useState(0);
  const [storyStep, setStoryStep] = useState(0);
  const [campaign, setCampaign] = useState(true);
  const [paused, setPaused] = useState(false);
  const [runId, setRunId] = useState(0);
  const [runView, setRunView] = useState<RunView>(INITIAL_VIEW);
  const [result, setResult] = useState<RunResult | null>(null);
  const [runUpgrades, setRunUpgrades] = useState<UpgradeId[]>([]);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [audioWarning, setAudioWarning] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const audioRef = useRef<NocturneAudioEngine | null>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const pressedRef = useRef(new Set<number>());
  const pausedRef = useRef(false);
  const saveRef = useRef(save);
  const settingsRef = useRef(save.settings);
  const upgradesRef = useRef(runUpgrades);
  const finishRef = useRef<(cleared: boolean) => void>(() => undefined);
  const lastHudUpdateRef = useRef(0);

  const chapter = CHAPTERS[chapterIndex];
  const themeStyle = useMemo(
    () =>
      ({
        "--accent": chapter.palette[0],
        "--accent-2": chapter.palette[1],
        "--deep": chapter.palette[2],
      }) as CSSProperties,
    [chapter],
  );

  useEffect(() => {
    const loaded = loadSave();
    const prefersLessMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const merged = prefersLessMotion
      ? { ...loaded, settings: { ...loaded.settings, reducedMotion: true } }
      : loaded;
    saveRef.current = merged;
    settingsRef.current = merged.settings;
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Offline support is an enhancement and must never block the game.
      });
    }
    let active = true;
    queueMicrotask(() => {
      if (active) setSave(merged);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    saveRef.current = save;
    settingsRef.current = save.settings;
  }, [save]);

  useEffect(() => {
    upgradesRef.current = runUpgrades;
  }, [runUpgrades]);

  useEffect(() => {
    const timer = window.setInterval(
      () => setQuoteIndex((current) => (current + 1) % MENU_QUOTES.length),
      7000,
    );
    return () => window.clearInterval(timer);
  }, []);

  const storeSave = useCallback((next: SaveData) => {
    saveRef.current = next;
    setSave(next);
    persistSave(next);
  }, []);

  const updateSettings = useCallback(
    <Key extends keyof GameSettings>(key: Key, value: GameSettings[Key]) => {
      const next = {
        ...saveRef.current,
        settings: { ...saveRef.current.settings, [key]: value },
      };
      settingsRef.current = next.settings;
      storeSave(next);
      const audio = audioRef.current;
      if (!audio) return;
      if (key === "masterVolume") audio.setMasterVolume(Number(value));
      if (key === "musicVolume") audio.setLayerVolume("music", Number(value));
      if (key === "effectsVolume") audio.setLayerVolume("sfx", Number(value));
      if (key === "ambienceVolume") audio.setLayerVolume("ambience", Number(value));
    },
    [storeSave],
  );

  const openIntro = useCallback((index: number, isCampaign: boolean) => {
    setChapterIndex(index);
    setCampaign(isCampaign);
    setStoryStep(0);
    setResult(null);
    setScreen("intro");
  }, []);

  const startCampaign = useCallback(() => {
    setRunUpgrades([]);
    setCampaign(true);
    setScreen("difficulty");
  }, []);

  const chooseDifficulty = useCallback(
    (choice: DifficultyId) => {
      setDifficulty(choice);
      openIntro(0, true);
    },
    [openIntro],
  );

  const disposeAudio = useCallback(() => {
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio) void audio.dispose();
  }, []);

  const startRun = useCallback(async () => {
    disposeAudio();
    const currentChapter = CHAPTERS[chapterIndex];
    const chart = generateChart(currentChapter.trackId, difficulty);
    const maxLucidity = upgradesRef.current.includes("nerve") ? 120 : 100;
    const runtime: Runtime = {
      chart,
      notes: chart.notes.map((note) => ({ ...note, status: "pending" })),
      state: createGameState({ difficulty, maxLucidity, lucidity: maxLucidity }),
      startedAt: performance.now(),
      timeMs: 0,
      finished: false,
      anchors: 0,
      objectiveCompleted: false,
    };
    runtimeRef.current = runtime;
    pressedRef.current.clear();
    pausedRef.current = false;
    setPaused(false);
    setRunView(viewFromRuntime(runtime));
    setAudioWarning(false);

    const settings = settingsRef.current;
    const audio = createNocturneAudioEngine({
      masterVolume: settings.masterVolume,
      layerVolumes: {
        music: settings.musicVolume,
        percussion: settings.musicVolume,
        ambience: settings.ambienceVolume,
        sfx: settings.effectsVolume,
      },
    });
    audioRef.current = audio;

    try {
      await audio.unlock();
      await audio.start(chart, {
        theme: THEME_BY_CHAPTER[currentChapter.index],
        intensity: difficulty === "story" ? 0.42 : difficulty === "nightmare" ? 1 : 0.72,
      });
      runtime.startedAt = performance.now();
    } catch {
      setAudioWarning(true);
      runtime.startedAt = performance.now();
    }

    setRunId((value) => value + 1);
    setScreen("playing");
  }, [chapterIndex, difficulty, disposeAudio]);

  const commitJudgement = useCallback(
    (
      runtime: Runtime,
      note: LiveNote,
      grade: JudgementGrade,
      offsetMs: number,
    ) => {
      if (note.status === "hit" || note.status === "missed") return;
      const previous = runtime.state;
      let next = resolveJudgement(previous, grade, { note, atMs: runtime.timeMs });

      if (grade !== "miss" && upgradesRef.current.includes("voltage")) {
        next = { ...next, feedback: clamp(next.feedback + (grade === "perfect" ? 2 : 1), 0, 100) };
      }
      if (
        grade !== "miss" &&
        upgradesRef.current.includes("nerve") &&
        next.combo > 0 &&
        next.combo % 25 === 0 &&
        previous.combo !== next.combo
      ) {
        next = { ...next, lucidity: clamp(next.lucidity + 6, 0, next.maxLucidity) };
      }

      note.status = grade === "miss" ? "missed" : "hit";
      note.hitOffsetMs = offsetMs;
      runtime.state = next;
      runtime.judgement = {
        grade,
        lane: note.lane,
        offsetMs,
        startedAtMs: runtime.timeMs,
      };

      audioRef.current?.playJudgement(grade, note.lane, offsetMs);
      if (next.attacks > previous.attacks) {
        audioRef.current?.playHorrorAttack({
          kind: note.accent ? "static" : "impact",
          intensity: clamp(next.threat / 100, 0.4, 1),
          pan: note.lane / 2 - 1,
        });
      }

      if (chapterIndex === 0) runtime.objectiveCompleted ||= next.maxCombo >= 30;
      if (chapterIndex === 1) runtime.objectiveCompleted ||= next.feedbackUses >= 2;
      if (chapterIndex === 2) runtime.objectiveCompleted ||= runtime.anchors >= 3;
      setRunView(viewFromRuntime(runtime));
    },
    [chapterIndex],
  );

  const finishRun = useCallback(
    (cleared: boolean) => {
      const runtime = runtimeRef.current;
      if (!runtime || runtime.finished) return;
      runtime.finished = true;
      audioRef.current?.stop();
      pressedRef.current.clear();

      const accuracy = getAccuracy(runtime.state);
      const currentChapter = getChapter(CHAPTERS[chapterIndex].id);
      const objectiveCompleted =
        chapterIndex === 0
          ? runtime.state.maxCombo >= 30
          : chapterIndex === 1
            ? runtime.state.feedbackUses >= 2
            : runtime.anchors >= 3;
      const fragmentFound =
        cleared &&
        (chapterIndex === 0
          ? accuracy >= 0.8
          : chapterIndex === 1
            ? runtime.state.feedbackUses >= 2
            : accuracy >= 0.8 && runtime.anchors >= 3);
      const score = getFinalScore(runtime.state, { cleared, objectiveCompleted });
      const key = recordKey(currentChapter.id, difficulty);
      const oldRecord = saveRef.current.records[key];
      const newRecord = cleared && (!oldRecord || score > oldRecord.score);
      const runResult: RunResult = {
        cleared,
        chapterId: currentChapter.id,
        score,
        rawScore: runtime.state.score,
        accuracy,
        maxCombo: runtime.state.maxCombo,
        misses: runtime.state.misses,
        perfects: runtime.state.perfects,
        greats: runtime.state.greats,
        goods: runtime.state.goods,
        rank: getRunRank(runtime.state, { cleared }),
        lucidity: runtime.state.lucidity,
        objectiveCompleted,
        fragmentFound,
        anchors: runtime.anchors,
        newRecord,
      };

      let nextSave = { ...saveRef.current, runs: saveRef.current.runs + 1 };
      if (cleared) {
        nextSave = {
          ...nextSave,
          unlockedChapter: Math.max(nextSave.unlockedChapter, Math.min(2, chapterIndex + 1)),
          completed: [...new Set([...nextSave.completed, currentChapter.id])],
          fragments: fragmentFound
            ? [...new Set([...nextSave.fragments, currentChapter.id])]
            : nextSave.fragments,
          records: newRecord
            ? {
                ...nextSave.records,
                [key]: {
                  score,
                  accuracy,
                  maxCombo: runtime.state.maxCombo,
                  rank: runResult.rank,
                  completedAt: new Date().toISOString(),
                },
              }
            : nextSave.records,
        };
      }
      storeSave(nextSave);
      setResult(runResult);
      setPaused(false);
      pausedRef.current = false;
      setScreen("result");
    },
    [chapterIndex, difficulty, storeSave],
  );

  useEffect(() => {
    finishRef.current = finishRun;
  }, [finishRun]);

  const activateRunFeedback = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime || screen !== "playing" || pausedRef.current || !isFeedbackReady(runtime.state)) return;
    const next = activateFeedback(runtime.state, runtime.timeMs);
    if (next === runtime.state) return;
    runtime.state = next;
    if (chapterIndex === 2) {
      runtime.anchors = Math.min(3, runtime.anchors + 1);
      runtime.objectiveCompleted = runtime.anchors >= 3;
    }
    runtime.judgement = {
      grade: "feedback",
      lane: 2,
      offsetMs: 0,
      startedAtMs: runtime.timeMs,
    };
    audioRef.current?.playFeedback();
    setRunView(viewFromRuntime(runtime));
  }, [chapterIndex, screen]);

  const handleLaneDown = useCallback(
    (lane: number) => {
      if (screen !== "playing" || pausedRef.current) return;
      const runtime = runtimeRef.current;
      if (!runtime || runtime.finished) return;
      if (pressedRef.current.has(lane)) return;
      pressedRef.current.add(lane);
      audioRef.current?.playLaneInput(lane);

      const songTime = runtime.timeMs + settingsRef.current.latencyOffset;
      const windows = getJudgementWindows(difficulty);
      const maxWindow = windows.good + (upgradesRef.current.includes("accord") ? 18 : 0);
      let candidate: LiveNote | undefined;
      let candidateDistance = Number.POSITIVE_INFINITY;

      for (const note of runtime.notes) {
        if (note.status !== "pending" || note.lane !== lane) continue;
        const distance = Math.abs(songTime - note.timeMs);
        if (distance < candidateDistance) {
          candidate = note;
          candidateDistance = distance;
        }
        if (note.timeMs > songTime + maxWindow) break;
      }

      if (!candidate || candidateDistance > maxWindow) return;
      const offset = Math.round(songTime - candidate.timeMs);
      const grade = gradeOffset(offset, difficulty, upgradesRef.current.includes("accord"));
      if (grade === "miss") return;

      if (candidate.kind === "hold") {
        runtime.notes = runtime.notes.map((note) =>
          note === candidate
            ? { ...note, status: "holding", holdGrade: grade, hitOffsetMs: offset }
            : note,
        );
        audioRef.current?.playJudgement(grade, lane, offset);
      } else {
        commitJudgement(runtime, candidate, grade, offset);
      }
    },
    [commitJudgement, difficulty, screen],
  );

  const handleLaneUp = useCallback(
    (lane: number) => {
      pressedRef.current.delete(lane);
      const runtime = runtimeRef.current;
      if (!runtime || screen !== "playing" || pausedRef.current) return;
      const songTime = runtime.timeMs + settingsRef.current.latencyOffset;
      const holding = runtime.notes.find(
        (note) => note.status === "holding" && note.lane === lane,
      );
      if (!holding) return;
      const endTime = holding.timeMs + holding.durationMs;
      if (songTime >= endTime - 90) {
        commitJudgement(runtime, holding, holding.holdGrade ?? "good", holding.hitOffsetMs ?? 0);
      } else {
        commitJudgement(runtime, holding, "miss", Math.round(songTime - endTime));
      }
    },
    [commitJudgement, screen],
  );

  const pauseRun = useCallback(() => {
    if (screen !== "playing" || pausedRef.current) return;
    pausedRef.current = true;
    setPaused(true);
    void audioRef.current?.suspend();
  }, [screen]);

  const resumeRun = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !pausedRef.current) return;
    runtime.startedAt = performance.now() - runtime.timeMs;
    pausedRef.current = false;
    setPaused(false);
    void audioRef.current?.resume();
  }, []);

  const quitRun = useCallback(() => {
    runtimeRef.current = null;
    disposeAudio();
    pressedRef.current.clear();
    pausedRef.current = false;
    setPaused(false);
    setScreen("menu");
  }, [disposeAudio]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === "Escape" && screen === "playing") {
        event.preventDefault();
        if (pausedRef.current) resumeRun();
        else pauseRun();
        return;
      }
      if (event.code === "Space" && screen === "playing") {
        event.preventDefault();
        activateRunFeedback();
        return;
      }
      const lane = LANE_DEFINITIONS.findIndex((definition) => definition.code === event.code);
      if (lane >= 0 && !event.repeat) {
        event.preventDefault();
        handleLaneDown(lane);
      }
    };
    const up = (event: KeyboardEvent) => {
      const lane = LANE_DEFINITIONS.findIndex((definition) => definition.code === event.code);
      if (lane >= 0) handleLaneUp(lane);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [
    activateRunFeedback,
    handleLaneDown,
    handleLaneUp,
    pauseRun,
    resumeRun,
    screen,
  ]);

  useEffect(() => {
    if (screen !== "playing" || !canvasRef.current || !runtimeRef.current) return;
    const runtime = runtimeRef.current;
    const settings = settingsRef.current;
    const renderer = createGameRenderer(canvasRef.current, {
      reducedMotion: settings.reducedMotion,
      highContrast: settings.highContrast,
      noteScale: settings.noteSize,
    });
    rendererRef.current = renderer;
    let animationFrame = 0;

    const tick = (now: number) => {
      if (!runtimeRef.current || runtimeRef.current !== runtime || runtime.finished) return;
      if (!pausedRef.current) {
        runtime.timeMs = Math.max(0, now - runtime.startedAt);
        const songTime = runtime.timeMs + settingsRef.current.latencyOffset;
        const windows = getJudgementWindows(difficulty);
        const missWindow = windows.good + (upgradesRef.current.includes("accord") ? 18 : 0);

        for (const note of runtime.notes) {
          if (note.status === "pending" && songTime > note.timeMs + missWindow) {
            commitJudgement(runtime, note, "miss", Math.round(songTime - note.timeMs));
          }
          if (
            note.status === "holding" &&
            songTime >= note.timeMs + note.durationMs - 70
          ) {
            const stillHeld = pressedRef.current.has(note.lane);
            commitJudgement(
              runtime,
              note,
              stillHeld ? (note.holdGrade ?? "good") : "miss",
              note.hitOffsetMs ?? 0,
            );
          }
          if (note.timeMs > songTime + 400) break;
        }

        if (runtime.state.gameOver) {
          finishRef.current(false);
          return;
        }
        if (runtime.timeMs >= runtime.chart.durationMs) {
          finishRef.current(true);
          return;
        }
      }

      const renderNotes: RenderNote[] = runtime.notes
        .filter(
          (note) =>
            note.timeMs + note.durationMs > runtime.timeMs - 1100 &&
            note.timeMs < runtime.timeMs + 5200,
        )
        .map((note) => ({
          id: note.id,
          lane: note.lane,
          timeMs: note.timeMs,
          durationMs: note.durationMs,
          kind: note.kind,
          chordId: note.chordId,
          accent: note.accent,
          status: note.status,
        }));
      renderer.render({
        nowMs: now,
        songTimeMs: runtime.timeMs,
        durationMs: runtime.chart.durationMs,
        bpm: runtime.chart.bpm,
        notes: renderNotes,
        pressedLanes: pressedRef.current,
        lucidity: runtime.state.lucidity / runtime.state.maxLucidity,
        threat: runtime.state.threat / 100,
        feedback: runtime.state.feedback / 100,
        feedbackActive: isFeedbackActive(runtime.state, runtime.timeMs),
        combo: runtime.state.combo,
        multiplier: runtime.state.multiplier,
        palette: chapter.palette,
        judgement: runtime.judgement,
        paused: pausedRef.current,
      });

      if (now - lastHudUpdateRef.current > 90) {
        lastHudUpdateRef.current = now;
        setRunView(viewFromRuntime(runtime));
      }
      animationFrame = window.requestAnimationFrame(tick);
    };

    renderer.resize();
    animationFrame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      renderer.destroy();
      if (rendererRef.current === renderer) rendererRef.current = null;
    };
  }, [chapter.palette, commitJudgement, difficulty, runId, screen]);

  useEffect(() => {
    if (
      screen !== "playing" ||
      new URLSearchParams(window.location.search).get("qa") !== "1"
    ) return;
    let autoplayInterval: number | null = null;
    const releaseTimers = new Set<number>();

    const stopAutoplay = () => {
      if (autoplayInterval !== null) {
        window.clearInterval(autoplayInterval);
        autoplayInterval = null;
      }
    };

    const debugApi = {
      getState: () => ({
        screen,
        paused: pausedRef.current,
        runtime: runtimeRef.current ? viewFromRuntime(runtimeRef.current) : null,
      }),
      hitLane: (lane: number) => handleLaneDown(clamp(Math.floor(lane), 0, 4)),
      releaseLane: (lane: number) => handleLaneUp(clamp(Math.floor(lane), 0, 4)),
      chargeFeedback: () => {
        const runtime = runtimeRef.current;
        if (runtime) {
          runtime.state = { ...runtime.state, feedback: 100 };
          setRunView(viewFromRuntime(runtime));
        }
      },
      seekToEnd: () => {
        const runtime = runtimeRef.current;
        if (runtime) runtime.startedAt -= Math.max(0, runtime.chart.durationMs - runtime.timeMs - 700);
      },
      autoPlay: (durationMs = 10_000) => {
        stopAutoplay();
        const stopsAt = performance.now() + clamp(durationMs, 1_000, 30_000);
        autoplayInterval = window.setInterval(() => {
          const runtime = runtimeRef.current;
          if (!runtime || runtime.finished || pausedRef.current || performance.now() >= stopsAt) {
            stopAutoplay();
            return;
          }

          const songTime = runtime.timeMs + settingsRef.current.latencyOffset;
          for (const note of runtime.notes) {
            if (note.status !== "pending") continue;
            const offset = note.timeMs - songTime;
            if (offset > 18) break;
            if (offset < -18) continue;

            handleLaneDown(note.lane);
            const releaseTimer = window.setTimeout(() => {
              handleLaneUp(note.lane);
              releaseTimers.delete(releaseTimer);
            }, note.kind === "hold" ? note.durationMs + 20 : 44);
            releaseTimers.add(releaseTimer);
          }
        }, 8);
        return true;
      },
      stopAutoPlay: stopAutoplay,
    };
    (window as typeof window & { __NOCTURNE_DEBUG__?: typeof debugApi }).__NOCTURNE_DEBUG__ =
      debugApi;
    return () => {
      stopAutoplay();
      for (const releaseTimer of releaseTimers) window.clearTimeout(releaseTimer);
      delete (window as typeof window & { __NOCTURNE_DEBUG__?: typeof debugApi })
        .__NOCTURNE_DEBUG__;
    };
  }, [handleLaneDown, handleLaneUp, screen]);

  useEffect(() => () => disposeAudio(), [disposeAudio]);

  const continueAfterResult = useCallback(() => {
    if (!result?.cleared) {
      setScreen("intro");
      setStoryStep(CHAPTERS[chapterIndex].transmission.length - 1);
      return;
    }
    if (!campaign) {
      setScreen("chapters");
      return;
    }
    if (chapterIndex >= CHAPTERS.length - 1) {
      setScreen("ending");
      return;
    }
    setScreen("upgrade");
  }, [campaign, chapterIndex, result]);

  const chooseUpgrade = useCallback(
    (upgrade: UpgradeId) => {
      const nextRunUpgrades = [...new Set([...runUpgrades, upgrade])];
      setRunUpgrades(nextRunUpgrades);
      upgradesRef.current = nextRunUpgrades;
      const nextSave = {
        ...saveRef.current,
        upgrades: [...new Set([...saveRef.current.upgrades, upgrade])],
      };
      storeSave(nextSave);
      openIntro(chapterIndex + 1, true);
    },
    [chapterIndex, openIntro, runUpgrades, storeSave],
  );

  const doReset = useCallback(() => {
    const fresh = resetSave();
    storeSave(fresh);
    setConfirmReset(false);
    setScreen("menu");
  }, [storeSave]);

  const ending = getEnding(save, result);

  return (
    <div
      className={`game-app ${save.settings.highContrast ? "high-contrast" : ""} ${save.settings.reducedMotion ? "reduced-motion" : ""}`}
      style={themeStyle}
      data-screen={screen}
    >
      <div className="noise-layer" aria-hidden="true" />
      <div className="scanline-layer" aria-hidden="true" />

      {screen === "menu" && (
        <MenuScreen
          quote={MENU_QUOTES[quoteIndex]}
          save={save}
          onStart={startCampaign}
          onChapters={() => setScreen("chapters")}
          onArchives={() => setScreen("archives")}
          onSettings={() => setScreen("settings")}
        />
      )}
      {screen === "difficulty" && (
        <DifficultyScreen
          onChoose={chooseDifficulty}
          onBack={() => setScreen("menu")}
        />
      )}
      {screen === "chapters" && (
        <ChapterScreen
          save={save}
          difficulty={difficulty}
          onDifficulty={setDifficulty}
          onChoose={(index) => openIntro(index, false)}
          onBack={() => setScreen("menu")}
        />
      )}
      {screen === "intro" && (
        <IntroScreen
          chapter={chapter}
          step={storyStep}
          difficulty={difficulty}
          onStep={setStoryStep}
          onStart={() => void startRun()}
          onBack={() => setScreen(campaign ? "menu" : "chapters")}
        />
      )}
      {screen === "playing" && (
        <PlayScreen
          canvasRef={canvasRef}
          chapter={chapter}
          difficulty={difficulty}
          view={runView}
          paused={paused}
          audioWarning={audioWarning}
          settings={save.settings}
          onPause={pauseRun}
          onResume={resumeRun}
          onQuit={quitRun}
          onLaneDown={handleLaneDown}
          onLaneUp={handleLaneUp}
          onFeedback={activateRunFeedback}
        />
      )}
      {screen === "result" && result && (
        <ResultScreen
          result={result}
          chapter={chapter}
          campaign={campaign}
          onContinue={continueAfterResult}
          onRetry={() => {
            setStoryStep(chapter.transmission.length - 1);
            setScreen("intro");
          }}
          onMenu={() => setScreen("menu")}
        />
      )}
      {screen === "upgrade" && (
        <UpgradeScreen
          owned={runUpgrades}
          onChoose={chooseUpgrade}
          onBack={() => setScreen("menu")}
        />
      )}
      {screen === "archives" && (
        <ArchivesScreen save={save} onBack={() => setScreen("menu")} />
      )}
      {screen === "settings" && (
        <SettingsScreen
          settings={save.settings}
          confirmReset={confirmReset}
          onChange={updateSettings}
          onAskReset={() => setConfirmReset(true)}
          onCancelReset={() => setConfirmReset(false)}
          onReset={doReset}
          onBack={() => {
            setConfirmReset(false);
            setScreen("menu");
          }}
        />
      )}
      {screen === "ending" && (
        <EndingScreen
          ending={ending}
          fragments={save.fragments.length}
          onReplay={() => {
            setRunUpgrades([]);
            setScreen("difficulty");
          }}
          onMenu={() => setScreen("menu")}
        />
      )}
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`} aria-label="NOCTURNE SIGNAL">
      <span className="brand-frequency">108.7 FM</span>
      <span className="brand-title">
        NOCTURNE <i>SIGNAL</i>
      </span>
      {!compact && <span className="brand-subtitle">SURVIVAL RHYTHM HORROR</span>}
    </div>
  );
}

function BackButton({ onClick, label = "Retour" }: { onClick: () => void; label?: string }) {
  return (
    <button className="back-button" onClick={onClick} type="button">
      <span aria-hidden="true">←</span> {label}
    </button>
  );
}

function MenuScreen({
  quote,
  save,
  onStart,
  onChapters,
  onArchives,
  onSettings,
}: {
  quote: string;
  save: SaveData;
  onStart: () => void;
  onChapters: () => void;
  onArchives: () => void;
  onSettings: () => void;
}) {
  return (
    <main className="menu-screen">
      <div className="menu-environment" aria-hidden="true">
        <div className="moon-haze" />
        <div className="tower">
          <span className="tower-light" />
          <span className="tower-cross tower-cross-one" />
          <span className="tower-cross tower-cross-two" />
          <span className="tower-dish" />
        </div>
        <div className="station-window">
          <span />
          <span />
          <span />
        </div>
        <div className="watcher">
          <span className="watcher-head" />
          <span className="watcher-body" />
        </div>
        <div className="foreground-cables" />
      </div>
      <div className="menu-vignette" aria-hidden="true" />
      <section className="menu-content">
        <Brand />
        <p className="menu-hook">Tant que vous jouez, la porte reste fermée.</p>
        <div className="menu-actions">
          <button className="primary-button signal-button" onClick={onStart} type="button">
            <span className="button-index">01</span>
            <span>
              <small>NOUVELLE PARTIE</small>
              COMMENCER L&apos;ÉMISSION
            </span>
            <b aria-hidden="true">▶</b>
          </button>
          <div className="menu-secondary-grid">
            <button onClick={onChapters} type="button">
              <small>02</small>
              CHAPITRES
              <span>{save.unlockedChapter + 1}/3</span>
            </button>
            <button onClick={onArchives} type="button">
              <small>03</small>
              ARCHIVES
              <span>{save.fragments.length}/3</span>
            </button>
          </div>
          <button className="text-button" onClick={onSettings} type="button">
            PARAMÈTRES & ACCESSIBILITÉ <span aria-hidden="true">＋</span>
          </button>
        </div>
      </section>
      <footer className="menu-footer">
        <p key={quote} className="rotating-quote">« {quote} »</p>
        <div className="menu-status">
          <span className="status-dot" /> SIGNAL FAIBLE
          <span>BUILD 1.0</span>
        </div>
      </footer>
    </main>
  );
}

function DifficultyScreen({
  onChoose,
  onBack,
}: {
  onChoose: (difficulty: DifficultyId) => void;
  onBack: () => void;
}) {
  return (
    <main className="panel-screen">
      <header className="panel-header">
        <BackButton onClick={onBack} />
        <Brand compact />
        <span className="header-code">PROTOCOLE 01/03</span>
      </header>
      <section className="panel-content difficulty-content">
        <div className="section-heading">
          <span>CALIBRAGE DE LA MENACE</span>
          <h1>Choisissez votre fréquence.</h1>
          <p>Ce réglage modifie la densité du morceau, le timing et la violence du signal.</p>
        </div>
        <div className="difficulty-grid">
          {DIFFICULTIES.map((item, index) => (
            <button
              className={`difficulty-card difficulty-${item.id}`}
              key={item.id}
              onClick={() => onChoose(item.id)}
              type="button"
            >
              <span className="card-number">0{index + 1}</span>
              <div className="difficulty-wave" aria-hidden="true">
                {Array.from({ length: 18 }, (_, bar) => (
                  <i key={bar} style={{ height: `${18 + ((bar * (index + 3)) % 42)}%` }} />
                ))}
              </div>
              <small>{item.eyebrow}</small>
              <h2>{item.label}</h2>
              <p>{item.description}</p>
              <span className="card-cta">SÉLECTIONNER <b>→</b></span>
            </button>
          ))}
        </div>
        <p className="assist-note">
          Vous pourrez toujours changer la difficulté dans la sélection des chapitres.
        </p>
      </section>
    </main>
  );
}

function ChapterScreen({
  save,
  difficulty,
  onDifficulty,
  onChoose,
  onBack,
}: {
  save: SaveData;
  difficulty: DifficultyId;
  onDifficulty: (difficulty: DifficultyId) => void;
  onChoose: (index: number) => void;
  onBack: () => void;
}) {
  return (
    <main className="panel-screen">
      <header className="panel-header">
        <BackButton onClick={onBack} />
        <Brand compact />
        <label className="difficulty-select">
          <span>Difficulté</span>
          <select
            value={difficulty}
            onChange={(event) => onDifficulty(event.target.value as DifficultyId)}
          >
            {DIFFICULTIES.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
      </header>
      <section className="panel-content chapter-content">
        <div className="section-heading">
          <span>BANDES RÉCUPÉRÉES</span>
          <h1>Trois émissions. Une seule aube.</h1>
        </div>
        <div className="chapter-list">
          {CHAPTERS.map((item) => {
            const locked = item.index > save.unlockedChapter;
            const record = save.records[recordKey(item.id, difficulty)];
            const completed = save.completed.includes(item.id);
            return (
              <button
                className={`chapter-card ${locked ? "locked" : ""}`}
                disabled={locked}
                key={item.id}
                onClick={() => onChoose(item.index)}
                style={{ "--chapter-accent": item.palette[0] } as CSSProperties}
                type="button"
              >
                <span className="chapter-index">0{item.index + 1}</span>
                <div className="chapter-signal" aria-hidden="true">
                  <i /><i /><i /><i /><i /><i /><i /><i /><i />
                </div>
                <div className="chapter-copy">
                  <small>{item.act} · {item.location}</small>
                  <h2>{item.title}</h2>
                  <p>{item.track} · {item.bpm} BPM · {formatDuration(item.duration)}</p>
                </div>
                <div className="chapter-record">
                  {locked ? (
                    <><b>×</b><span>SIGNAL VERROUILLÉ</span></>
                  ) : record ? (
                    <><b>{record.rank}</b><span>{formatScore(record.score)} PTS</span></>
                  ) : (
                    <><b>{completed ? "✓" : "—"}</b><span>{completed ? "TERMINÉ" : "AUCUN SCORE"}</span></>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function IntroScreen({
  chapter,
  step,
  difficulty,
  onStep,
  onStart,
  onBack,
}: {
  chapter: (typeof CHAPTERS)[number];
  step: number;
  difficulty: DifficultyId;
  onStep: (step: number) => void;
  onStart: () => void;
  onBack: () => void;
}) {
  const isLast = step >= chapter.transmission.length - 1;
  return (
    <main className={`intro-screen intro-${chapter.motif}`}>
      <div className="intro-visual" aria-hidden="true">
        <div className="tape-reel tape-left"><i /></div>
        <div className="tape-reel tape-right"><i /></div>
        <div className="tape-line" />
        <div className="intro-spectrum">
          {Array.from({ length: 44 }, (_, index) => <i key={index} />)}
        </div>
        <div className="intro-shadow" />
      </div>
      <header className="intro-header">
        <BackButton onClick={onBack} />
        <Brand compact />
        <span>ENREGISTREMENT {chapter.index + 1}/3</span>
      </header>
      <section className="intro-card" key={step}>
        <div className="intro-progress">
          {chapter.transmission.map((_, index) => (
            <i className={index <= step ? "active" : ""} key={index} />
          ))}
        </div>
        <small>{chapter.act} · LOG 0{step + 1}</small>
        <h1>{step === 0 ? chapter.title : chapter.transmission[step]}</h1>
        {step === 0 ? (
          <>
            <p>{chapter.transmission[step]}</p>
            <dl>
              <div><dt>MORCEAU</dt><dd>{chapter.track}</dd></div>
              <div><dt>TEMPO</dt><dd>{chapter.bpm} BPM</dd></div>
              <div><dt>MODE</dt><dd>{DIFFICULTIES.find((item) => item.id === difficulty)?.label}</dd></div>
            </dl>
          </>
        ) : (
          <p className="transcript-line">REC // {String(step + 1).padStart(2, "0")} — K-27</p>
        )}
        <div className="intro-actions">
          {step > 0 && (
            <button className="secondary-button" onClick={() => onStep(step - 1)} type="button">
              PRÉCÉDENT
            </button>
          )}
          {!isLast ? (
            <button className="primary-button" onClick={() => onStep(step + 1)} type="button">
              CONTINUER <span>→</span>
            </button>
          ) : (
            <button className="primary-button start-track-button" onClick={onStart} type="button">
              <span>BRANCHER LA GUITARE</span>
              <small>A S D F G · ESPACE = FEEDBACK</small>
            </button>
          )}
        </div>
      </section>
      <p className="intro-objective"><b>OBJECTIF</b> {chapter.objective}</p>
    </main>
  );
}

function Meter({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className={`hud-meter ${danger ? "danger-meter" : ""}`}>
      <span>{label}</span>
      <div><i style={{ width: `${clamp(value, 0, 1) * 100}%` }} /></div>
      <b>{Math.round(clamp(value, 0, 1) * 100)}</b>
    </div>
  );
}

function PlayScreen({
  canvasRef,
  chapter,
  difficulty,
  view,
  paused,
  audioWarning,
  settings,
  onPause,
  onResume,
  onQuit,
  onLaneDown,
  onLaneUp,
  onFeedback,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  chapter: (typeof CHAPTERS)[number];
  difficulty: DifficultyId;
  view: RunView;
  paused: boolean;
  audioWarning: boolean;
  settings: GameSettings;
  onPause: () => void;
  onResume: () => void;
  onQuit: () => void;
  onLaneDown: (lane: number) => void;
  onLaneUp: (lane: number) => void;
  onFeedback: () => void;
}) {
  const progress = clamp(view.timeMs / view.durationMs, 0, 1);
  return (
    <main
      className={`play-screen ${settings.screenShake && view.attacks > 0 ? "threat-shake" : ""}`}
      data-threat={Math.round(view.threat / 20)}
    >
      <canvas ref={canvasRef} className="game-canvas" aria-label="Piste rythmique à cinq voies" />
      <header className="play-hud-top">
        <div className="track-ident">
          <small>{chapter.act} · {difficulty.toUpperCase()}</small>
          <strong>{chapter.track}</strong>
          <span>{chapter.artist} · {chapter.bpm} BPM</span>
        </div>
        <div className="track-progress" aria-label={`Progression ${Math.round(progress * 100)} %`}>
          <i style={{ width: `${progress * 100}%` }} />
          <span>{formatDuration(view.timeMs / 1000)} / {formatDuration(view.durationMs / 1000)}</span>
        </div>
        <button className="pause-button" onClick={onPause} type="button" aria-label="Mettre en pause">
          Ⅱ
        </button>
      </header>

      <aside className="survival-hud">
        <Meter label="LUCIDITÉ" value={view.lucidity / view.maxLucidity} />
        <Meter label="PROXIMITÉ" value={view.threat / 100} danger />
        <p className="threat-copy">
          <span className="status-dot" />
          {view.threat > 78 ? "DERRIÈRE VOUS" : view.threat > 48 ? "SIGNAL HOSTILE" : "DISTANCE STABLE"}
        </p>
      </aside>

      <aside className="score-hud">
        <small>SCORE</small>
        <strong>{formatScore(view.score)}</strong>
        <div>
          <span><b>{view.combo}</b> COMBO</span>
          <span><b>×{view.multiplier}</b> MULTI</span>
        </div>
        <p>{view.accuracy ? percent(view.accuracy) : "—"} PRÉCISION</p>
      </aside>

      {view.judgement && (
        <div className={`judgement judgement-${view.judgement}`} key={`${view.timeMs}-${view.judgement}`}>
          <strong>{GRADE_LABELS[view.judgement]}</strong>
          {view.offsetMs !== null && view.judgement !== "miss" && (
            <span>{view.offsetMs > 0 ? "+" : ""}{view.offsetMs} ms</span>
          )}
        </div>
      )}

      {chapter.index === 2 && (
        <div className="anchor-hud">
          <small>ANCRES SONORES</small>
          <div>
            {[0, 1, 2].map((anchor) => (
              <i className={anchor < view.anchors ? "broken" : ""} key={anchor}>◇</i>
            ))}
          </div>
        </div>
      )}

      <div className="coach-hint">
        {view.timeMs < 7000
          ? "Frappez quand les symboles traversent le câble blanc."
          : view.feedbackReady
            ? "FEEDBACK PRÊT — ESPACE"
            : view.combo >= 10
              ? "Le signal recule. Gardez le rythme."
              : ""}
      </div>

      <footer className="play-controls">
        <div className="lane-controls" aria-label="Commandes tactiles">
          {LANE_DEFINITIONS.map((lane, index) => (
            <button
              className="lane-button"
              key={lane.code}
              onContextMenu={(event) => event.preventDefault()}
              onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                onLaneDown(index);
              }}
              onPointerUp={() => onLaneUp(index)}
              onPointerCancel={() => onLaneUp(index)}
              style={{ "--lane-color": lane.color } as CSSProperties}
              type="button"
              aria-label={`Piste ${index + 1}, touche ${lane.label}`}
            >
              <span>{lane.symbol}</span>
              <kbd>{lane.label}</kbd>
            </button>
          ))}
        </div>
        <button
          className={`feedback-button ${view.feedbackReady ? "ready" : ""} ${view.feedbackActive ? "active" : ""}`}
          disabled={!view.feedbackReady}
          onClick={onFeedback}
          type="button"
        >
          <span className="feedback-charge" style={{ "--charge": view.feedback } as CSSProperties} />
          <b>ϟ</b>
          <span>FEEDBACK<kbd>ESPACE</kbd></span>
        </button>
      </footer>

      {audioWarning && (
        <p className="audio-warning" role="status">Audio indisponible — le mode visuel reste jouable.</p>
      )}
      {paused && (
        <div className="pause-overlay" role="dialog" aria-modal="true" aria-label="Jeu en pause">
          <div className="pause-card">
            <small>TRANSMISSION SUSPENDUE</small>
            <h2>Le silence se rapproche.</h2>
            <p>Le chronomètre et la menace sont arrêtés.</p>
            <button className="primary-button" onClick={onResume} type="button">REPRENDRE</button>
            <button className="secondary-button" onClick={onQuit} type="button">ABANDONNER LA STATION</button>
          </div>
        </div>
      )}
    </main>
  );
}

function ResultScreen({
  result,
  chapter,
  campaign,
  onContinue,
  onRetry,
  onMenu,
}: {
  result: RunResult;
  chapter: (typeof CHAPTERS)[number];
  campaign: boolean;
  onContinue: () => void;
  onRetry: () => void;
  onMenu: () => void;
}) {
  return (
    <main className={`result-screen ${result.cleared ? "cleared" : "failed"}`}>
      <div className="result-backdrop" aria-hidden="true">
        <div className="result-ring" />
        <div className="result-wave" />
      </div>
      <header className="result-header"><Brand compact /></header>
      <section className="result-card">
        <div className="rank-block">
          <small>{result.cleared ? "TRANSMISSION COMPLÈTE" : "SIGNAL PERDU"}</small>
          <strong>{result.rank}</strong>
          <span>{result.newRecord ? "NOUVEAU RECORD" : chapter.track}</span>
        </div>
        <div className="result-copy">
          <span>{chapter.act}</span>
          <h1>{result.cleared ? chapter.outro[0] : "La porte s'est ouverte."}</h1>
          <p>{result.cleared ? chapter.outro[1] : "Recalibrez le signal et reprenez avant que la station ne mémorise votre silence."}</p>
        </div>
        <div className="result-score">
          <small>SCORE FINAL</small>
          <strong>{formatScore(result.score)}</strong>
          {result.objectiveCompleted && <span>+ OBJECTIF 5 000</span>}
        </div>
        <div className="stats-grid">
          <div><b>{percent(result.accuracy)}</b><span>PRÉCISION</span></div>
          <div><b>{result.maxCombo}</b><span>MAX COMBO</span></div>
          <div><b>{result.perfects}</b><span>PARFAITS</span></div>
          <div><b>{result.misses}</b><span>RATÉS</span></div>
          <div><b>{Math.round(result.lucidity)}</b><span>LUCIDITÉ</span></div>
          <div><b>{result.anchors}/3</b><span>ANCRES</span></div>
        </div>
        <div className={`fragment-result ${result.fragmentFound ? "found" : ""}`}>
          <b>{result.fragmentFound ? "◈" : "◇"}</b>
          <span>
            <small>FRAGMENT DE MÉMOIRE</small>
            {result.fragmentFound ? "VOIX ISOLÉE DANS LE SIGNAL" : chapter.fragmentCondition}
          </span>
        </div>
        <div className="result-actions">
          <button className="primary-button" onClick={onContinue} type="button">
            {result.cleared ? (campaign ? "CONTINUER L'ÉMISSION" : "RETOUR AUX CHAPITRES") : "RÉÉCOUTER LA BANDE"}
          </button>
          <button className="secondary-button" onClick={result.cleared ? onMenu : onRetry} type="button">
            {result.cleared ? "MENU PRINCIPAL" : "RÉESSAYER"}
          </button>
        </div>
      </section>
    </main>
  );
}

function UpgradeScreen({
  owned,
  onChoose,
  onBack,
}: {
  owned: UpgradeId[];
  onChoose: (upgrade: UpgradeId) => void;
  onBack: () => void;
}) {
  return (
    <main className="panel-screen upgrade-screen">
      <header className="panel-header">
        <BackButton onClick={onBack} label="Abandonner" />
        <Brand compact />
        <span className="header-code">INTERLUDE</span>
      </header>
      <section className="panel-content upgrade-content">
        <div className="section-heading">
          <span>LE SIGNAL A LAISSÉ UNE TRACE</span>
          <h1>Choisissez ce qui vous suivra.</h1>
          <p>Une modification restera active jusqu&apos;à la fin de cette émission.</p>
        </div>
        <div className="upgrade-grid">
          {UPGRADES.map((upgrade) => {
            const alreadyOwned = owned.includes(upgrade.id);
            return (
              <button
                disabled={alreadyOwned}
                key={upgrade.id}
                onClick={() => onChoose(upgrade.id)}
                type="button"
              >
                <span className="upgrade-icon">{upgrade.icon}</span>
                <small>{alreadyOwned ? "DÉJÀ INSTALLÉ" : `MODIFICATION // ${upgrade.id.toUpperCase()}`}</small>
                <h2>{upgrade.name}</h2>
                <p>{upgrade.description}</p>
                <b>{upgrade.effect}</b>
                <i>SÉLECTIONNER →</i>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function ArchivesScreen({ save, onBack }: { save: SaveData; onBack: () => void }) {
  return (
    <main className="panel-screen archive-screen">
      <header className="panel-header">
        <BackButton onClick={onBack} />
        <Brand compact />
        <span className="header-code">{save.fragments.length}/3 FRAGMENTS</span>
      </header>
      <section className="panel-content archive-content">
        <div className="section-heading">
          <span>MÉMOIRE DU RELAIS K-27</span>
          <h1>Ce que le bruit essayait de cacher.</h1>
        </div>
        <div className="fragment-grid">
          {CHAPTERS.map((item) => {
            const found = save.fragments.includes(item.id);
            return (
              <article className={found ? "found" : ""} key={item.id}>
                <div className="fragment-symbol">{found ? "◈" : "◇"}</div>
                <small>FRAGMENT 0{item.index + 1}</small>
                <h2>{found ? item.title : "DONNÉES CORROMPUES"}</h2>
                <p>
                  {found
                    ? item.index === 0
                      ? "La voix sur la bande est la vôtre. La date d'enregistrement n'existe pas encore."
                      : item.index === 1
                        ? "K-27 n'était pas une station radio : c'était un instrument d'annulation."
                        : "Les Ancres accordent le monde entier sur une seule fréquence."
                    : item.fragmentCondition}
                </p>
              </article>
            );
          })}
        </div>
        <div className="archive-summary">
          <div><b>{save.runs}</b><span>TRANSMISSIONS TENTÉES</span></div>
          <div><b>{save.completed.length}/3</b><span>CHAPITRES SURVÉCUS</span></div>
          <div><b>{save.upgrades.length}/3</b><span>MODIFICATIONS DÉCOUVERTES</span></div>
        </div>
      </section>
    </main>
  );
}

function RangeSetting({
  label,
  description,
  value,
  min,
  max,
  step,
  unit = "%",
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const display = unit === "%" ? Math.round(value * 100) : Math.round(value);
  return (
    <label className="setting-row range-setting">
      <span><b>{label}</b><small>{description}</small></span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output>{display}{unit}</output>
    </label>
  );
}

function ToggleSetting({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="setting-row toggle-setting">
      <span><b>{label}</b><small>{description}</small></span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i aria-hidden="true" />
    </label>
  );
}

function SettingsScreen({
  settings,
  confirmReset,
  onChange,
  onAskReset,
  onCancelReset,
  onReset,
  onBack,
}: {
  settings: GameSettings;
  confirmReset: boolean;
  onChange: <Key extends keyof GameSettings>(key: Key, value: GameSettings[Key]) => void;
  onAskReset: () => void;
  onCancelReset: () => void;
  onReset: () => void;
  onBack: () => void;
}) {
  return (
    <main className="panel-screen settings-screen">
      <header className="panel-header">
        <BackButton onClick={onBack} />
        <Brand compact />
        <span className="header-code">CONFIGURATION</span>
      </header>
      <section className="panel-content settings-content">
        <div className="section-heading">
          <span>CONSOLE DE MIXAGE</span>
          <h1>Paramètres & accessibilité.</h1>
        </div>
        <div className="settings-columns">
          <div className="settings-group">
            <h2>AUDIO</h2>
            <RangeSetting label="Volume général" description="Toute la sortie audio" value={settings.masterVolume} min={0} max={1} step={0.01} onChange={(value) => onChange("masterVolume", value)} />
            <RangeSetting label="Musique" description="Synthés et guitare procédurale" value={settings.musicVolume} min={0} max={1} step={0.01} onChange={(value) => onChange("musicVolume", value)} />
            <RangeSetting label="Effets" description="Frappes, jugements et Feedback" value={settings.effectsVolume} min={0} max={1} step={0.01} onChange={(value) => onChange("effectsVolume", value)} />
            <RangeSetting label="Ambiance" description="Station, parasites et présence" value={settings.ambienceVolume} min={0} max={1} step={0.01} onChange={(value) => onChange("ambienceVolume", value)} />
            <RangeSetting label="Décalage visuel" description="Ajustez si les notes semblent tôt ou tard" value={settings.latencyOffset} min={-150} max={150} step={5} unit=" ms" onChange={(value) => onChange("latencyOffset", value)} />
          </div>
          <div className="settings-group">
            <h2>VISUEL & CONFORT</h2>
            <ToggleSetting label="Contraste renforcé" description="Éclaircit les pistes et les textes" checked={settings.highContrast} onChange={(value) => onChange("highContrast", value)} />
            <ToggleSetting label="Réduire les mouvements" description="Désactive les pulsations et déplacements décoratifs" checked={settings.reducedMotion} onChange={(value) => onChange("reducedMotion", value)} />
            <ToggleSetting label="Secousses de menace" description="Réaction de l'écran aux attaques" checked={settings.screenShake} onChange={(value) => onChange("screenShake", value)} />
            <RangeSetting label="Taille des notes" description="Agrandit les symboles de la piste" value={settings.noteSize} min={0.8} max={1.35} step={0.05} unit="×" onChange={(value) => onChange("noteSize", value)} />
            <div className="controls-reference">
              <span><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>F</kbd><kbd>G</kbd></span>
              <p><b>PISTES</b> — Chaque voie possède une couleur et un symbole.</p>
              <span><kbd>ESPACE</kbd><kbd>ÉCHAP</kbd></span>
              <p><b>FEEDBACK / PAUSE</b></p>
            </div>
          </div>
        </div>
        <div className="danger-zone">
          {!confirmReset ? (
            <button className="text-button" onClick={onAskReset} type="button">EFFACER LA PROGRESSION</button>
          ) : (
            <div role="alertdialog" aria-label="Confirmer l'effacement">
              <span>Effacer définitivement scores, fragments et réglages ?</span>
              <button onClick={onReset} type="button">OUI, EFFACER</button>
              <button onClick={onCancelReset} type="button">ANNULER</button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function EndingScreen({
  ending,
  fragments,
  onReplay,
  onMenu,
}: {
  ending: EndingDefinition;
  fragments: number;
  onReplay: () => void;
  onMenu: () => void;
}) {
  return (
    <main className="ending-screen">
      <div className="ending-sun" aria-hidden="true" />
      <div className="ending-towers" aria-hidden="true">
        <i /><i /><i /><i /><i /><i /><i />
      </div>
      <section className="ending-card">
        <Brand compact />
        <small>{ending.eyebrow}</small>
        <h1>{ending.title}</h1>
        <p>{ending.text}</p>
        <div className="ending-fragments">
          {[0, 1, 2].map((fragment) => <i key={fragment}>{fragment < fragments ? "◈" : "◇"}</i>)}
        </div>
        <div>
          <button className="primary-button" onClick={onReplay} type="button">REJOUER L&apos;ÉMISSION</button>
          <button className="secondary-button" onClick={onMenu} type="button">MENU PRINCIPAL</button>
        </div>
      </section>
      <footer>CONCEPTION, MUSIQUE ET UNIVERS ORIGINAUX · AUCUN ASSET SOUS LICENCE</footer>
    </main>
  );
}
