// Client de l'API HTTP du serveur de jeu, côté serveur seulement (server components, route handlers,
// actions serveur). Le jeton bearer n'est jamais lu ici : chaque appel authentifié le reçoit en paramètre
// (plus tard, depuis le cookie httpOnly ; voir README « Plan : les comptes »).
//
// Forme des requêtes (server/src/core/http.ts) : corps JSON, en-tête `Authorization: Bearer <jeton>` pour
// les routes authentifiées, erreurs `{ error, message }` avec un statut HTTP (types.ts ServerErrorCode).
//
// Cache : le projet active Cache Components (next.config.ts). Les `fetch` y sont sans cache par défaut ;
// on cache une lecture en l'enveloppant dans une fonction « use cache » + cacheLife (getStatus), pas avec
// les options `next.revalidate` de fetch.

import "server-only";
import { cacheLife } from "next/cache";
import type {
  ApiErrorCode,
  ApiErrorInfo,
  ApiResult,
  CharacterRecord,
  CharactersResponse,
  CreateCharacterRequest,
  CreateCharacterResponse,
  Credentials,
  MetaResponse,
  OkResponse,
  StatusResponse,
  TokenResponse,
} from "./types";

const DEFAULT_API_URL = "https://jouer.sanstour.com";
/** Au-delà, l'appel échoue en `timeout` (le site ne reste pas suspendu à un serveur de jeu figé). */
const TIMEOUT_MS = 10_000;

/** Adresse de l'API du jeu : variable serveur SANSTOUR_API_URL, sans « / » final. */
export function apiBaseUrl(): string {
  const raw = process.env.SANSTOUR_API_URL?.trim();
  return (raw || DEFAULT_API_URL).replace(/\/+$/, "");
}

/** Erreur d'un appel à l'API du jeu. `message` est en français et montrable au joueur. */
export class SanstourApiError extends Error {
  /** Statut HTTP, ou 0 quand aucune réponse n'est arrivée (`network`, `timeout`). */
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(info: ApiErrorInfo) {
    super(info.message);
    this.name = "SanstourApiError";
    this.status = info.status;
    this.code = info.code;
  }

  /** Forme sérialisable (pour la renvoyer d'une action serveur ou d'un route handler). */
  toInfo(): ApiErrorInfo {
    return { status: this.status, code: this.code, message: this.message };
  }
}

export function isSanstourApiError(err: unknown): err is SanstourApiError {
  return err instanceof SanstourApiError;
}

const UNAUTHORIZED: ApiErrorInfo = { status: 401, code: "unauthorized", message: "Session expirée, reconnectez-vous." };

interface RequestOptions {
  method?: "GET" | "POST" | "DELETE";
  /** Jeton bearer rendu par /api/login ou /api/register. */
  token?: string;
  /** Corps JSON. */
  body?: unknown;
  cache?: RequestCache;
}

