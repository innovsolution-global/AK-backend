# 3. Matrice rôles / permissions — AK IMMO

## 3.1 Rôles système

| Code | Libellé | Portée |
|---|---|---|
| `ADMIN` | Administrateur | Accès complet à toute la plateforme, y compris utilisateurs et audit |
| `GESTIONNAIRE` | Gestionnaire | Biens et projets **qui lui sont attribués** (`property_managers`, `projects.manager_id`) |
| `CONSULTANT` | Consultant | Consultation seule, selon les permissions accordées |
| `UTILISATEUR_PARTAGE` | Utilisateur partagé | **Uniquement** les biens explicitement partagés et actifs |

Les rôles système (`is_system = true`) ne peuvent être ni renommés ni supprimés ; seules leurs
permissions sont ajustables par un `ADMIN`.

## 3.2 Catalogue de permissions

Forme `resource.action`. Une permission absente = accès refusé (principe du moindre privilège).

| Code | Description |
|---|---|
| `property.read` | Consulter les terrains de son périmètre |
| `property.create` | Créer un terrain |
| `property.update` | Modifier un terrain |
| `property.delete` | Supprimer (soft delete) un terrain |
| `property.share` | Partager un terrain avec un bénéficiaire externe |
| `project.read` | Consulter les projets de son périmètre |
| `project.create` | Créer un projet |
| `project.update` | Modifier un projet, faire évoluer son statut |
| `project.delete` | Supprimer (soft delete) un projet |
| `document.read` | Consulter et télécharger les documents autorisés |
| `document.upload` | Téléverser un document |
| `document.delete` | Supprimer (soft delete) un document |
| `location.read` / `location.manage` | Consulter / gérer préfectures, villes, communes |
| `site.read` / `site.manage` | Consulter / gérer les sites et quartiers |
| `company.read` / `company.manage` | Consulter / gérer les entreprises et gérants |
| `user.manage` | Créer, modifier, désactiver des utilisateurs et leurs rôles |
| `role.manage` | Gérer les rôles et leurs permissions |
| `audit.read` | Consulter le journal d'audit |
| `dashboard.read` | Accéder aux tableaux de bord |
| `map.read` | Accéder à la carte du patrimoine |

## 3.3 Matrice

| Permission | ADMIN | GESTIONNAIRE | CONSULTANT | UTILISATEUR_PARTAGE |
|---|:--:|:--:|:--:|:--:|
| `property.read` | ✅ | 🔸 attribués | ✅ lecture | 🔒 partagés uniquement |
| `property.create` | ✅ | ✅ | ❌ | ❌ |
| `property.update` | ✅ | 🔸 attribués | ❌ | ❌ |
| `property.delete` | ✅ | ❌ | ❌ | ❌ |
| `property.share` | ✅ | ❌ | ❌ | ❌ |
| `project.read` | ✅ | 🔸 attribués | ✅ lecture | ❌ |
| `project.create` | ✅ | ✅ | ❌ | ❌ |
| `project.update` | ✅ | 🔸 attribués | ❌ | ❌ |
| `project.delete` | ✅ | ❌ | ❌ | ❌ |
| `document.read` | ✅ | 🔸 attribués | ✅ lecture | 🔒 liste blanche du partage |
| `document.upload` | ✅ | 🔸 attribués | ❌ | ❌ |
| `document.delete` | ✅ | ❌ | ❌ | ❌ |
| `location.read` | ✅ | ✅ | ✅ | ❌ |
| `location.manage` | ✅ | ❌ | ❌ | ❌ |
| `site.read` | ✅ | ✅ | ✅ | ❌ |
| `site.manage` | ✅ | ✅ | ❌ | ❌ |
| `company.read` | ✅ | ✅ | ✅ | ❌ |
| `company.manage` | ✅ | ✅ | ❌ | ❌ |
| `user.manage` | ✅ | ❌ | ❌ | ❌ |
| `role.manage` | ✅ | ❌ | ❌ | ❌ |
| `audit.read` | ✅ | ❌ | ❌ | ❌ |
| `dashboard.read` | ✅ | 🔸 périmètre | ✅ | ❌ |
| `map.read` | ✅ | 🔸 périmètre | ✅ | 🔒 le bien partagé seul |

Légende — ✅ accordé · ❌ refusé · 🔸 accordé mais **restreint au périmètre** par le scope
applicatif · 🔒 accordé mais **restreint à la ressource partagée**.

## 3.4 Les deux niveaux : permission ≠ périmètre

Une permission répond à « *cette action est-elle autorisée ?* ».
Le périmètre répond à « *sur quelles lignes ?* ». Les deux sont contrôlés côté backend.

```ts
// PermissionsGuard — niveau 1
@RequirePermissions('property.update')

// Scope applicatif — niveau 2, dans le service, jamais optionnel
const where = this.scope.propertyFilter(user);
// ADMIN / CONSULTANT      → { deletedAt: null }
// GESTIONNAIRE            → { deletedAt: null, managers: { some: { userId } } }
// UTILISATEUR_PARTAGE     → { deletedAt: null, shares: { some: {
//                              userId, status: 'ACTIVE', expiresAt: { gt: now } } } }
```

Conséquence : même avec `property.update`, un `GESTIONNAIRE` reçoit un `404 NOT_FOUND` (et non un
`403`) sur un bien hors périmètre — on ne révèle pas l'existence d'une ressource inaccessible.

## 3.5 Portée de l'utilisateur partagé (§22)

Ce rôle est **confiné par route** : `SharedUserRestrictionGuard` n'autorise que `/api/shared/*`,
`/api/auth/*` et `/api/health`. Ses deux permissions (`property.read`, `document.read`) ne lui
ouvrent donc rien en dehors de son espace — sans ce confinement, elles lui donnaient accès à
`/api/properties/:id` et à la fiche complète de son bien, notes internes comprises.

Le bénéficiaire accède à `/shared/properties/:id` et **ne voit que** :

| Visible | Jamais visible |
|---|---|
| référence, nom, localisation (ville / site) | les autres terrains |
| superficie et unité | le patrimoine global, le dashboard |
| coordonnées *(si `allow_coordinates`)* | les projets |
| carte centrée sur le bien *(si `allow_coordinates`)* | notes internes, sessionnaire / vendeur |
| Google Maps / Google Earth *(si `allow_google_earth`)* | gestionnaire, créateur, historique |
| documents de la liste blanche *(si `allow_documents`)* | les autres documents du bien |
| | les utilisateurs, l'audit, les entreprises |

Le DTO de sortie du partage est **construit en liste blanche** (`SharedPropertyView`), pas par
suppression de champs sur l'entité : un champ ajouté plus tard au modèle n'apparaît pas par accident.

## 3.6 Attribution à la création d'un compte

| Contexte | Rôle attribué |
|---|---|
| Seed initial | `ADMIN` |
| Création par un admin | rôle choisi parmi `GESTIONNAIRE`, `CONSULTANT`, `ADMIN` |
| Activation d'un partage | `UTILISATEUR_PARTAGE` uniquement, sans possibilité de cumul |

Un compte `UTILISATEUR_PARTAGE` ne peut jamais recevoir un autre rôle : la promotion passe par la
création d'un compte distinct par un `ADMIN`.
