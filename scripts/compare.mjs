#!/usr/bin/env node
// Compare la maquette Figma et le rendu du site, section par section (sharp).
//
//   node scripts/compare.mjs --ref <maquette.png> --shot <rendu.png>
//                            [--sections "hero:0:1000,combat:1000:2100,..."] [--threshold 24]
//                            [--out preuves]
//
// --ref   export PNG du cadre Figma (1600 px de large pour la landing)
// --shot  capture pleine page du rendu à la même largeur, de préférence avec --reduced-motion :
//         npm run shoot -- --widths 1600 --reduced-motion --name rendu
//         (une autre largeur, une capture --dpr 2 par exemple, est ramenée à celle de la maquette)
// --sections  liste nom:début:fin en px de la maquette (fin exclue) ; un 4e champ facultatif donne le
//         début de la même plage dans le rendu quand le rendu est décalé : « combat:1000:2100:1040 ».
//         Défaut : une section « page » sur toute la hauteur de la maquette.
//
// Pour chaque section : <out>/site-compare-<section>.png (gauche : maquette, droite : rendu, même
// hauteur, étiquettes « Figma » / « Rendu » en tête) et <out>/site-diff-<section>.png (maquette en gris
// assombri, pixels différents en magenta). Un pixel est « différent » si l'un de ses canaux R, G ou B
// s'écarte de plus de --threshold (0-255). Une image plus courte que la plage demandée est complétée
// en noir (et ce noir compte comme différent face à du contenu). Les transparences sont aplaties sur du
// noir.

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { DEFAULT_OUT_DIR, rel } from "./lib/chrome.mjs";

const USAGE = `Usage : node scripts/compare.mjs --ref <maquette.png> --shot <rendu.png> [options]   (ou npm run compare -- …)
  --sections <liste>     nom:début:fin[:débutRendu],… en px de la maquette (défaut : toute la page)
  --threshold <0-255>    écart max par canal R, G, B avant de compter un pixel comme différent (défaut 24)
  --out <dossier>        dossier de sortie (défaut preuves/ à la racine du dépôt)`;

function fail(message) {
  console.error(`Erreur : ${message}\n\n${USAGE}`);
  process.exit(1);
}

