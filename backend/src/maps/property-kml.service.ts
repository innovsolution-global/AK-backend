import { Injectable, NotFoundException } from '@nestjs/common';
import { GeoExtractionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatArea } from '../common/utils/area.util';
import {
  boundsOf,
  parcelRing,
  ringAreaSqm,
  ringCentroid,
  type GeoBoundsBox,
} from '../common/utils/geo.util';
import { KmlBuilderService } from './kml-builder.service';

export interface PropertyKmlDocument {
  fileName: string;
  kml: string;
  /** Centre de l'emprise (ou point principal), pour cadrer Google Earth. */
  center: { latitude: number; longitude: number } | null;
  bounds: GeoBoundsBox | null;
  /** Nombre de sommets de l'emprise dessinée (0 si simple repère). */
  vertexCount: number;
}

/**
 * Produit le fichier Google Earth d'un terrain (§12).
 *
 * Ne vérifie **aucun** droit : c'est au service appelant de s'assurer que
 * l'utilisateur ou le lien public est autorisé à voir ce terrain. Cela permet
 * de servir exactement le même document aux gestionnaires et aux bénéficiaires.
 */
@Injectable()
export class PropertyKmlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly builder: KmlBuilderService,
  ) {}

  async build(propertyId: string): Promise<PropertyKmlDocument> {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, deletedAt: null },
      select: {
        reference: true,
        name: true,
        status: true,
        areaSqm: true,
        description: true,
        googleMapsUrl: true,
        location: { select: { name: true } },
        site: { select: { name: true } },
        coordinates: {
          orderBy: [{ isPrimary: 'desc' }, { pointOrder: 'asc' }],
          select: {
            label: true,
            latitude: true,
            longitude: true,
            altitude: true,
            isPrimary: true,
          },
        },
        geoFiles: {
          where: {
            deletedAt: null,
            extractionStatus: {
              in: [GeoExtractionStatus.SUCCESS, GeoExtractionStatus.PARTIAL],
            },
          },
          orderBy: { createdAt: 'desc' },
          select: { extractedGeometry: true },
        },
      },
    });

    if (!property) {
      throw new NotFoundException({
        message: "Ce terrain n'existe pas.",
        error: 'NOT_FOUND',
      });
    }

    const coordinates = property.coordinates.map((point) => ({
      label: point.label,
      latitude: Number(point.latitude),
      longitude: Number(point.longitude),
      altitude: point.altitude === null ? null : Number(point.altitude),
      isPrimary: point.isPrimary,
    }));

    const ring = parcelRing(coordinates);
    const declaredArea = Number(property.areaSqm);
    const measured = ring.length >= 3 ? ringAreaSqm(ring) : 0;

    // Quand l'emprise est dessinée, on affiche les deux valeurs : un écart
    // notable entre titre et relevé est précisément ce qu'un acquéreur veut voir.
    const areaLabel =
      measured > 0 && Math.abs(measured - declaredArea) / declaredArea > 0.02
        ? `${formatArea(declaredArea)} (titre) · ${formatArea(measured)} (emprise)`
        : formatArea(declaredArea);

    const kml = this.builder.build({
      reference: property.reference,
      name: property.name,
      locationName: property.location.name,
      siteName: property.site?.name ?? null,
      areaLabel,
      status: property.status,
      description: property.description,
      googleMapsUrl: property.googleMapsUrl,
      coordinates,
      extractedGeometries: property.geoFiles
        .map((file) => file.extractedGeometry)
        .filter((geometry) => geometry !== null),
    });

    const primary = coordinates.find((point) => point.isPrimary) ?? coordinates[0];
    const center =
      ring.length >= 3
        ? ringCentroid(ring)
        : primary
          ? { latitude: primary.latitude, longitude: primary.longitude }
          : null;

    return {
      fileName: `${property.reference}.kml`,
      kml,
      center,
      bounds: boundsOf(coordinates),
      vertexCount: ring.length,
    };
  }
}
