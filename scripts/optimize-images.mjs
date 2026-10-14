#!/usr/bin/env node
// Optimise des images sources (PNG / JPG / WebP) pour le site : redimensionne (sans jamais agrandir) et
// réencode en WebP, AVIF et/ou PNG optimisé, en gardant l'arborescence relative du dossier source.
//
//   node scripts/optimize-images.mjs --in <dossier> [--out public/images] [--max-width 1920]
//                                    [--quality 82] [--format webp|avif|png|webp,avif]
//
// Exemple : npm run optimize-images -- --in ../design/captures --max-width 1600 --format webp,avif
// Les images servies par next/image sont de toute façon réencodées à la demande (AVIF / WebP) :
// ce script sert à garder des sources légères dans public/images.

import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import sharp from "sharp";

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INPUT_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const FORMATS = ["webp", "avif", "png"];

function usage(message) {
  if (message) console.error(`Erreur : ${message}\n`);
  console.error(
    "Usage : node scripts/optimize-images.mjs --in <dossier> [--out <dossier>] [--max-width <n>] [--quality <1-100>] [--format webp|avif|png[,…]]",
  );
  process.exit(message ? 1 : 0);
}

let args;
try {
  ({ values: args } = parseArgs({
    options: {
      in: { type: "string" },
      out: { type: "string", default: path.join(SITE_DIR, "public", "images") },
      "max-width": { type: "string", default: "1920" },
      quality: { type: "string", default: "82" },
      format: { type: "string", default: "webp" },
      help: { type: "boolean", short: "h" },
    },
  }));
} catch (err) {
  usage(err.message);
}
if (args.help) usage();
if (!args.in) usage("--in est obligatoire.");

const inDir = path.resolve(args.in);
const outDir = path.resolve(args.out);
const maxWidth = Number(args["max-width"]);
const quality = Number(args.quality);
const formats = args.format.split(",").map((f) => f.trim().toLowerCase()).filter(Boolean);

if (!Number.isInteger(maxWidth) || maxWidth < 1) usage("--max-width doit être un entier positif.");
if (!Number.isInteger(quality) || quality < 1 || quality > 100) usage("--quality doit être un entier entre 1 et 100.");
if (!formats.length || formats.some((f) => !FORMATS.includes(f))) usage(`--format parmi ${FORMATS.join(", ")}.`);
if (!(await stat(inDir).catch(() => null))?.isDirectory()) usage(`dossier source introuvable : ${inDir}`);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full !== outDir) yield* walk(full);
    } else if (INPUT_EXT.has(path.extname(entry.name).toLowerCase())) {
      yield full;
    }
  }
}

function encode(pipeline, format) {
  switch (format) {
    case "webp":
      return pipeline.webp({ quality, effort: 6 });
    case "avif":
      return pipeline.avif({ quality, effort: 6 });
    case "png":
      // quality < 100 : palette quantifiée (bien plus légère) ; 100 : sans perte
      return pipeline.png({ compressionLevel: 9, palette: quality < 100, quality });
  }
  throw new Error(`format inconnu : ${format}`);
}

const kb = (n) => `${(n / 1024).toFixed(1)} Ko`;
let count = 0;
let before = 0;
let after = 0;
let failures = 0;

for await (const file of walk(inDir)) {
  const rel = path.relative(inDir, file);
  const base = rel.slice(0, -path.extname(rel).length);
  const srcSize = (await stat(file)).size;
  before += srcSize;
  try {
    const source = sharp(file, { failOn: "error" }).rotate().resize({ width: maxWidth, withoutEnlargement: true });
    for (const format of formats) {
      const target = path.join(outDir, `${base}.${format}`);
      if (path.resolve(target) === path.resolve(file)) {
        console.warn(`ignoré (écraserait la source) : ${rel}`);
        continue;
      }
      await mkdir(path.dirname(target), { recursive: true });
      const info = await encode(source.clone(), format).toFile(target);
      after += info.size;
      count++;
      console.log(`${rel} → ${path.relative(outDir, target)}  ${info.width}×${info.height}  ${kb(srcSize)} → ${kb(info.size)}`);
    }
  } catch (err) {
    failures++;
    console.error(`échec : ${rel} — ${err instanceof Error ? err.message : err}`);
  }
}

console.log(`\n${count} fichier(s) écrit(s) dans ${outDir} : sources ${kb(before)} → sorties ${kb(after)}${failures ? `, ${failures} échec(s)` : ""}.`);
if (failures) process.exit(1);
