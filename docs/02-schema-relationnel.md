# 2. Schéma relationnel — AK IMMO

Toutes les clés primaires sont des `UUID v4`. Tous les horodatages sont `timestamptz`.
Les tables patrimoniales portent `created_at`, `updated_at`, `deleted_at`, `deleted_by` (soft delete).

## 2.1 Vue d'ensemble des relations

```
                       ┌───────────┐        ┌──────────────────┐        ┌─────────────┐
                       │   roles   │───────<│ role_permissions │>───────│ permissions │
                       └─────┬─────┘        └──────────────────┘        └─────────────┘
                             │
                       ┌─────┴──────┐
                       │ user_roles │
                       └─────┬──────┘
                             │
      ┌──────────────────────┴───────────────────────────────────────────────┐
      │                              users                                    │
      └──┬────────┬──────────┬───────────┬──────────────┬──────────┬─────────┘
         │        │          │           │              │          │
  refresh_tokens  │  temporary_access_   │        notifications  audit_logs
                  │      tokens          │
                  │                      │
         property_managers         property_shares
                  │                      │
                  │                      └──> property_share_documents
                  │
  ┌───────────┐   │
  │ locations │──┐│                      HIÉRARCHIE GÉOGRAPHIQUE (§6)
  └─────┬─────┘  ││                      Préfecture/Ville → Site/Quartier
        │ parent ││                                      → Terrain/Domaine
        │ (self) ││                                      → Projet éventuel
  ┌─────▼─────┐  ││
  │   sites   │  ││
  └─────┬─────┘  ││
        │        ││
  ┌─────▼────────▼▼────┐
  │     properties     │───< property_coordinates
  │  (terrains/domaines)│───< property_documents  (versionnés, parent_document_id)
  └─────┬──────────────┘───< property_geo_files   (KML/KMZ — §12)
        │
  ┌─────▼─────┐        ┌───────────┐
  │  projects │>───────│ companies │
  └─────┬─────┘        └───────────┘
        ├──< project_components
        ├──< project_documents
        ├──< building_permits
        └──< project_status_history   (append-only)
```

## 2.2 Domaine « identité & accès »

### users
| Colonne | Type | Contraintes |
|---|---|---|
| id | uuid | PK |
| email | citext | UNIQUE, NOT NULL |
| password_hash | text | NOT NULL (Argon2id) |
| first_name / last_name | text | NOT NULL |
| phone | text | NULL |
| is_active | boolean | DEFAULT true |
| email_verified_at | timestamptz | NULL |
| must_change_password | boolean | DEFAULT false — §21 |
| last_login_at | timestamptz | NULL |
| failed_login_attempts | int | DEFAULT 0 |
| locked_until | timestamptz | NULL |
| token_version | int | DEFAULT 0 — invalide tous les JWT si incrémenté |
| created_at / updated_at / deleted_at / deleted_by | | soft delete |

Index : `UNIQUE(email)`, `(deleted_at)`, `(is_active)`.

### roles
`id`, `code` (UNIQUE : `ADMIN`, `GESTIONNAIRE`, `CONSULTANT`, `UTILISATEUR_PARTAGE`), `name`,
`description`, `is_system` (les rôles système ne sont ni renommés ni supprimés).

### permissions
`id`, `code` (UNIQUE, ex. `property.update`), `resource` (`property`), `action` (`update`),
`description`. Le couple `(resource, action)` est unique.

### role_permissions
PK composite `(role_id, permission_id)`, `ON DELETE CASCADE` des deux côtés.

### user_roles
PK composite `(user_id, role_id)`, plus `assigned_at`, `assigned_by`.

### refresh_tokens
`id`, `user_id` (FK), `token_hash` (UNIQUE, SHA-256), `family_id` (uuid), `expires_at`,
`revoked_at`, `replaced_by_id` (FK self), `ip`, `user_agent`, `created_at`.
Index : `(user_id, revoked_at)`, `(family_id)`, `(expires_at)`.

### temporary_access_tokens
`id`, `user_id` (FK, nullable), `purpose` (`PASSWORD_RESET` | `EMAIL_VERIFICATION` |
`SHARE_ACTIVATION`), `token_hash` (UNIQUE), `expires_at`, `used_at`, `metadata` jsonb,
`created_at`. Le token en clair n'existe que dans l'email envoyé.

## 2.3 Domaine « géographie & patrimoine »

### locations — Préfecture / Ville / Commune (§6)
`id`, `name`, `code` (UNIQUE), `type` (`PREFECTURE` | `VILLE` | `COMMUNE`), `parent_id` (FK self —
une ville appartient à une préfecture), `country` (défaut `GN`), `region`, `latitude`, `longitude`,
`description`, timestamps + soft delete.
Index : `(parent_id)`, `(type)`, `UNIQUE(code)`, index trigram sur `name` pour la recherche.

