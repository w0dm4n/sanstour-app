// Outils communs aux scripts de preuve (shoot.mjs, lighthouse.mjs, serve-prod.mjs, compare.mjs) :
// dossiers du dépôt, Chrome installé sur le poste, profil temporaire, arrêt garanti par PID.
//
// Règle du poste : un seul Chrome headless à la fois, lancé avec un --user-data-dir temporaire qui est
// supprimé à la fin, même en cas d'erreur ou de Ctrl+C ; un Chrome qui ne s'arrête pas est tué par son
// PID (arbre de processus), jamais par nom.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, open, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const REPO_DIR = path.resolve(SITE_DIR, "..");
/** Sorties des preuves : preuves/ à la racine du dépôt (gitignoré : captures d'images du jeu). */
export const DEFAULT_OUT_DIR = path.join(SITE_DIR, "preuves");
/** Préfixe des profils temporaires : permet de retrouver un Chrome orphelin par sa ligne de commande. */
export const PROFILE_PREFIX = "sanstour-proof-";

function chromeCandidates() {
  const env = process.env;
  if (process.platform === "win32") {
    const roots = [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter(Boolean);
    return [
      ...roots.map((root) => path.join(root, "Google", "Chrome", "Application", "chrome.exe")),
      ...roots.map((root) => path.join(root, "Microsoft", "Edge", "Application", "msedge.exe")),
    ];
  }
  if (process.platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ];
  }
  return [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
  ];
}

/** Chemin du Chrome à utiliser : --chrome, sinon CHROME_PATH, sinon Chrome puis Edge installés. */
export function findChrome(explicit) {
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`navigateur introuvable : ${explicit}`);
    return explicit;
  }
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const found = chromeCandidates().find((candidate) => existsSync(candidate));
  if (!found) throw new Error("ni Chrome ni Edge trouvé : passer --chrome <chemin> (ou la variable CHROME_PATH).");
  return found;
}

const LOCK_FILE = path.join(os.tmpdir(), `${PROFILE_PREFIX}chrome.lock`);

/**
 * Verrou du poste « un seul Chrome headless à la fois », partagé par tous les scripts de preuve et tous
 * les agents (fichier exclusif dans le dossier temporaire, avec le PID du détenteur). Attend que l'autre
 * Chrome ait fini (jusqu'à `waitMs`) ; un verrou dont le détenteur est mort est repris. Rend la fonction
 * qui le libère.
 */
export async function acquireChromeLock(tool, waitMs = 15 * 60 * 1000) {
  const started = Date.now();
  let announced = false;
  for (;;) {
    try {
      const handle = await open(LOCK_FILE, "wx");
      await handle.writeFile(JSON.stringify({ pid: process.pid, tool, since: new Date().toISOString() }));
      await handle.close();
      return async () => {
        const holder = await readFile(LOCK_FILE, "utf8").then(JSON.parse).catch(() => null);
        if (holder?.pid === process.pid) await rm(LOCK_FILE, { force: true });
      };
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
    const holder = await readFile(LOCK_FILE, "utf8").then(JSON.parse).catch(() => null);
    const age = await stat(LOCK_FILE).then((s) => Date.now() - s.mtimeMs).catch(() => Infinity);
    // Fichier vide ou illisible depuis plus de 5 s, ou détenteur mort : verrou orphelin.
    if (holder ? !isAlive(holder.pid) : age > 5000) {
      await rm(LOCK_FILE, { force: true });
      continue;
    }
    if (!announced && holder) {
      console.log(`Un autre Chrome de preuve tourne (${holder.tool}, PID ${holder.pid}) : attente de sa fin…`);
      announced = true;
    }
    if (Date.now() - started > waitMs) {
      throw new Error(`verrou ${LOCK_FILE} toujours pris après ${Math.round(waitMs / 60000)} min (PID ${holder?.pid}).`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

/** Crée un profil Chrome vide dans le dossier temporaire du système. */
export function makeTempProfile(tool) {
  return mkdtemp(path.join(os.tmpdir(), `${PROFILE_PREFIX}${tool}-`));
}

/** Supprime un dossier ; sous Windows, Chrome peut garder des fichiers ouverts un court instant. */
export async function removeDir(dir) {
  if (!dir) return;
  await rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  if (existsSync(dir)) throw new Error(`profil temporaire non supprimé : ${dir}`);
}

export function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

/** Tue un processus et ses enfants par PID (taskkill /T /F sous Windows). */
export function killTree(pid) {
  if (!isAlive(pid)) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } else {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // déjà arrêté
    }
  }
}

/** Attend la fin d'un processus, puis le tue (arbre) s'il vit encore après `ms`. */
export async function ensureDead(pid, ms = 5000) {
  const until = Date.now() + ms;
  while (isAlive(pid) && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 100));
  if (isAlive(pid)) killTree(pid);
  const killedUntil = Date.now() + 3000;
  while (isAlive(pid) && Date.now() < killedUntil) await new Promise((resolve) => setTimeout(resolve, 100));
  if (isAlive(pid)) throw new Error(`Chrome (PID ${pid}) ne s'arrête pas : le tuer à la main par son PID.`);
}

/**
 * Exécute `cleanup` une seule fois : à l'appel explicite (fin normale ou erreur) ou sur Ctrl+C / SIGTERM,
 * auquel cas le processus sort ensuite avec le code 130 / 143.
 */
export function guardCleanup(cleanup) {
  let promise;
  const run = () => (promise ??= Promise.resolve().then(cleanup));
  const onSignal = (signal) => {
    console.error(`\n${signal} reçu : arrêt de Chrome et suppression du profil temporaire…`);
    run()
      .catch((err) => console.error(err))
      .finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  return run;
}

/** Lit largeur et hauteur d'un PNG depuis son en-tête IHDR. */
export function pngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** Chemin lisible : relatif au dossier courant s'il est proche, absolu sinon. */
export function rel(file) {
  const relative = path.relative(process.cwd(), file);
  if (!relative) return ".";
  if (path.isAbsolute(relative) || relative.startsWith(`..${path.sep}..`)) return file;
  return relative;
}
