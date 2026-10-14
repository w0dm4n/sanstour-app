#!/usr/bin/env node
// Construit les images de la landing (public/images/landing) et les icônes (src/app) depuis les exports
// de la maquette Figma de nicow (« SANSTOUR (Copy) »), faits avec le MCP Figwright :
//   - originaux des fills (save_image_fills) pour les éléments du village, posés hors cadre ;
//   - rendus à l'échelle 2 (save_screenshots, scale 2) pour les fonds recadrés, les transitions, le logo ;
//   - rendus à l'échelle 1 pour « Profil » (14:323) et « Discord Banner » (14:350).
// Chaque fichier d'entrée s'appelle d'après son nœud Figma (« 6:202 » → 6-202.png).
//
//   node scripts/build-landing-images.mjs --in <dossier des exports Figma>
//
// Voir notes/site.md (section « Assets ») pour refaire les exports.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import sharp from "sharp";

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(SITE_DIR, "public", "images", "landing");
const APP = path.join(SITE_DIR, "src", "app");

const { values: args } = parseArgs({ options: { in: { type: "string" } } });
if (!args.in) {
  console.error("Usage : node scripts/build-landing-images.mjs --in <dossier des exports Figma>");
  process.exit(1);
}
const src = (node) => path.join(path.resolve(args.in), `${node.replace(":", "-")}.png`);

// Fond de la maquette (#373023, --color-sanstour-terre) : sous les coins arrondis du cadre Figma.
const TERRE = { r: 0x37, g: 0x30, b: 0x23 };

/** [nom de sortie, nœud Figma, options] — tailles en px d'image (l'échelle 2 donne 3200 px pour 1600). */
const LANDING = [
  ["village-fond", "6:107", { quality: 78, opaque: true }],
  ["falaise-herbeuse", "6:109", {}],
  ["nuage", "6:110", {}],
  ["ferme", "6:111", {}],
  ["buisson-rond-jaune", "6:112", {}],
  ["buisson", "6:113", {}],
  ["combat-fond", "6:155", { quality: 76, opaque: true }],
  ["royale-fond", "13:257", { quality: 76, opaque: true }],
  ["songes-fond", "13:252", { quality: 76, opaque: true }],
  ["transition-village-combat", "6:202", {}],
  ["transition-royale-songes", "13:261", {}],
  ["logo-sanstour", "6:121", { quality: 90 }],
];

async function webp(input, name, { quality = 82, opaque = false } = {}) {
  let img = sharp(input);
  if (opaque) img = img.flatten({ background: TERRE });
  const out = path.join(OUT, `${name}.webp`);
  const info = await img
    .webp({ quality, alphaQuality: 90, effort: 6, smartSubsample: true })
    .toFile(out);
  console.log(`${path.relative(SITE_DIR, out)}  ${info.width}x${info.height}  ${(info.size / 1024).toFixed(0)} Ko`);
}

await mkdir(OUT, { recursive: true });

for (const [name, node, options] of LANDING) await webp(src(node), name, options);

// Versions mobiles des fonds (< 1024 px) : seule une bande verticale de chaque fond est visible sur un
// téléphone ; on la découpe pour ne pas télécharger trois fois la largeur de l'écran. Les fractions viennent
// des boîtes mobiles d'origine de src/components/landing/donnees.ts (x, largeur en px de la maquette 390) :
// gauche = -x / largeur, largeur visible = 390 / largeur ; toute la hauteur est gardée.
const MOBILE = [
  ["village-fond-mobile", "6:107", -380, 1046],
  ["combat-fond-mobile", "6:155", -480, 1147],
  ["royale-fond-mobile", "13:257", -350, 1154],
  ["songes-fond-mobile", "13:252", -440, 1090],
];
for (const [name, node, x, largeur] of MOBILE) {
  const meta = await sharp(src(node)).metadata();
  const left = Math.round((-x / largeur) * meta.width);
  const width = Math.round((390 / largeur) * meta.width);
  const crop = await sharp(src(node)).extract({ left, top: 0, width, height: meta.height }).png().toBuffer();
  await webp(crop, name, { quality: 76, opaque: true });
}

// Transition combat → Battle Royale : dans la maquette, la même image est posée deux fois (groupes
// « Group 1 » 6:192 et « Group 4 » 13:259). Sous y = 2343 (haut du fond 13:257, opaque), les deux
// copies se superposent et la poussière en est plus dense : on reproduit ce cumul dans un seul fichier.
{
  const top = 2343.26 - 1979; // px de maquette où le fond « royale » commence à couvrir 6:192
  const meta = await sharp(src("6:192")).metadata();
  const rows = Math.round(top * 2);
  const under = await sharp(src("6:192"))
    .extract({ left: 0, top: 0, width: meta.width, height: rows })
    .toBuffer();
  const merged = await sharp({
    create: { width: meta.width, height: meta.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: under, left: 0, top: 0 },
      { input: src("13:259"), left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
  await webp(merged, "transition-combat-royale", {});
}

// Icônes (conventions de fichiers de Next : src/app/icon.png, apple-icon.png, favicon.ico) : le « S »
// de « Profil » (14:406) sur fond transparent ; l'icône Apple reprend la frame « Profil » entière (opaque).
const square = async (input, size) =>
  sharp(input)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
    .toBuffer();

await writeFile(path.join(APP, "icon.png"), await square(src("14:406"), 256));
await writeFile(
  path.join(APP, "apple-icon.png"),
  await sharp(src("14:323")).resize(180, 180).png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 }).toBuffer(),
);

// favicon.ico : conteneur ICO avec des PNG 16, 32 et 48 px.
{
  const sizes = [16, 32, 48];
  const pngs = await Promise.all(sizes.map((s) => square(src("14:406"), s)));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(s, e);
    header.writeUInt8(s, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(pngs[i].length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += pngs[i].length;
  });
  await writeFile(path.join(APP, "favicon.ico"), Buffer.concat([header, ...pngs]));
}

// Image Open Graph / Twitter : la « Discord Banner » (14:350, 1280 × 640).
for (const name of ["opengraph-image.jpg", "twitter-image.jpg"]) {
  await sharp(src("14:350")).jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(APP, name));
}
console.log("icônes et images de partage écrites dans src/app");

// Grain : la frame de la maquette porte un effet « Noise » (assombrissement monochrome, jusqu'à ~15 % dans
// les clairs, mesuré contre notre rendu). Tuile 128 × 128 de bruit noir, alpha = |N(0 ; 0,055)| borné à 0,2,
// graine fixe pour un fichier reproductible.
{
  const N = 128;
  const px = Buffer.alloc(N * N * 4);
  let graine = 0x5a17;
  const alea = () => ((graine = (graine * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < N * N; i++) {
    const g = Math.sqrt(-2 * Math.log(alea() || 1e-9)) * Math.cos(2 * Math.PI * alea());
    px[i * 4 + 3] = Math.round(Math.min(0.2, Math.abs(g * 0.055)) * 255);
  }
  const info = await sharp(px, { raw: { width: N, height: N, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, "grain.png"));
  console.log(`public/images/landing/grain.png  ${N}x${N}  ${(info.size / 1024).toFixed(0)} Ko`);
}
