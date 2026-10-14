#!/usr/bin/env node
// Audit Lighthouse (API Node) d'une page du site, en mobile (réglages par défaut de Lighthouse) et/ou en
// desktop (preset desktop), avec chrome-launcher et le Chrome du poste : un seul Chrome headless pour
// tous les passages, profil temporaire supprimé à la fin, Chrome arrêté par son PID.
//
//   node scripts/lighthouse.mjs [--url http://127.0.0.1:5631/] [--preset mobile|desktop|all]
//                               [--out preuves] [--locale fr] [--json] [--max-items 3]
//                               [--debug-port 5634] [--chrome <chemin>]
//
// Toujours contre le build de production : npm run build, puis npm run serve:prod (port 5631).
// Rapport HTML : <out>/lighthouse-<preset>.html (+ .json avec --json).

import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { parseArgs } from "node:util";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import {
  acquireChromeLock,
  DEFAULT_OUT_DIR,
  ensureDead,
  findChrome,
  guardCleanup,
  isAlive,
  makeTempProfile,
  rel,
  removeDir,
} from "./lib/chrome.mjs";

const USAGE = `Usage : node scripts/lighthouse.mjs [options]   (ou npm run lighthouse -- [options])
  --url <url>            page auditée (défaut http://127.0.0.1:5631/, le build servi par npm run serve:prod)
  --preset <p>           mobile, desktop ou all (défaut all : mobile puis desktop)
  --out <dossier>        dossier des rapports (défaut preuves/ à la racine du dépôt)
  --locale <code>        langue du rapport et des titres d'audits (défaut fr)
  --json                 écrit aussi lighthouse-<preset>.json
  --max-items <n>        éléments affichés par audit en échec (défaut 3)
  --debug-port <port>    port de débogage de Chrome (défaut 5634 ; doit être libre)
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
      preset: { type: "string", default: "all" },
      out: { type: "string", default: DEFAULT_OUT_DIR },
      locale: { type: "string", default: "fr" },
      json: { type: "boolean", default: false },
      "max-items": { type: "string", default: "3" },
      "debug-port": { type: "string", default: "5634" },
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
const presets = args.preset === "all" ? ["mobile", "desktop"] : [args.preset];
if (!presets.every((p) => p === "mobile" || p === "desktop")) fail("--preset vaut mobile, desktop ou all.");
const maxItems = Number(args["max-items"]);
if (!Number.isInteger(maxItems) || maxItems < 0) fail("--max-items doit être un entier ≥ 0.");
const debugPort = Number(args["debug-port"]);
if (!Number.isInteger(debugPort) || debugPort < 1024 || debugPort > 65535) fail("--debug-port invalide.");
try {
  new URL(args.url);
} catch {
  fail(`--url invalide : ${args.url}`);
}
let chromePath;
try {
  chromePath = findChrome(args.chrome);
} catch (err) {
  fail(err.message);
}

/**
 * chrome-launcher, quand on lui donne un port, se branche sur ce qui y écoute déjà au lieu de lancer
 * son Chrome (et ne saurait alors pas l'arrêter) : on exige un port libre.
 */
function assertPortFree(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () => reject(new Error(`le port ${port} est occupé : choisir --debug-port (5631-5639 sur ce poste).`)));
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}

const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];
const METRICS = [
  ["first-contentful-paint", "FCP"],
  ["largest-contentful-paint", "LCP"],
  ["total-blocking-time", "TBT"],
  ["cumulative-layout-shift", "CLS"],
  ["speed-index", "SI"],
];
const SCORED = new Set(["binary", "numeric", "metricSavings"]);
const score100 = (s) => (s === null || s === undefined ? "–" : String(Math.round(s * 100)));
const oneLine = (s, n = 160) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** Élément HTML d'un résultat : libellé (ou extrait HTML s'il ne fait que répéter le sélecteur) et sélecteur. */
function nodeLabel(node, width = 70) {
  const label = node.nodeLabel && node.nodeLabel !== node.selector ? node.nodeLabel : node.snippet;
  return `${oneLine(label, width)} (${oneLine(node.selector, 70)})`;
}

function itemLabel(item) {
  const parts = [];
  const url = item.url ?? item.source?.url;
  if (typeof url === "string") parts.push(oneLine(url, 110));
  const node = item.node ?? (item.type === "node" ? item : undefined);
  if (node && !url) parts.push(nodeLabel(node));
  if (node?.explanation) {
    parts.push(oneLine(node.explanation.replace(/^Fix (any|all) of the following:\s*/i, ""), 140));
  }
  return parts.length ? parts.join(" — ") : null;
}

/** L'élément LCP, d'après l'insight « lcp-breakdown » (Lighthouse 13). */
function lcpElement(lhr) {
  const lists = lhr.audits["lcp-breakdown-insight"]?.details?.items ?? [];
  const node = lists.find((entry) => entry?.type === "node");
  if (!node) return null;
  const src = /\bsrc="([^"]+)"/.exec(node.snippet ?? "")?.[1];
  const tag = /^<(\w+)/.exec(node.snippet ?? "")?.[1] ?? "?";
  let shown = src;
  try {
    shown = src && decodeURIComponent(src.replace(/&amp;/g, "&")); // l'extrait est tronqué : « %2 » peut casser
  } catch {
    // on garde l'URL encodée
  }
  return `<${tag}> ${oneLine(node.selector, 70)}${shown ? ` — ${oneLine(shown, 90)}` : ""}`;
}

function printSummary(preset, lhr, reportFile) {
  console.log(`\n=== ${preset} — ${lhr.finalDisplayedUrl} (Lighthouse ${lhr.lighthouseVersion})`);
  if (lhr.runtimeError) console.log(`  ! erreur d'exécution : ${lhr.runtimeError.code} — ${oneLine(lhr.runtimeError.message)}`);
  for (const warning of lhr.runWarnings ?? []) console.log(`  ! ${oneLine(warning, 200)}`);
  if (lhr.runtimeError) {
    console.log(`  Rapport : ${rel(reportFile)}`);
    return;
  }
  for (const id of CATEGORIES) {
    const cat = lhr.categories[id];
    if (cat) console.log(`  ${cat.title.padEnd(26)} ${score100(cat.score).padStart(3)}`);
  }
  const metrics = METRICS.map(([id, short]) => {
    const audit = lhr.audits[id];
    return audit ? `${short} ${audit.displayValue ?? "–"}` : null;
  }).filter(Boolean);
  console.log(`  Mesures : ${metrics.join(" · ")}`);
  const lcp = lcpElement(lhr);
  if (lcp) console.log(`  Élément LCP : ${lcp}`);

  let failures = 0;
  for (const id of CATEGORIES) {
    const cat = lhr.categories[id];
    if (!cat) continue;
    const seen = new Set();
    const failing = cat.auditRefs
      .map((ref) => ({ ref, audit: lhr.audits[ref.id] }))
      .filter(({ ref, audit }) => {
        if (!audit || seen.has(ref.id)) return false;
        seen.add(ref.id);
        if (audit.scoreDisplayMode === "error") return true;
        return SCORED.has(audit.scoreDisplayMode) && audit.score !== null && audit.score < 0.9;
      })
      .sort((a, b) => b.ref.weight - a.ref.weight || (a.audit.score ?? 0) - (b.audit.score ?? 0));
    if (!failing.length) continue;
    console.log(`  ${cat.title} — en échec :`);
    for (const { ref, audit } of failing) {
      failures++;
      const value = audit.displayValue ? ` : ${oneLine(audit.displayValue, 80)}` : "";
      const status =
        audit.scoreDisplayMode === "error"
          ? `erreur d'audit : ${oneLine(audit.errorMessage, 100)}`
          : `score ${audit.score.toFixed(2).replace(".", ",")}${ref.weight ? `, poids ${ref.weight}` : ""}`;
      console.log(`    - ${audit.id} — ${oneLine(audit.title, 100)}${value} (${status})`);
      const items = Array.isArray(audit.details?.items) ? audit.details.items : [];
      for (const item of items.slice(0, maxItems)) {
        const label = itemLabel(item);
        if (label) console.log(`        · ${label}`);
      }
      if (items.length > maxItems && maxItems > 0) console.log(`        · … ${items.length - maxItems} de plus dans le rapport`);
    }
  }
  if (!failures) console.log("  Aucun audit en échec (score < 0,9).");
  console.log(`  Rapport : ${rel(reportFile)}`);
}

