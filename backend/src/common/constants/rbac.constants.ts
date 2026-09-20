/**
 * Référentiel RBAC — source de vérité unique (doc 3).
 *
 * Le seed lit ces constantes : ajouter une permission ici et relancer le seed
 * suffit à la propager, sans SQL manuel.
 */

export const ROLES = {
  ADMIN: 'ADMIN',
  GESTIONNAIRE: 'GESTIONNAIRE',
  CONSULTANT: 'CONSULTANT',
  UTILISATEUR_PARTAGE: 'UTILISATEUR_PARTAGE',
} as const;

export type RoleCode = (typeof ROLES)[keyof typeof ROLES];

export const PERMISSIONS = {
  PROPERTY_READ: 'property.read',
  PROPERTY_CREATE: 'property.create',
  PROPERTY_UPDATE: 'property.update',
  PROPERTY_DELETE: 'property.delete',
  PROPERTY_SHARE: 'property.share',

  PROJECT_READ: 'project.read',
  PROJECT_CREATE: 'project.create',
  PROJECT_UPDATE: 'project.update',
  PROJECT_DELETE: 'project.delete',

  DOCUMENT_READ: 'document.read',
  DOCUMENT_UPLOAD: 'document.upload',
  DOCUMENT_DELETE: 'document.delete',

  LOCATION_READ: 'location.read',
  LOCATION_MANAGE: 'location.manage',

  SITE_READ: 'site.read',
  SITE_MANAGE: 'site.manage',

  COMPANY_READ: 'company.read',
  COMPANY_MANAGE: 'company.manage',

  USER_MANAGE: 'user.manage',
  ROLE_MANAGE: 'role.manage',
  AUDIT_READ: 'audit.read',
  DASHBOARD_READ: 'dashboard.read',
  MAP_READ: 'map.read',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_DESCRIPTIONS: Record<PermissionCode, string> = {
  [PERMISSIONS.PROPERTY_READ]: 'Consulter les terrains de son périmètre',
  [PERMISSIONS.PROPERTY_CREATE]: 'Créer un terrain',
  [PERMISSIONS.PROPERTY_UPDATE]: 'Modifier un terrain',
  [PERMISSIONS.PROPERTY_DELETE]: 'Supprimer un terrain',
  [PERMISSIONS.PROPERTY_SHARE]: 'Partager un terrain avec un bénéficiaire externe',
  [PERMISSIONS.PROJECT_READ]: 'Consulter les projets de son périmètre',
  [PERMISSIONS.PROJECT_CREATE]: 'Créer un projet',
  [PERMISSIONS.PROJECT_UPDATE]: 'Modifier un projet et faire évoluer son statut',
  [PERMISSIONS.PROJECT_DELETE]: 'Supprimer un projet',
  [PERMISSIONS.DOCUMENT_READ]: 'Consulter et télécharger les documents autorisés',
  [PERMISSIONS.DOCUMENT_UPLOAD]: 'Téléverser un document',
  [PERMISSIONS.DOCUMENT_DELETE]: 'Supprimer un document',
  [PERMISSIONS.LOCATION_READ]: 'Consulter préfectures, villes et communes',
  [PERMISSIONS.LOCATION_MANAGE]: 'Gérer préfectures, villes et communes',
  [PERMISSIONS.SITE_READ]: 'Consulter les sites et quartiers',
  [PERMISSIONS.SITE_MANAGE]: 'Gérer les sites et quartiers',
  [PERMISSIONS.COMPANY_READ]: 'Consulter les entreprises et gérants',
  [PERMISSIONS.COMPANY_MANAGE]: 'Gérer les entreprises et gérants',
  [PERMISSIONS.USER_MANAGE]: 'Gérer les utilisateurs et leurs rôles',
  [PERMISSIONS.ROLE_MANAGE]: 'Gérer les rôles et leurs permissions',
  [PERMISSIONS.AUDIT_READ]: "Consulter le journal d'audit",
  [PERMISSIONS.DASHBOARD_READ]: 'Accéder aux tableaux de bord',
  [PERMISSIONS.MAP_READ]: 'Accéder à la carte du patrimoine',
};

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

/** Matrice rôle → permissions (doc 3, §3.3). */
export const ROLE_PERMISSIONS: Record<RoleCode, readonly PermissionCode[]> = {
  [ROLES.ADMIN]: ALL_PERMISSIONS,

  [ROLES.GESTIONNAIRE]: [
    PERMISSIONS.PROPERTY_READ,
    PERMISSIONS.PROPERTY_CREATE,
    PERMISSIONS.PROPERTY_UPDATE,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.PROJECT_CREATE,
    PERMISSIONS.PROJECT_UPDATE,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_UPLOAD,
    PERMISSIONS.LOCATION_READ,
    PERMISSIONS.SITE_READ,
    PERMISSIONS.SITE_MANAGE,
    PERMISSIONS.COMPANY_READ,
    PERMISSIONS.COMPANY_MANAGE,
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.MAP_READ,
  ],

  [ROLES.CONSULTANT]: [
    PERMISSIONS.PROPERTY_READ,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.LOCATION_READ,
    PERMISSIONS.SITE_READ,
    PERMISSIONS.COMPANY_READ,
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.MAP_READ,
  ],

  // §22 — l'utilisateur partagé n'accède qu'aux routes /api/shared/*.
  // Ses deux permissions sont systématiquement doublées d'un filtre
  // « ce partage précis, ACTIVE et non expiré » côté service.
  [ROLES.UTILISATEUR_PARTAGE]: [
    PERMISSIONS.PROPERTY_READ,
    PERMISSIONS.DOCUMENT_READ,
  ],
};

export const ROLE_DEFINITIONS: Record<RoleCode, { name: string; description: string }> = {
  [ROLES.ADMIN]: {
    name: 'Administrateur',
    description: 'Accès complet à la plateforme, y compris utilisateurs et audit',
  },
  [ROLES.GESTIONNAIRE]: {
    name: 'Gestionnaire',
    description: 'Gestion des biens et projets qui lui sont attribués',
  },
  [ROLES.CONSULTANT]: {
    name: 'Consultant',
    description: 'Consultation seule selon les permissions accordées',
  },
  [ROLES.UTILISATEUR_PARTAGE]: {
    name: 'Utilisateur partagé',
    description: 'Accès limité aux biens explicitement partagés',
  },
};
