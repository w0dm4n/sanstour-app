// La landing en données : calques d'art et sections, en px de la maquette Figma (landing 6:106,
// 1600 × 4734). Les coordonnées sont celles des nœuds Figma (x, y, largeur, hauteur), recadrées sur
// le cadre quand l'export l'est. L'ordre des calques est celui de la maquette (du fond vers l'avant).

export type Univers = "village" | "combat" | "royale" | "songes";

/** Comment un calque bouge au défilement (désactivé par prefers-reduced-motion). */
export type Mouvement =
  /** Descend plus lentement que la page : y = vitesse × défilement (haut de page). */
  | { type: "descente"; vitesse: number }
  /** Fond d'une section : glisse de -amplitude à +amplitude (px de maquette) pendant qu'il traverse l'écran. */
  | { type: "fond"; amplitude: number }
  /** Nuage : dérive horizontale lente en aller-retour (+ descente au défilement). */
  | { type: "nuage"; derive: string; duree: number; vitesse: number };

export type Boite = { x: number; y: number; w: number; h: number };

export type Couche = Boite & {
  id: string;
  /** Image dans public/images/landing, ou un dégradé CSS. */
  image?: string;
  degrade?: string;
  /** Largeur affichée à 1600 px, pour sizes de next/image. */
  mouvement?: Mouvement;
  /** Version découpée pour le mobile (bande visible du fond) ; sa boîte mobile fait alors 390 de large. */
  imageMobile?: string;
  /** Image principale du premier écran (LCP) : préchargée. */
  lcp?: boolean;
  /** Mise en page mobile (< 1024 px, maquette de 390 px de large). Absent : calque masqué. */
  mobile?: Boite;
  /** Calque propre au mobile (masqué à partir de 1024 px). */
  mobileSeulement?: boolean;
};

/** Assombrissement vertical derrière un bloc de texte, pour la mise en page mobile. */
const ombreMobile = (id: string, y: number, h: number): Couche => ({
  id,
  degrade: `linear-gradient(180deg, ${ASSOMBRIR}00, ${ASSOMBRIR}d9 22%, ${ASSOMBRIR}d9 78%, ${ASSOMBRIR}00)`,
  x: 0,
  y: 0,
  w: 0,
  h: 0,
  mobile: { x: 0, y, w: 390, h },
  mobileSeulement: true,
});

const ASSOMBRIR = "#373023";
// Assombrissement des sections 2 à 4 (rectangles 1600 × 1076 de la maquette) : le gradientTransform de
// Figma converti en CSS, angle 218,42° et arrêts à 41,82 % / 94,84 % de la ligne du dégradé.
const OMBRE_SECTION = `linear-gradient(218.42deg, ${ASSOMBRIR}00 41.82%, ${ASSOMBRIR} 94.84%)`;

export const HAUTEUR_SCENE = 4734;
export const HAUTEUR_SCENE_MOBILE = 3110;

