// Types de l'API HTTP du serveur de jeu, recopiés du code serveur (le site n'importe rien du dépôt du jeu :
// il a ses propres dépendances). À tenir à jour si ces fichiers changent :
//   - server/src/core/http.ts        routes /api/*, forme des réponses et des erreurs
//   - server/src/core/auth.ts        /api/register, /api/login, jetons (TOKEN_TTL_MS)
//   - server/src/core/validation.ts  règles des noms de compte, mots de passe, personnages
//   - server/src/core/characters.ts  /api/characters (création, limite par compte)
//   - server/src/core/game.ts        stats() → /api/status ; server/src/core/app.ts (champs ajoutés)
//   - server/src/core/realm.ts       RealmMaps.source, REALM_CLASSES, REALM_SCALE (/api/meta)
//   - server/src/core/net-groups.ts  AssetVersions (/api/meta)
//   - shared/src/contracts.ts        ClassId, Gender, ModeId, SkinId, RealmId, CharacterRecord, EntityLook
//
// Toutes les réponses sont du JSON (`Cache-Control: no-store`). Le serveur n'envoie aucun en-tête CORS.

// ---- identité (shared/src/contracts.ts) ------------------------------------------------------

export type ClassId =
  | "feca" | "osamodas" | "enutrof" | "sram" | "xelor" | "ecaflip" | "eniripsa" | "iop"
  | "cra" | "sadida" | "sacrieur" | "pandawa" | "roublard" | "zobal" | "steamer"
  | "eliotrope" | "huppermage" | "ouginak" | "forgelance";

export type Gender = "male" | "female";
export type ModeId = "run" | "world";
export type SkinId = "retro" | "dofus3";
/** Un monde par royaume (AUTHENTICITY.md). */
export type RealmId = SkinId;

/** Durée de vie d'un jeton bearer (server/src/core/auth.ts TOKEN_TTL_MS) : 30 jours. */
export const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000;

// ---- comptes : POST /api/register, POST /api/login, POST /api/logout -------------------------

/**
 * Corps de POST /api/register et POST /api/login (JSON, 16 Ko au plus).
 * - register (server/src/core/validation.ts) : `username` 3 à 24 caractères `[A-Za-z0-9_.-]` (espaces
 *   autour retirés), `password` 6 à 128 caractères. Unicité insensible à la casse.
 * - login : `username` comparé sans les espaces autour et sans la casse ; mauvais types → 401.
 */
export interface Credentials {
  username: string;
  password: string;
}
export type RegisterRequest = Credentials;
export type LoginRequest = Credentials;

/** Réponse de register (201) et de login (200) : le jeton bearer (base64url, 43 caractères). */
export interface TokenResponse {
  token: string;
}

/** Réponse de POST /api/logout et de DELETE /api/characters/:id (200). */
export interface OkResponse {
  ok: true;
}

// ---- personnages : GET / POST /api/characters, DELETE /api/characters/:id ----------------------

/** [EQUIPEMENT ext] Apparence des objets portés (skins Dofus 3), ajoutée par GET /api/characters. */
export interface EntityLook {
  skins: number[];
  /** Les skins de `skins` dessinés avec leurs propres couleurs (objets non colorables). */
  fixed?: number[];
  /** Type d'objet de l'arme portée quand son skin est dans `skins`. */
  weapon?: number;
}

/** shared/src/contracts.ts CharacterRecord, tel que GET /api/characters le rend. */
export interface CharacterRecord {
  id: string;
  accountId: string;
  /** Unique, 3 à 16 caractères : lettres (accents permis), chiffres, « - ». */
  name: string;
  classId: ClassId;
  gender: Gender;
  /** Jusqu'à 6 couleurs RVB entières (Dofus 3 : peau, cheveux, tenue 1 à 4). */
  colors: number[];
  /** Visage choisi (Dofus 3 « Visage »), index dans les têtes de la classe. */
  head?: number;
  level: number;
  /** Date de création, en ms depuis l'epoch. */
  createdAt: number;
  /** JSON propre à chaque mode de jeu ; opaque pour le site. */
  progress: Partial<Record<ModeId, unknown>>;
  look?: EntityLook;
}

/** Réponse de GET /api/characters (200). */
export interface CharactersResponse {
  characters: CharacterRecord[];
}