const outDir = path.resolve(args.out);
await mkdir(outDir, { recursive: true });

let releaseLock;
let profile;
let chrome;
const cleanup = guardCleanup(async () => {
  try {
    if (chrome) {
      const { pid } = chrome;
      if (isAlive(pid)) chrome.kill(); // taskkill /PID … /T /F sous Windows
      await ensureDead(pid);
    }
    await removeDir(profile);
  } finally {
    await releaseLock?.();
  }
});

let exitCode = 0;
try {
  releaseLock = await acquireChromeLock("lighthouse");
  await assertPortFree(debugPort);
  profile = await makeTempProfile("lighthouse");
  chrome = await chromeLauncher.launch({
    chromePath,
    userDataDir: profile,
    port: debugPort,
    handleSIGINT: false,
    logLevel: "silent",
    chromeFlags: ["--headless=new", "--lang=fr-FR"],
  });
  if (!chrome.pid) throw new Error("chrome-launcher n'a pas lancé de Chrome (connexion à un Chrome existant ?)");
  console.log(`Chrome ${chromePath} (PID ${chrome.pid}, port ${chrome.port}) — ${args.url}`);

  for (const preset of presets) {
    const flags = {
      port: chrome.port,
      output: args.json ? ["html", "json"] : "html",
      logLevel: "error",
      locale: args.locale,
    };
    const result = await lighthouse(args.url, flags, preset === "desktop" ? desktopConfig : undefined);
    if (!result) throw new Error(`Lighthouse n'a rendu aucun résultat (${preset}).`);
    const reports = Array.isArray(result.report) ? result.report : [result.report];
    const htmlFile = path.join(outDir, `lighthouse-${preset}.html`);
    await writeFile(htmlFile, reports[0]);
    if (args.json) await writeFile(path.join(outDir, `lighthouse-${preset}.json`), reports[1]);
    printSummary(preset, result.lhr, htmlFile);
    if (result.lhr.runtimeError) exitCode = 1;
  }
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
