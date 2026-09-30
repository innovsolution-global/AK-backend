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
| **6** | Dashboard, recherche globale, filtres, audit, notifications | ✅ terminé et validé |
| **7** | Frontend React, tests E2E, Docker, documentation, déploiement | ✅ frontend livré · E2E Playwright du scénario critique (§33) automatisés · déploiement à planifier |

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

## 7.1 quater — Recette de la phase 6 (2026-09-20)

**Tableau de bord (§28)**

| Indicateur | Valeur observée |
|---|---|
| Terrains / superficie | 21 · 90 ha (900 000 m²) |
| Villes / sites | 6 / 11 |
| Projets | 5 |
| Documents / fichiers géo | 1 / 1 |
| Statuts de terrains listés | **8** — y compris ceux à zéro, pour stabiliser les graphiques |
| Répartition par ville | 6 villes, Conakry en tête avec 8 terrains |
| Répartition des permis | `APPROUVE = 1` |

**Recherche globale (§24)**

| Vérification | Résultat |
|---|---|
| « Lambanyi » | 4 résultats : 2 terrains, 1 projet, 1 site |
| Terme d'un seul caractère | 0 résultat — seuil à 2 caractères |
| Référence hors périmètre, par un admin | 1 résultat |
| Même référence, par le gestionnaire | **0 résultat** — le périmètre s'applique aussi à la recherche |

**Audit (§26)**

| Vérification | Résultat |
|---|---|
| Entrées enregistrées | 37 |
| Répartition sur 30 jours | `LOGIN` 22, `CREATE` 5, `UPLOAD` 3, `DOWNLOAD` 2 |
| Filtre `action=SHARE` | 1 entrée |
| Accès par un gestionnaire | `403 FORBIDDEN` — `audit.read` requise |

**Notifications (§27)**

| Déclencheur | Résultat |
|---|---|
| Document déposé par un tiers | `DOCUMENT_ADDED` reçue par le gestionnaire du bien |
| Changement de statut de projet | `PROJECT_STATUS_CHANGED` reçue par le responsable |
| Auteur de l'action | **non notifié** — pas d'auto-notification |
| Marquage comme lue | compteur de non-lues décrémenté |

`npx tsc --noEmit` sans erreur · `jest` **47/47** · **103 routes** exposées sur 23 contrôleurs.

## 7.1 quinquies — Recette du frontend (2026-09-20)

`tsc --noEmit` sans erreur · `vite build` réussi, découpage par route effectif
(`leaflet` 154 ko et `vendor` 182 ko isolés du bundle initial).

| Vérification | Résultat |
|---|---|
| Page servie sur `:5173` | `200`, titre « AK IMMO » |
| Proxy `/api` vers le backend | `health` = `ok`, trois dépendances `up` |
| Connexion via le proxy | session ouverte |
| Cookie de refresh | posé, `httpOnly = true`, `path = /api/auth` |
| Accès JavaScript au refresh token | **impossible** (httpOnly) |
| Rotation sur `/auth/refresh` | token remplacé à chaque appel |
| Rejeu d'un refresh token consommé | `401` — refusé |
| Session légitime après ce rejeu | `401` — **famille entière révoquée** |

Ce dernier point est la vérification de fond : rejouer un token volé ne donne
pas d'accès *et* coupe la session d'origine, signalant l'incident au lieu de le
laisser passer.

## 7.1 sexies — Tableau de bord graphique et animations (2026-09-20)

Palette validée par `scripts/validate_palette.js` de la méthode dataviz avant tout tracé.

| Bloc | Forme | Donnée |
|---|---|---|
| 4 tuiles KPI | compteur animé, sparkline 12 mois, delta | terrains, superficie (chiffre héros), projets, partages |
| Rythme d'acquisition | aire à une série, lavis 10 %, curseur + infobulle | `GET /dashboard/acquisitions` — 24 mois, mois vides inclus |
| Terrains par statut | barres horizontales, badge en libellé, clic → liste filtrée | `GET /dashboard/properties` |
| Terrains par ville | barres horizontales, superficie en secondaire | idem |
| Pipeline des projets | barres ordonnées par étape, **emphase** sur les chantiers | `GET /dashboard/projects` |
| Documents par type · Permis | barres compactes | `GET /dashboard/documents`, `/projects` |
| Carte du patrimoine | Leaflet intégrée, markers colorés par statut | `GET /maps/properties` |
| Activité récente · Échéances · Plus grands terrains | listes | `GET /dashboard/activity`, `/properties` |

