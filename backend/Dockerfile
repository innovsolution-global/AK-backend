# ---------------------------------------------------------------------------
# AK IMMO — backend
# Image multi-étapes : `development` pour le hot reload, `production` pour un
# runtime minimal exécuté sans privilèges.
# ---------------------------------------------------------------------------

FROM node:20-alpine AS base
WORKDIR /app
# Requis par la compilation native d'argon2 sur Alpine.
RUN apk add --no-cache python3 make g++ libc6-compat

# --- Dépendances ------------------------------------------------------------
FROM base AS dependencies
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# --- Développement ----------------------------------------------------------
FROM base AS development
ENV NODE_ENV=development
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

# --- Compilation ------------------------------------------------------------
FROM base AS build
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build && npm prune --omit=dev

# --- Production -------------------------------------------------------------
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache libc6-compat dumb-init

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package.json ./package.json

# N'exécute jamais l'application en root.
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main"]
