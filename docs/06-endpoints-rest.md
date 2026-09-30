# 6. Contrat d'API REST — AK IMMO

Base : `/api` · Authentification : `Authorization: Bearer <access_token>` ·
Documentation interactive : `/api/docs`.

## 6.1 Conventions

**Réponse de liste**

```json
{
  "success": true,
  "data": [],
  "meta": { "page": 1, "limit": 20, "total": 143, "totalPages": 8,
            "sort": "createdAt", "order": "desc" }
}
```

**Paramètres communs de liste (§24)** — `page` (déf. 1), `limit` (déf. 20, max 100),
`sort`, `order` (`asc` | `desc`), `search`, plus les filtres propres à la ressource.

Exemple : `GET /api/properties?page=1&limit=20&status=AMENAGE&search=Lambanyi`

**Codes** — `200` OK · `201` créé · `204` sans contenu · `400` validation · `401` non authentifié ·
`403` interdit · `404` introuvable ou hors périmètre · `409` conflit · `413` fichier trop volumineux ·
`415` type non supporté · `429` trop de requêtes · `500` erreur interne.

## 6.2 Authentification

| Méthode | Chemin | Accès | Description |
|---|---|---|---|
| POST | `/api/auth/login` | public | Connexion ; pose le cookie refresh |
| POST | `/api/auth/logout` | authentifié | Révoque la famille de refresh tokens |
| POST | `/api/auth/refresh` | cookie refresh | Rotation et nouvel access token |
| POST | `/api/auth/forgot-password` | public | Envoi du lien de réinitialisation (réponse toujours `204`) |
| POST | `/api/auth/reset-password` | public | Nouveau mot de passe via token |
| POST | `/api/auth/change-password` | authentifié | Changement avec mot de passe actuel |
| POST | `/api/auth/verify-email` | public | Vérification d'adresse |
| GET | `/api/auth/me` | authentifié | Profil, rôles, permissions effectives |

`POST /api/auth/login` → `{ "email": "...", "password": "..." }`
→ `{ "accessToken": "...", "expiresIn": 900, "user": { "id", "email", "firstName", "lastName",
"roles": [], "permissions": [], "mustChangePassword": false } }`

## 6.3 Référentiel géographique

| Méthode | Chemin | Permission |
|---|---|---|
| GET / POST | `/api/locations` | `location.read` / `location.manage` |
| GET / PATCH / DELETE | `/api/locations/:id` | `location.read` / `location.manage` |
| GET | `/api/locations/:id/sites` | `site.read` |
| GET / POST | `/api/sites` | `site.read` / `site.manage` |
| GET / PATCH / DELETE | `/api/sites/:id` | `site.read` / `site.manage` |

Filtres : `locations?type=VILLE&parentId=...` · `sites?locationId=...`

## 6.4 Terrains & domaines

| Méthode | Chemin | Permission |
|---|---|---|
| GET | `/api/properties` | `property.read` |
| POST | `/api/properties` | `property.create` |
| GET | `/api/properties/:id` | `property.read` |
| PATCH | `/api/properties/:id` | `property.update` |
| DELETE | `/api/properties/:id` | `property.delete` (soft delete) |
| GET / PUT | `/api/properties/:id/coordinates` | `property.read` / `property.update` |
| GET / POST | `/api/properties/:id/managers` | `property.read` / `user.manage` |
| DELETE | `/api/properties/:id/managers/:userId` | `user.manage` |
| GET | `/api/properties/:id/history` | `property.read` |

Filtres : `status`, `locationId`, `siteId`, `managerId`, `minArea`, `maxArea`,
`purchasedFrom`, `purchasedTo`, `hasCoordinates`, `hasDocuments`.

## 6.5 Documents des terrains

| Méthode | Chemin | Permission |
|---|---|---|
| GET | `/api/properties/:id/documents` | `document.read` |
| POST | `/api/properties/:id/documents` | `document.upload` (multipart) |
| GET | `/api/documents/:id` | `document.read` (métadonnées) |
| GET | `/api/documents/:id/download` | `document.read` (URL signée, TTL 5 min) |
| GET | `/api/documents/:id/versions` | `document.read` |
| POST | `/api/documents/:id/versions` | `document.upload` (nouvelle version) |
| DELETE | `/api/documents/:id` | `document.delete` |
| POST | `/api/documents/upload` | `document.upload` (upload générique) |

`storageKey` n'est **jamais** renvoyé.

## 6.6 Google Earth (§12)

