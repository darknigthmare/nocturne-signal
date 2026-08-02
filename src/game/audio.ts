/**
 * Procedural Web Audio score for NOCTURNE SIGNAL.
 *
 * Nothing is allocated at module load. Call `unlock()` or `start()` directly
 * from a pointer/keyboard handler so mobile browsers can authorise audio.
 * Every sound is synthesised here; the engine never fetches an audio file.
 */

export type AudioLayer = "music" | "percussion" | "ambience" | "sfx";
export type AudioEngineState = "idle" | "playing" | "suspended";
export type AudioTheme = "station" | "tunnels" | "choir";
export type JudgementGrade = "perfect" | "great" | "good" | "miss";
export type HorrorAttackKind = "impact" | "whisper" | "static" | "heartbeat";

export interface AudioChartNote {
  readonly timeMs: number;
  readonly lane: number;
  readonly kind?: string;
  readonly durationMs?: number;
  readonly accent?: boolean;
}

export interface AudioChart {
  readonly bpm: number;
  readonly durationMs: number;
  readonly notes: readonly AudioChartNote[];
  readonly id?: string;
  readonly trackId?: string;
  readonly title?: string;
  readonly chapter?: number;
  readonly laneCount?: number;
}

export interface AudioEngineOptions {
  readonly masterVolume?: number;
  readonly layerVolumes?: Partial<Record<AudioLayer, number>>;
  /** Seconds rendered ahead of the playhead. Values around 0.1 are responsive. */
  readonly scheduleAheadSeconds?: number;
  readonly schedulerIntervalMs?: number;
  readonly onStateChange?: (state: AudioEngineState) => void;
}

export interface StartSongOptions {
  readonly offsetMs?: number;
  readonly theme?: AudioTheme;
  /** Musical density from 0 (restrained) to 1 (nightmare). */
  readonly intensity?: number;
  readonly leadInSeconds?: number;
  readonly onEnded?: () => void;
}

export interface HorrorAttackOptions {
  readonly kind?: HorrorAttackKind;
  readonly intensity?: number;
  /** -1 is hard left and 1 is hard right. */
  readonly pan?: number;
}

export interface AudioEngineSnapshot {
  readonly state: AudioEngineState;
  readonly supported: boolean;
  readonly contextState: AudioContextState | "unavailable";
  readonly positionMs: number;
  readonly durationMs: number;
  readonly bpm: number | null;
  readonly masterVolume: number;
  readonly muted: boolean;
}

interface ThemeDefinition {
  readonly rootMidi: number;
  readonly progression: readonly number[];
  readonly scale: readonly number[];
  readonly droneRatio: number;
  readonly delaySeconds: number;
}

interface Playback {
  readonly chart: NormalizedChart;
  readonly theme: AudioTheme;
  readonly songZeroTime: number;
  readonly onEnded?: () => void;
  nextStep: number;
  nextNote: number;
}

interface NormalizedChart {
  readonly bpm: number;
  readonly durationMs: number;
  readonly notes: readonly AudioChartNote[];
  readonly identity: string;
  readonly trackId?: string;
  readonly title?: string;
  readonly chapter?: number;
}

type AudioContextConstructor = new (contextOptions?: AudioContextOptions) => AudioContext;
type ScheduledSource = OscillatorNode | AudioBufferSourceNode;

const LAYERS: readonly AudioLayer[] = ["music", "percussion", "ambience", "sfx"];
const DEFAULT_LAYER_VOLUMES: Readonly<Record<AudioLayer, number>> = Object.freeze({
  music: 0.62,
  percussion: 0.68,
  ambience: 0.42,
  sfx: 0.9,
});

const THEMES: Readonly<Record<AudioTheme, ThemeDefinition>> = Object.freeze({
  station: Object.freeze({
    rootMidi: 38,
    progression: Object.freeze([0, -3, 2, -5]),
    scale: Object.freeze([0, 3, 5, 7, 10]),
    droneRatio: 1.498,
    delaySeconds: 0.29,
  }),
  tunnels: Object.freeze({
    rootMidi: 35,
    progression: Object.freeze([0, 1, -5, -2]),
    scale: Object.freeze([0, 2, 5, 6, 9]),
    droneRatio: 1.414,
    delaySeconds: 0.227,
  }),
  choir: Object.freeze({
    rootMidi: 40,
    progression: Object.freeze([0, -2, 3, -6]),
    scale: Object.freeze([0, 3, 6, 8, 11]),
    droneRatio: 1.335,
    delaySeconds: 0.193,
  }),
});

const MIN_GAIN = 0.0001;

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function volumeGain(value: number): number {
  const normalized = clamp(value);
  return normalized * normalized;
}