### sites — Site / Quartier
`id`, `location_id` (FK → locations, RESTRICT), `name`, `code` (UNIQUE), `description`,
`latitude`, `longitude`, timestamps + soft delete.
Contrainte : `UNIQUE(location_id, name)` parmi les lignes non supprimées.

### properties — Terrain / Domaine (§9)
| Colonne | Type | Notes |
|---|---|---|
| id | uuid | PK |
| reference | text | UNIQUE, généré `AK-IMM-000001` |
| name | text | libellé usuel du domaine |
| location_id | uuid | FK → locations (ville) |
| site_id | uuid | FK → sites, nullable |
| area | numeric(14,2) | superficie |
| area_unit | enum | `M2` \| `ARE` \| `HECTARE` |
| purchase_date | date | nullable |
| seller_name | text | sessionnaire / vendeur |
| seller_contact | text | nullable |
| status | enum | §10 |
| description / notes | text | nullable |
| google_maps_url / google_earth_url | text | nullable |
| created_by / updated_by | uuid | FK → users |
| created_at / updated_at / deleted_at / deleted_by | | |

Index : `UNIQUE(reference)`, `(location_id)`, `(site_id)`, `(status)`, `(deleted_at)`,
index composite `(status, location_id)` pour les filtres du dashboard, trigram sur
`reference || name` pour la recherche globale.

Génération de la référence : séquence PostgreSQL dédiée `property_reference_seq`, formatée
`AK-IMM-` + `lpad(nextval, 6, '0')`. Une séquence garantit l'unicité sous concurrence, contrairement
à un `MAX(reference)+1`.

### property_coordinates (§11)
`id`, `property_id` (FK CASCADE), `label`, `latitude` numeric(10,7), `longitude` numeric(10,7),
`altitude` numeric(8,2) nullable, `point_order` int, `is_primary` boolean, `created_at`.
Un seul point `is_primary = true` par terrain (index unique partiel) : c'est celui affiché sur la
carte générale. Les autres points décrivent l'emprise (bornes).

### property_managers
PK composite `(property_id, user_id)`, `assigned_at`, `assigned_by`. Porte le périmètre du rôle
`GESTIONNAIRE`.

### property_documents (§13)
`id`, `property_id` (FK CASCADE), `name`, `type` enum (`DONATION`, `PLAN_DE_MASSE`,
`TITRE_FONCIER`, `ACTE_DE_VENTE`, `CONVENTION`, `CERTIFICAT`, `PLAN_CADASTRAL`, `AUTRE`),
`file_name`, `mime_type`, `size` bigint, `storage_key` (UNIQUE), `checksum` (sha256),
`version` int DEFAULT 1, `parent_document_id` (FK self — chaîne de versions),
`is_current_version` boolean, `uploaded_by` (FK users), timestamps + soft delete.

Versioning : un nouvel upload sur un document existant crée une **nouvelle ligne** avec
`parent_document_id` pointant sur la racine, `version = max+1`, et bascule `is_current_version` à
`false` sur la précédente. Aucun fichier n'est écrasé dans le stockage objet.

