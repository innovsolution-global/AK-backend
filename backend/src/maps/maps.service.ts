import { Injectable } from '@nestjs/common';
import { Prisma, PropertyStatus } from '@prisma/client';
import { PropertiesRepository } from '../properties/properties.repository';
import { parcelRing, ringAreaSqm } from '../common/utils/geo.util';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { QueryMapDto } from './dto/map.dto';

/** Emprise d'un terrain au format GeoJSON, directement consommable par Leaflet. */
export interface ParcelFeature {
  type: 'Feature';
  id: string;
  geometry: { type: 'Polygon'; coordinates: number[][][] };
  properties: {
    id: string;
    reference: string;
    name: string;
    status: PropertyStatus;
    areaSqm: number;
    measuredAreaSqm: number;
    locationName: string;
    siteName: string | null;
    vertexCount: number;
  };
}

export interface ParcelCollection {
  type: 'FeatureCollection';
  features: ParcelFeature[];
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
  async findMarkers(user: AuthenticatedUser, query: QueryMapDto): Promise<MapMarker[]> {
    const properties = await this.properties.findForMap(user, this.buildFilters(query));

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
   * Emprises des terrains (§11) : un polygone par terrain qui possède au moins
   * trois bornes. Les terrains réduits à un point restent représentés par leur
   * marker — c'est la combinaison des deux couches qui fait la carte.
   */
  async findParcels(
    user: AuthenticatedUser,
    query: QueryMapDto,
  ): Promise<ParcelCollection> {
    const properties = await this.properties.findForParcels(
      user,
      this.buildFilters(query),
    );

    const features = properties.flatMap<ParcelFeature>((property) => {
      const points = property.coordinates.map((point) => ({
        latitude: Number(point.latitude),
        longitude: Number(point.longitude),
        isPrimary: point.isPrimary,
      }));

      const ring = parcelRing(points);
      if (ring.length < 3) return [];

      // GeoJSON : [longitude, latitude], anneau fermé.
      const coordinates = [...ring, ring[0]].map((point) => [
        point.longitude,
        point.latitude,
      ]);

      return [
        {
          type: 'Feature',
          id: property.id,
          geometry: { type: 'Polygon', coordinates: [coordinates] },
          properties: {
            id: property.id,
            reference: property.reference,
            name: property.name,
            status: property.status,
            areaSqm: Number(property.areaSqm),
            measuredAreaSqm: ringAreaSqm(ring),
            locationName: property.location.name,
            siteName: property.site?.name ?? null,
            vertexCount: ring.length,
          },
        },
      ];
    });

    return { type: 'FeatureCollection', features };
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
