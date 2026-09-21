/**
 * Types du domaine, alignés sur les DTO du backend.
 *
 * Les énumérations sont dupliquées côté client plutôt qu'importées : cela évite
 * un couplage de build entre les deux projets, au prix d'un alignement à tenir
 * lors d'une évolution du schéma.
 */

export const PROPERTY_STATUSES = [
  'NON_AMENAGE',
  'EN_AMENAGEMENT',
  'AMENAGE',
  'EN_PROJET',
  'EN_LITIGE',
  'VENDU',
  'TRANSFERE',
  'AUTRE',
] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export const AREA_UNITS = ['M2', 'ARE', 'HECTARE'] as const;
export type AreaUnit = (typeof AREA_UNITS)[number];

export const PROJECT_STATUSES = [
  'IDEE',
  'ETUDE_PRELIMINAIRE',
  'EN_ETUDE',
  'CONCEPTION',
  'EN_ATTENTE_PERMIS',
  'PERMIS_OBTENU',
  'TRAVAUX_PREPARATION',
  'TRAVAUX_EN_COURS',
  'SUSPENDU',
  'TERMINE',
  'ABANDONNE',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROPERTY_DOCUMENT_TYPES = [
  'DONATION',
  'PLAN_DE_MASSE',
  'TITRE_FONCIER',
  'ACTE_DE_VENTE',
  'CONVENTION',
  'CERTIFICAT',
  'PLAN_CADASTRAL',
  'AUTRE',
] as const;
export type PropertyDocumentType = (typeof PROPERTY_DOCUMENT_TYPES)[number];

export const PROJECT_COMPONENT_TYPES = [
  'ECOLE',
  'HOTEL',
  'RESTAURATION',
  'LOISIRS',
  'RESIDENCE',
  'COMMERCE',
  'BUREAUX',
  'PARKING',
  'SANTE',
  'SPORT',
  'AGRICULTURE',
  'INDUSTRIE',
  'AUTRE',
] as const;
export type ProjectComponentType = (typeof PROJECT_COMPONENT_TYPES)[number];

export const SHARE_STATUSES = ['PENDING', 'ACTIVE', 'EXPIRED', 'REVOKED'] as const;
export type ShareStatus = (typeof SHARE_STATUSES)[number];

export const BUILDING_PERMIT_STATUSES = [
  'EN_ATTENTE',
  'EN_ETUDE',
  'APPROUVE',
  'REFUSE',
  'EXPIRE',
  'ANNULE',
] as const;
export type BuildingPermitStatus = (typeof BUILDING_PERMIT_STATUSES)[number];

export type RoleCode =
  | 'ADMIN'
  | 'GESTIONNAIRE'
  | 'CONSULTANT'
  | 'UTILISATEUR_PARTAGE';

// --- Entités ----------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: RoleCode[];
  permissions: string[];
  mustChangePassword: boolean;
}

export interface LocationRef {
  id: string;
  name: string;
  code?: string;
}

export interface UserRef {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
}

export interface Coordinate {
  id?: string;
  label?: string | null;
  latitude: string | number;
  longitude: string | number;
  altitude?: string | number | null;
  pointOrder?: number;
  isPrimary: boolean;
}

export interface PropertyListItem {
  id: string;
  reference: string;
  name: string;
  area: string;
  areaUnit: AreaUnit;
  areaSqm: string;
  status: PropertyStatus;
  purchaseDate: string | null;
  createdAt: string;
  location: LocationRef;
  site: LocationRef | null;
  coordinates: Array<{ latitude: string; longitude: string }>;
  managers: Array<{ user: UserRef }>;
  _count: { documents: number; geoFiles: number; projects: number };
}

export interface PropertyDetail extends Omit<PropertyListItem, 'coordinates'> {
  description: string | null;
  notes: string | null;
  sellerName: string | null;
  sellerContact: string | null;
  googleMapsUrl: string | null;
  googleEarthUrl: string | null;
  coordinates: Coordinate[];
  createdBy: UserRef | null;
  updatedBy: UserRef | null;
}

export interface PropertyDocument {
  id: string;
  propertyId: string;
  name: string;
  type: PropertyDocumentType;
  fileName: string;
  mimeType: string;
  size: number;
  version: number;
  isCurrentVersion: boolean;
  createdAt: string;
  uploadedBy: UserRef | null;
}

export interface GeoFile {
  id: string;
  fileName: string;
  format: 'KML' | 'KMZ';
  size: number;
  featureCount: number | null;
  bounds: {
    minLat: number;
    minLng: number;
    maxLat: number;
    maxLng: number;
  } | null;
  extractionStatus: 'PENDING' | 'SUCCESS' | 'PARTIAL' | 'FAILED';
  extractionError: string | null;
  createdAt: string;
}

export interface MapMarker {
  id: string;
  reference: string;
  name: string;
  status: PropertyStatus;
  latitude: number;
  longitude: number;
  areaSqm: number;
  locationName: string;
  siteName: string | null;
}

export interface ProjectListItem {
  id: string;
  reference: string;
  name: string;
  status: ProjectStatus;
  startDate: string | null;
  expectedEndDate: string | null;
  actualEndDate: string | null;
  location: LocationRef;
  site: LocationRef | null;
  property: { id: string; reference: string; name: string } | null;
  company: { id: string; name: string } | null;
  manager: UserRef | null;
  _count: { components: number; documents: number; permits: number };
}

