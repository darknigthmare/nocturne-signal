export type DifficultyId = "story" | "standard" | "nightmare";
export type ChapterId = "station-zero" | "glass-tunnels" | "last-frequency";
export type UpgradeId = "accord" | "nerve" | "voltage";

export interface DifficultyDefinition {
  id: DifficultyId;
  label: string;
  eyebrow: string;
  description: string;
  noteSpeed: number;
  chartDensity: number;
  damageScale: number;
  timingScale: number;
  scoreScale: number;
}

export interface ChapterDefinition {
  id: ChapterId;
  trackId: "static-hunger" | "pulse-below" | "choir-in-the-wires";
  index: number;
  act: string;
  title: string;
  track: string;
  artist: string;
  bpm: number;
  duration: number;
  palette: readonly [string, string, string];
  location: string;
  objective: string;
  fragmentCondition: string;
  transmission: readonly string[];
  outro: readonly string[];
  motif: "static" | "echo" | "choir";
}

export interface UpgradeDefinition {
  id: UpgradeId;
  name: string;
  icon: string;
  description: string;
  effect: string;
}

export const DIFFICULTIES: readonly DifficultyDefinition[] = [
  {
    id: "story",
    label: "Histoire",
    eyebrow: "Écouter le signal",
    description: "Une piste plus lisible, une menace patiente et des fenêtres de frappe généreuses.",
    noteSpeed: 0.82,
    chartDensity: 0.7,
    damageScale: 0.58,
    timingScale: 1.35,
    scoreScale: 0.82,
  },
  {
    id: "standard",
    label: "Standard",
    eyebrow: "La fréquence prévue",
    description: "Le mix complet : accords, notes tenues et créature agressive.",
    noteSpeed: 1,
    chartDensity: 1,
    damageScale: 1,
    timingScale: 1,
    scoreScale: 1,
  },
  {
    id: "nightmare",
    label: "Cauchemar",
    eyebrow: "Ne manquez aucun battement",
    description: "Patterns denses, timing resserré et signal qui se défend.",
    noteSpeed: 1.18,
    chartDensity: 1.3,
    damageScale: 1.35,
    timingScale: 0.78,
    scoreScale: 1.34,
  },
] as const;

export const CHAPTERS: readonly ChapterDefinition[] = [
  {
    id: "station-zero",
    trackId: "static-hunger",
    index: 0,
    act: "Transmission I",
    title: "Station Zéro",
    track: "Static Hunger",
    artist: "NOCTURNE ARRAY",
    bpm: 100,
    duration: 170,
    palette: ["#c7ff45", "#74d72c", "#163323"],
    location: "Relais hertzien K-27 · Niveau −1",
    objective: "Rallumer l'émetteur et tenir un combo de 30.",
    fragmentCondition: "Atteignez 80 % de précision pour isoler la voix dans le bruit.",
    transmission: [
      "JOUR 19 — Le groupe électrogène refuse de démarrer.",
      "Quelque chose imite les voix sur la fréquence 108.7.",
      "La guitare surcharge les parasites. Tant que je joue, la porte reste fermée.",
      "Si vous trouvez cet enregistrement… ne répondez pas quand le signal prononce votre nom.",
    ],
    outro: [
      "L'ampoule du studio se rallume.",
      "Dans le souffle de la bande, une seconde respiration s'arrête exactement avec la vôtre.",
    ],
    motif: "static",
  },
  {
    id: "glass-tunnels",
    trackId: "pulse-below",
    index: 1,
    act: "Transmission II",
    title: "Les Tunnels de verre",
    track: "Pulse Below",
    artist: "NOCTURNE ARRAY",
    bpm: 132,
    duration: 215,
    palette: ["#ffb340", "#ef5838", "#4b1828"],
    location: "Galerie technique · Antenne secondaire",
    objective: "Traverser trois séquences d'écho sans rompre le signal.",
    fragmentCondition: "Déclenchez Feedback au moins deux fois et survivez.",
    transmission: [
      "Le câble principal descend sous la station.",
      "Les parois ne sont pas en verre. Elles vibrent comme des cordes vocales.",
      "Chaque écho revient avec une note de plus.",
      "Je dois atteindre l'antenne avant que le tunnel apprenne tout le morceau.",
    ],
    outro: [
      "L'antenne secondaire pivote vers un point vide du ciel.",
      "Sous vos pieds, le tunnel reprend votre refrain — plus lent, plus proche.",
    ],
    motif: "echo",
  },
  {
    id: "last-frequency",
    trackId: "choir-in-the-wires",
    index: 2,
    act: "Transmission III",
    title: "La Dernière Fréquence",
    track: "Choir in the Wires",
    artist: "NOCTURNE ARRAY",
    bpm: 156,
    duration: 260,
    palette: ["#ff4d7d", "#b44cff", "#241336"],
    location: "Toit de K-27 · 04:47",
    objective: "Briser les trois Ancres sonores avant le dernier refrain.",
    fragmentCondition: "Terminez avec 80 % de précision et les trois Ancres détruites.",
    transmission: [
      "L'émetteur est prêt. Il ne manque qu'une source assez forte.",
      "La chose n'était pas enfermée dans la station.",
      "La station était construite pour l'empêcher d'être entendue.",
      "Dernière prise. Plein volume. Que l'aube choisisse ce qui répondra.",
    ],
    outro: [
      "La fréquence se vide d'un seul coup.",
      "À l'horizon, le soleil révèle des milliers d'antennes tournées vers vous.",
    ],
    motif: "choir",
  },
] as const;

export const UPGRADES: readonly UpgradeDefinition[] = [
  {
    id: "accord",
    name: "Accord fantôme",
    icon: "◫",
    description: "La guitare se cale sur votre pouls.",
    effect: "+18 ms à toutes les fenêtres de frappe.",
  },
  {
    id: "nerve",
    name: "Nerf d'acier",
    icon: "◇",
    description: "La peur devient un rythme mesurable.",
    effect: "+20 Lucidité et récupération tous les 25 combos.",
  },
  {
    id: "voltage",
    name: "Voltage interdit",
    icon: "ϟ",
    description: "La saturation mord dans le signal.",
    effect: "Feedback se charge 25 % plus vite et frappe plus fort.",
  },
] as const;

export const LANE_DEFINITIONS = [
  { key: "a", code: "KeyA", label: "A", symbol: "●", color: "#7cff4d" },
  { key: "s", code: "KeyS", label: "S", symbol: "▲", color: "#ffd84d" },
  { key: "d", code: "KeyD", label: "D", symbol: "■", color: "#58b8ff" },
  { key: "f", code: "KeyF", label: "F", symbol: "◆", color: "#ff6b61" },
  { key: "g", code: "KeyG", label: "G", symbol: "✦", color: "#d27bff" },
] as const;

export const MENU_QUOTES = [
  "Le silence n'est pas vide. Il attend.",
  "Jouez assez fort pour que la porte se souvienne d'être fermée.",
  "La fréquence 108.7 émet encore depuis une station condamnée.",
] as const;

export function getDifficulty(id: DifficultyId): DifficultyDefinition {
  return DIFFICULTIES.find((difficulty) => difficulty.id === id) ?? DIFFICULTIES[1];
}

export function getChapter(id: ChapterId): ChapterDefinition {
  return CHAPTERS.find((chapter) => chapter.id === id) ?? CHAPTERS[0];
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