| Méthode | Chemin | Permission |
|---|---|---|
| GET | `/api/properties/:id/google-earth` | `property.read` |
| POST | `/api/properties/:id/google-earth` | `document.upload` — `.kml` / `.kmz` |
| GET | `/api/properties/:id/google-earth/export.kml` | `property.read` — **KML généré** du terrain (emprise, repère, bornes, fiche) |
| GET | `/api/properties/:id/google-earth/:fileId/geometry` | `property.read` — GeoJSON extrait |
| POST | `/api/properties/:id/google-earth/:fileId/apply-coordinates` | `property.update` — reprend le polygone du fichier comme coordonnées |
| GET | `/api/properties/:id/google-earth/:fileId/download` | `document.read` (URL signée) |
| DELETE | `/api/properties/:id/google-earth/:fileId` | `document.delete` |
| GET | `/api/public/earth/:token.kml` | **public** — KML d'un bien partagé, lien signé lié au partage |

La réponse d'import expose `featureCount`, `bounds`, `extractionStatus` et le GeoJSON extrait
quand l'analyse a réussi, plus `autoApplied`, `appliedVertexCount` et `measuredAreaSqm` :
**déposer le fichier suffit à dessiner le terrain**. Si le domaine n'a pas encore d'emprise
(au plus un repère), le polygone extrait devient automatiquement ses coordonnées ; une emprise
déjà saisie n'est jamais écrasée sans passer par `apply-coordinates`.

Variantes de fichiers réels acceptées (recette du 2026-09-21) : KMZ dont le document ne s'appelle
pas `doc.kml` ou vit dans un dossier ; `MultiGeometry` polygone + épingle ; `LinearRing` nu ;
chemin `LineString` fermé **ou non** (« Ajouter un chemin » de Google Earth Pro) ; bornes en
épingles seules ; espaces après les virgules ; tuples sans altitude ; UTF-8 avec BOM ; UTF-16 ;
KML 2.1 et balises préfixées. Type MIME déclaré vide ou `application/x-zip-compressed` (Windows)
accepté — la signature binaire fait foi. Un XML malformé donne un statut `FAILED`, jamais un 500.

`export.kml` et le lien public renvoient le **même document** (`application/vnd.google-earth.kml+xml`,
`Content-Disposition: attachment`), construit à la demande depuis les coordonnées du terrain et les
géométries importées : l'emprise cyan (`#emprise`), le repère avec la fiche en bulle (`#repere`),
les bornes numérotées (`#borne`). Le fichier s'ouvre dans Google Earth Pro, l'application mobile
ou s'importe dans Google Earth Web.

`apply-coordinates` prend le premier polygone (ou une ligne fermée, ou à défaut les points isolés)
du fichier : ses sommets deviennent les bornes (`pointOrder` 1..n), son centroïde le point principal.
Limite : 500 sommets ; au-delà le fichier reste consultable sans être repris.

**Lien public** : le token vaut `base64url(shareId ‖ HMAC-SHA256(secret, shareId))` — rien n'est
stocké, il se vérifie à temps constant, et il n'est servi que si le partage est `PENDING` ou `ACTIVE`,
non expiré, avec `allowGoogleEarth`. Révocation ou expiration ⇒ 404 immédiat. Chaque téléchargement
met à jour `lastAccessedAt` et produit une entrée d'audit `DOWNLOAD` (`via: EARTH_LINK`).
Limité à 30 requêtes/minute par IP. Clé : `EARTH_LINK_SECRET`, sinon dérivée de `JWT_REFRESH_SECRET`.

## 6.7 Partage sécurisé (§20-21)

| Méthode | Chemin | Accès |
|---|---|---|
| POST | `/api/properties/:id/share` | `property.share` |
| GET | `/api/properties/:id/shares` | `property.share` |
| DELETE | `/api/properties/:id/shares/:shareId` | `property.share` (révocation) |
| POST | `/api/properties/:id/shares/:shareId/resend` | `property.share` |
| GET | `/api/shares` | `property.share` (tous les partages, filtrable par statut) |
| GET | `/api/shares/validate/:token` | public — vérifie une invitation |
| POST | `/api/shares/activate` | public — `{ token, password }` crée le compte |

Corps de `POST /api/properties/:id/share` :

```json
{
  "firstName": "…", "lastName": "…", "email": "…", "phone": "…",
  "message": "…", "expiresAt": "2026-12-31T23:59:59Z",
  "allowDocuments": true, "allowCoordinates": true, "allowGoogleEarth": true,
  "documentIds": ["uuid", "uuid"]
}
```

`status` n'est jamais accepté en entrée : il est dérivé par le backend.

Chaque partage renvoyé (création, listes) porte `earthLinkUrl` : le lien `.kml` public à transmettre
au bénéficiaire, `null` si Google Earth n'est pas autorisé ou si le partage est révoqué/expiré.
Ce lien figure aussi dans l'email d'invitation.

