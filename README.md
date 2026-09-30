# AK IMMO

Plateforme privée de gestion de patrimoine immobilier — **Terrains & Domaines** et **Projets**.

> Principe fondamental : *un utilisateur ne doit pouvoir accéder qu'aux ressources pour lesquelles
> il possède explicitement une autorisation.*

---

## Structure du dépôt

```
AK IMMO/
├── docs/               # Livrables d'architecture (à lire en premier)
├── backend/            # API NestJS + Prisma + PostgreSQL
├── frontend/           # SPA React + Vite + Tailwind
├── scripts/dev.mjs     # Orchestrateur de développement (npm run dev)
├── .devtools/          # Binaires locaux : stockage S3, capture SMTP (ignoré par Git)
├── docker-compose.yml  # Alternative Docker : Postgres, MinIO, Mailpit, backend, frontend
├── package.json        # Workspaces npm + scripts racine
└── .env.example        # Variables d'environnement racine (compose)
```

## Documents d'architecture

| # | Document | Contenu |
|---|----------|---------|
| 1 | [docs/01-architecture-technique.md](docs/01-architecture-technique.md) | Vue d'ensemble, flux, sécurité, stockage, environnements |
| 2 | [docs/02-schema-relationnel.md](docs/02-schema-relationnel.md) | Modèle relationnel, tables, index, contraintes |
| 3 | [backend/prisma/schema.prisma](backend/prisma/schema.prisma) | Schéma Prisma exécutable |
| 4 | [docs/03-matrice-roles-permissions.md](docs/03-matrice-roles-permissions.md) | Rôles, permissions fines, matrice |
| 5 | [docs/04-modules-nestjs.md](docs/04-modules-nestjs.md) | Découpage modulaire backend |
| 6 | [docs/05-architecture-react.md](docs/05-architecture-react.md) | Découpage frontend, routes, state |
| 7 | [docs/06-endpoints-rest.md](docs/06-endpoints-rest.md) | Contrat d'API REST complet |
| — | [docs/07-plan-de-developpement.md](docs/07-plan-de-developpement.md) | Phases, avancement, critères d'acceptation |

## Démarrage rapide (développement)

### Première installation

```bash
npm install                      # installe backend et frontend (workspaces)

cp backend/.env.example backend/.env    # renseigner DATABASE_URL et les secrets
cp frontend/.env.example frontend/.env

npm run migrate                  # crée le schéma PostgreSQL
npm run --workspace backend storage:setup   # crée le bucket S3
npm run seed                     # rôles, permissions, jeu de démonstration
```

PostgreSQL doit être installé et démarré. Les binaires du stockage S3 et de la
capture d'emails se placent dans [.devtools/](.devtools/README.md) — ou passez
par Docker : `docker compose up -d postgres minio mailpit`.

### Au quotidien

```bash
npm run dev
```

Une seule commande, un seul terminal : elle vérifie PostgreSQL, démarre le
stockage S3 et Mailpit s'ils ne tournent pas, puis lance l'API et le frontend
avec rechargement à chaud. `Ctrl+C` arrête tout proprement.

```bash
npm run dev:status               # état des cinq services
npm run dev:down                 # arrête le stockage S3 et Mailpit
npm run typecheck                # backend + frontend
npm run test:e2e      # Playwright : scénario critique dans Chromium, contre la pile `npm run dev`
npm test                         # tests unitaires backend
npm run build                    # build de production des deux
```

Le serveur Vite proxifie `/api` vers le backend : aucune configuration CORS
n'est nécessaire en développement, et le cookie de refresh reste sur la même
origine que l'application.

## Services de développement

| Service | URL | Notes |
|---------|-----|-------|
| API | http://localhost:3000/api | Swagger sur `/api/docs` |
| Frontend | http://localhost:5173 | Vite dev server *(à venir)* |
| PostgreSQL | localhost:5432 | base `ak_immo` |
| Stockage S3 | http://127.0.0.1:8333 | bucket `ak-immo`, privé |
| Mailpit | http://127.0.0.1:8025 | capture des emails sortants |

`GET /api/health` renvoie l'état des trois dépendances.

> **Note sur MinIO.** Le prompt maître prévoit MinIO (§2, §36). Ses binaires communautaires ayant
> été archivés en 2025, le développement local utilise SeaweedFS — même API S3, code applicatif
> identique. Voir [.devtools/README.md](.devtools/README.md).

## État d'avancement

| Phase | Périmètre | État |
|---|---|---|
| 0 | Architecture, schéma de données | ✅ |
| 1 | Auth, utilisateurs, rôles, permissions | ✅ validé |
| 2 | Villes, sites, terrains, coordonnées, carte | ✅ validé |
| 3 | Documents versionnés, KML/KMZ, stockage S3 | ✅ validé |
| 4 | Projets, composantes, permis, entreprises | ✅ validé |
| 5 | Partage sécurisé, invitation, révocation | ✅ validé |
| 6 | Dashboard, recherche globale, audit, notifications | ✅ validé |
| 7 | Frontend React, tests E2E, Docker, déploiement | 🔄 frontend livré, E2E automatisés restants |

Backend : **103 routes**, 23 contrôleurs, 47 tests unitaires.
Frontend : 20 pages, 19 routes, chargement différé par écran.

Détail et résultats de recette : [docs/07-plan-de-developpement.md](docs/07-plan-de-developpement.md).

## Règles de contribution

- **`npm install` se lance à la racine**, jamais dans `backend/` ou `frontend/` : le dépôt
  est en workspaces npm avec un verrou unique. Ajouter une dépendance :
  `npm install <paquet> --workspace frontend`.
- Aucun secret dans Git. Utiliser `.env` (ignoré) et `.env.example` (versionné).
- Le backend est l'autorité finale : toute règle métier et tout contrôle d'accès y sont implémentés.
- Soft delete (`deletedAt` / `deletedBy`) sur toutes les données patrimoniales.
- Pas de mock ni de fausse API dans le code livré.