let args;
try {
  ({ values: args } = parseArgs({
    options: {
      ref: { type: "string" },
      shot: { type: "string" },
      sections: { type: "string" },
      threshold: { type: "string", default: "24" },
      out: { type: "string", default: DEFAULT_OUT_DIR },
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
if (!args.ref || !args.shot) fail("--ref et --shot sont obligatoires.");
const threshold = Number(args.threshold);
if (!Number.isInteger(threshold) || threshold < 0 || threshold > 255) fail("--threshold doit être un entier entre 0 et 255.");

const LABEL_H = 40;
const GAP = 16;
const fmtPct = (n) => `${n.toFixed(2).replace(".", ",")} %`;
const escapeXml = (s) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Image en RVB brut (alpha aplati sur du noir), à la largeur voulue. */
async function loadRgb(file, width) {
  const meta = await sharp(file).metadata().catch((err) => fail(`${file} illisible : ${err.message}`));
  let img = sharp(file).flatten({ background: "#000000" });
  if (width && meta.width !== width) img = img.resize({ width, kernel: "lanczos3" });
  const { data, info } = await img.removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, original: meta };
}

/** Bande de `h` lignes à partir de `y0` ; les lignes hors image restent noires. */
function band(img, y0, h) {
  const row = img.width * 3;
  const out = Buffer.alloc(row * h);
  const from = Math.max(0, y0);
  const to = Math.min(img.height, y0 + h);
  if (to > from) img.data.copy(out, (from - y0) * row, from * row, to * row);
  return { data: out, missing: h - Math.max(0, to - from) };
}

function parseSections(spec, refHeight) {
  if (!spec) return [{ name: "page", y0: 0, y1: refHeight, shotY0: 0 }];
  const seen = new Set();
  return spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [rawName, ...nums] = s.split(":");
      const name = rawName.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
      const [y0, y1, shotY0 = y0] = nums.map(Number);
      if (!name || (nums.length !== 2 && nums.length !== 3) || ![y0, y1, shotY0].every(Number.isInteger)) {
        fail(`section invalide « ${s} » : attendu nom:début:fin[:débutRendu] (entiers).`);
      }
      if (y0 < 0 || y1 <= y0 || shotY0 < 0) fail(`section « ${s} » : il faut 0 ≤ début < fin.`);
      if (seen.has(name)) fail(`section en double : ${name}`);
      seen.add(name);
      return { name, y0, y1, shotY0 };
    });
}

const ref = await loadRgb(path.resolve(args.ref));
const shot = await loadRgb(path.resolve(args.shot), ref.width);
const width = ref.width;
const sections = parseSections(args.sections, ref.height);
const outDir = path.resolve(args.out);
await mkdir(outDir, { recursive: true });

console.log(`Maquette : ${rel(path.resolve(args.ref))} (${ref.width}×${ref.height})`);
console.log(
  `Rendu    : ${rel(path.resolve(args.shot))} (${shot.original.width}×${shot.original.height}` +
    `${shot.original.width !== width ? `, ramené à ${shot.width}×${shot.height}` : ""})`,
);
console.log(`Seuil    : écart > ${threshold} sur au moins un canal R, G ou B\n`);

let totalPixels = 0;
let totalDiff = 0;
for (const section of sections) {
  const h = section.y1 - section.y0;
  const a = band(ref, section.y0, h);
  const b = band(shot, section.shotY0, h);

  const diff = Buffer.alloc(width * h * 3);
  let count = 0;
  for (let i = 0; i < diff.length; i += 3) {
    const r1 = a.data[i];
    const g1 = a.data[i + 1];
    const b1 = a.data[i + 2];
    const d = Math.max(Math.abs(r1 - b.data[i]), Math.abs(g1 - b.data[i + 1]), Math.abs(b1 - b.data[i + 2]));
    if (d > threshold) {
      count++;
      diff[i] = 255;
      diff[i + 1] = 0;
      diff[i + 2] = 255;
    } else {
      const grey = Math.round((0.299 * r1 + 0.587 * g1 + 0.114 * b1) * 0.35);
      diff[i] = grey;
      diff[i + 1] = grey;
      diff[i + 2] = grey;
    }
  }
  const pct = (100 * count) / (width * h);
  totalPixels += width * h;
  totalDiff += count;

  const raw = { width, height: h, channels: 3 };
  const shotRange = `y ${section.shotY0}–${section.shotY0 + h}`;
  const labels = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${2 * width + GAP}" height="${LABEL_H}">` +
      `<style>text{font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;fill:#fff}</style>` +
      `<text x="12" y="27">${escapeXml(`Figma · ${section.name} · y ${section.y0}–${section.y1}`)}</text>` +
      `<text x="${width + GAP + 12}" y="27">${escapeXml(`Rendu · ${shotRange} · ${fmtPct(pct)} différents`)}</text>` +
      `</svg>`,
  );
  const compareFile = path.join(outDir, `site-compare-${section.name}.png`);
  const diffFile = path.join(outDir, `site-diff-${section.name}.png`);
  await sharp({ create: { width: 2 * width + GAP, height: h + LABEL_H, channels: 3, background: "#1b1b1f" } })
    .composite([
      { input: a.data, raw, left: 0, top: LABEL_H },
      { input: b.data, raw, left: width + GAP, top: LABEL_H },
      { input: labels, left: 0, top: 0 },
    ])
    .png()
    .toFile(compareFile);
  await sharp(diff, { raw }).png().toFile(diffFile);

  const notes = [];
  if (section.shotY0 !== section.y0) notes.push(`rendu ${shotRange}`);
  if (a.missing) notes.push(`maquette plus courte : ${a.missing} px de noir`);
  if (b.missing) notes.push(`rendu plus court : ${b.missing} px de noir`);
  console.log(
    `  ${section.name.padEnd(14)} y ${`${section.y0}–${section.y1}`.padEnd(11)} ${fmtPct(pct).padStart(9)}` +
      `   ${rel(compareFile)}, ${path.basename(diffFile)}${notes.length ? `   (${notes.join(" ; ")})` : ""}`,
  );
}
if (sections.length > 1) {
  console.log(`  ${"total".padEnd(14)} ${"".padEnd(13)} ${fmtPct((100 * totalDiff) / totalPixels).padStart(9)}   (pondéré par la hauteur)`);
}
