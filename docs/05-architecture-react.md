# 5. Architecture frontend React — AK IMMO

## 5.1 Arborescence

```
frontend/src/
├── main.tsx
├── app/
│   ├── App.tsx                 # providers : Query, Auth, Router, Toast
│   ├── providers/
│   └── query-client.ts
│
├── api/
│   ├── http.ts                 # instance Axios, intercepteurs, refresh auto
│   ├── endpoints.ts            # chemins centralisés
│   └── types.ts                # ApiResponse<T>, Paginated<T>, ApiError
│
├── features/                   # une tranche verticale par domaine métier
│   ├── auth/       { api, hooks, components, schemas }
│   ├── properties/
│   ├── projects/
│   ├── documents/
│   ├── shares/
│   ├── locations/
│   ├── sites/
│   ├── companies/
│   ├── users/
│   ├── dashboard/
│   ├── map/
│   └── audit/
│
├── components/
│   ├── ui/                     # Button, Input, Select, Modal, Badge, Table…
│   ├── data/                   # DataTable, Pagination, EmptyState, Skeleton
│   ├── feedback/               # Toast, ConfirmDialog, ErrorBoundary
│   ├── files/                  # Dropzone, FilePreview (PDF/image), FileList
│   └── map/                    # MapContainer, PropertyMarker, MapPopup
│
├── layouts/
│   ├── AppLayout.tsx           # sidebar + topbar + recherche globale
│   ├── AuthLayout.tsx
│   └── SharedLayout.tsx        # layout épuré du bénéficiaire
│
├── pages/                      # une page par route (§35)
├── routes/
│   ├── index.tsx               # définition des routes
│   ├── ProtectedRoute.tsx      # exige une session
│   └── PermissionRoute.tsx     # exige une permission
│
├── hooks/                      # useAuth, usePermissions, useDebounce, useQueryParams
├── services/                   # storage token, formatage, export
├── types/                      # types du domaine, alignés sur les DTO backend
├── utils/                      # dates, nombres, superficies, classNames
└── styles/                     # tailwind.css, tokens de design
```

## 5.2 Organisation par *feature*

Chaque dossier de `features/` est autonome :

```
features/properties/
├── api/properties.api.ts       # appels HTTP typés
├── hooks/
│   ├── useProperties.ts        # useQuery liste + filtres
│   ├── useProperty.ts          # useQuery détail
│   └── usePropertyMutations.ts # create / update / delete + invalidations
├── components/
│   ├── PropertyTable.tsx
│   ├── PropertyForm.tsx
│   ├── PropertyStatusBadge.tsx
│   ├── PropertyFilters.tsx
│   └── PropertyMapPanel.tsx
└── schemas/property.schema.ts  # Zod, partagé formulaire + typage
```

Les pages de `pages/` ne font qu'assembler des composants de *features* : aucune logique métier ni
appel HTTP direct.

## 5.3 Routes (§35)

| Route | Accès | Page |
|---|---|---|
| `/login` | public | connexion |
| `/forgot-password`, `/reset-password` | public | mot de passe |
| `/activate-share` | public | activation d'un partage (définition du mot de passe) |
| `/dashboard` | `dashboard.read` | tableau de bord |
| `/properties` | `property.read` | liste des terrains |
| `/properties/create` | `property.create` | création |
| `/properties/:id` | `property.read` | fiche : infos, coordonnées, documents, KML, partages |
| `/properties/:id/edit` | `property.update` | édition |
| `/sites`, `/locations` | `site.read` / `location.read` | référentiels géographiques |
| `/map` | `map.read` | carte du patrimoine |
| `/projects`, `/projects/:id`, `/projects/create`, `/projects/:id/edit` | `project.*` | projets |
| `/documents` | `document.read` | bibliothèque documentaire |
| `/shares` | `property.share` | partages actifs, expirés, révoqués |
| `/users` | `user.manage` | utilisateurs et rôles |
| `/companies` | `company.read` | entreprises / gérants |
| `/audit-logs` | `audit.read` | journal d'audit |
| `/settings` | authentifié | profil, mot de passe, préférences |
| `/shared/properties/:id` | session partagée | **vue bénéficiaire isolée** (`SharedLayout`) |

`PermissionRoute` masque l'accès côté UI ; le backend refait le contrôle à chaque appel.

## 5.4 Gestion de la session

- L'**access token** vit en mémoire dans `AuthProvider` (jamais `localStorage` : protection XSS).
- Le **refresh token** est un cookie `httpOnly` posé par le backend, invisible du JavaScript.
- L'intercepteur Axios rejoue **une seule fois** une requête après un `401` en appelant
  `/auth/refresh` ; les appels concurrents sont mis en file derrière un unique refresh en cours.
- Un second `401` vide la session et redirige vers `/login`.

## 5.5 Données serveur — TanStack Query

Clés de cache normalisées :

```ts
export const propertyKeys = {
  all:     ['properties'] as const,
  lists:   () => [...propertyKeys.all, 'list'] as const,
  list:    (filters: PropertyFilters) => [...propertyKeys.lists(), filters] as const,
  details: () => [...propertyKeys.all, 'detail'] as const,
  detail:  (id: string) => [...propertyKeys.details(), id] as const,
};
```

Réglages : `staleTime` 30 s sur les listes, `retry` désactivé sur les 4xx, invalidation ciblée après
mutation, `placeholderData: keepPreviousData` pour une pagination sans clignotement.

Les filtres de liste (`page`, `limit`, `sort`, `order`, `search`, `status`…) sont **synchronisés
avec l'URL** : une vue filtrée est partageable et survit au rafraîchissement.

## 5.6 UX (§34)

- **Shell** : sidebar repliable, topbar avec recherche globale (`⌘K`), notifications, menu profil.
- **Tables** : tri serveur, filtres persistés dans l'URL, densité réglable, sélection multiple,
  état vide explicite, `Skeleton` au chargement.
- **Statuts** : badges de couleur constante entre liste, fiche et carte
  (gris `NON_AMENAGE`, ambre `EN_AMENAGEMENT`, vert `AMENAGE`, bleu `EN_PROJET`,
  rouge `EN_LITIGE`, ardoise `VENDU`/`TRANSFERE`).
- **Documents** : glisser-déposer, progression d'upload, prévisualisation PDF/image en panneau
  latéral, historique des versions.
- **Carte** : clustering des markers, filtres par ville/site/statut, popup avec référence,
  localisation, superficie, statut et lien vers la fiche.
- **Confirmations** : toute action destructive ouvre un `ConfirmDialog` nommant la ressource.
- **Erreurs** : le `message` du backend est affiché tel quel ; `details[]` est rattaché aux champs
  du formulaire concerné.
- **Responsive** : tables en cartes empilées sous `md`, sidebar en tiroir, carte plein écran.

## 5.7 Accessibilité et performance

- Composants basés sur Radix (focus, rôles ARIA, navigation clavier), contraste AA.
- `React.lazy` par route ; la carte et la prévisualisation PDF sont chargées à la demande.
- Images optimisées, listes longues virtualisées, `Suspense` + `Skeleton` partout.
