import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Image Docker autonome : .next/standalone (server.js + node_modules tracés), voir Dockerfile.
  output: "standalone",
  // Racine fixée sur ce dossier : un package-lock.json dans un dossier parent ferait prendre à Next une
  // mauvaise racine (traçage et standalone imbriqué).
  outputFileTracingRoot: __dirname,
  // Le traçage ne prend que le .node de sharp, pas libvips (DLL Windows, .so Linux) : sans eux, sharp ne se
  // charge pas dans .next/standalone et next/image renvoie les images d'origine (3200 px) sans les réduire.
  outputFileTracingIncludes: {
    "/*": ["node_modules/@img/**/*"],
  },
  poweredByHeader: false,
  // Pas de pastille de dev par-dessus la page : les captures de preuve se comparent à la maquette.
  devIndicators: false,
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
    // Qualités permises (obligatoire depuis Next 16) : 60 pour les grands décors, 75 par défaut.
    qualities: [60, 75],
  },
  // Défauts de create-next-app 16.4 : Cache Components (« use cache » / cacheLife) et Partial Prefetching.
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    root: __dirname,
    // Tailwind CSS v4 par son loader Turbopack (pas de postcss.config).
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
