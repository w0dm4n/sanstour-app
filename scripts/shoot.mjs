#!/usr/bin/env node
// Captures du site pour les preuves, avec puppeteer-core et le Chrome installé sur le poste (un seul
// Chrome headless, profil temporaire supprimé à la fin, même en cas d'erreur ou de Ctrl+C).
//
//   node scripts/shoot.mjs [--url http://127.0.0.1:5631/] [--widths 390,768,1280,1600,2200,2752]
//                          [--height 900] [--out preuves] [--name site]
//                          [--full | --viewport | --scroll <y>] [--clip x,y,w,h] [--reduced-motion]
//                          [--dpr 1] [--settle 500] [--timeout 60000] [--chrome <chemin>]
//
// Fichiers : <out>/site-<name>-<largeur>.png (« site- » n'est pas doublé : --name site → site-1600.png,
// --name hero → site-hero-1600.png ; suffixe @<dpr>x si --dpr ≠ 1).
//
// Avant chaque capture : document.fonts.ready, défilement de toute la page par pas (images lazy,
// animations « whileInView »), attente des images (complete + decode) et du réseau au repos, retour en
// haut (ou à --scroll y), puis --settle ms.
//
// Pleine page (défaut) : puppeteer 25 capture avec captureBeyondViewport (CDP) : Chrome agrandit la
// surface capturée à la hauteur du document, mais (mesuré avec Chrome 155) sans changer la mise en page :
// 100vh / svh / dvh et window.innerHeight gardent la hauteur de --height, aucun « resize ». En revanche
// tout est dessiné dans l'état « défilement 0 » : un élément fixed / sticky n'apparaît qu'une fois, en
// haut, et un parallax piloté par le défilement est figé à sa position de départ sur toute la page.
// L'ancienne méthode (captureBeyondViewport: false, anciens puppeteer) agrandissait le viewport lui-même
// et étirait les éléments en vh : le script signale toute capture dont la hauteur diffère de celle du
// document mesurée avant la capture. Pour comparer à la maquette : --reduced-motion (parallax coupé).

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import puppeteer from "puppeteer-core";
import {
  acquireChromeLock,
  DEFAULT_OUT_DIR,
  ensureDead,
  findChrome,
  guardCleanup,
  makeTempProfile,
  pngSize,
  rel,
  removeDir,
} from "./lib/chrome.mjs";

const USAGE = `Usage : node scripts/shoot.mjs [options]   (ou npm run shoot -- [options])
  --url <url>            page à capturer (défaut http://127.0.0.1:5631/, le build servi par npm run serve:prod)
  --widths <liste>       largeurs de viewport, séparées par des virgules (défaut 390,768,1280,1600,2200,2752)
  --height <px>          hauteur du viewport (défaut 900)
  --full                 capture pleine page (défaut)
  --viewport             capture du viewport seulement, en haut de page
  --scroll <y>           capture du viewport après défilement à y (px CSS) ; implique --viewport
  --clip x,y,w,h         ne garde que ce rectangle (px CSS) : coordonnées du document en pleine page,
                         du viewport sinon
  --reduced-motion       émule prefers-reduced-motion: reduce
  --hide-dev-overlay     masque le badge et l'overlay d'erreurs de next dev (élément nextjs-portal)
  --dpr <n>              deviceScaleFactor (défaut 1)
  --settle <ms>          attente avant chaque capture, après le retour en position (défaut 500)
  --timeout <ms>         délai max de chargement d'une page (défaut 60000)
  --out <dossier>        dossier de sortie (défaut preuves/ à la racine du dépôt)
  --name <nom>           nom des fichiers : site-<nom>-<largeur>.png (défaut site → site-<largeur>.png)
  --chrome <chemin>      navigateur à utiliser (défaut : CHROME_PATH, puis Chrome, puis Edge installés)`;

function fail(message) {
  console.error(`Erreur : ${message}\n\n${USAGE}`);
  process.exit(1);
}

let args;
try {
  ({ values: args } = parseArgs({
    options: {
      url: { type: "string", default: "http://127.0.0.1:5631/" },
      widths: { type: "string", default: "390,768,1280,1600,2200,2752" },
      height: { type: "string", default: "900" },
      out: { type: "string", default: DEFAULT_OUT_DIR },
      name: { type: "string", default: "site" },
      full: { type: "boolean", default: false },
      viewport: { type: "boolean", default: false },
      scroll: { type: "string" },
      clip: { type: "string" },
      "reduced-motion": { type: "boolean", default: false },
      "hide-dev-overlay": { type: "boolean", default: false },
      dpr: { type: "string", default: "1" },
      settle: { type: "string", default: "500" },
      timeout: { type: "string", default: "60000" },
      chrome: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  }));
} catch (err) {
  fail(err.message);
}
if (args.help) {
  console.log(USAGE);
  process.exit(0);
}

const toInt = (value, label, min = 1) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) fail(`${label} doit être un entier ≥ ${min} (reçu « ${value} »).`);
  return n;
};