## 6.8 Accès du bénéficiaire (§22)

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/shared/properties` | rôle `UTILISATEUR_PARTAGE` — les biens partagés actifs |
| GET | `/api/shared/properties/:id` | idem — vue en liste blanche (inclut `earthLinkUrl`) |
| GET | `/api/shared/properties/:id/documents` | idem — liste blanche du partage |
| GET | `/api/shared/properties/:id/google-earth/:fileId/download` | idem — URL signée du fichier importé |
| GET | `/api/shared/documents/:id/download` | idem — URL signée |

Aucune autre route de l'API n'est accessible à ce rôle, hormis les routes publiques
(`/api/public/earth/:token.kml`, activation).

## 6.9 Projets

| Méthode | Chemin | Permission |
|---|---|---|
| GET / POST | `/api/projects` | `project.read` / `project.create` |
| GET / PATCH / DELETE | `/api/projects/:id` | `project.read` / `project.update` / `project.delete` |
| GET / POST | `/api/projects/:id/components` | `project.read` / `project.update` |
| PATCH / DELETE | `/api/projects/:id/components/:componentId` | `project.update` |
| GET / POST | `/api/projects/:id/documents` | `document.read` / `document.upload` |
| GET / POST | `/api/projects/:id/permits` | `project.read` / `project.update` |
| PATCH / DELETE | `/api/projects/:id/permits/:permitId` | `project.update` |
| GET | `/api/projects/:id/status-history` | `project.read` |
| POST | `/api/projects/:id/status` | `project.update` — `{ status, comment }` |

Filtres : `status`, `propertyId`, `companyId`, `locationId`, `siteId`, `managerId`.

## 6.10 Entreprises

| Méthode | Chemin | Permission |
|---|---|---|
| GET / POST | `/api/companies` | `company.read` / `company.manage` |
| GET / PATCH / DELETE | `/api/companies/:id` | `company.read` / `company.manage` |
| GET | `/api/companies/:id/projects` | `project.read` |

## 6.11 Utilisateurs, rôles, permissions

| Méthode | Chemin | Permission |
|---|---|---|
| GET / POST | `/api/users` | `user.manage` |
| GET / PATCH / DELETE | `/api/users/:id` | `user.manage` |
| POST | `/api/users/:id/roles` | `user.manage` |
| DELETE | `/api/users/:id/roles/:roleId` | `user.manage` |
| POST | `/api/users/:id/activate` \| `/deactivate` | `user.manage` |
| GET / POST | `/api/roles` | `role.manage` |
| GET / PATCH / DELETE | `/api/roles/:id` | `role.manage` |
| PUT | `/api/roles/:id/permissions` | `role.manage` |
| GET | `/api/permissions` | `role.manage` |

## 6.12 Carte, dashboard, recherche

| Méthode | Chemin | Permission |
|---|---|---|
| GET | `/api/maps/properties` | `map.read` — markers allégés (`id`, `reference`, `lat`, `lng`, `status`, `area`) |
| GET | `/api/maps/parcels` | `map.read` — emprises en GeoJSON (`FeatureCollection` de polygones, un par terrain ≥ 3 bornes, avec `measuredAreaSqm`) |
| GET | `/api/maps/bounds` | `map.read` — emprise globale du patrimoine |
| GET | `/api/dashboard/overview` | `dashboard.read` |
| GET | `/api/dashboard/properties` | `dashboard.read` — répartition par statut, ville, superficie |
| GET | `/api/dashboard/projects` | `dashboard.read` — répartition par statut, avancement |
| GET | `/api/dashboard/documents` | `dashboard.read` — volumétrie par type |
| GET | `/api/search?q=…` | authentifié — terrains, projets, sites, documents, entreprises |

`GET /api/dashboard/overview` retourne : nombre de terrains, superficie totale (normalisée en m² et
en hectares), nombre de villes et de sites, répartition par statut, nombre de projets et répartition
par statut, nombre de documents, partages actifs et partages expirant sous 7 jours.

## 6.13 Notifications et audit

| Méthode | Chemin | Permission |
|---|---|---|
| GET | `/api/notifications` | authentifié |
| GET | `/api/notifications/unread-count` | authentifié |
| PATCH | `/api/notifications/:id/read` | authentifié |
| POST | `/api/notifications/read-all` | authentifié |
| GET | `/api/audit-logs` | `audit.read` |
| GET | `/api/audit-logs/:id` | `audit.read` |

Filtres d'audit : `userId`, `action`, `entity`, `entityId`, `from`, `to`.

## 6.14 Santé

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/health` | public — état base et stockage objet |