async function request<T>(path: string, { method = "GET", token, body, cache }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token !== undefined) {
    // un cookie altéré ne doit pas devenir un en-tête invalide (fetch lèverait une TypeError)
    if (!/^[\x21-\x7e]{1,512}$/.test(token)) throw new SanstourApiError(UNAUTHORIZED);
    headers.authorization = `Bearer ${token}`;
  }

  let res: Response;
  let text: string;
  try {
    res = await fetch(`${apiBaseUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    text = await res.text();
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new SanstourApiError(
      timedOut
        ? { status: 0, code: "timeout", message: "Le serveur de jeu ne répond pas, réessayez dans un instant." }
        : { status: 0, code: "network", message: "Le serveur de jeu est injoignable, réessayez dans un instant." },
    );
  }

  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      /* pas du JSON : page d'erreur d'un proxy, 404 texte hors /api… */
    }
  }

  if (!res.ok) {
    const e = (data ?? {}) as { error?: unknown; message?: unknown };
    if (typeof e.error === "string") {
      throw new SanstourApiError({
        status: res.status,
        code: e.error as ApiErrorCode,
        message: typeof e.message === "string" ? e.message : `Erreur ${res.status} du serveur de jeu.`,
      });
    }
    throw new SanstourApiError({ status: res.status, code: "bad_response", message: `Réponse inattendue du serveur de jeu (HTTP ${res.status}).` });
  }
  if (data === undefined) {
    throw new SanstourApiError({ status: res.status, code: "bad_response", message: "Réponse illisible du serveur de jeu." });
  }
  return data as T;
}

// ---- comptes -------------------------------------------------------------------------------------

/**
 * POST /api/register — crée le compte et ouvre une session : 201 `{ token }`.
 * Erreurs : 400 invalid_username / invalid_password / bad_json, 409 username_taken, 429 rate_limited.
 */
export function register(credentials: Credentials): Promise<TokenResponse> {
  return request<TokenResponse>("/api/register", {
    method: "POST",
    body: { username: credentials.username, password: credentials.password },
    cache: "no-store",
  });
}

/**
 * POST /api/login — 200 `{ token }` (jeton bearer valable 30 jours, types.ts TOKEN_TTL_MS).
 * Erreurs : 401 invalid_credentials, 400 bad_json, 429 rate_limited.
 */
export function login(credentials: Credentials): Promise<TokenResponse> {
  return request<TokenResponse>("/api/login", {
    method: "POST",
    body: { username: credentials.username, password: credentials.password },
    cache: "no-store",
  });
}

/** POST /api/logout (bearer) — révoque le jeton : 200 `{ ok: true }`. Erreur : 401 unauthorized. */
export function logout(token: string): Promise<OkResponse> {
  return request<OkResponse>("/api/logout", { method: "POST", token, cache: "no-store" });
}

// ---- personnages ---------------------------------------------------------------------------------

/** GET /api/characters (bearer) — 200 `{ characters }`. Erreur : 401 unauthorized. */
export async function listCharacters(token: string): Promise<CharacterRecord[]> {
  const r = await request<CharactersResponse>("/api/characters", { token, cache: "no-store" });
  return r.characters;
}

/**
 * POST /api/characters (bearer) — 201 `{ character }`.
 * Erreurs : 400 invalid_name / invalid_class / invalid_gender / invalid_colors / invalid_head,
 * 403 too_many_characters, 409 name_taken, 401 unauthorized.
 */
export async function createCharacter(token: string, input: CreateCharacterRequest): Promise<CharacterRecord> {
  const r = await request<CreateCharacterResponse>("/api/characters", { method: "POST", token, body: input, cache: "no-store" });
  return r.character;
}

/**
 * DELETE /api/characters/:id (bearer) — 200 `{ ok: true }`.
 * Erreurs : 404 not_found, 409 character_online (personnage connecté), 401 unauthorized.
 */
export function deleteCharacter(token: string, id: string): Promise<OkResponse> {
  return request<OkResponse>(`/api/characters/${encodeURIComponent(id)}`, { method: "DELETE", token, cache: "no-store" });
}

// ---- public --------------------------------------------------------------------------------------

/** GET /api/meta (public) — royaume, classes jouables, version du protocole et des assets. Sans cache. */
export function getMeta(): Promise<MetaResponse> {
  return request<MetaResponse>("/api/meta");
}

/** GET /api/status (public), sans cache ; lève SanstourApiError. */
export function fetchStatus(): Promise<StatusResponse> {
  return request<StatusResponse>("/api/status");
}

/**
 * GET /api/status mis en cache 30 s (« use cache » + cacheLife), sans exception : une erreur levée dans
 * une portée « use cache » perd sa classe et son message en production, d'où le résultat `ApiResult`.
 * Un échec est gardé en cache comme un succès (30 s), ce qui laisse le build passer sans réseau.
 * Appelée depuis une autre portée « use cache », celle-ci doit déclarer son propre cacheLife.
 */
export async function getStatus(): Promise<ApiResult<StatusResponse>> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 30, expire: 3600 });
  try {
    return { ok: true, data: await fetchStatus() };
  } catch (err) {
    const error: ApiErrorInfo = isSanstourApiError(err)
      ? err.toInfo()
      : { status: 0, code: "network", message: "Le serveur de jeu est injoignable, réessayez dans un instant." };
    return { ok: false, error };
  }
}
