# NOCTURNE SIGNAL

[![CI](https://github.com/darknigthmare/nocturne-signal/actions/workflows/ci.yml/badge.svg)](https://github.com/darknigthmare/nocturne-signal/actions/workflows/ci.yml)

> Tant que vous jouez, la porte reste fermée.

**NOCTURNE SIGNAL** est un jeu de rythme et de survival horror original, jouable gratuitement dans un navigateur. Seul dans le relais hertzien K-27, le joueur doit maintenir une fréquence parasite sous contrôle en interprétant trois morceaux de plus en plus hostiles. Chaque fausse note rapproche la présence enfermée dans le signal ; chaque enchaînement réussi permet de tenir jusqu'à l'aube.

Le jeu est pensé comme une expérience complète et courte, sans compte ni achat : campagne en trois transmissions, narration intégrée, musique procédurale, progression locale, records, fragments cachés et plusieurs fins.

## Fonctionnalités

- Une campagne horrifique en **trois chapitres** et trois morceaux originaux : *Static Hunger*, *Pulse Below* et *Choir in the Wires*.
- Une piste rythmique à **cinq voies**, avec notes simples, accords, impulsions dangereuses et notes tenues.
- Trois difficultés : **Histoire**, **Standard** et **Cauchemar**. Elles modifient la densité, les fenêtres de frappe, les dégâts et le multiplicateur de score.
- Un système survival fondé sur la **Lucidité**, la **Proximité** de la menace et le **Feedback** défensif.
- Des objectifs propres à chaque transmission, un bonus de survie et des rangs de fin de morceau.
- Des améliorations temporaires de campagne : Accord fantôme, Nerf d'acier et Voltage interdit.
- Trois fragments de mémoire à isoler et plusieurs conclusions, dont une fin véritable.
- Une synthèse musicale et horrifique générée en temps réel avec la Web Audio API ; aucun fichier musical commercial n'est requis.
- Une sauvegarde automatique locale des chapitres, fragments, records et réglages.
- Des commandes clavier et tactiles, adaptées à l'ordinateur, à la tablette et au mobile.
- Un manifeste web et un service worker pour une installation en application et un secours hors connexion après un premier chargement réussi.

## Contrôles

| Action | Clavier | Tactile / souris |
| --- | --- | --- |
| Voies 1 à 5 | `A` `S` `D` `F` `G` | Boutons colorés sous la piste |
| Tenir une note | Maintenir la touche jusqu'à la fin | Maintenir le bouton jusqu'à la fin |
| Déclencher Feedback | `Espace` lorsque la jauge est pleine | Bouton **Feedback** |
| Mettre en pause / reprendre | `Échap` | Bouton pause, puis **Reprendre** |

Les cinq voies ne reposent pas uniquement sur la couleur : chaque note possède aussi un symbole distinct. Pour un accord, frappez les voies affichées ensemble. Pour une note tenue, gardez chaque commande enfoncée jusqu'à l'extrémité de la traîne.

## Règles de survie

1. Frappez la voie correspondante lorsque son symbole traverse le câble blanc.
2. La précision du timing produit un jugement **Parfait**, **Excellent**, **Bon** ou **Raté**.
3. Les réussites augmentent le score, le combo et la charge de Feedback. Le multiplicateur passe à ×2 à 10 notes, ×3 à 30 et ×4 à 60.
4. Un raté remet le combo à zéro, augmente la Proximité et retire de la Lucidité. Lorsque la menace atteint le joueur, une attaque inflige des dégâts supplémentaires.
5. À 100 % de charge, Feedback repousse fortement la menace et réduit les dégâts pendant quatre secondes. Dans la dernière transmission, chaque activation brise aussi une Ancre sonore.
6. Une émission est réussie si la Lucidité reste supérieure à zéro jusqu'à la fin du morceau. À zéro, le signal est perdu.

Le score final ajoute au score rythmique un bonus proportionnel à la Lucidité restante. Réussir l'objectif du chapitre accorde **5 000 points** supplémentaires. Les rangs vont de **Survie** à **S**, selon la précision, les ratés et l'état du joueur.

## Campagne et progression

La campagne commence à Station Zéro et débloque les transmissions suivantes lorsqu'un morceau est survécu. Entre deux chapitres, le joueur sélectionne une modification active pour le reste de l'émission :

- **Accord fantôme** élargit toutes les fenêtres de frappe de 18 ms.
- **Nerf d'acier** augmente la Lucidité maximale et restaure de la Lucidité tous les 25 combos.
- **Voltage interdit** accélère la charge du Feedback.

Les records sont conservés séparément pour chaque couple chapitre/difficulté. Les fragments demandent des performances particulières : précision minimale, utilisations de Feedback ou destruction des Ancres. Rassembler les trois fragments et maîtriser la dernière transmission permet d'accéder à la conclusion la plus complète.

La progression est enregistrée dans `localStorage` sous la clé `nocturne-signal.save.v1`. Elle reste donc liée au navigateur et à l'appareil utilisés. Le menu des paramètres permet de tout effacer après confirmation.

## Accessibilité et confort

Le menu **Paramètres & accessibilité** propose :

- quatre volumes indépendants : général, musique, effets et ambiance ;
- un décalage visuel réglable de −150 à +150 ms pour compenser la latence ;
- un contraste renforcé ;
- une réduction des mouvements, activée automatiquement si le système demande `prefers-reduced-motion` ;
- la désactivation des secousses liées à la menace ;
- une taille de notes réglable de 0,8× à 1,35× ;
- une redondance couleur/symbole sur les cinq voies ;
- un mode visuel qui reste jouable si l'audio ne peut pas être initialisé.

Le jeu contient des effets de parasites, des pulsations, des secousses optionnelles et une ambiance horrifique soutenue. Il ne demande ni caméra, ni microphone, ni géolocalisation.

## Installation locale

### Prérequis

- Node.js `>= 22.13.0`
- npm

```bash
git clone https://github.com/darknigthmare/nocturne-signal.git
cd nocturne-signal
npm ci
npm run dev
```

Ouvrez ensuite [http://localhost:3000](http://localhost:3000). L'audio est déverrouillé au premier geste utilisateur, conformément aux règles des navigateurs.

## Commandes du projet

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Lance le serveur de développement Next.js |
| `npm run build` | Produit et vérifie le build Next.js de production |
| `npm run start` | Sert le build Next.js localement |
| `npm run lint` | Exécute ESLint sur le projet |
| `npm test` | Vérifie le moteur de jeu et les contrats de contenu |
| `npm run check` | Enchaîne lint, tests et build de production |

Avant publication, la commande recommandée est :

```bash
npm ci
npm run check
```

## Architecture

```text
app/
├── GameApp.tsx          interface, campagne et orchestration d'une partie
├── globals.css          direction visuelle et adaptation responsive
├── layout.tsx           métadonnées et cadre HTML
└── page.tsx             point d'entrée
src/game/
├── core.mjs             règles pures, partitions déterministes et scoring
├── content.ts           chapitres, difficultés, voies et améliorations
├── renderer.ts          rendu Canvas 2D de la piste
├── audio.ts             musique et effets procéduraux Web Audio
└── storage.ts           sauvegarde locale versionnée
public/
├── manifest.webmanifest métadonnées d'installation PWA
└── sw.js                cache réseau-d'abord et secours hors connexion
tests/
├── game-core.test.mjs   tests unitaires du moteur
└── content-contract.test.mjs
```

Le moteur de `src/game/core.mjs` ne dépend ni de React, ni du navigateur, ni de l'audio. Les partitions sont générées de manière déterministe pour qu'un même morceau et une même difficulté produisent toujours le même enchaînement. L'interface React pilote ce moteur, tandis que Canvas et Web Audio assurent respectivement l'image et le son.

Le service worker emploie une stratégie **réseau d'abord** : il demande systématiquement la version actuelle, puis utilise une copie locale uniquement en cas d'échec réseau. Il ne met pas en cache les API, les parcours d'authentification, les réponses privées ou `no-store`, ni les flux React Server Components. Le mode hors connexion est un secours : lancez et chargez entièrement le jeu au moins une fois en ligne.

## Déploiement sur Vercel

Le dépôt contient déjà une configuration `vercel.json` pour Next.js.

### Depuis GitHub

1. Poussez le dépôt sur GitHub.
2. Dans Vercel, choisissez **Add New → Project** puis importez le dépôt.
3. Laissez le framework **Next.js** détecté automatiquement.
4. Utilisez `npm ci` pour l'installation et `npm run build` pour le build.
5. Déployez, puis vérifiez le jeu, l'audio, la sauvegarde et l'installation depuis l'URL HTTPS de production.

### Avec la CLI Vercel

```bash
npx vercel
npx vercel --prod
```

Les service workers exigent un contexte sécurisé : ils fonctionnent sur `localhost` en développement et en HTTPS sur Vercel. Le cache ne remplace jamais une sauvegarde serveur ; les données de progression restent locales au navigateur.

## Crédits et originalité

- **Direction, univers et création du projet :** darknigthmare
- **Co-conception et assistance à l'implémentation :** OpenAI ChatGPT / Codex
- **Musique, effets et ambiance :** composition procédurale originale générée à l'exécution par le moteur Web Audio du projet
- **Narration, morceaux, interface et identité NOCTURNE SIGNAL :** créations originales pour ce projet

Ce projet n'utilise aucun morceau, personnage, logo ou asset sous licence d'une franchise existante. Il reprend les conventions générales du jeu de rythme sans être affilié à *Guitar Hero*, Activision, Harmonix ou leurs ayants droit.

## Licence

Le code source est distribué sous licence [MIT](LICENSE). Conservez les mentions de copyright et de licence lors de toute redistribution.
