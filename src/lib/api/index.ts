// API du serveur de jeu, côté serveur seulement (client.ts importe "server-only").
// Les types seuls peuvent aussi être importés depuis "@/lib/api/types" par du code client.

export {
  apiBaseUrl,
  SanstourApiError,
  isSanstourApiError,
  register,
  login,
  logout,
  listCharacters,
  createCharacter,
  deleteCharacter,
  getMeta,
  fetchStatus,
  getStatus,
} from "./client";
export * from "./types";
