import { NotFoundException } from '@nestjs/common';
import { ShareStatus } from '@prisma/client';
import type { AuditService } from '../audit/audit.service';
import type { AppConfigService } from '../config/app-config.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { PropertyKmlService } from '../maps/property-kml.service';
import { EarthLinkService } from './earth-link.service';

const SHARE_ID = '3f2b1c9e-8d7a-4b6c-9e1f-2a3b4c5d6e7f';
const OTHER_SHARE_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

function build(overrides: { share?: unknown } = {}) {
  const prisma = {
    propertyShare: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          'share' in overrides
            ? overrides.share
            : { id: SHARE_ID, userId: 'user-1', propertyId: 'property-1' },
        ),
      update: jest.fn().mockResolvedValue(undefined),
    },
  } as unknown as PrismaService;

  const config = {
    frontendUrl: 'https://patrimoine.example',
    apiPrefix: 'api',
    earthLinkSecret: 'x'.repeat(64),
  } as unknown as AppConfigService;

  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;

  const propertyKml = {
    build: jest.fn().mockResolvedValue({
      fileName: 'AK-IMM-000001.kml',
      kml: '<kml/>',
      center: null,
      bounds: null,
      vertexCount: 4,
    }),
  } as unknown as PropertyKmlService;

  return {
    service: new EarthLinkService(prisma, config, audit, propertyKml),
    prisma,
    audit,
    propertyKml,
  };
}

describe('EarthLinkService', () => {
  it('produit une URL stable, suffixée .kml, sans identifiant en clair', () => {
    const { service } = build();

    const first = service.buildUrl(SHARE_ID);
    const second = service.buildUrl(SHARE_ID);

    expect(first).toBe(second);
    expect(first).toMatch(
      /^https:\/\/patrimoine\.example\/api\/public\/earth\/[A-Za-z0-9_-]+\.kml$/,
    );
    expect(first).not.toContain(SHARE_ID);
  });

  it('résout un token valide vers le KML du bien partagé et trace l’accès', async () => {
    const { service, prisma, audit, propertyKml } = build();
    const token = service.buildUrl(SHARE_ID).split('/').pop()!;

    const document = await service.resolve(token, { ip: '127.0.0.1' });

    expect(document.kml).toBe('<kml/>');
    expect(propertyKml.build).toHaveBeenCalledWith('property-1');

    const where = (prisma.propertyShare.findFirst as jest.Mock).mock.calls[0][0].where;
    expect(where.id).toBe(SHARE_ID);
    expect(where.allowGoogleEarth).toBe(true);
    expect(where.status.in).toEqual([ShareStatus.PENDING, ShareStatus.ACTIVE]);

    expect(prisma.propertyShare.update).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        metadata: expect.objectContaining({ via: 'EARTH_LINK' }),
      }),
    );
  });

  it('rejette un token dont la signature ne correspond pas', async () => {
    const { service, prisma } = build();
    const token = service
      .buildUrl(SHARE_ID)
      .split('/')
      .pop()!
      .replace(/\.kml$/, '');

    // Même longueur, dernier caractère altéré : la signature ne colle plus.
    const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');

    await expect(service.resolve(`${tampered}.kml`, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.propertyShare.findFirst).not.toHaveBeenCalled();
  });

  it('rejette un token signé pour un autre partage greffé sur cet identifiant', async () => {
    const { service, prisma } = build();
    const validForOther = service
      .buildUrl(OTHER_SHARE_ID)
      .split('/')
      .pop()!
      .replace(/\.kml$/, '');

    const bytes = Buffer.from(validForOther, 'base64url');
    const forged = Buffer.concat([
      Buffer.from(SHARE_ID.replace(/-/g, ''), 'hex'),
      bytes.subarray(16),
    ]).toString('base64url');

    await expect(service.resolve(forged, {})).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.propertyShare.findFirst).not.toHaveBeenCalled();
  });

  it('rejette un token malformé sans toucher à la base', async () => {
    const { service, prisma } = build();

    await expect(service.resolve('pas-un-token.kml', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.propertyShare.findFirst).not.toHaveBeenCalled();
  });

  it('renvoie 404 quand le partage est révoqué, expiré ou sans option Google Earth', async () => {
    const { service, propertyKml } = build({ share: null });
    const token = service.buildUrl(SHARE_ID).split('/').pop()!;

    await expect(service.resolve(token, {})).rejects.toBeInstanceOf(NotFoundException);
    expect(propertyKml.build).not.toHaveBeenCalled();
  });
});