const widths = args.widths
  .split(/[,\s]+/)
  .filter(Boolean)
  .map((w) => toInt(w, "--widths"));
if (!widths.length) fail("--widths est vide.");
const height = toInt(args.height, "--height");
const settle = toInt(args.settle, "--settle", 0);
const timeout = toInt(args.timeout, "--timeout");
const dpr = Number(args.dpr);
if (!(dpr > 0 && dpr <= 4)) fail("--dpr doit être un nombre entre 0 et 4.");
if (args.full && (args.viewport || args.scroll !== undefined)) fail("--full exclut --viewport et --scroll.");
const scrollY = args.scroll === undefined ? 0 : toInt(args.scroll, "--scroll", 0);
const fullPage = !(args.viewport || args.scroll !== undefined);
let clip;
if (args.clip) {
  const parts = args.clip.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n)) || parts[2] <= 0 || parts[3] <= 0) {
    fail("--clip attend x,y,largeur,hauteur (px CSS), largeur et hauteur > 0.");
  }
  clip = { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}
try {
  new URL(args.url);
} catch {
  fail(`--url invalide : ${args.url}`);
}

const outDir = path.resolve(args.out);
const baseName = args.name.replace(/^site-?/, "");
const fileFor = (w) =>
  path.join(outDir, `site-${baseName ? `${baseName}-` : ""}${w}${dpr === 1 ? "" : `@${dpr}x`}.png`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Défile toute la page par pas de 80 % du viewport pour déclencher le lazy loading et les « in view ». */
async function scrollThrough(page) {
  await page.evaluate(async () => {
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
    for (let y = 0, i = 0; i < 1000; i++) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (y >= max) break;
      y = Math.min(y + step, max);
      window.scrollTo({ top: y, left: 0, behavior: "instant" });
      await pause(120);
    }
    window.scrollTo({ top: document.documentElement.scrollHeight, left: 0, behavior: "instant" });
    await pause(300);
  });
}

/**
 * Attend que les images soient chargées et décodées ; rend la liste des images en attente ou cassées.
 * Les images lazy encore absentes après le défilement (hors de vue : calques de parallax, display:none…)
 * passent en eager, sinon elles manqueraient à la capture pleine page. decode() ne se résout jamais pour
 * une image pas encore chargée : on ne décode que les images complètes, avec une limite de temps.
 */
async function waitImages(page) {
  const issues = [];
  await page.evaluate(() => {
    for (const img of document.images) if (!img.complete && img.loading === "lazy") img.loading = "eager";
  });
  try {
    await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete), {
      timeout,
      polling: 100,
    });
  } catch {
    const pending = await page.evaluate(() =>
      Array.from(document.images)
        .filter((img) => !img.complete)
        .map((img) => img.currentSrc || img.src),
    );
    issues.push(...pending.map((src) => `image encore en chargement après ${timeout / 1000} s : ${src}`));
  }
  const broken = await page.evaluate(async () => {
    const done = Array.from(document.images).filter((img) => img.complete);
    const decoded = Promise.all(done.map((img) => img.decode().catch(() => {})));
    await Promise.race([decoded, new Promise((resolve) => setTimeout(resolve, 10000))]);
    return done
      .filter((img) => img.naturalWidth === 0 && (img.currentSrc || img.src))
      .map((img) => img.currentSrc || img.src);
  });
  issues.push(...broken.map((src) => `image cassée : ${src}`));
  return issues;
}

/** document.fonts.ready, borné à 10 s ; rend document.fonts.status. */
function fontsReady(page) {
  return page.evaluate(() =>
    Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 10000))]).then(
      () => document.fonts.status,
    ),
  );
}

/** Défile à y (sans animation, même avec scroll-behavior: smooth), attend deux images puis `settle`. */
async function scrollToAndSettle(page, y) {
  const actual = await page.evaluate(async (top) => {
    window.scrollTo({ top, left: 0, behavior: "instant" });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return window.scrollY;
  }, y);
  await sleep(settle);
  return actual;
}

