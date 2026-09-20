/**
 * Seed de développement (§37).
 *
 * Idempotent : relançable sans dupliquer les données (`upsert` partout).
 *
 * Jeu produit : 1 administrateur, 2 gestionnaires, 1 consultant, 5 villes,
 * 10 sites, 20 terrains avec coordonnées, 5 projets et leurs composantes.
 *
 * Aucune donnée patrimoniale réelle : les références, superficies, vendeurs et
 * coordonnées sont fictifs. Les noms de villes servent uniquement à rendre les
 * écrans lisibles.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AreaUnit,
  ComponentStatus,
  LocationType,
  PrismaClient,
  ProjectComponentType,
  ProjectStatus,
  PropertyStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';
import {
  PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  ROLES,
  ROLE_DEFINITIONS,
  ROLE_PERMISSIONS,
  type PermissionCode,
  type RoleCode,
} from '../src/common/constants/rbac.constants';

const prisma = new PrismaClient();

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

// ---------------------------------------------------------------------------
// Étape 0 — objets SQL hors schéma Prisma
// ---------------------------------------------------------------------------

async function applyPostMigrateSql(): Promise<void> {
  const sql = readFileSync(join(__dirname, 'sql', 'post-migrate.sql'), 'utf8');

  // Le fichier contient plusieurs instructions ; `$executeRawUnsafe` n'en
  // accepte qu'une à la fois, d'où le découpage. Les commentaires `--` sont
  // retirés pour ne pas neutraliser la fin d'une instruction reconstituée.
  const statements = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  console.log(`  ✓ ${statements.length} instructions SQL appliquées`);
}

// ---------------------------------------------------------------------------
// Étape 1 — rôles et permissions
// ---------------------------------------------------------------------------

async function seedRbac(): Promise<Record<RoleCode, string>> {
  const permissionIds = new Map<PermissionCode, string>();

  for (const code of Object.values(PERMISSIONS)) {
    const [resource, action] = code.split('.');

    const permission = await prisma.permission.upsert({
      where: { code },
      update: { description: PERMISSION_DESCRIPTIONS[code] },
      create: {
        code,
        resource,
        action,
        description: PERMISSION_DESCRIPTIONS[code],
      },
      select: { id: true },
    });

    permissionIds.set(code, permission.id);
  }

  const roleIds = {} as Record<RoleCode, string>;

  for (const code of Object.values(ROLES)) {
    const definition = ROLE_DEFINITIONS[code];

    const role = await prisma.role.upsert({
      where: { code },
      update: { name: definition.name, description: definition.description },
      create: {
        code,
        name: definition.name,
        description: definition.description,
        isSystem: true,
      },
      select: { id: true },
    });

    roleIds[code] = role.id;

    // La matrice du code fait foi : on aligne la base dessus à chaque seed,
    // en retirant les permissions qui n'y figurent plus.
    const expected = ROLE_PERMISSIONS[code];

    await prisma.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permission: { code: { notIn: [...expected] } },
      },
    });

    await prisma.rolePermission.createMany({
      data: expected.map((permissionCode) => ({
        roleId: role.id,
        permissionId: permissionIds.get(permissionCode)!,
      })),
      skipDuplicates: true,
    });
  }

  console.log(
    `  ✓ ${permissionIds.size} permissions, ${Object.keys(roleIds).length} rôles`,
  );

  return roleIds;
}

// ---------------------------------------------------------------------------
// Étape 2 — utilisateurs
// ---------------------------------------------------------------------------

interface SeedUser {
  email: string;
  firstName: string;
  lastName: string;
  role: RoleCode;
  password: string;
}

async function seedUsers(
  roleIds: Record<RoleCode, string>,
): Promise<Record<string, string>> {
  const adminEmail = (
    process.env.SEED_ADMIN_EMAIL ?? 'admin@ak-immo.local'
  ).toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminPassword) {
    throw new Error(
      'SEED_ADMIN_PASSWORD est requis. Renseignez-le dans backend/.env avant de lancer le seed.',
    );
  }

  const demoPassword = 'DemoAkImmo!2026';

  const users: SeedUser[] = [
    {
      email: adminEmail,
      firstName: 'Amadou',
      lastName: 'Keita',
      role: ROLES.ADMIN,
      password: adminPassword,
    },
    {
      email: 'gestionnaire1@ak-immo.local',
      firstName: 'Fatoumata',
      lastName: 'Diallo',
      role: ROLES.GESTIONNAIRE,
      password: demoPassword,
    },
    {
      email: 'gestionnaire2@ak-immo.local',
      firstName: 'Ibrahima',
      lastName: 'Barry',
      role: ROLES.GESTIONNAIRE,
      password: demoPassword,
    },
    {
      email: 'consultant@ak-immo.local',
      firstName: 'Mariama',
      lastName: 'Camara',
      role: ROLES.CONSULTANT,
      password: demoPassword,
    },
  ];

  const ids: Record<string, string> = {};

  for (const entry of users) {
    const passwordHash = await argon2.hash(entry.password, ARGON2_OPTIONS);

    const user = await prisma.user.upsert({
      where: { email: entry.email },
      // Le mot de passe n'est pas réécrit si le compte existe déjà : relancer
      // le seed ne doit pas réinitialiser un mot de passe choisi par ailleurs.
      update: { firstName: entry.firstName, lastName: entry.lastName },
      create: {
        email: entry.email,
        firstName: entry.firstName,
        lastName: entry.lastName,
        passwordHash,
        isActive: true,
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: roleIds[entry.role] } },
      update: {},
      create: { userId: user.id, roleId: roleIds[entry.role] },
    });

    ids[entry.email] = user.id;
  }

  console.log(`  ✓ ${users.length} utilisateurs`);
  console.log(`    admin        : ${adminEmail}`);
  console.log(`    démonstration: gestionnaire1@ak-immo.local / ${demoPassword}`);

  return ids;
}

// ---------------------------------------------------------------------------
// Étape 3 — géographie
// ---------------------------------------------------------------------------

const CITIES = [
  { name: 'Conakry', code: 'CKY', latitude: 9.6412, longitude: -13.5784 },
  { name: 'Kindia', code: 'KND', latitude: 10.0569, longitude: -12.8658 },
  { name: 'Boké', code: 'BOK', latitude: 10.9324, longitude: -14.2857 },
  { name: 'Kankan', code: 'KAN', latitude: 10.3854, longitude: -9.3057 },
  { name: 'Labé', code: 'LAB', latitude: 11.3182, longitude: -12.2833 },
];

const SITES = [
  { city: 'CKY', name: 'Lambanyi', code: 'CKY-LAM' },
  { city: 'CKY', name: 'Kipé', code: 'CKY-KIP' },
  { city: 'CKY', name: 'Nongo', code: 'CKY-NON' },
  { city: 'CKY', name: 'Sonfonia', code: 'CKY-SON' },
  { city: 'KND', name: 'Friguiagbé', code: 'KND-FRI' },
  { city: 'KND', name: 'Damakania', code: 'KND-DAM' },
  { city: 'BOK', name: 'Kamsar', code: 'BOK-KAM' },
  { city: 'BOK', name: 'Tanènè', code: 'BOK-TAN' },
  { city: 'KAN', name: 'Karifamoriah', code: 'KAN-KAR' },
  { city: 'LAB', name: 'Popodara', code: 'LAB-POP' },
];

async function seedGeography() {
  const locationIds = new Map<string, string>();

  for (const city of CITIES) {
    const location = await prisma.location.upsert({
      where: { code: city.code },
      update: { name: city.name },
      create: {
        name: city.name,
        code: city.code,
        type: LocationType.VILLE,
        country: 'GN',
        latitude: city.latitude,
        longitude: city.longitude,
      },
      select: { id: true },
    });

    locationIds.set(city.code, location.id);
  }

  const siteIds = new Map<string, string>();

  for (const site of SITES) {
    const created = await prisma.site.upsert({
      where: { code: site.code },
      update: { name: site.name },
      create: {
        name: site.name,
        code: site.code,
        locationId: locationIds.get(site.city)!,
        description: `Quartier ${site.name}`,
      },
      select: { id: true },
    });

    siteIds.set(site.code, created.id);
  }

  console.log(`  ✓ ${CITIES.length} villes, ${SITES.length} sites`);

  return { locationIds, siteIds };
}

// ---------------------------------------------------------------------------
// Étape 4 — terrains
// ---------------------------------------------------------------------------

const PROPERTY_STATUSES: PropertyStatus[] = [
  PropertyStatus.NON_AMENAGE,
  PropertyStatus.EN_AMENAGEMENT,
  PropertyStatus.AMENAGE,
  PropertyStatus.EN_PROJET,
  PropertyStatus.EN_LITIGE,
];

async function nextPropertyReference(): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<Array<{ value: bigint }>>(
    "SELECT nextval('property_reference_seq') AS value",
  );
  return `AK-IMM-${rows[0].value.toString().padStart(6, '0')}`;
}

async function seedProperties(
  geography: Awaited<ReturnType<typeof seedGeography>>,
  userIds: Record<string, string>,
  adminEmail: string,
) {
  const existing = await prisma.property.count();
  if (existing > 0) {
    console.log(`  · ${existing} terrains déjà présents, étape ignorée`);
    return prisma.property.findMany({ select: { id: true }, take: 20 });
  }

  const adminId = userIds[adminEmail];
  const managerIds = [
    userIds['gestionnaire1@ak-immo.local'],
    userIds['gestionnaire2@ak-immo.local'],
  ];

  const siteCodes = SITES.map((site) => site.code);
  const created: Array<{ id: string }> = [];

  for (let index = 0; index < 20; index += 1) {
    const site = SITES[index % siteCodes.length];
    const status = PROPERTY_STATUSES[index % PROPERTY_STATUSES.length];
    const areaHectares = 0.5 + (index % 8) * 1.25;

    const property = await prisma.property.create({
      data: {
        reference: await nextPropertyReference(),
        name: `Domaine ${site.name} ${index + 1}`,
        locationId: geography.locationIds.get(site.city)!,
        siteId: geography.siteIds.get(site.code)!,
        area: areaHectares * 10_000,
        areaUnit: AreaUnit.M2,
        areaSqm: areaHectares * 10_000,
        purchaseDate: new Date(2019 + (index % 6), index % 12, 1 + (index % 27)),
        sellerName: `Vendeur fictif ${index + 1}`,
        sellerContact: `+224 600 00 00 ${String(index + 10).padStart(2, '0')}`,
        status,
        description: `Terrain de démonstration situé à ${site.name}.`,
        notes: 'Donnée fictive générée par le seed de développement.',
        createdById: adminId,
        coordinates: {
          create: {
            label: 'Point principal',
            // Dispersion autour de la ville pour obtenir des markers distincts.
            latitude:
              CITIES.find((city) => city.code === site.city)!.latitude +
              (index % 7) * 0.004 -
              0.012,
            longitude:
              CITIES.find((city) => city.code === site.city)!.longitude +
              (index % 5) * 0.004 -
              0.008,
            altitude: 15 + (index % 40),
            isPrimary: true,
            pointOrder: 0,
          },
        },
        managers: {
          create: {
            userId: managerIds[index % managerIds.length],
            assignedById: adminId,
          },
        },
      },
      select: { id: true },
    });

    created.push(property);
  }

  console.log(`  ✓ ${created.length} terrains avec coordonnées et gestionnaire`);
  return created;
}

// ---------------------------------------------------------------------------
// Étape 5 — entreprises et projets
// ---------------------------------------------------------------------------

const COMPONENT_PLAN: Array<{ name: string; type: ProjectComponentType }> = [
  { name: 'École primaire', type: ProjectComponentType.ECOLE },
  { name: 'Résidence 24 logements', type: ProjectComponentType.RESIDENCE },
  { name: 'Galerie commerciale', type: ProjectComponentType.COMMERCE },
  { name: 'Parking couvert', type: ProjectComponentType.PARKING },
  { name: 'Centre de santé', type: ProjectComponentType.SANTE },
];

async function nextProjectReference(): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<Array<{ value: bigint }>>(
    "SELECT nextval('project_reference_seq') AS value",
  );
  return `AK-PRJ-${rows[0].value.toString().padStart(6, '0')}`;
}

async function seedProjects(
  properties: Array<{ id: string }>,
  userIds: Record<string, string>,
  adminEmail: string,
) {
  const existing = await prisma.project.count();
  if (existing > 0) {
    console.log(`  · ${existing} projets déjà présents, étape ignorée`);
    return;
  }

  const company = await prisma.company.create({
    data: {
      name: 'Entreprise Générale de Construction (fictive)',
      registrationNumber: 'RCCM-DEMO-0001',
      taxNumber: 'NIF-DEMO-0001',
      address: 'Immeuble de démonstration, Conakry',
      phone: '+224 600 00 00 00',
      email: 'contact@egc-demo.local',
      contactPerson: 'Directeur technique (fictif)',
      notes: 'Entreprise fictive créée par le seed de développement.',
    },
    select: { id: true },
  });

  const adminId = userIds[adminEmail];
  const statuses: ProjectStatus[] = [
    ProjectStatus.IDEE,
    ProjectStatus.EN_ETUDE,
    ProjectStatus.EN_ATTENTE_PERMIS,
    ProjectStatus.TRAVAUX_EN_COURS,
    ProjectStatus.TERMINE,
  ];

  for (let index = 0; index < 5; index += 1) {
    const property = await prisma.property.findFirstOrThrow({
      where: { id: properties[index].id },
      select: { id: true, locationId: true, siteId: true, name: true },
    });

    const status = statuses[index];

    await prisma.project.create({
      data: {
        reference: await nextProjectReference(),
        name: `Projet ${property.name}`,
        locationId: property.locationId,
        siteId: property.siteId,
        propertyId: property.id,
        companyId: company.id,
        managerId: userIds['gestionnaire1@ak-immo.local'],
        description: 'Projet de démonstration généré par le seed.',
        status,
        startDate: new Date(2024, index, 1),
        expectedEndDate: new Date(2027, index, 1),
        createdById: adminId,
        components: {
          create: COMPONENT_PLAN.slice(0, 2 + (index % 3)).map((component, i) => ({
            name: component.name,
            type: component.type,
            description: `Composante de démonstration ${i + 1}.`,
            area: 800 + i * 350,
            areaUnit: AreaUnit.M2,
            status:
              index >= 3 ? ComponentStatus.EN_CONSTRUCTION : ComponentStatus.PLANIFIE,
          })),
        },
        // L'historique n'est jamais écrasé (§18) : la ligne initiale trace
        // l'entrée du projet dans son premier statut.
        statusHistory: {
          create: {
            fromStatus: null,
            toStatus: status,
            comment: 'Création du projet (seed de développement).',
            changedById: adminId,
          },
        },
      },
    });
  }

  console.log('  ✓ 1 entreprise, 5 projets avec composantes et historique');
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('\nAK IMMO — seed de développement\n');

  console.log('[0/5] Objets SQL complémentaires');
  await applyPostMigrateSql();

  console.log('[1/5] Rôles et permissions');
  const roleIds = await seedRbac();

  console.log('[2/5] Utilisateurs');
  const userIds = await seedUsers(roleIds);
  const adminEmail = (
    process.env.SEED_ADMIN_EMAIL ?? 'admin@ak-immo.local'
  ).toLowerCase();

  console.log('[3/5] Villes et sites');
  const geography = await seedGeography();

  console.log('[4/5] Terrains');
  const properties = await seedProperties(geography, userIds, adminEmail);

  console.log('[5/5] Entreprises et projets');
  await seedProjects(properties, userIds, adminEmail);

  console.log('\nSeed terminé.\n');
}

main()
  .catch((error) => {
    console.error('\nÉchec du seed :', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
