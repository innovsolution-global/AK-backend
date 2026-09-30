# ---------------------------------------------------------------------------
# AK IMMO — backend
# Contexte de build : la RACINE du dépôt (workspaces npm, verrou unique).
#   docker build -f backend/Dockerfile --target production .
# ---------------------------------------------------------------------------

FROM node:20-alpine AS base
WORKDIR /app
# Requis par la compilation native d'argon2 sur Alpine.
RUN apk add --no-cache python3 make g++ libc6-compat

# --- Dépendances ------------------------------------------------------------
FROM base AS dependencies
# Le verrou vit à la racine : on copie les manifestes des deux niveaux, puis on
# n'installe que le workspace backend.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY backend/prisma ./backend/prisma
RUN npm ci --workspace backend --include-workspace-root=false

# --- Développement ----------------------------------------------------------
FROM base AS development
ENV NODE_ENV=development
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/backend/node_modules ./backend/node_modules
COPY package.json ./
COPY backend ./backend
WORKDIR /app/backend
RUN npx prisma generate
EXPOSE 3000
CMD ["npm", "run", "dev"]

# --- Compilation ------------------------------------------------------------
FROM base AS build
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/backend/node_modules ./backend/node_modules
COPY package.json ./
COPY backend ./backend
WORKDIR /app/backend
RUN npx prisma generate && npm run build
WORKDIR /app
RUN npm prune --omit=dev --workspace backend --include-workspace-root=false

# --- Production -------------------------------------------------------------
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache libc6-compat dumb-init

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/backend/node_modules ./backend/node_modules
COPY --from=build --chown=node:node /app/backend/dist ./backend/dist
COPY --from=build --chown=node:node /app/backend/prisma ./backend/prisma
COPY --from=build --chown=node:node /app/backend/package.json ./backend/package.json
COPY --from=build --chown=node:node /app/package.json ./package.json

# N'exécute jamais l'application en root.
USER node
WORKDIR /app/backend
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main"]