/**
 * Corps de POST /api/characters (server/src/core/validation.ts validateCharacterInput).
 * 8 personnages au plus par compte (characters.ts MAX_CHARACTERS_PER_ACCOUNT).
 */
export interface CreateCharacterRequest {
  /** 3 à 16 caractères, commence par une lettre, tirets seulement entre deux parties. */
  name: string;
  /** Doit être une classe jouable du royaume (MetaResponse.classes). */
  classId: ClassId;
  gender: Gender;
  /** 6 au plus : entiers 0..0xFFFFFF ou chaînes « #rrggbb ». */
  colors?: Array<number | string>;
  /** Entier 0..999. */
  head?: number;
}

/** Réponse de POST /api/characters (201). */
export interface CreateCharacterResponse {
  character: CharacterRecord;
}

// ---- public : GET /api/meta, GET /api/status ----------------------------------------------------

/** server/src/core/net-groups.ts AssetVersions. */
export interface AssetVersions {
  base: string;
  groups: Record<string, string>;
}

/** Réponse de GET /api/meta (200, public). */
export interface MetaResponse {
  mode: ModeId;
  realm: RealmId;
  /** Classes jouables du royaume (12 en retro, 19 en dofus3). */
  classes: ClassId[];
  skins: SkinId[];
  protocol: number;
  realmScale: number;
  demoMode: boolean;
  combatSim: boolean;
  assetVersion: AssetVersions | null;
}

/** Une zone « hub » (carte du monde ouvert) dans GET /api/status. */
export interface StatusHub {
  id: string;
  map: string;
  players: number;
}

/** Une instance (activité) dans GET /api/status. */
export interface StatusInstance {
  id: string;
  activityId?: string;
  players: number;
  realSim: boolean;
}

/** Réponse de GET /api/status (200, public) : app.ts `stats` + game.ts `stats()`. */
export interface StatusResponse {
  mode: ModeId;
  demoMode: boolean;
  combatSim: boolean;
  /** Sessions de jeu ouvertes (joueurs connectés). */
  online: number;
  /** Joueurs dans les hubs (monde ouvert). */
  hub: number;
  hubs: StatusHub[];
  realm: RealmId;
  maps: "assets" | "builtin";
  instances: StatusInstance[];
  parties: number;
  tick: number;
}

// ---- erreurs -------------------------------------------------------------------------------------

/**
 * Codes d'erreur que le serveur peut rendre sur ces routes, avec leur statut HTTP :
 * - 400 bad_json, invalid_username, invalid_password, invalid_name, invalid_class, invalid_gender,
 *   invalid_colors, invalid_head
 * - 401 invalid_credentials (login), unauthorized (jeton absent, inconnu ou expiré)
 * - 403 too_many_characters
 * - 404 not_found (route inconnue, personnage introuvable)
 * - 409 username_taken, name_taken, character_online
 * - 413 too_large (corps > 16 Ko)
 * - 429 rate_limited (register + login : 30 essais par minute et par adresse vue du serveur)
 * - 500 internal
 */
export type ServerErrorCode =
  | "bad_json"
  | "invalid_username"
  | "invalid_password"
  | "invalid_name"
  | "invalid_class"
  | "invalid_gender"
  | "invalid_colors"
  | "invalid_head"
  | "invalid_credentials"
  | "unauthorized"
  | "too_many_characters"
  | "not_found"
  | "username_taken"
  | "name_taken"
  | "character_online"
  | "too_large"
  | "rate_limited"
  | "internal";

/**
 * Codes ajoutés par le client du site (statut 0 sauf `bad_response`) :
 * `network` serveur injoignable, `timeout` pas de réponse à temps, `bad_response` réponse non JSON
 * ou sans code d'erreur (page 502 d'un proxy, 404 texte hors /api…).
 */
export type ClientErrorCode = "network" | "timeout" | "bad_response";

export type ApiErrorCode = ServerErrorCode | ClientErrorCode;

/** Corps d'une erreur du serveur : `{ error, message }` ; `message` est en français, montrable au joueur. */
export interface ApiErrorBody {
  error: ServerErrorCode;
  message: string;
}

/** Une erreur sous forme sérialisable (pour franchir « use cache », une action serveur, etc.). */
export interface ApiErrorInfo {
  /** Statut HTTP, ou 0 quand aucune réponse n'est arrivée. */
  status: number;
  code: ApiErrorCode;
  message: string;
}

/** Résultat sans exception, pour les lectures mises en cache. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiErrorInfo };
