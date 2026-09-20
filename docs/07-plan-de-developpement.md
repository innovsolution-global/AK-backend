# 7. Plan de développement et avancement — AK IMMO

Règle de travail (§43) : **un module à la fois**. On ne passe au suivant que lorsque le précédent
est cohérent, fonctionnel et testé. Aucun mock dans le code livré.

## 7.1 État d'avancement

| Phase | Périmètre | État |
|---|---|---|
| **0** | Livrables d'architecture (docs 1→7), schéma Prisma | ✅ terminé |
| **1** | Socle NestJS, PostgreSQL, auth, utilisateurs, rôles, permissions | ✅ terminé et validé |
| **2** | Locations, sites, terrains, coordonnées, carte | ✅ terminé et validé |
| **3** | Documents, KML/KMZ, Google Earth, stockage objet sécurisé | ✅ terminé et validé |
| **4** | Projets, composantes, documents, permis, historique, entreprises | ✅ terminé et validé |
| **5** | Partage sécurisé, invitation, email, accès temporaire, révocation | ✅ terminé et validé |
| **6** | Dashboard, recherche globale, filtres, audit, notifications | ⏳ |
| **7** | Frontend React, tests E2E, Docker, documentation, déploiement | ⏳ |

## 7.1 bis — Recette exécutée (2026-09-20)

Environnement : PostgreSQL 18 local, base `ak_immo`, rôle dédié `ak_immo`.
`npx tsc --noEmit` sans erreur · `jest` 24/24 · migration `init` appliquée · seed complet.

| Vérification | Résultat |
|---|---|
| `GET /api/health` | `ok`, base `up` |
| Connexion administrateur | 23 permissions résolues |
| Liste des terrains (ADMIN) | 20 terrains, pagination 1/4 |
| Liste des terrains (GESTIONNAIRE) | **10 terrains** — périmètre appliqué |
| Terrain hors périmètre | `404 NOT_FOUND` (et non 403) |
| `GET /api/users` par un gestionnaire | `403 FORBIDDEN` — `user.manage` requise |
| Requête sans token | `401 UNAUTHORIZED` |
| Mot de passe erroné | `401` — « Identifiants invalides » |
| Ville → site → terrain → coordonnées | `AK-IMM-000021` créé, 2 points |
| Conversion de superficie | 2,5 HECTARE → 25 000 m² |
| Site incohérent avec la ville | `400 VALIDATION_ERROR` |
| Marker présent sur la carte | `9.701, -13.601` |
| Journal d'audit du terrain | 1 entrée `CREATE` |
| Suppression d'une ville non vide | `409 CONFLICT` |

## 7.1 ter — Recette des phases 3 et 5 (2026-09-20)

Environnement complété : SeaweedFS (stockage S3, port 8333) et Mailpit (SMTP, port 1025), tous deux
en écoute sur 127.0.0.1 uniquement. `GET /api/health` renvoie `ok` avec les trois dépendances `up`.

**Documents et fichiers (§13, §25, §29)**

| Vérification | Résultat |
|---|---|
| Téléversement d'un PDF | v1 créée, 80 octets |
| `storageKey` dans la réponse | **absent** |
| URL signée | TTL 300 s, téléchargement direct `200` |
| Nouvelle version | v2 courante, **2 versions conservées** |
| `malware.pdf.exe` | `415` — exécutables refusés |
| Fichier texte déclaré `application/pdf` | `415` — signature binaire non reconnue |

**Google Earth (§12)**

| Vérification | Résultat |
|---|---|
| Import `.kml` | `SUCCESS`, 2 features |
| Géométries extraites | `Point`, `Polygon` |
| Bounding box | lat 9.700→9.703, lng −13.602→−13.599 |
| Téléchargement par URL signée | `200` |

**Partage sécurisé — scénario critique complet (§33)**

| Étape | Résultat |
|---|---|
| Création du partage | `PENDING`, email délivré |
| Token dans la réponse API | **absent** (seul l'email le porte) |
| Réception de l'email | capté par Mailpit, token de 43 caractères |
| Validation publique du lien | valide, référence du bien confirmée |
| Activation | compte créé, mot de passe choisi par le bénéficiaire |
| Connexion | rôle `UTILISATEUR_PARTAGE`, 2 permissions |
| Biens visibles | **1 sur 21** |
| Champs internes dans la vue partagée | **aucun** |
| Document de la liste blanche | téléchargé, `200` |
| Autre bien via `/shared` | `404` |
| 10 routes internes testées | `403` sur les 10 |
| Révocation | session en cours coupée → `401` immédiat |
| Reconnexion après révocation | `401` — compte désactivé |
| Journal d'audit | `CREATE`, `VIEW`×2 tracés |

**Projets (§15, §17, §18)**

| Vérification | Résultat |
|---|---|
| Saut `IDEE → TERMINE` | `400` — transitions possibles listées dans la réponse |
| Transition `IDEE → ETUDE_PRELIMINAIRE` | acceptée |
| Historique après transition | **2 entrées** — la ligne initiale est conservée |
| Statut terminal (`TERMINE`) | toute sortie refusée |
| Ajout d'une composante | `Bloc sanitaire` / `SANTE` / 420 m² |
| Permis approuvé | `PC-2026-0042` enregistré |
| Permis expirant avant son émission | `400` — dates incohérentes |
| Fiche projet | 3 composantes, 1 permis |

`npx tsc --noEmit` sans erreur · `jest` **47/47**.

## 7.2 Détail des phases

### Phase 1 — Socle et contrôle d'accès
1. Projet NestJS, TypeScript strict, ESLint/Prettier, configuration validée au démarrage.
2. `PrismaModule`, migration initiale, seed des rôles et permissions.
3. `auth` : login, refresh rotatif, logout, mot de passe oublié/réinitialisé/changé, `/auth/me`.
4. `users`, `roles`, `permissions` : CRUD + affectation.
5. Guards `JwtAuthGuard` → `RolesGuard` → `PermissionsGuard`, `ScopeService`.
6. Filtre d'exception, interceptor d'enveloppe, interceptor d'audit, Swagger.
7. **Critère de sortie** : un admin seedé se connecte, obtient ses permissions, crée un
   gestionnaire ; un gestionnaire se voit refuser `user.manage` ; les tests d'intégration auth
   passent.

### Phase 2 — Patrimoine et carte
`locations` → `sites` → `properties` → `property_coordinates` → `maps`.
Génération de la référence `AK-IMM-000001` par séquence, périmètre gestionnaire, pagination,
filtres, recherche.
**Critère de sortie (§44)** : ville → site → terrain → superficie → coordonnées → sessionnaire →
gestionnaire, visible et filtrable sur la carte.

### Phase 3 — Documents et Google Earth
`storage` (MinIO/S3, URLs signées), `uploads` (extension + MIME + magic bytes + taille),
`property-documents` (versioning), import `.kml`/`.kmz` avec extraction bbox/GeoJSON.
**Critère de sortie** : upload, nouvelle version, téléchargement par URL signée, aucun chemin
physique exposé, KML importé et affiché sur la carte.

### Phase 4 — Projets
`companies` → `projects` → `project-components` → `project-documents` → `building-permits` →
`project-status` (historique append-only, écrit dans la même transaction que le changement de statut).
**Critère de sortie (§44)** : projet créé, domaine associé, composantes, études, permis, entreprise,
statut évolué, historique intégralement conservé.

### Phase 5 — Partage sécurisé
`property-shares` (token 32 octets, hash SHA-256, expiration), `mail` (templates responsives),
activation avec définition du mot de passe, `shared-access` en liste blanche, révocation,
tâche planifiée d'expiration.
**Critère de sortie (§44)** : invitation → email → activation → accès limité au seul bien →
Google Earth → expiration ou révocation effective immédiate.

### Phase 6 — Pilotage
`dashboard`, `search` global, `audit` consultable, `notifications` in-app + email.
**Critère de sortie** : indicateurs du §28 exacts et cohérents avec le périmètre de l'utilisateur.

### Phase 7 — Industrialisation
Tests unitaires, d'intégration et E2E (scénario critique §33), revue de sécurité,
Docker Compose complet, Swagger finalisé, procédures de sauvegarde et de déploiement.

## 7.3 Scénario E2E critique (§33)

```
1.  Connexion administrateur
2.  Création ville → site
3.  Création terrain (superficie, sessionnaire, gestionnaire)
4.  Ajout des coordonnées → vérification sur la carte
5.  Upload d'un titre foncier → nouvelle version → téléchargement par URL signée
6.  Import d'un fichier .kmz → extraction → affichage
7.  Partage du bien (bénéficiaire + expiration + liste blanche de documents)
8.  Réception de l'email d'invitation (Mailpit)
9.  Activation : le bénéficiaire définit son mot de passe
10. Connexion bénéficiaire → voit UNIQUEMENT le bien partagé
11. Tentative d'accès à un autre terrain → 404
12. Révocation par l'administrateur → session invalidée, accès refusé
13. Vérification du journal d'audit : SHARE, LOGIN, DOWNLOAD, REVOKE_SHARE présents
```

## 7.4 Journal des décisions

| Décision | Motif |
|---|---|
| `SharedUserRestrictionGuard` ajouté à la chaîne d'accès | **Correctif de sécurité.** La recette a montré qu'un bénéficiaire porteur de `property.read` atteignait `/api/properties/:id` : le scope lui rendait son seul bien, mais avec la projection complète (notes, sessionnaire, gestionnaires). Le scope filtre les lignes, pas les champs — le confinement par route ferme la voie en amont |
| SeaweedFS au lieu de MinIO en développement | MinIO a archivé ses projets communautaires en 2025 : binaires retirés, plus de correctifs de sécurité. Même API S3, code applicatif inchangé |
| `incremental: false` dans `tsconfig.build.json` | `nest build` vide `dist` avant de compiler ; en mode incrémental TypeScript se fie à son `.tsbuildinfo`, juge la sortie à jour et n'émet rien — le build « réussit » en laissant un dist vide |
| `@Param('id', UuidParam)` sur les routes à deux paramètres | Un `@Param()` sans clé lie tous les paramètres au DTO, et `forbidNonWhitelisted` rejette alors `fileId`, `shareId`, `permitId`… |
| Référence par séquence PostgreSQL | Unicité garantie sous concurrence, contrairement à `MAX()+1` |
| Table `property_geo_files` distincte de `property_documents` | Champs propres (bbox, géométrie, statut d'extraction) ; un KML n'est pas un document juridique versionné |
| Refresh token opaque haché plutôt que JWT | Révocation immédiate possible, aucun secret exploitable en cas de fuite de la base |
| `404` au lieu de `403` hors périmètre | Ne pas révéler l'existence d'une ressource inaccessible |
| Vue bénéficiaire construite en liste blanche | Un champ ajouté au modèle ne peut pas fuiter par accident |
| PostGIS différé | `Decimal` lat/lng suffit aux markers et à la bbox ; migration additive le jour venu |
| Pas de module financier | §41 — hors périmètre sans demande explicite |