### property_geo_files (§12) — extension du §5
`id`, `property_id` (FK CASCADE), `file_name`, `format` (`KML` | `KMZ`), `mime_type`, `size`,
`storage_key` (UNIQUE), `checksum`, `feature_count` int, `bounds` jsonb (bbox extraite),
`extracted_geometry` jsonb (GeoJSON extrait quand l'analyse réussit), `extraction_status`
(`PENDING` | `SUCCESS` | `PARTIAL` | `FAILED`), `extraction_error` text, `uploaded_by`, timestamps.

*Justification :* un fichier Google Earth n'est pas un document juridique ; il porte des champs
propres (bbox, géométrie extraite, statut d'analyse) et n'est pas versionné comme un titre foncier.
Le séparer évite d'alourdir `property_documents` de colonnes nullables.

### property_shares (§20-21)
| Colonne | Type | Notes |
|---|---|---|
| id | uuid | PK |
| property_id | uuid | FK CASCADE |
| beneficiary_first_name / last_name | text | |
| beneficiary_email | citext | |
| beneficiary_phone | text | nullable |
| message | text | message d'invitation |
| user_id | uuid | FK → users, nullable jusqu'à l'activation |
| token_hash | text | UNIQUE, SHA-256 du token d'invitation |
| status | enum | `PENDING` \| `ACTIVE` \| `EXPIRED` \| `REVOKED` |
| expires_at | timestamptz | NOT NULL |
| activated_at / revoked_at | timestamptz | nullable |
| revoked_by / created_by | uuid | FK → users |
| allow_documents / allow_coordinates / allow_google_earth | boolean | portée fine (§22) |
| created_at / updated_at | | |

Index : `UNIQUE(token_hash)`, `(property_id, status)`, `(beneficiary_email)`, `(expires_at, status)`
pour la tâche planifiée d'expiration.

### property_share_documents
PK composite `(share_id, document_id)`. Liste blanche des documents visibles par le bénéficiaire.
Sans ligne ici, aucun document n'est accessible, même si `allow_documents = true`.

## 2.4 Domaine « projets »

### projects (§14)
`id`, `reference` UNIQUE (`AK-PRJ-000001`, séquence dédiée), `name`, `location_id` (FK),
`site_id` (FK, nullable), `property_id` (FK → properties, nullable — un projet *peut* être lié à un
terrain), `company_id` (FK → companies, nullable), `manager_id` (FK → users, nullable),
`description`, `status` enum (§18), `start_date`, `expected_end_date`, `actual_end_date`, `notes`,
`created_by`, `updated_by`, timestamps + soft delete.
Index : `UNIQUE(reference)`, `(property_id)`, `(status)`, `(company_id)`, `(location_id)`.

### project_components (§15)
`id`, `project_id` (FK CASCADE), `name`, `type` enum (`ECOLE`, `HOTEL`, `RESTAURATION`, `LOISIRS`,
`RESIDENCE`, `COMMERCE`, `BUREAUX`, `PARKING`, `SANTE`, `SPORT`, `AGRICULTURE`, `INDUSTRIE`,
`AUTRE`), `description`, `area` numeric(14,2), `area_unit` enum, `status` enum, `notes`, timestamps.

### project_documents (§16)
Même structure que `property_documents` (versioning inclus), avec `project_id`,
`component_id` nullable et `type` enum : `ETUDE_TOPOGRAPHIQUE`, `ETUDE_GEOTECHNIQUE`,
`PLAN_CONSTRUCTION`, `PLAN_ARCHITECTURAL`, `ETUDE_ENVIRONNEMENTALE`, `PLAN_ELECTRIQUE`,
`PLAN_PLOMBERIE`, `PERMIS`, `AUTRE`.

### building_permits (§17)
`id`, `project_id` (FK CASCADE), `number`, `issue_date`, `expiry_date`, `authority`,
`status` enum (`EN_ATTENTE`, `EN_ETUDE`, `APPROUVE`, `REFUSE`, `EXPIRE`, `ANNULE`),
`document_id` (FK → project_documents, nullable), `notes`, timestamps.
Index : `(project_id)`, `(status)`, `(expiry_date)` pour l'alerte d'expiration (§27).

### project_status_history (§18) — append-only
`id`, `project_id` (FK CASCADE), `from_status` enum nullable, `to_status` enum NOT NULL,
`comment`, `changed_by` (FK users), `changed_at`.
Aucun `UPDATE`/`DELETE` applicatif : l'historique n'est jamais écrasé. Index `(project_id, changed_at DESC)`.

### companies (§19)
`id`, `name`, `registration_number`, `tax_number`, `address`, `phone`, `email`, `website`,
`contact_person`, `notes`, timestamps + soft delete. Index `UNIQUE(registration_number)` partiel
(quand non nul), trigram sur `name`.

## 2.5 Domaine « transverse »

### notifications (§27)
`id`, `user_id` (FK CASCADE), `type` enum, `title`, `message`, `entity_type`, `entity_id`,
`read_at` nullable, `created_at`. Index `(user_id, read_at)`.

### audit_logs (§26) — append-only
`id`, `user_id` (FK SET NULL), `action` enum, `entity`, `entity_id`, `ip` inet, `user_agent` text,
`metadata` jsonb, `created_at`.
Index : `(user_id, created_at DESC)`, `(entity, entity_id)`, `(action, created_at DESC)`.
Partitionnement mensuel prévu au-delà de ~10 M de lignes.

## 2.6 Règles d'intégrité transverses

1. **Cohérence géographique** — si `site_id` est fourni, le service vérifie que
   `sites.location_id = properties.location_id`. Idem pour les projets.
2. **Soft delete en cascade applicative** — supprimer une `location` n'est autorisé que si elle ne
   porte aucun site ni terrain actif (FK `RESTRICT`).
3. **Partage** — un partage ne peut viser qu'un terrain non supprimé ; sa date d'expiration est
   obligatoirement future à la création ; `status` est dérivé et maintenu par le service et la tâche
   planifiée, jamais fourni par le client.
4. **Statuts de projet** — toute modification de `projects.status` écrit une ligne dans
   `project_status_history` dans la **même transaction**.
5. **Documents** — `storage_key` est unique ; aucune route ne renvoie `storage_key` au client.