Chaque graphique a un **jumeau tableau** (bouton « Tableau ») ; le rafraîchissement conserve le
rendu précédent atténué au lieu d'un squelette. Animations : cascade d'entrée, transition entre
pages, repère de menu glissant, compteurs — toutes neutralisées sous `prefers-reduced-motion`.

Chunks séparés : `charts` 364 ko (chargé sur le seul dashboard), `motion` 144 ko, page 23 ko.

## 7.1 septies — Chaîne Google Earth de bout en bout (2026-09-21)

Objectif rappelé par le maître d'ouvrage : **partager l'emprise d'un terrain de façon qu'un tiers
l'ouvre dans Google Earth**, à l'image d'un relevé de géomètre sur fond satellite. La recette
suit l'emprise du premier fichier jusqu'au lien reçu par le bénéficiaire.

| # | Étape | Résultat |
|---|---|---|
| 1 | `GET /maps/parcels` — emprises GeoJSON des terrains bornés | ✅ 15 polygones fermés ; aire mesurée à ±5 % du titre (ex. 40 771 vs 42 500 m²) |
| 2 | `GET /properties/:id/google-earth/export.kml` | ✅ `application/vnd.google-earth.kml+xml`, `attachment; filename="AK-IMM-000020.kml"`, polygone + repère + bornes |
| 3 | `POST /share` (Google Earth autorisé) | ✅ renvoie `earthLinkUrl` ; l'email Mailpit contient le lien en texte et en HTML |
| 4 | `GET` du lien public **sans session** (partage `PENDING`) | ✅ 200, document identique octet pour octet à l'export authentifié |
| 5 | Token altéré d'un caractère | ✅ 404, aucune requête en base |
| 6 | `GET /properties/:id/shares` | ✅ chaque partage porte `earthLinkUrl` |
| 7 | Révocation puis nouvel appel du lien | ✅ 204 puis **404 immédiat** |
| 8 | Journal d'audit | ✅ `DOWNLOAD` sur `Property`, `metadata.via = EARTH_LINK`, `shareId` |
| 9 | Import d'un KML « géomètre » (5 sommets, altitudes) | ✅ `SUCCESS`, 1 objet |
| 10 | `POST …/apply-coordinates` | ✅ 5 bornes ordonnées avec altitude + centre comme repère ; 11 220 m² mesurés ; nom du placemark repris |
| 11 | `GET /maps/parcels` après reprise | ✅ le terrain apparaît avec 5 sommets |
| 12 | Export KML après reprise | ✅ 2 polygones : emprise saisie **et** tracé importé d'origine |
| 13 | Tests unitaires | ✅ 65/65 (`EarthLinkService` : signature, altération, greffe d'identifiant, statut ; `geo.util` : centroïde, aire, anneau, GeoJSON) |

Côté interface : fond **satellite Esri** par défaut sur toutes les cartes (commutateur Plan /
Satellite mémorisé), emprise cyan avec halo sombre, bornes numérotées, superficie mesurée comparée
au titre dans la fiche ; onglet Google Earth refondu (importer → voir en superposition → appliquer
comme emprise) ; carte « Google Earth » avec téléchargement du KML, lien Google Earth Web cadré
sur le terrain, lien permanent à copier et mode d'emploi (Pro, Web, mobile) ; côté bénéficiaire,
la même emprise et le même fichier. Le seed dote 15 terrains sur 20 d'une emprise réaliste.

### Recette avec un relevé réel — `AK_TANENE_DUB.kmz` (Google Earth Pro 7.3.7)

Fichier fourni par le maître d'ouvrage : un polygone de 16 sommets à Tanéné (Dubréka), coordonnées
à 14 décimales. Importé sur le terrain **AK-IMM-000022 — Domaine AK Tanéné** (Dubréka / Tanéné,
créés pour l'occasion).

| Étape | Résultat |
|---|---|
| Extraction du KMZ | ✅ 17 tuples identiques à la source, 14 décimales conservées dans `extracted_geometry` |
| Reprise comme emprise | ✅ 16 bornes + centre ; 85 428 m² mesurés (8,54 ha) |
| Coordonnées stockées vs source | ⚠️ écart max **0,66 cm** avec `numeric(10,7)` → migration vers `numeric(12,9)` → ✅ **0,07 mm** |
| Export KML vs source | ✅ 17 tuples, écart max 0,07 mm ; tracé d'origine annexé (2 polygones) |
| Affichage | ✅ `formatCoordinate` restitue la valeur stockée sans arrondi (6 à 9 décimales) ; champs lat/lng du formulaire en `step="any"` |

### « On dépose le fichier et ça s'affiche » — recette des variantes (2026-09-21)

Question du maître d'ouvrage : *tous* les fichiers déposés s'afficheront-ils ? Réponse initiale :
non — l'import était un onglet après création et exigeait un clic « Appliquer », et plusieurs
formes réelles échouaient. Corrigé, puis vérifié par HTTP sur des terrains créés à la volée :

| Variante déposée | Résultat |
|---|---|
| KML polygone, type MIME **vide** (Windows sans Google Earth) | ✅ auto-appliqué, 5 bornes, visible sur `/maps/parcels` |
| KMZ, `application/x-zip-compressed` (Chrome Windows) | ✅ |
| KMZ « Ajouter un chemin » **non fermé** (`LineString`) | ✅ |
| KML `MultiGeometry` polygone + épingle | ✅ le polygone est gardé |
| KML UTF-8 avec BOM, espaces après virgules, sans altitude | ✅ |
| KML bornes en épingles seules (4 `Point`) | ✅ 4 bornes, centre comme repère |
| Second fichier sur un terrain déjà borné | ✅ conservé, emprise **non** écrasée (`autoApplied: false`) |
| Fichier sans géométrie / XML malformé | ✅ import conservé, statut `FAILED`, pas de 500 |
| `virus.kml.exe`, faux `.kmz` | ✅ 415 |

Tests unitaires du parseur : 10 cas (MultiGeometry, anneau nu, chemin ouvert, priorité polygone,
espaces, BOM/UTF-16, KML 2.1, PARTIAL/FAILED) — dont un a révélé une vraie faute : `parse()`
renvoyait la promesse sans `await`, un XML malformé échappait au `catch` (500 au lieu de FAILED).
Total : 75 tests.

Côté formulaire de création : une zone « Emprise Google Earth » reçoit le .kml/.kmz ; il est
importé juste après l'enregistrement et le terrain s'ouvre avec son contour dessiné. Sans emprise
saisie, la fiche superpose en pointillés le dernier fichier lisible non repris.

### Tests de bout en bout dans un vrai navigateur (Playwright, 2026-09-22)

`npm run test:e2e` (racine) lance Chromium contre la pile `npm run dev`. Rien n'est simulé.
`frontend/e2e/google-earth-share.spec.ts` rejoue l'objectif du projet avec le vrai
`AK_TANENE_DUB.kmz` (fixture) :

| Étape jouée dans le navigateur | Vérifié |
|---|---|
| Connexion, formulaire « Nouveau terrain », dépôt du KMZ dans la zone Google Earth, « Créer » | redirection sur la fiche |
| Toast « Emprise dessinée depuis AK_TANENE_DUB.kmz : 16 bornes » | ✅ sans autre clic |
| « Coordonnées (17) », « Emprise de 16 bornes · 8,54 ha mesurés », cellule `9.802506094` | ✅ valeurs du fichier, non arrondies |
| Polygone Leaflet (halo + trait) sur fond `basemap-satellite` | ✅ |
| Onglet Google Earth → « Télécharger AK-IMM-xxxxxx.kml » | ✅ fichier reçu, contient `<Polygon>` et le sommet `-13.486290863,9.802506094` |
| Onglet Partages → création → bouton « Lien Google Earth » | ✅ `earthLinkUrl` dans la réponse |
| `GET` du lien public **sans session** | ✅ 200, KML identique octet pour octet au téléchargement authentifié |
| Révocation dans l'interface | ✅ le lien répond 404 dans la seconde |
| Second import sur un terrain borné | ✅ conservé, superposé en pointillés, non appliqué ; « Appliquer » → 3 bornes |

Durée : ~20 s. Le terrain créé est supprimé en fin de suite.

`frontend/e2e/projects.spec.ts` : liste Projets → **« Nouveau projet »** → formulaire (ville, terrain
de cette ville, statut initial, dates) → « Créer le projet » → toast « Projet AK-PRJ-xxxxxx créé »,
fiche ouverte, projet présent dans la liste → « Modifier » → nom changé et enregistré.

`frontend/e2e/companies.spec.ts` : **« Nouvelle entreprise »** → fenêtre de saisie (email invalide
bloqué avant envoi) → ligne dans la liste → clic sur la ligne → contact modifié, téléphone **vidé et
réellement effacé** → suppression. Une entreprise portant des projets garde « Supprimer » désactivé
(le backend répond de toute façon 409).

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
| KML **généré** à la demande plutôt que servi depuis S3 | Un terrain saisi à la main, sans fichier importé, doit quand même s'ouvrir dans Google Earth. Le document est reconstruit depuis les coordonnées (emprise, repère avec fiche, bornes) et y annexe les géométries importées : gestionnaire et bénéficiaire reçoivent exactement le même fichier |
| Lien Google Earth public signé HMAC, lié au partage | Une URL S3 signée expire en 5 min — inutilisable depuis Google Earth ou un message. Le token `base64url(shareId ‖ HMAC)` ne stocke rien, se vérifie à temps constant et meurt avec le partage (révocation ⇒ 404 immédiat). Servi pour les statuts `PENDING` **et** `ACTIVE` : le lien est un secret remis par le gestionnaire, comme le lien d'invitation, et l'objectif premier est que le tiers voie l'emprise sans créer de compte ; l'espace web, lui, reste soumis à l'activation. Chaque téléchargement est audité |
| Convention d'emprise : repère hors du contour | Le point principal sert la carte générale (souvent le centre) ; les autres points, dans l'ordre de saisie, forment le polygone. Si seuls des sommets ont été saisis (l'un marqué principal), tous sont conservés. Règle unique, implémentée à l'identique côté serveur (`parcelRing`) et client |
| Reprise **automatique** de l'emprise à l'import | L'objectif est « on dépose le fichier et ça s'affiche ». Si le terrain n'a pas d'emprise (≤ 1 repère), le polygone du fichier devient ses coordonnées sans clic supplémentaire ; une emprise existante n'est jamais écrasée en silence — c'est le geste explicite « Appliquer » qui le fait. Une géométrie inexploitable (trop de sommets) n'annule pas l'import |
| Type MIME vide ou `x-zip-compressed` accepté | Le MIME vient du registre Windows du poste, pas du fichier ; sur un poste sans Google Earth un `.kmz` arrive vide ou en `x-zip-compressed`. La signature binaire (ZIP / première balise XML après BOM) fait autorité, le MIME n'est qu'un indice |
| « Appliquer comme emprise » remplace les coordonnées | Ressaisir 30 bornes d'un KML est la première cause d'erreur ; on adopte le premier polygone du fichier (sommets → bornes, centroïde → repère). Le fichier d'origine reste conservé et réexporté en surimpression |
| `PageTransition` fige l'élément de route via `useOutlet()` | **Correctif trouvé par les E2E.** Avec `<Outlet/>` en enfant et `mode="wait"`, l'écran *sortant* rendait déjà la nouvelle page pendant ses 220 ms de fondu, puis celle-ci se remontait à neuf : toute saisie faite dans l'intervalle était perdue et chaque page se chargeait deux fois. Un humain tape rarement en 220 ms ; un test, oui — et les requêtes doublées étaient bien réelles |
| Vite ignore `e2e/`, `test-results/`, `playwright-report/` | Playwright écrit traces et vidéos dans le dossier du frontend pendant les tests ; Vite rechargeait la page à chaque fichier et vidait les formulaires en cours de test |
| Session E2E : un contexte de navigateur **vivant** par worker | Un `storageState` rejoué à chaque test présente un refresh token déjà consommé : la détection de vol (§19) révoque alors toute la famille — le mécanisme fait son travail. La suite se connecte donc une seule fois et garde le contexte ouvert ; les appels API des tests passent par `context.request` (même cookie). Le limiteur de connexion (10 / 5 min / IP) reste tel quel |
| Limiteur « auth » opt-in, limite générale **par utilisateur** | **Correctif trouvé par les E2E.** Avec `@nestjs/throttler` v6, tout limiteur nommé s'applique à toutes les routes : « auth » (10 appels / 5 min) bridait chaque route, par IP — ouvrir onze fiches de terrain en cinq minutes depuis un même bureau renvoyait un 429. « auth » ne s'applique plus qu'aux routes qui le déclarent ; la limite générale (`THROTTLE_LIMIT`/`THROTTLE_TTL`, désormais réellement lus) compte par utilisateur vérifié, l'IP restant la clé sur les routes publiques. Le guard passe donc après `JwtAuthGuard`. Vérifié : 25 ouvertures consécutives de la même fiche → 25 × 200 (avant : 429 à la 11e) |
| Champs facultatifs d'entreprise : chaîne vide → `null` côté serveur | Sans cela, vider un champ en modification était impossible : un email vide échouait sur `@IsEmail`, et un RCCM vide aurait heurté le contrôle d'unicité entre deux entreprises sans numéro |
| Formulaire projet : statut initial limité aux quatre premières étapes | Les étapes suivantes (permis, travaux, fin) se franchissent par « Faire évoluer le statut », qui applique les transitions autorisées et trace l'historique ; un projet ne peut pas naître « terminé ». En édition, le statut n'est pas modifiable depuis le formulaire |
| Fond satellite par défaut | Une limite de parcelle se lit par rapport aux murs, pistes et arbres visibles — c'est la lecture Google Earth. Le plan OSM reste disponible ; le thème sombre n'assombrit pas l'imagerie |
| Refonte visuelle sur la référence « Sales Analytics » | Demande explicite. Système de jetons (doc 5 § 5.5 bis), thème clair/sombre à bascule, rayons généreux, halos sur les actions principales. La couleur de série passe au orange `#ea580c` — seule nuance à passer le validateur dataviz sur **les deux** surfaces ; les dégradés plus vifs restent cantonnés à l'interface. La jauge d'aménagement suit la règle du « meter » : piste dans la même gamme, atténuée |
| Verrou npm unique à la racine (workspaces) | Le passage aux workspaces a remonté React vers `node_modules/` racine ; le cache de pré-bundling de Vite pointait sur l'ancien chemin (`ENOENT react/index.js`). Purge du cache, suppression des verrous imbriqués, et Dockerfiles rebâtis avec la racine pour contexte. **Règle** : `npm install` se lance à la racine, jamais dans un sous-dossier |
| Graphiques à teinte unique, identité par libellé | Méthode dataviz : les statuts et villes sont des catégories *nominales* — les colorer par valeur double-encoderait la longueur de barre. La couleur de série `#0d9488` est la seule nuance de la marque à passer le validateur (luminosité, chroma, contraste ≥ 3:1) ; l'identité est portée par le badge ou le libellé |
| Barres horizontales en HTML, tendance en Recharts | Les libellés doivent être des composants (badges) : impossible en SVG sans `foreignObject`. Recharts reste pour la série temporelle, où axes, curseur et infobulle justifient la bibliothèque |
| Chronologie regroupée en mémoire | Le périmètre Prisma ne se traduit pas en SQL brut ; on remonte deux colonnes par terrain (date, superficie), léger jusqu'à quelques dizaines de milliers de lignes. Au-delà : `GROUP BY date_trunc` côté base |
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
