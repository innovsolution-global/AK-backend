import { Injectable } from '@nestjs/common';
import { Prisma, PropertyStatus } from '@prisma/client';
import { PropertiesRepository } from '../properties/properties.repository';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { QueryMapDto } from './dto/map.dto';

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

export interface MapBounds {
  minLatitude: number;
  minLongitude: number;
  maxLatitude: number;
  maxLongitude: number;
  center: { latitude: number; longitude: number };
  count: number;
}

@Injectable()
export class MapsService {
  constructor(private readonly properties: PropertiesRepository) {}

  /**
   * Markers de la carte du patrimoine (§11).
   *
   * Projection volontairement minimale : une carte affichant plusieurs milliers
   * de terrains ne doit pas transporter les fiches complètes. Le détail est
   * chargé à l'ouverture de la popup.
   */
  async findMarkers(
    user: AuthenticatedUser,
    query: QueryMapDto,
  ): Promise<MapMarker[]> {
    const properties = await this.properties.findForMap(
      user,
      this.buildFilters(query),
    );

    return properties.flatMap((property) => {
      const point = property.coordinates[0];
      if (!point) return [];

      return [
        {
          id: property.id,
          reference: property.reference,
          name: property.name,
          status: property.status,
          latitude: Number(point.latitude),
          longitude: Number(point.longitude),
          areaSqm: Number(property.areaSqm),
          locationName: property.location.name,
          siteName: property.site?.name ?? null,
        },
      ];
    });
  }

  /**
   * Emprise globale du patrimoine visible, pour un cadrage initial.
   * Renvoie `null` si aucun terrain n'a de coordonnées : le frontend applique
   * alors son cadrage par défaut plutôt qu'un centre calculé sur zéro point.
   */
  async findBounds(
    user: AuthenticatedUser,
    query: QueryMapDto,
  ): Promise<MapBounds | null> {
    const markers = await this.findMarkers(user, query);

    if (markers.length === 0) return null;

    const latitudes = markers.map((marker) => marker.latitude);
    const longitudes = markers.map((marker) => marker.longitude);

    const minLatitude = Math.min(...latitudes);
    const maxLatitude = Math.max(...latitudes);
    const minLongitude = Math.min(...longitudes);
    const maxLongitude = Math.max(...longitudes);

    return {
      minLatitude,
      minLongitude,
      maxLatitude,
      maxLongitude,
      center: {
        latitude: (minLatitude + maxLatitude) / 2,
        longitude: (minLongitude + maxLongitude) / 2,
      },
      count: markers.length,
    };
  }

  private buildFilters(query: QueryMapDto): Prisma.PropertyWhereInput {
    const filters: Prisma.PropertyWhereInput = {};

    if (query.status) filters.status = query.status;
    if (query.locationId) filters.locationId = query.locationId;
    if (query.siteId) filters.siteId = query.siteId;

    if (query.search) {
      filters.OR = [
        { reference: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return filters;
  }
}