function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function hashString(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/** A deterministic random value for one scheduled grid position. */
function randomAt(seed: number, position: number, salt = 0): number {
  let value = (seed ^ Math.imul(position + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 4_294_967_296;
}

function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof globalThis === "undefined") return null;
  const audioGlobal = globalThis as typeof globalThis & {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return audioGlobal.AudioContext ?? audioGlobal.webkitAudioContext ?? null;
}

function normalizeChart(chart: AudioChart): NormalizedChart {
  if (!Number.isFinite(chart.bpm) || chart.bpm <= 0) {
    throw new RangeError("Audio chart BPM must be a finite positive number.");
  }
  if (!Number.isFinite(chart.durationMs) || chart.durationMs <= 0) {
    throw new RangeError("Audio chart durationMs must be a finite positive number.");
  }
  if (!Array.isArray(chart.notes)) {
    throw new TypeError("Audio chart notes must be an array.");
  }

  const notes = chart.notes.map((note, index) => {
    if (!Number.isFinite(note.timeMs) || note.timeMs < 0) {
      throw new RangeError(`Audio chart note ${index} has an invalid timeMs.`);
    }
    if (!Number.isInteger(note.lane) || note.lane < 0) {
      throw new RangeError(`Audio chart note ${index} has an invalid lane.`);
    }
    return note;
  });
  notes.sort((left, right) => left.timeMs - right.timeMs || left.lane - right.lane);

  return {
    bpm: chart.bpm,
    durationMs: chart.durationMs,
    notes,
    identity: chart.trackId ?? chart.id ?? chart.title ?? `${chart.bpm}:${chart.durationMs}`,
    ...(chart.trackId === undefined ? {} : { trackId: chart.trackId }),
    ...(chart.title === undefined ? {} : { title: chart.title }),
    ...(chart.chapter === undefined ? {} : { chapter: chart.chapter }),
  };
}

function lowerBoundNotes(notes: readonly AudioChartNote[], targetMs: number): number {
  let low = 0;
  let high = notes.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (notes[middle].timeMs < targetMs) low = middle + 1;
    else high = middle;
  }
  return low;
}

function inferTheme(chart: NormalizedChart): AudioTheme {
  const identity = `${chart.trackId ?? ""} ${chart.title ?? ""}`.toLowerCase();
  if (identity.includes("pulse") || identity.includes("tunnel") || chart.chapter === 2) return "tunnels";
  if (identity.includes("choir") || identity.includes("wire") || chart.chapter === 3) return "choir";
  return "station";
}

/**
 * Stateful, lazy Web Audio engine. One instance is enough for the whole game.
 * It is safe to construct during SSR because the browser API is only touched
 * by `unlock()`/`start()`.
 */
export class NocturneAudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterFilter: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private delay: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayWet: GainNode | null = null;
  private layerGains: Partial<Record<AudioLayer, GainNode>> = {};
  private noiseBuffer: AudioBuffer | null = null;
  private playback: Playback | null = null;
  private schedulerId: ReturnType<typeof globalThis.setInterval> | null = null;
  private readonly activeSources = new Map<ScheduledSource, readonly AudioNode[]>();
  private readonly onStateChange?: (state: AudioEngineState) => void;
  private readonly scheduleAheadSeconds: number;
  private readonly schedulerIntervalMs: number;
  private stateValue: AudioEngineState = "idle";
  private masterVolumeValue: number;
  private readonly layerVolumeValues: Record<AudioLayer, number>;
  private mutedValue = false;
  private intensityValue = 0.55;
  private disposed = false;
  private songSeed = 0;

  public constructor(options: AudioEngineOptions = {}) {
    this.masterVolumeValue = clamp(finiteOr(options.masterVolume, 0.74));
    this.layerVolumeValues = { ...DEFAULT_LAYER_VOLUMES };
    for (const layer of LAYERS) {
      const requested = options.layerVolumes?.[layer];
      if (requested !== undefined) this.layerVolumeValues[layer] = clamp(finiteOr(requested, 0));
    }
    this.scheduleAheadSeconds = clamp(finiteOr(options.scheduleAheadSeconds, 0.12), 0.06, 0.4);
    this.schedulerIntervalMs = clamp(Math.round(finiteOr(options.schedulerIntervalMs, 25)), 15, 100);
    this.onStateChange = options.onStateChange;
  }

  public static isSupported(): boolean {
    return getAudioContextConstructor() !== null;
  }

  /**
   * Authorise and initialise Web Audio. Invoke synchronously from a user gesture
   * on iOS/Android. Starting a song also calls this method.
   */
  public async unlock(): Promise<void> {
    this.assertUsable();
    const context = this.ensureContext();
    if (context.state === "closed") throw new Error("The NOCTURNE SIGNAL audio context is closed.");

    // A silent one-frame buffer covers older WebKit's explicit source-unlock requirement.
    const silent = context.createBufferSource();
    silent.buffer = context.createBuffer(1, 1, context.sampleRate);
    if (this.masterGain) silent.connect(this.masterGain);
    silent.start();
    if (context.state !== "running") await context.resume();
  }

  /** Start or replace a procedural song driven by the supplied gameplay chart. */
  public async start(chart: AudioChart, options: StartSongOptions = {}): Promise<void> {
    const normalizedChart = normalizeChart(chart);
    await this.unlock();
    const context = this.requireContext();

    this.stopPlayback(false);
    const offsetMs = clamp(finiteOr(options.offsetMs, 0), 0, normalizedChart.durationMs);
    const leadInSeconds = clamp(finiteOr(options.leadInSeconds, 0.045), 0.01, 1);
    const stepMs = 30_000 / normalizedChart.bpm;
    const theme = options.theme ?? inferTheme(normalizedChart);
    const now = context.currentTime;

    this.intensityValue = clamp(finiteOr(options.intensity, this.intensityValue));
    this.songSeed = hashString(`${normalizedChart.identity}:${theme}`);
    this.playback = {
      chart: normalizedChart,
      theme,
      songZeroTime: now + leadInSeconds - offsetMs / 1_000,
      nextStep: Math.max(0, Math.ceil(offsetMs / stepMs - 1e-7)),
      nextNote: lowerBoundNotes(normalizedChart.notes, offsetMs),
      ...(options.onEnded === undefined ? {} : { onEnded: options.onEnded }),
    };

    this.configureDelay(theme);
    this.startContinuousAmbience(now + 0.008, theme);
    this.setState("playing");
    this.runScheduler();
    this.startSchedulerTimer();
  }

  public async suspend(): Promise<void> {
    if (!this.context || this.stateValue !== "playing") return;
    this.clearSchedulerTimer();
    await this.context.suspend();
    this.setState("suspended");
  }

  public async resume(): Promise<void> {
    this.assertUsable();
    if (!this.context || !this.playback || this.stateValue !== "suspended") return;
    await this.context.resume();
    this.setState("playing");
    this.runScheduler();
    this.startSchedulerTimer();
  }

  public stop(): void {
    this.stopPlayback(true);
  }

  /** Aliases make intent explicit at call sites controlling a song lifecycle. */
  public startSong(chart: AudioChart, options?: StartSongOptions): Promise<void> {
    return this.start(chart, options);
  }

  public suspendSong(): Promise<void> {
    return this.suspend();
  }

  public resumeSong(): Promise<void> {
    return this.resume();
  }

  public stopSong(): void {
    this.stop();
  }

  public setMasterVolume(volume: number): void {
    this.masterVolumeValue = clamp(finiteOr(volume, 0));
    this.applyMasterVolume();
  }

  public setLayerVolume(layer: AudioLayer, volume: number): void {
    this.layerVolumeValues[layer] = clamp(finiteOr(volume, 0));
    const gain = this.layerGains[layer];
    if (gain && this.context) this.smoothGain(gain.gain, volumeGain(this.layerVolumeValues[layer]));
  }

  public getLayerVolume(layer: AudioLayer): number {
    return this.layerVolumeValues[layer];
  }

  public setMuted(muted: boolean): void {
    this.mutedValue = muted;
    this.applyMasterVolume();
  }

  public setIntensity(intensity: number): void {
    this.intensityValue = clamp(finiteOr(intensity, 0));
  }

  public getPositionMs(): number {
    if (!this.context || !this.playback) return 0;
    return clamp(
      (this.context.currentTime - this.playback.songZeroTime) * 1_000,
      0,
      this.playback.chart.durationMs,
    );
  }

  public getSnapshot(): AudioEngineSnapshot {
    return {
      state: this.stateValue,
      supported: NocturneAudioEngine.isSupported(),
      contextState: this.context?.state ?? "unavailable",
      positionMs: this.getPositionMs(),
      durationMs: this.playback?.chart.durationMs ?? 0,
      bpm: this.playback?.chart.bpm ?? null,
      masterVolume: this.masterVolumeValue,
      muted: this.mutedValue,
    };
  }

  /** Immediate, lane-coloured input sound. Returns false while audio is locked. */
  public playLaneInput(lane: number, accent = false): boolean {
    const context = this.runningContext();
    const destination = this.layerGains.sfx;
    if (!context || !destination) return false;
    const laneIndex = Math.max(0, Math.floor(finiteOr(lane, 0))) % 5;
    const theme = THEMES[this.playback?.theme ?? "station"];
    const frequency = midiToFrequency(theme.rootMidi + 24 + theme.scale[laneIndex]);
    this.scheduleTone(context.currentTime + 0.004, accent ? 0.11 : 0.065, frequency, {
      destination,
      gain: accent ? 0.12 : 0.075,
      type: accent ? "sawtooth" : "square",
      endFrequency: frequency * (accent ? 1.06 : 0.985),
      pan: laneIndex / 2 - 1,
    });
    return true;
  }

  public playJudgement(grade: JudgementGrade, lane = 2, timingOffsetMs = 0): boolean {
    const context = this.runningContext();
    const destination = this.layerGains.sfx;
    if (!context || !destination) return false;
    const at = context.currentTime + 0.004;
    const laneIndex = Math.max(0, Math.floor(finiteOr(lane, 2))) % 5;
    const pan = laneIndex / 2 - 1;
    const timingPenalty = clamp(Math.abs(finiteOr(timingOffsetMs, 0)) / 180, 0, 0.35);
    const base = midiToFrequency(72 + laneIndex * 2);

    if (grade === "perfect") {
      [0, 7, 12].forEach((semitones, index) => {
        this.scheduleTone(at + index * 0.018, 0.17, base * 2 ** (semitones / 12), {
          destination,
          gain: 0.082 - index * 0.012,
          type: "sine",
          pan,
        });
      });
    } else if (grade === "great") {
      this.scheduleTone(at, 0.13, base, { destination, gain: 0.074, type: "triangle", pan });
      this.scheduleTone(at + 0.025, 0.11, base * 1.5, { destination, gain: 0.052, type: "sine", pan });
    } else if (grade === "good") {
      this.scheduleTone(at, 0.105, base * (1 - timingPenalty), {
        destination,
        gain: 0.065,
        type: "triangle",
        endFrequency: base * 0.92,
        pan,
      });
    } else {
      this.scheduleNoise(at, 0.16, { destination, gain: 0.11, lowpass: 1_700, pan });
      this.scheduleTone(at, 0.19, 92 + laneIndex * 8, {
        destination,
        gain: 0.09,
        type: "sawtooth",
        endFrequency: 54,
        pan,
      });
    }
    return true;
  }

  /** Rising defensive burst used when the Feedback meter is spent. */
  public playFeedback(): boolean {
    const context = this.runningContext();
    const destination = this.layerGains.sfx;
    if (!context || !destination) return false;
    const at = context.currentTime + 0.005;
    [0, 5, 9, 12].forEach((semitones, index) => {
      const frequency = midiToFrequency(55 + semitones);
      this.scheduleTone(at + index * 0.055, 0.45 - index * 0.035, frequency, {
        destination,
        gain: 0.105 - index * 0.012,
        type: index % 2 === 0 ? "triangle" : "sine",
        endFrequency: frequency * 2,
        pan: index / 1.5 - 1,
      });
    });
    this.scheduleNoise(at, 0.52, { destination, gain: 0.055, highpass: 2_600, pan: 0 });
    return true;
  }

  public playFeedbackActivation(): boolean {
    return this.playFeedback();
  }

  /** One of four authored procedural scare signatures. */
  public playHorrorAttack(
    kindOrOptions: HorrorAttackKind | HorrorAttackOptions = "impact",
    legacyIntensity = 0.85,
  ): boolean {
    const context = this.runningContext();
    const destination = this.layerGains.sfx;
    if (!context || !destination) return false;
    const options: HorrorAttackOptions =
      typeof kindOrOptions === "string"
        ? { kind: kindOrOptions, intensity: legacyIntensity }
        : kindOrOptions;
    const kind = options.kind ?? "impact";
    const intensity = clamp(finiteOr(options.intensity, 0.85), 0.05, 1);
    const pan = clamp(finiteOr(options.pan, randomAt(this.songSeed, Math.round(context.currentTime * 10)) * 2 - 1), -1, 1);
    const at = context.currentTime + 0.008;

    this.horrorFilterSweep(at, intensity);
    if (kind === "whisper") {
      this.scheduleNoise(at, 1.1, { destination, gain: 0.1 * intensity, bandpass: 1_250, pan });
      this.scheduleTone(at + 0.08, 0.9, 155, {
        destination,
        gain: 0.045 * intensity,
        type: "sine",
        endFrequency: 121,
        pan: -pan,
      });
    } else if (kind === "static") {
      for (let index = 0; index < 7; index += 1) {
        this.scheduleNoise(at + index * 0.055, 0.035 + (index % 3) * 0.012, {
          destination,
          gain: (0.08 + (index % 2) * 0.045) * intensity,
          bandpass: 900 + index * 430,
          pan: index % 2 === 0 ? pan : -pan,
        });
      }
    } else if (kind === "heartbeat") {
      this.scheduleKick(at, 0.16 * intensity, destination, pan);
      this.scheduleKick(at + 0.19, 0.12 * intensity, destination, pan * 0.7);
      this.scheduleNoise(at + 0.02, 0.48, { destination, gain: 0.035 * intensity, lowpass: 520, pan });
    } else {
      this.scheduleKick(at, 0.24 * intensity, destination, pan);
      this.scheduleNoise(at, 0.42, { destination, gain: 0.18 * intensity, lowpass: 2_400, pan });
      this.scheduleTone(at, 0.7, 68, {
        destination,
        gain: 0.16 * intensity,
        type: "sawtooth",
        endFrequency: 34,
        pan,
      });
    }
    return true;
  }

  /** Stop all voices and permanently release this instance's AudioContext. */
  public async dispose(): Promise<void> {
    if (this.disposed) return;
    this.stopPlayback(false);
    this.disposed = true;
    const context = this.context;
    this.disconnectGraph();
    this.context = null;
    if (context && context.state !== "closed") await context.close();
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error("This NOCTURNE SIGNAL audio engine has been disposed.");
  }

  private ensureContext(): AudioContext {
    if (this.context) return this.context;
    const Constructor = getAudioContextConstructor();
    if (!Constructor) throw new Error("Web Audio is unavailable in this environment.");
    const context = new Constructor({ latencyHint: "interactive" });
    this.context = context;
    this.createGraph(context);
    return context;
  }

  private requireContext(): AudioContext {
    if (!this.context) throw new Error("AudioContext is not initialised.");
    return this.context;
  }

  private runningContext(): AudioContext | null {
    return this.context?.state === "running" ? this.context : null;
  }

  private createGraph(context: AudioContext): void {
    const master = context.createGain();
    const filter = context.createBiquadFilter();
    const compressor = context.createDynamicsCompressor();
    const delay = context.createDelay(0.8);
    const delayFeedback = context.createGain();
    const delayWet = context.createGain();

    master.gain.value = this.mutedValue ? 0 : volumeGain(this.masterVolumeValue);
    filter.type = "lowpass";
    filter.frequency.value = 19_000;
    filter.Q.value = 0.4;
    compressor.threshold.value = -16;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;
    delay.delayTime.value = THEMES.station.delaySeconds;
    delayFeedback.gain.value = 0.17;
    delayWet.gain.value = 0.11;

    for (const layer of LAYERS) {
      const gain = context.createGain();
      gain.gain.value = volumeGain(this.layerVolumeValues[layer]);
      gain.connect(master);
      this.layerGains[layer] = gain;
    }
    this.layerGains.music?.connect(delay);
    this.layerGains.ambience?.connect(delay);
    delay.connect(delayWet);
    delay.connect(delayFeedback);
    delayFeedback.connect(delay);
    delayWet.connect(master);
    master.connect(filter);
    filter.connect(compressor);
    compressor.connect(context.destination);

    this.masterGain = master;
    this.masterFilter = filter;
    this.compressor = compressor;
    this.delay = delay;
    this.delayFeedback = delayFeedback;
    this.delayWet = delayWet;
  }

  private disconnectGraph(): void {
    for (const layer of LAYERS) this.layerGains[layer]?.disconnect();
    this.masterGain?.disconnect();
    this.masterFilter?.disconnect();
    this.compressor?.disconnect();
    this.delay?.disconnect();
    this.delayFeedback?.disconnect();
    this.delayWet?.disconnect();
    this.layerGains = {};
    this.masterGain = null;
    this.masterFilter = null;
    this.compressor = null;
    this.delay = null;
    this.delayFeedback = null;
    this.delayWet = null;
    this.noiseBuffer = null;
  }

  private configureDelay(theme: AudioTheme): void {
    if (!this.context || !this.delay) return;
    const at = this.context.currentTime;
    this.delay.delayTime.cancelScheduledValues(at);
    this.delay.delayTime.setTargetAtTime(THEMES[theme].delaySeconds, at, 0.04);
  }

  private applyMasterVolume(): void {
    if (!this.masterGain || !this.context) return;
    this.smoothGain(this.masterGain.gain, this.mutedValue ? 0 : volumeGain(this.masterVolumeValue));
  }

  private smoothGain(parameter: AudioParam, target: number): void {
    if (!this.context) return;
    const at = this.context.currentTime;
    parameter.cancelScheduledValues(at);
    parameter.setTargetAtTime(target, at, 0.018);
  }

  private setState(state: AudioEngineState): void {
    if (state === this.stateValue) return;
    this.stateValue = state;
    this.onStateChange?.(state);
  }

  private startSchedulerTimer(): void {
    if (this.schedulerId !== null) return;
    this.schedulerId = globalThis.setInterval(() => this.runScheduler(), this.schedulerIntervalMs);
  }

  private clearSchedulerTimer(): void {
    if (this.schedulerId === null) return;
    globalThis.clearInterval(this.schedulerId);
    this.schedulerId = null;
  }

  private runScheduler(): void {
    const context = this.context;
    const playback = this.playback;
    if (!context || !playback || this.stateValue !== "playing" || context.state !== "running") return;

    const now = context.currentTime;
    const horizon = now + this.scheduleAheadSeconds;
    const chart = playback.chart;
    const stepSeconds = 30 / chart.bpm;
    const horizonSongMs = (horizon - playback.songZeroTime) * 1_000;

    while (playback.nextStep * stepSeconds * 1_000 <= horizonSongMs) {
      const songTimeSeconds = playback.nextStep * stepSeconds;
      if (songTimeSeconds * 1_000 > chart.durationMs) break;
      const at = playback.songZeroTime + songTimeSeconds;
      if (at >= now - 0.075) this.scheduleGridStep(playback.nextStep, Math.max(at, now + 0.002), playback.theme, chart.bpm);
      playback.nextStep += 1;
    }

    while (playback.nextNote < chart.notes.length && chart.notes[playback.nextNote].timeMs <= horizonSongMs) {
      const note = chart.notes[playback.nextNote];
      const at = playback.songZeroTime + note.timeMs / 1_000;
      if (at >= now - 0.075) this.scheduleChartNote(note, Math.max(at, now + 0.002), playback.theme);
      playback.nextNote += 1;
    }

    if ((now - playback.songZeroTime) * 1_000 >= chart.durationMs) this.finishNaturally(playback);
  }

  private scheduleGridStep(step: number, at: number, themeName: AudioTheme, bpm: number): void {
    const music = this.layerGains.music;
    const percussion = this.layerGains.percussion;
    const ambience = this.layerGains.ambience;
    if (!music || !percussion || !ambience) return;
    const theme = THEMES[themeName];
    const beat = Math.floor(step / 2);
    const isBeat = step % 2 === 0;
    const beatInBar = beat % 4;
    const bar = Math.floor(beat / 4);
    const rootOffset = theme.progression[bar % theme.progression.length];
    const rootMidi = theme.rootMidi + rootOffset;
    const beatSeconds = 60 / bpm;

    if (isBeat) {
      const bassFrequency = midiToFrequency(rootMidi);
      this.scheduleTone(at, Math.min(0.34, beatSeconds * 0.72), bassFrequency, {
        destination: music,
        gain: 0.085 + this.intensityValue * 0.035,
        type: "triangle",
        endFrequency: bassFrequency * 0.985,
        lowpass: 720,
      });

      if (beatInBar === 0 || beatInBar === 2 || this.intensityValue > 0.76) {
        this.scheduleKick(at, 0.13 + this.intensityValue * 0.045, percussion, 0);
      }
      if (beatInBar === 1 || beatInBar === 3) this.scheduleSnare(at, percussion);

      if (beat % 8 === 0) this.schedulePad(at, beatSeconds * 7.6, rootMidi, theme, music);
      if (beatInBar === 0 && randomAt(this.songSeed, bar, 5) > 0.58) {
        this.scheduleTone(at, beatSeconds * 1.5, midiToFrequency(rootMidi - 12) * theme.droneRatio, {
          destination: ambience,
          gain: 0.025 + this.intensityValue * 0.018,
          type: "sine",
          endFrequency: midiToFrequency(rootMidi - 12) * theme.droneRatio * 0.994,
          pan: randomAt(this.songSeed, bar, 7) * 1.4 - 0.7,
        });
      }
    } else if (this.intensityValue > 0.12) {
      this.scheduleHiHat(at, percussion, 0.025 + this.intensityValue * 0.028);
    }

    const crackleThreshold = 0.91 - this.intensityValue * 0.1;
    if (randomAt(this.songSeed, step, 11) > crackleThreshold) {
      this.scheduleNoise(at + 0.015, 0.025, {
        destination: ambience,
        gain: 0.035 + this.intensityValue * 0.025,
        bandpass: 1_800 + randomAt(this.songSeed, step, 13) * 3_200,
        pan: randomAt(this.songSeed, step, 17) * 2 - 1,
      });
    }
  }

  private scheduleChartNote(note: AudioChartNote, at: number, themeName: AudioTheme): void {
    const destination = this.layerGains.music;
    if (!destination) return;
    const theme = THEMES[themeName];
    const lane = note.lane % theme.scale.length;
    const frequency = midiToFrequency(theme.rootMidi + 24 + theme.scale[lane]);
    const isPulse = note.kind === "pulse" || note.accent === true;
    const isHold = note.kind === "hold" && finiteOr(note.durationMs, 0) > 0;
    const duration = isPulse ? 0.18 : isHold ? clamp(finiteOr(note.durationMs, 0) / 1_000, 0.12, 1.2) : 0.07;
    this.scheduleTone(at, duration, frequency, {
      destination,
      gain: isPulse ? 0.07 : 0.032 + this.intensityValue * 0.014,
      type: isPulse ? "sawtooth" : "square",
      endFrequency: frequency * (isHold ? 0.995 : 1.018),
      lowpass: isPulse ? 2_900 : 2_100,
      pan: lane / 2 - 1,
    });
  }

  private schedulePad(
    at: number,
    duration: number,
    rootMidi: number,
    theme: ThemeDefinition,
    destination: AudioNode,
  ): void {
    [0, theme.scale[1], theme.scale[3]].forEach((semitones, index) => {
      const frequency = midiToFrequency(rootMidi + 12 + semitones);
      this.scheduleTone(at + index * 0.012, duration, frequency, {
        destination,
        gain: 0.022 + this.intensityValue * 0.008,
        type: index === 1 ? "triangle" : "sine",
        endFrequency: frequency * (index === 1 ? 0.997 : 1.002),
        lowpass: 1_350 + this.intensityValue * 500,
        pan: index - 1,
        slowAttack: true,
      });
    });
  }

  private startContinuousAmbience(at: number, themeName: AudioTheme): void {
    const context = this.context;
    const destination = this.layerGains.ambience;
    if (!context || !destination) return;
    const theme = THEMES[themeName];

    const noise = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    const breathLfo = context.createOscillator();
    const breathDepth = context.createGain();
    noise.buffer = this.getNoiseBuffer(context);
    noise.loop = true;
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = themeName === "tunnels" ? 520 : 780;
    noiseFilter.Q.value = 0.55;
    noiseGain.gain.value = 0.027;
    breathLfo.type = "sine";
    breathLfo.frequency.value = themeName === "choir" ? 0.071 : 0.093;
    breathDepth.gain.value = 0.014;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(destination);
    breathLfo.connect(breathDepth);
    breathDepth.connect(noiseGain.gain);
    this.registerSource(noise, [noise, noiseFilter, noiseGain]);
    this.registerSource(breathLfo, [breathLfo, breathDepth]);
    noise.start(at, randomAt(this.songSeed, 0, 31));
    breathLfo.start(at);

    [1, theme.droneRatio].forEach((ratio, index) => {
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      oscillator.type = index === 0 ? "sine" : "triangle";
      oscillator.frequency.value = midiToFrequency(theme.rootMidi - 24) * ratio;
      oscillator.detune.value = index === 0 ? -4 : 7;
      filter.type = "lowpass";
      filter.frequency.value = 410 + index * 180;
      gain.gain.setValueAtTime(MIN_GAIN, at);
      gain.gain.exponentialRampToValueAtTime(index === 0 ? 0.065 : 0.026, at + 2.4 + index);
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(destination);
      this.registerSource(oscillator, [oscillator, filter, gain]);
      oscillator.start(at);
    });
  }

  private scheduleKick(at: number, gainAmount: number, destination: AudioNode, pan: number): void {
    this.scheduleTone(at, 0.17, 118, {
      destination,
      gain: gainAmount,
      type: "sine",
      endFrequency: 38,
      pan,
    });
  }

  private scheduleSnare(at: number, destination: AudioNode): void {
    this.scheduleNoise(at, 0.105, { destination, gain: 0.085 + this.intensityValue * 0.04, bandpass: 1_850, pan: 0 });
    this.scheduleTone(at, 0.075, 174, { destination, gain: 0.035, type: "triangle", endFrequency: 132 });
  }

  private scheduleHiHat(at: number, destination: AudioNode, gain: number): void {
    this.scheduleNoise(at, 0.037, { destination, gain, highpass: 5_400, pan: 0.16 });
  }

  private scheduleTone(
    at: number,
    duration: number,
    frequency: number,
    options: {
      readonly destination: AudioNode;
      readonly gain: number;
      readonly type: OscillatorType;
      readonly endFrequency?: number;
      readonly lowpass?: number;
      readonly pan?: number;
      readonly slowAttack?: boolean;
    },
  ): void {
    const context = this.context;
    if (!context) return;
    const safeDuration = Math.max(0.015, duration);
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const filter = options.lowpass === undefined ? null : context.createBiquadFilter();
    const panner = options.pan === undefined ? null : context.createStereoPanner();
    const peakAt = at + (options.slowAttack ? Math.min(1.2, safeDuration * 0.22) : 0.006);
    const releaseAt = at + safeDuration;

    oscillator.type = options.type;
    oscillator.frequency.setValueAtTime(Math.max(1, frequency), at);
    if (options.endFrequency !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, options.endFrequency), releaseAt);
    }
    envelope.gain.setValueAtTime(MIN_GAIN, at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(MIN_GAIN, options.gain), peakAt);
    envelope.gain.exponentialRampToValueAtTime(MIN_GAIN, releaseAt);
    oscillator.connect(filter ?? envelope);
    if (filter) {
      filter.type = "lowpass";
      filter.frequency.value = options.lowpass ?? 2_000;
      filter.Q.value = 0.7;
      filter.connect(envelope);
    }
    if (panner) {
      panner.pan.value = clamp(options.pan ?? 0, -1, 1);
      envelope.connect(panner);
      panner.connect(options.destination);
    } else {
      envelope.connect(options.destination);
    }

    const nodes: AudioNode[] = [oscillator, envelope];
    if (filter) nodes.push(filter);
    if (panner) nodes.push(panner);
    this.registerSource(oscillator, nodes);
    oscillator.start(at);
    oscillator.stop(releaseAt + 0.018);
  }

  private scheduleNoise(
    at: number,
    duration: number,
    options: {
      readonly destination: AudioNode;
      readonly gain: number;
      readonly lowpass?: number;
      readonly highpass?: number;
      readonly bandpass?: number;
      readonly pan?: number;
    },
  ): void {
    const context = this.context;
    if (!context) return;
    const safeDuration = clamp(duration, 0.012, 1.8);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const panner = options.pan === undefined ? null : context.createStereoPanner();
    source.buffer = this.getNoiseBuffer(context);
    if (options.bandpass !== undefined) {
      filter.type = "bandpass";
      filter.frequency.value = options.bandpass;
      filter.Q.value = 0.85;
    } else if (options.highpass !== undefined) {
      filter.type = "highpass";
      filter.frequency.value = options.highpass;
      filter.Q.value = 0.5;
    } else {
      filter.type = "lowpass";
      filter.frequency.value = options.lowpass ?? 2_000;
      filter.Q.value = 0.6;
    }
    envelope.gain.setValueAtTime(MIN_GAIN, at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(MIN_GAIN, options.gain), at + 0.004);
    envelope.gain.exponentialRampToValueAtTime(MIN_GAIN, at + safeDuration);
    source.connect(filter);
    filter.connect(envelope);
    if (panner) {
      panner.pan.value = clamp(options.pan ?? 0, -1, 1);
      envelope.connect(panner);
      panner.connect(options.destination);
    } else {
      envelope.connect(options.destination);
    }
    const nodes: AudioNode[] = [source, filter, envelope];
    if (panner) nodes.push(panner);
    this.registerSource(source, nodes);
    const maxOffset = Math.max(0, this.getNoiseBuffer(context).duration - safeDuration);
    const offset = randomAt(this.songSeed, Math.round(at * 1_000), 43) * maxOffset;
    source.start(at, offset, safeDuration);
  }

  private getNoiseBuffer(context: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const frameCount = Math.max(1, Math.floor(context.sampleRate * 2));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const channel = buffer.getChannelData(0);
    let value = 0x1254_8f3d;
    for (let index = 0; index < channel.length; index += 1) {
      value ^= value << 13;
      value ^= value >>> 17;
      value ^= value << 5;
      channel[index] = ((value >>> 0) / 2_147_483_648 - 1) * 0.82;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private registerSource(source: ScheduledSource, nodes: readonly AudioNode[]): void {
    this.activeSources.set(source, nodes);
    source.onended = () => this.releaseSource(source);
  }

  private releaseSource(source: ScheduledSource): void {
    const nodes = this.activeSources.get(source);
    if (!nodes) return;
    this.activeSources.delete(source);
    for (const node of nodes) {
      try {
        node.disconnect();
      } catch {
        // A browser can report an already-disconnected node after stop().
      }
    }
  }

  private stopAllSources(): void {
    for (const source of [...this.activeSources.keys()]) {
      try {
        source.stop();
      } catch {
        // A source may already have ended between the snapshot and stop().
      }
      this.releaseSource(source);
    }
  }

  private stopPlayback(notify: boolean): void {
    this.clearSchedulerTimer();
    this.stopAllSources();
    this.playback = null;
    if (notify || this.stateValue !== "idle") this.setState("idle");
  }

  private finishNaturally(expectedPlayback: Playback): void {
    if (this.playback !== expectedPlayback) return;
    const onEnded = expectedPlayback.onEnded;
    this.stopPlayback(true);
    if (onEnded) globalThis.setTimeout(onEnded, 0);
  }

  private horrorFilterSweep(at: number, intensity: number): void {
    const filter = this.masterFilter;
    if (!filter) return;
    filter.frequency.cancelScheduledValues(at);
    filter.frequency.setValueAtTime(19_000, at);
    filter.frequency.exponentialRampToValueAtTime(650 + (1 - intensity) * 1_100, at + 0.055);
    filter.frequency.exponentialRampToValueAtTime(19_000, at + 0.75);
  }
}

export function createNocturneAudioEngine(options?: AudioEngineOptions): NocturneAudioEngine {
  return new NocturneAudioEngine(options);
}

export default NocturneAudioEngine;