export const COUCHES: Couche[] = [
  // — Village (6:107 vidéo dans Figma : image fixe en attendant le fichier vidéo)
  {
    id: "village-fond",
    image: "village-fond.webp",
    imageMobile: "village-fond-mobile.webp",
    x: 86.46,
    y: 0,
    w: 1513.54,
    h: 908,
    lcp: true,
    mouvement: { type: "descente", vitesse: 0.15 },
    mobile: { x: 0, y: 0, w: 390, h: 627.5 },
  },
  {
    id: "village-ombre",
    degrade: `linear-gradient(270deg, ${ASSOMBRIR}00, ${ASSOMBRIR})`,
    x: 0,
    y: 0,
    w: 712.47,
    h: 1000,
  },
  {
    id: "falaise-herbeuse",
    image: "falaise-herbeuse.webp",
    x: -182,
    y: -86,
    w: 402,
    h: 414,
    mouvement: { type: "descente", vitesse: 0.3 },
  },
  {
    id: "nuage-1",
    image: "nuage.webp",
    x: 285.5,
    y: 530.09,
    w: 2013,
    h: 889,
    mouvement: { type: "nuage", derive: "6%", duree: 48, vitesse: 0.22 },
  },
  {
    id: "ferme",
    image: "ferme.webp",
    x: -309,
    y: 14,
    w: 765,
    h: 960.59,
    mouvement: { type: "descente", vitesse: 0.3 },
  },
  {
    id: "buisson-rond-jaune",
    image: "buisson-rond-jaune.webp",
    x: 0,
    y: 661.93,
    w: 525.04,
    h: 453.07,
    mouvement: { type: "descente", vitesse: 0.38 },
  },
  {
    id: "buisson",
    image: "buisson.webp",
    x: -151,
    y: 605,
    w: 502,
    h: 429.03,
    mouvement: { type: "descente", vitesse: 0.38 },
  },
  {
    id: "nuage-2",
    image: "nuage.webp",
    x: -721,
    y: 634,
    w: 2013,
    h: 889,
    mouvement: { type: "nuage", derive: "8%", duree: 62, vitesse: 0.22 },
    mobile: { x: -620, y: 470, w: 1000, h: 441.6 },
  },
  // — Combat
  {
    id: "combat-fond",
    image: "combat-fond.webp",
    imageMobile: "combat-fond-mobile.webp",
    x: 0,
    y: 1134.48,
    w: 1600,
    h: 1131,
    mouvement: { type: "fond", amplitude: 60 },
    mobile: { x: 0, y: 600, w: 390, h: 811 },
  },
  {
    id: "combat-ombre",
    degrade: OMBRE_SECTION,
    x: 0,
    y: 1189.31,
    w: 1600,
    h: 1076.18,
  },
  // — Battle Royale
  {
    id: "royale-fond",
    image: "royale-fond.webp",
    imageMobile: "royale-fond-mobile.webp",
    x: 0,
    y: 2343.26,
    w: 1600,
    h: 1189,
    mouvement: { type: "fond", amplitude: 60 },
    mobile: { x: 0, y: 1441, w: 390, h: 857.6 },
  },
  {
    id: "royale-ombre",
    degrade: OMBRE_SECTION,
    x: 0,
    y: 2456.08,
    w: 1600,
    h: 1076.18,
  },
  ombreMobile("village-ombre-mobile", 150, 330),
  ombreMobile("combat-ombre-mobile", 900, 400),
  ombreMobile("royale-ombre-mobile", 1640, 400),
  {
    id: "transition-combat-royale",
    image: "transition-combat-royale.webp",
    x: 0,
    y: 1979,
    w: 1600,
    h: 830.25,
    mobile: { x: -115, y: 1300, w: 620, h: 321.7 },
  },
  {
    id: "transition-village-combat",
    image: "transition-village-combat.webp",
    x: 1.12,
    y: 666.17,
    w: 1598.88,
    h: 1112,
    mobile: { x: -115, y: 420, w: 620, h: 431.2 },
  },
  // — Raids & Songes
  {
    id: "songes-fond",
    image: "songes-fond.webp",
    imageMobile: "songes-fond-mobile.webp",
    x: 0,
    y: 3544.52,
    w: 1600,
    h: 1189.4,
    mouvement: { type: "fond", amplitude: 60 },
    mobile: { x: 0, y: 2303, w: 390, h: 810 },
  },
  {
    id: "songes-ombre",
    degrade: OMBRE_SECTION,
    x: 0,
    y: 3657.74,
    w: 1600,
    h: 1076.18,
  },
  ombreMobile("songes-ombre-mobile", 2700, 400),
  {
    id: "transition-royale-songes",
    image: "transition-royale-songes.webp",
    x: 0,
    y: 2890.74,
    w: 1600,
    h: 1388.8,
    mobile: { x: -115, y: 2050, w: 620, h: 538.2 },
  },
];

export type Section = {
  id: string;
  univers: Univers;
  /** Haut-gauche du bloc de texte (l'accroche) dans la maquette. */
  x: number;
  y: number;
  /** Haut du bloc de texte dans la mise en page mobile. */
  yMobile: number;
  accroche: string;
  titre: string;
  /** Texte courant, ligne par ligne ; [avant, surligné, après] pour la ligne du mot-clé. */
  lignes: (string | [string, string, string])[];
  /** Partie du mot-clé en gras (seule la section village en a une dans la maquette : « arrête jamais »). */
  gras?: string;
};

// Textes repris tels quels de la maquette (fautes comprises, à valider par le joueur).
export const SECTIONS: Section[] = [
  {
    id: "village",
    univers: "village",
    x: 137.62,
    y: 364.5,
    yMobile: 176,
    accroche: "A chacun son tour ?",
    titre: "Plus maintenant!",
    lignes: [
      "Le Monde des Douze n'attend pas son tour.",
      ["Un fan game Dofus où l'action ne ", "s'arrête jamais", "."],
    ],
    gras: "arrête jamais",
  },
  {
    id: "combat",
    univers: "combat",
    x: 137.62,
    y: 1715.74,
    yMobile: 950,
    accroche: "Découvrez Dofus",
    titre: "Sous un autre angle",
    lignes: ["Des combats en temps réel, où chaque", ["décision doit être ", "prise rapidement.", ""]],
  },
  {
    id: "royale",
    univers: "royale",
    x: 138.98,
    y: 2675.74,
    yMobile: 1690,
    accroche: "Un mode exclusif",
    titre: "Battle Royale",
    lignes: ["Affrontez les autres joueurs, dans des combats", ["épiques, où un ", "seul doit survivre.", ""]],
  },
  {
    id: "songes",
    univers: "songes",
    x: 137.98,
    y: 4259.74,
    yMobile: 2760,
    accroche: "Des combats en temps réel de",
    titre: "Raides & Songes",
    lignes: [
      "Une manière inédite de combattres les créatures",
      ["les ", "plus épiques", " du Monde des Douzes !"],
    ],
  },
];

export const URL_JEU = "https://jouer.sanstour.com";
