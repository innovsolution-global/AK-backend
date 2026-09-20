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
├── docker-compose.yml  # Postgres, MinIO, Mailpit, backend, frontend
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

### Avec Docker

```bash
cp .env.example .env
docker compose up -d postgres minio mailpit
```

### Sans Docker (Windows)

Les services d'infrastructure tournent en binaires natifs dans [.devtools/](.devtools/) :

```powershell
.\.devtools\start-storage.ps1    # stockage objet S3 (SeaweedFS)
.\.devtools\start-mail.ps1       # capture des emails (Mailpit)
```

PostgreSQL doit être installé et démarré séparément.

### Backend

```bash
cd backend
cp .env.example .env             # puis renseigner DATABASE_URL et les secrets
npm install
npx prisma migrate dev
npm run storage:setup            # crée le bucket S3
npm run seed
npm run start:dev                # http://localhost:3000/api — docs : /api/docs
```

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
| 6 | Dashboard, recherche globale, audit, notifications | ⏳ |
| 7 | Frontend React, tests E2E, Docker, déploiement | ⏳ |

Détail et résultats de recette : [docs/07-plan-de-developpement.md](docs/07-plan-de-developpement.md).

## Règles de contribution

- Aucun secret dans Git. Utiliser `.env` (ignoré) et `.env.example` (versionné).
- Le backend est l'autorité finale : toute règle métier et tout contrôle d'accès y sont implémentés.
- Soft delete (`deletedAt` / `deletedBy`) sur toutes les données patrimoniales.
- Pas de mock ni de fausse API dans le code livré.