export interface ProjectComponent {
  id: string;
  name: string;
  type: ProjectComponentType;
  description: string | null;
  area: string | null;
  areaUnit: AreaUnit | null;
  status: string;
  notes: string | null;
}

export interface BuildingPermit {
  id: string;
  number: string;
  issueDate: string | null;
  expiryDate: string | null;
  authority: string | null;
  status: BuildingPermitStatus;
  notes: string | null;
}

export interface ProjectDetail extends ProjectListItem {
  description: string | null;
  notes: string | null;
  components: ProjectComponent[];
  permits: BuildingPermit[];
  createdBy: UserRef | null;
}

export interface StatusHistoryEntry {
  id: string;
  fromStatus: ProjectStatus | null;
  toStatus: ProjectStatus;
  comment: string | null;
  changedAt: string;
  changedBy: UserRef | null;
}

export interface PropertyShare {
  id: string;
  propertyId: string;
  beneficiaryFirstName: string;
  beneficiaryLastName: string;
  beneficiaryEmail: string;
  beneficiaryPhone: string | null;
  message: string | null;
  status: ShareStatus;
  expiresAt: string;
  activatedAt: string | null;
  revokedAt: string | null;
  lastAccessedAt: string | null;
  allowDocuments: boolean;
  allowCoordinates: boolean;
  allowGoogleEarth: boolean;
  createdAt: string;
  property: { id: string; reference: string; name: string };
  createdBy: UserRef | null;
  documents: Array<{ document: { id: string; name: string } }>;
}

export interface Company {
  id: string;
  name: string;
  registrationNumber: string | null;
  taxNumber: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  contactPerson: string | null;
  notes: string | null;
  _count: { projects: number };
}

export interface AppUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  isActive: boolean;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  roles: string[];
  createdAt: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: UserRef | null;
}

export interface DashboardOverview {
  properties: {
    total: number;
    totalAreaSqm: number;
    totalAreaHectares: number;
    byStatus: Array<{ key: string; count: number; percentage: number }>;
  };
  geography: { locations: number; sites: number };
  projects: {
    total: number;
    byStatus: Array<{ key: string; count: number; percentage: number }>;
  };
  documents: { total: number; geoFiles: number };
  shares: { active: number; expiringSoon: number };
}

export interface DashboardProperties {
  byStatus: Array<{ status: PropertyStatus; count: number; areaSqm: number }>;
  byLocation: Array<{
    locationId: string;
    locationName: string;
    count: number;
    areaSqm: number;
  }>;
  largest: Array<{
    id: string;
    reference: string;
    name: string;
    areaSqm: string;
    status: PropertyStatus;
    location: { name: string };
  }>;
  recent: Array<{
    id: string;
    reference: string;
    name: string;
    status: PropertyStatus;
    createdAt: string;
    location: { name: string };
  }>;
}

export interface DashboardProjects {
  byStatus: Array<{ status: ProjectStatus; count: number }>;
  byCompany: Array<{ companyId: string | null; companyName: string; count: number }>;
  permitsByStatus: Array<{ status: BuildingPermitStatus; count: number }>;
  recent: Array<{
    id: string;
    reference: string;
    name: string;
    status: ProjectStatus;
    updatedAt: string;
    property: { reference: string } | null;
  }>;
}

export interface DashboardDocuments {
  propertyDocuments: {
    totalVersions: number;
    totalSizeBytes: number;
    byType: Array<{ type: PropertyDocumentType; count: number }>;
  };
  projectDocuments: {
    byType: Array<{ type: string; count: number }>;
  };
  recent: Array<{
    id: string;
    name: string;
    type: PropertyDocumentType;
    createdAt: string;
    property: { id: string; reference: string };
  }>;
}

export interface AcquisitionPoint {
  /** `AAAA-MM` */
  month: string;
  count: number;
  areaSqm: number;
  cumulative: number;
}

export interface DashboardActivity {
  recentActivity: Array<{
    id: string;
    action: string;
    entity: string;
    entityId: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
    user: UserRef | null;
  }>;
  expiringShares: Array<{
    id: string;
    beneficiaryFirstName: string;
    beneficiaryLastName: string;
    beneficiaryEmail: string;
    expiresAt: string;
    lastAccessedAt: string | null;
    property: { id: string; reference: string; name: string };
  }>;
  pendingShares: number;
}

export interface SearchHit {
  entity: 'property' | 'project' | 'site' | 'location' | 'document' | 'company';
  id: string;
  title: string;
  subtitle: string | null;
  badge: string | null;
  path: string;
}

// --- Vue du bénéficiaire (§22) ---------------------------------------------

export interface SharedPropertyView {
  id: string;
  reference: string;
  name: string;
  location: { name: string };
  site: { name: string } | null;
  area: string;
  areaUnit: AreaUnit;
  areaSqm: string;
  status: PropertyStatus;
  description: string | null;
  coordinates: Coordinate[];
  googleMapsUrl: string | null;
  googleEarthUrl: string | null;
  geoFiles: Array<{ id: string; fileName: string; format: string }>;
  documentCount: number;
  share: {
    expiresAt: string;
    allowDocuments: boolean;
    allowCoordinates: boolean;
    allowGoogleEarth: boolean;
  };
}
