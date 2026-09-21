# ---------------------------------------------------------------------------
# AK IMMO — frontend
# Contexte de build : la RACINE du dépôt (workspaces npm, verrou unique).
#   docker build -f frontend/Dockerfile --target production .
# ---------------------------------------------------------------------------

FROM node:20-alpine AS base
WORKDIR /app

FROM base AS dependencies
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
RUN npm ci --workspace frontend --include-workspace-root=false

FROM base AS development
ENV NODE_ENV=development
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/frontend/node_modules ./frontend/node_modules
COPY package.json ./
COPY frontend ./frontend
WORKDIR /app/frontend
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM base AS build
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/frontend/node_modules ./frontend/node_modules
COPY package.json ./
COPY frontend ./frontend
WORKDIR /app/frontend
# L'URL de l'API est figée au build : Vite remplace import.meta.env à la
# compilation, elle n'est pas lisible à l'exécution.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine AS production
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
