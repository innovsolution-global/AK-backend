import { LocationType } from '@prisma/client';

/**
 * Découpage administratif de la Guinée (§6).
 *
 * Source : fichier de référence fourni par le maître d'ouvrage — sept régions
 * administratives, leurs 33 préfectures, et Conakry, zone spéciale découpée en
 * douze communes.
 *
 * Les codes sont **figés ici** plutôt que dérivés du nom : une dérivation
 * produirait des collisions (Koundara / Kouroussa) et un code déjà imprimé sur
 * un document ne doit jamais changer parce qu'une localité a été ajoutée.
 * Ceux de Conakry, Kindia, Boké, Kankan, Labé et Dubréka reprennent les codes
 * historiques de l'application.
 */
export interface GuineaLocality {
  name: string;
  code: string;
  type: LocationType;
  /** Région administrative de rattachement ; « Conakry » pour la zone spéciale. */
  region: string;
  /** Code de la localité parente — les communes de Conakry uniquement. */
  parentCode?: string;
}

export const GUINEA_REGIONS = [
  'Boké',
  'Kindia',
  'Mamou',
  'Labé',
  'Faranah',
  'Kankan',
  "N'zérékoré",
  'Conakry',
] as const;

export const GUINEA_LOCALITIES: GuineaLocality[] = [
  // --- Région de Boké --------------------------------------------------------
  { name: 'Boké', code: 'BOK', type: LocationType.PREFECTURE, region: 'Boké' },
  { name: 'Boffa', code: 'BOF', type: LocationType.PREFECTURE, region: 'Boké' },
  { name: 'Fria', code: 'FRI', type: LocationType.PREFECTURE, region: 'Boké' },
  { name: 'Gaoual', code: 'GAO', type: LocationType.PREFECTURE, region: 'Boké' },
  { name: 'Koundara', code: 'KDR', type: LocationType.PREFECTURE, region: 'Boké' },

  // --- Région de Kindia ------------------------------------------------------
  { name: 'Coyah', code: 'COY', type: LocationType.PREFECTURE, region: 'Kindia' },
  { name: 'Dubréka', code: 'DBK', type: LocationType.PREFECTURE, region: 'Kindia' },
  { name: 'Forécariah', code: 'FOR', type: LocationType.PREFECTURE, region: 'Kindia' },
  { name: 'Kindia', code: 'KND', type: LocationType.PREFECTURE, region: 'Kindia' },
  { name: 'Télimélé', code: 'TEL', type: LocationType.PREFECTURE, region: 'Kindia' },

  // --- Région de Mamou -------------------------------------------------------
  { name: 'Dalaba', code: 'DAL', type: LocationType.PREFECTURE, region: 'Mamou' },
  { name: 'Mamou', code: 'MAM', type: LocationType.PREFECTURE, region: 'Mamou' },
  { name: 'Pita', code: 'PIT', type: LocationType.PREFECTURE, region: 'Mamou' },

  // --- Région de Labé --------------------------------------------------------
  { name: 'Koubia', code: 'KBA', type: LocationType.PREFECTURE, region: 'Labé' },
  { name: 'Labé', code: 'LAB', type: LocationType.PREFECTURE, region: 'Labé' },
  { name: 'Lélouma', code: 'LEL', type: LocationType.PREFECTURE, region: 'Labé' },
  { name: 'Mali', code: 'MAL', type: LocationType.PREFECTURE, region: 'Labé' },
  { name: 'Tougué', code: 'TOU', type: LocationType.PREFECTURE, region: 'Labé' },

  // --- Région de Faranah -----------------------------------------------------
  { name: 'Dabola', code: 'DAB', type: LocationType.PREFECTURE, region: 'Faranah' },
  { name: 'Faranah', code: 'FAR', type: LocationType.PREFECTURE, region: 'Faranah' },
  { name: 'Dinguiraye', code: 'DIN', type: LocationType.PREFECTURE, region: 'Faranah' },
  { name: 'Kissidougou', code: 'KIS', type: LocationType.PREFECTURE, region: 'Faranah' },

  // --- Région de Kankan ------------------------------------------------------
  { name: 'Kankan', code: 'KAN', type: LocationType.PREFECTURE, region: 'Kankan' },
  { name: 'Kérouané', code: 'KER', type: LocationType.PREFECTURE, region: 'Kankan' },
  { name: 'Kouroussa', code: 'KOU', type: LocationType.PREFECTURE, region: 'Kankan' },
  { name: 'Mandiana', code: 'MAN', type: LocationType.PREFECTURE, region: 'Kankan' },
  { name: 'Siguiri', code: 'SIG', type: LocationType.PREFECTURE, region: 'Kankan' },

  // --- Région de N'zérékoré --------------------------------------------------
  { name: 'Beyla', code: 'BEY', type: LocationType.PREFECTURE, region: "N'zérékoré" },
  { name: 'Guéckédou', code: 'GUE', type: LocationType.PREFECTURE, region: "N'zérékoré" },
  { name: 'Lola', code: 'LOL', type: LocationType.PREFECTURE, region: "N'zérékoré" },
  { name: 'Macenta', code: 'MAC', type: LocationType.PREFECTURE, region: "N'zérékoré" },
  {
    name: "N'zérékoré",
    code: 'NZE',
    type: LocationType.PREFECTURE,
    region: "N'zérékoré",
  },
  { name: 'Yomou', code: 'YOM', type: LocationType.PREFECTURE, region: "N'zérékoré" },

  // --- Conakry, zone spéciale, et ses communes -------------------------------
  { name: 'Conakry', code: 'CKY', type: LocationType.VILLE, region: 'Conakry' },
  {
    name: 'Kaloum',
    code: 'KLM',
    type: LocationType.COMMUNE,
    region: 'Conakry',
    parentCode: 'CKY',
  },
  {
    name: 'Dixinn',
    code: 'DIX',
    type: LocationType.COMMUNE,
    region: 'Conakry',
    parentCode: 'CKY',
  },
  {
    name: 'Matam',
    code: 'MTM',
    type: LocationType.COMMUNE,
    region: 'Conakry',
    parentCode: 'CKY',
  },
  {
    name: 'Ratoma',
    code: 'RTM',
    type: LocationType.COMMUNE,
    region: 'Conakry',
    parentCode: 'CKY',
  },
  {
    name: 'Matoto',
    code: 'MTT',
    type: LocationType.COMMUNE,
    region: 'Conakry',
    parentCode: 'CKY',
  },
  {
    name: 'Lambanyi',
    code: 'LBY',
    type: LocationType.COMMUNE,
    region: 'Conakry',
    parentCode: 'CKY',
  },
  {
    name: 'Sonfonia',
    code: 'SFN',
    type: LocationType.COMMUNE,
    region: 'Conakry',
    parentCode: 'CKY',
  },
  {
    name: 'Kagbelen',
    code: 'KGB',
    type: LocationType.COMMUNE,
    region: 'Conakry',
    parentCode: 'CKY',
  },
  {
    name: 'Tombolia',
    code: 'TBL',
    type: LocationType.COMMUNE,
    region: 'Conakry',
    parentCode: 'CKY',
  },
  {
    name: 'Gbessia',
    code: 'GBS',
    type: LocationType.COMMUNE,
    region: 'Conakry',
    parentCode: 'CKY',
  },
  {
    name: 'Manéah',
    code: 'MNH',
    type: LocationType.COMMUNE,
    region: 'Conakry',
    parentCode: 'CKY',
  },
  {
    name: 'Sanoyah',
    code: 'SNY',
    type: LocationType.COMMUNE,
    region: 'Conakry',
    parentCode: 'CKY',
  },
];

/**
 * Normalise un nom pour la comparaison : sans accents, sans ponctuation, en
 * minuscules. « N'zérékoré », « Nzerekore » et « N’Zérékoré » désignent la même
 * localité — une comparaison brute créerait des doublons à chaque import.
 */
export function normalizeLocalityName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}
