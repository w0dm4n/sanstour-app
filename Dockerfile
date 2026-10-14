# syntax=docker/dockerfile:1
# Site vitrine Sanstour : Next.js en sortie « standalone ».
# Construire depuis ce dossier :  docker build -t sanstour-site site/
# Lancer :                        docker run --rm -p 127.0.0.1:3000:3000 -e SANSTOUR_API_URL=https://jouer.sanstour.com sanstour-site

# ---- dépendances (toutes : le build a besoin de TypeScript, Tailwind, ESLint) ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- build ----
FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Lues au build : SITE_URL (metadataBase des métadonnées prérendues), SANSTOUR_API_URL (données en cache
# remplies pendant le prérendu). Aucune n'est un secret.
ARG SITE_URL=https://sanstour.com
ARG SANSTOUR_API_URL=https://jouer.sanstour.com
ENV SITE_URL=${SITE_URL} SANSTOUR_API_URL=${SANSTOUR_API_URL}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- image finale : server.js + node_modules tracés, fichiers statiques, public ----
FROM node:24-alpine AS runner
WORKDIR /app
ARG SITE_URL=https://sanstour.com
ARG SANSTOUR_API_URL=https://jouer.sanstour.com
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    SITE_URL=${SITE_URL} \
    SANSTOUR_API_URL=${SANSTOUR_API_URL}
# utilisateur non root fourni par l'image node (uid 1000)
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
