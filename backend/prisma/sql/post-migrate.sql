-- ---------------------------------------------------------------------------
-- AK IMMO — objets SQL non exprimables dans le schéma Prisma.
--
-- Séquences de références, index uniques partiels et index de recherche.
-- Entièrement idempotent : exécutable après chaque `prisma migrate deploy`.
-- Appliqué automatiquement par `npm run seed`.
-- ---------------------------------------------------------------------------

-- Recherche floue sur les libellés (§24) : `ILIKE '%terme%'` n'utilise aucun
-- index B-tree ; l'index GIN trigram le rend efficace dès quelques milliers
-- de lignes.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- --- Séquences de références métier (§9, §14) -------------------------------
-- Une séquence garantit l'unicité sous concurrence, contrairement à un
-- `MAX(reference) + 1` qui produirait des doublons sur deux créations
-- simultanées.
CREATE SEQUENCE IF NOT EXISTS property_reference_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS project_reference_seq  START WITH 1 INCREMENT BY 1;

-- --- Unicité conditionnelle -------------------------------------------------

-- Un seul point principal par terrain : c'est celui affiché sur la carte.
CREATE UNIQUE INDEX IF NOT EXISTS property_coordinates_primary_unique
  ON property_coordinates (property_id)
  WHERE is_primary = true;

-- Nom de site unique dans une ville, en ignorant les lignes supprimées :
-- un nom redevient disponible après suppression.
CREATE UNIQUE INDEX IF NOT EXISTS sites_location_name_unique
  ON sites (location_id, lower(name))
  WHERE deleted_at IS NULL;

-- Numéro d'enregistrement d'entreprise unique lorsqu'il est renseigné.
CREATE UNIQUE INDEX IF NOT EXISTS companies_registration_number_unique
  ON companies (registration_number)
  WHERE registration_number IS NOT NULL AND deleted_at IS NULL;

-- Un bénéficiaire ne peut avoir qu'un seul partage actif sur un même bien.
CREATE UNIQUE INDEX IF NOT EXISTS property_shares_active_unique
  ON property_shares (property_id, lower(beneficiary_email))
  WHERE status IN ('PENDING', 'ACTIVE');

-- --- Index de recherche globale (§24) ---------------------------------------
CREATE INDEX IF NOT EXISTS properties_search_trgm
  ON properties USING gin ((reference || ' ' || name) gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS projects_search_trgm
  ON projects USING gin ((reference || ' ' || name) gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS locations_name_trgm
  ON locations USING gin (name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS sites_name_trgm
  ON sites USING gin (name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS companies_name_trgm
  ON companies USING gin (name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS property_documents_name_trgm
  ON property_documents USING gin (name gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- --- Index de tri et de filtrage --------------------------------------------

-- Listes triées par date de création, filtrées sur les lignes vivantes.
CREATE INDEX IF NOT EXISTS properties_active_created_at
  ON properties (created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS projects_active_created_at
  ON projects (created_at DESC)
  WHERE deleted_at IS NULL;

-- Tâche planifiée d'expiration des partages : balaye uniquement les partages
-- encore ouverts (§21).
CREATE INDEX IF NOT EXISTS property_shares_pending_expiry
  ON property_shares (expires_at)
  WHERE status IN ('PENDING', 'ACTIVE');

-- Alerte sur les permis proches de l'expiration (§27).
CREATE INDEX IF NOT EXISTS building_permits_active_expiry
  ON building_permits (expiry_date)
  WHERE deleted_at IS NULL AND status IN ('APPROUVE', 'EN_ATTENTE', 'EN_ETUDE');

-- Notifications non lues d'un utilisateur.
CREATE INDEX IF NOT EXISTS notifications_unread
  ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;