async function shoot(browser, width) {
  const started = Date.now();
  const page = await browser.newPage();
  const problems = [];
  page.on("pageerror", (err) => problems.push(`erreur JS : ${err.message.split("\n")[0]}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(`console.error : ${msg.text().split("\n")[0]}`);
  });
  page.on("requestfailed", (req) => {
    const reason = req.failure()?.errorText ?? "";
    if (reason !== "net::ERR_ABORTED") problems.push(`requête en échec (${reason}) : ${req.url()}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400) problems.push(`HTTP ${res.status()} : ${res.url()}`);
  });
  try {
    await page.setViewport({ width, height, deviceScaleFactor: dpr });
    await page.emulateMediaFeatures([
      { name: "prefers-reduced-motion", value: args["reduced-motion"] ? "reduce" : "no-preference" },
    ]);
    await page.setExtraHTTPHeaders({ "Accept-Language": "fr-FR,fr;q=0.9" });

    const response = await page.goto(args.url, { waitUntil: "load", timeout });
    if (response && response.status() >= 400) problems.push(`la page répond HTTP ${response.status()}`);
    if (await page.evaluate(() => document.documentElement.id === "__next_error__")) {
      problems.push("rendu serveur en échec : page d'erreur de Next (html#__next_error__), rendu côté client seulement");
    }
    if (args["hide-dev-overlay"]) {
      // Masque l'indicateur ET l'overlay d'erreurs de next dev (même élément) ; sans effet en production.
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
    }
    await fontsReady(page);

    await scrollThrough(page);
    problems.push(...(await waitImages(page)));
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 15000 }).catch(() => {
      problems.push("réseau jamais au repos 500 ms (15 s) : capture faite quand même");
    });
    const fonts = await fontsReady(page);

    const actualY = await scrollToAndSettle(page, fullPage ? 0 : scrollY);
    const doc = await page.evaluate(() => ({
      height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
    }));

    const options = { type: "png", fullPage: fullPage && !clip };
    if (clip) {
      options.clip = fullPage ? clip : { ...clip, y: clip.y + actualY };
      options.captureBeyondViewport = fullPage;
    }
    const png = Buffer.from(await page.screenshot(options));
    const file = fileFor(width);
    await writeFile(file, png);

    const size = pngSize(png);
    const notes = [];
    if (!fullPage) notes.push(`scrollY ${actualY}${actualY !== scrollY ? ` (demandé ${scrollY}, bas de page atteint)` : ""}`);
    if (fullPage && !clip) {
      notes.push(`document ${doc.height} px`);
      const captured = Math.round(size.height / dpr);
      if (Math.abs(captured - doc.height) > 1) {
        problems.push(
          `hauteur capturée ${captured} px ≠ hauteur du document ${doc.height} px avec le viewport de ${height} px : ` +
            "la capture pleine page agrandit la zone d'affichage (éléments en vh/svh/dvh ou dépendants du viewport)",
        );
      }
    }
    if (fonts !== "loaded") problems.push(`polices encore en chargement (document.fonts.status = ${fonts})`);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`  ${String(width).padStart(4)} px  ${rel(file)}  ${size.width}×${size.height}  ${notes.join(", ")}  ${secs} s`);
    for (const p of [...new Set(problems)]) console.log(`         ! ${p}`);
    return problems.length;
  } finally {
    await page.close().catch(() => {});
  }
}

const chromePath = (() => {
  try {
    return findChrome(args.chrome);
  } catch (err) {
    return fail(err.message);
  }
})();
await mkdir(outDir, { recursive: true });

let releaseLock;
let profile;
let browser;
let pid;
const cleanup = guardCleanup(async () => {
  try {
    if (browser) await browser.close().catch(() => {});
    if (pid) await ensureDead(pid);
    await removeDir(profile);
  } finally {
    await releaseLock?.();
  }
});

const startedAt = Date.now();
let exitCode = 0;
try {
  releaseLock = await acquireChromeLock("shoot");
  profile = await makeTempProfile("shoot");
  browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    userDataDir: profile,
    pipe: true, // pas de port de débogage TCP
    defaultViewport: null,
    protocolTimeout: timeout + 120000, // chaque attente dans la page est bornée en dessous
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
    args: ["--lang=fr-FR", "--force-color-profile=srgb"],
  });
  pid = browser.process()?.pid;
  const mode = clip
    ? `rectangle ${args.clip}${fullPage ? " (document)" : ` (viewport, scrollY ${scrollY})`}`
    : fullPage
      ? "pleine page"
      : `viewport, scrollY ${scrollY}`;
  console.log(
    `${await browser.version()} (PID ${pid}) — ${args.url}\n` +
      `  ${mode}, viewport ×${height} px, dpr ${dpr}${args["reduced-motion"] ? ", prefers-reduced-motion: reduce" : ""}`,
  );
  let warnings = 0;
  for (const width of widths) warnings += await shoot(browser, width);
  console.log(`Terminé en ${((Date.now() - startedAt) / 1000).toFixed(1)} s${warnings ? `, ${warnings} avertissement(s) : voir les lignes « ! » ci-dessus` : ""}.`);
} catch (err) {
  console.error(`Erreur : ${err.message}`);
  exitCode = 1;
} finally {
  try {
    await cleanup();
  } catch (err) {
    console.error(`Erreur au nettoyage : ${err.message}`);
    exitCode = 1;
  }
}
process.exit(exitCode);
