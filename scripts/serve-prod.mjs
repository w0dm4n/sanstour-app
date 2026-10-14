#!/usr/bin/env node
// Sert le build de production comme l'image Docker : le serveur autonome .next/standalone/server.js,
// après copie de public/ et .next/static/ dans .next/standalone/ (next build ne les y met pas).
// Le build doit déjà être fait (npm run build). Pour Lighthouse et les captures : jamais next dev.
//
//   node scripts/serve-prod.mjs [--port 5631] [--host 127.0.0.1]     (ou npm run serve:prod)
//
// Un seul processus Node (celui-ci charge server.js) : l'arrêter par Ctrl+C ou par le PID affiché.
// HOSTNAME est fixé explicitement : Git Bash définit HOSTNAME au nom de la machine, que server.js
// prendrait sinon comme adresse d'écoute.

import { existsSync } from "node:fs";
import { cp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { SITE_DIR } from "./lib/chrome.mjs";

let args;
try {
  ({ values: args } = parseArgs({
    options: {
      port: { type: "string", default: "5631" },
      host: { type: "string", default: "127.0.0.1" },
      help: { type: "boolean", short: "h" },
    },
  }));
} catch (err) {
  console.error(`Erreur : ${err.message}`);
  process.exit(1);
}
if (args.help) {
  console.log("Usage : node scripts/serve-prod.mjs [--port 5631] [--host 127.0.0.1]   (après npm run build)");
  process.exit(0);
}

const standalone = path.join(SITE_DIR, ".next", "standalone");
const server = path.join(standalone, "server.js");
if (!existsSync(server)) {
  console.error(`Erreur : ${path.relative(SITE_DIR, server)} introuvable : lancer « npm run build » d'abord.`);
  process.exit(1);
}

// Fichiers statiques du build courant (on remplace toute copie d'un build précédent).
const staticSrc = path.join(SITE_DIR, ".next", "static");
const staticDst = path.join(standalone, ".next", "static");
await rm(staticDst, { recursive: true, force: true });
await cp(staticSrc, staticDst, { recursive: true });
const publicSrc = path.join(SITE_DIR, "public");
const publicDst = path.join(standalone, "public");
await rm(publicDst, { recursive: true, force: true });
if (existsSync(publicSrc)) await cp(publicSrc, publicDst, { recursive: true });

process.env.NODE_ENV = "production";
process.env.PORT = args.port;
process.env.HOSTNAME = args.host;
console.log(`Site Sanstour (build de production, standalone) : http://${["0.0.0.0", "::"].includes(args.host) ? "127.0.0.1" : args.host}:${args.port}/  — PID ${process.pid}`);
await import(pathToFileURL(server).href);
