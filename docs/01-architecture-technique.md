# 1. Architecture technique — AK IMMO

## 1.1 Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              NAVIGATEUR                                   │
│   React 18 + TypeScript + Vite + Tailwind + TanStack Query + Leaflet      │
│   Access token en mémoire (jamais localStorage) · Refresh token cookie    │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │ HTTPS / JSON (Axios)
┌──────────────────────────────▼───────────────────────────────────────────┐
│                         API NestJS (REST /api)                            │
│                                                                           │
│  Middleware   : Helmet · CORS · compression · rate-limit · requestId       │
│  Guards       : JwtAuthGuard → RolesGuard → PermissionsGuard → ScopeGuard  │
│  Pipes        : ValidationPipe global (class-validator, whitelist)         │
│  Interceptors : ResponseEnvelope · AuditLog · Timeout · Logging            │
│  Filters      : AllExceptionsFilter (format d'erreur standardisé §39)      │
│                                                                           │
│  Couches : Controller → Service (règles métier) → Repository (Prisma)      │
└───────┬───────────────────────────┬───────────────────────┬───────────────┘
        │                           │                       │
┌───────▼─────────┐   ┌─────────────▼────────┐   ┌──────────▼─────────────┐
│  PostgreSQL 16  │   │  Stockage objet S3   │   │  SMTP / transactionnel │
│  (Prisma ORM)   │   │  MinIO (dev) / S3    │   │  Mailpit (dev)         │
│  + PostGIS opt. │   │  URLs signées TTL    │   │  templates MJML/HBS    │
└─────────────────┘   └──────────────────────┘   └────────────────────────┘
                               ▲
                    ┌──────────┴──────────┐
                    │  Tâches planifiées  │  expiration des partages,
                    │  (@nestjs/schedule) │  permis proches d'échéance,
                    └─────────────────────┘  purge des tokens
```

## 1.2 Stack retenue

| Couche | Technologie | Justification |
|--------|-------------|---------------|
| Runtime | Node.js 20 LTS+ | Support long terme |
| Backend | NestJS 10 + TypeScript strict | Modularité, DI, guards/interceptors natifs |
| ORM | Prisma 5 | Typage de bout en bout, migrations versionnées, anti-injection |
| Base | PostgreSQL 16 | Index GIN/BTree, JSONB, contraintes fortes |
| Géo | PostGIS *(optionnel, phase ultérieure)* | Requêtes spatiales (rayon, intersection de polygones) |
| Stockage | S3 compatible (MinIO en dev) | Fichiers hors base, URLs signées |
| Auth | JWT access + refresh rotatif, Argon2id | §8 du prompt maître |
| Frontend | React 18 + Vite + TypeScript | Build rapide, DX |
| UI | Tailwind CSS + Radix primitives | Interface premium, accessible |
| Data fetching | TanStack Query v5 | Cache, invalidations, états de chargement |
| Formulaires | React Hook Form + Zod | Validation partagée avec les DTO |
| Carte | Leaflet + react-leaflet | Markers, clustering, popups |
| Docs API | Swagger / OpenAPI sur `/api/docs` | §32 |
| Tests | Jest (unit/intégration), Supertest (e2e), Playwright (UI) | §33 |

**PostGIS** : la phase 2 stocke `latitude`/`longitude` en colonnes `Decimal` — suffisant pour markers,
bbox et distances approximatives. PostGIS est activé plus tard si des requêtes de polygones
(emprises issues des KML) deviennent nécessaires ; la migration est additive
(colonne `geom geometry(Point,4326)` alimentée depuis lat/lng).

## 1.3 Chaîne de contrôle d'accès

Toute requête authentifiée traverse cinq niveaux, du plus large au plus fin :

1. **JwtAuthGuard** — le token est valide, non expiré, l'utilisateur est actif et non supprimé.
2. **SharedUserRestrictionGuard** — un `UTILISATEUR_PARTAGE` n'atteint que `/shared`, `/auth` et
   `/health` ; toute autre route est refusée avant d'arriver au contrôleur.
3. **RolesGuard** — `@Roles('ADMIN')` : filtre grossier par rôle.
4. **PermissionsGuard** — `@RequirePermissions('property.update')` : permissions fines chargées
   depuis `user_roles → role_permissions → permissions`.
5. **Scope applicatif** — dans le service : un `GESTIONNAIRE` ne voit que les biens qui lui sont
   attribués (`property_managers`), un `UTILISATEUR_PARTAGE` ne voit que les biens présents dans
   `property_shares` avec un partage `ACTIVE` et non expiré.

Le niveau 5 n'est jamais optionnel : `ScopeService` fournit le filtre `propertyFilter(user)`
réutilisé par toutes les lectures, afin qu'aucun endpoint ne puisse retourner une ressource hors
périmètre. Le frontend ne fait *que* masquer l'UI ; il n'est jamais l'autorité.

**Pourquoi le niveau 2 existe.** Le scope restreint les *lignes*, pas les *champs*. Un bénéficiaire
porteur de `property.read` pouvait appeler `/api/properties/:id` : le filtre lui rendait bien son
seul bien, mais avec la projection complète — notes internes, sessionnaire, gestionnaires — alors
que le §22 limite sa vue à une liste blanche. Le confinement par route ferme cette voie en amont ;
les projections restreintes de `SharedAccessService` restent la seconde ligne de défense.

## 1.4 Authentification et sessions

- **Access token** JWT signé HS256, TTL court (15 min), porte `sub`, `email`, `roles`, `permissions`,
  `tokenVersion`. Conservé en mémoire côté client.
- **Refresh token** opaque (32 octets aléatoires), stocké **haché (SHA-256)** en base, TTL 7 jours,
  transmis en cookie `httpOnly` + `sameSite=strict` + `secure` en production.
- **Rotation** : chaque `/auth/refresh` révoque le token présenté et en émet un nouveau dans la même
  *famille*. La réutilisation d'un token déjà consommé révoque toute la famille (détection de vol).
- **Brute-force** : compteur `failedLoginAttempts` + `lockedUntil` par compte, plus un rate-limit IP
  sur les routes d'authentification.
- **Mots de passe** : Argon2id (`memoryCost` 19 MiB, `timeCost` 2, `parallelism` 1). Jamais en clair,
  jamais dans les logs, jamais renvoyés par l'API.

## 1.5 Stockage des fichiers

Aucun binaire en base. Le flux d'upload :

1. Le client envoie le fichier (`multipart/form-data`) au backend.
2. Le backend valide **extension + MIME déclaré + signature binaire (magic bytes) + taille**, et
   rejette tout exécutable.
3. Le fichier est écrit sous une clé opaque : `properties/{propertyId}/documents/{uuid}.{ext}`.
4. La base enregistre les métadonnées (`storageKey`, `mimeType`, `size`, `checksum`, `version`).
5. Le téléchargement passe par `GET /api/documents/:id/download` qui **vérifie les droits** puis
   renvoie une **URL signée à TTL court (5 min)**. La clé de stockage n'est jamais exposée.

## 1.6 Format de réponse

Succès :

```json
{ "success": true, "data": { }, "meta": { "page": 1, "limit": 20, "total": 143, "totalPages": 8 } }
```

Erreur (§39) :

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Une erreur est survenue",
  "error": "VALIDATION_ERROR",
  "details": [],
  "timestamp": "2026-09-19T10:12:33.412Z",
  "path": "/api/properties"
}
```

Codes `error` normalisés : `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
`CONFLICT`, `RATE_LIMITED`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `INTERNAL_ERROR`.

## 1.7 Observabilité et audit

- Logger structuré JSON (`pino`) avec `requestId` corrélé de bout en bout.
- `AuditInterceptor` : écrit dans `audit_logs` les actions listées au §26 avec `userId`, `action`,
  `entity`, `entityId`, `ip`, `userAgent`, `metadata`, `createdAt`.
- Les logs de sécurité (échec de connexion, verrouillage, révocation de partage, refus d'accès)
  sont émis au niveau `warn` et audités.

## 1.8 Environnements

| | development | staging | production |
|---|---|---|---|
| Base | Postgres Docker local | instance dédiée | instance managée + réplica |
| Stockage | MinIO | bucket S3 staging | bucket S3 privé + versioning |
| Email | Mailpit | service transactionnel (sandbox) | service transactionnel |
| Secrets | `.env` local | gestionnaire de secrets | gestionnaire de secrets |
| CORS | `http://localhost:5173` | domaine staging | domaine production |
| Logs | pretty | JSON | JSON + collecte externe |

Toute variable est déclarée dans `.env.example` et validée au démarrage par un schéma Zod
(`config/env.validation.ts`) : l'application refuse de démarrer si une variable requise manque.

## 1.9 Sauvegardes (§30)

- Soft delete (`deletedAt`, `deletedBy`) sur users, locations, sites, properties, documents,
  projects, companies. Les lectures filtrent `deletedAt: null` par défaut.
- `pg_dump` quotidien (rétention 30 j) et hebdomadaire (rétention 12 semaines).
- Versioning du bucket objet + réplication ; restauration testée trimestriellement.
- `project_status_history` et `audit_logs` sont **append-only** : jamais d'`UPDATE` ni de `DELETE`.
