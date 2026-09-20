import { ApiProperty } from '@nestjs/swagger';

export class PaginationMeta {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
  @ApiProperty({ required: false }) sort?: string;
  @ApiProperty({ required: false, enum: ['asc', 'desc'] }) order?: 'asc' | 'desc';
}

/**
 * Résultat paginé renvoyé par les services.
 * `ResponseEnvelopeInterceptor` le reconnaît et l'aplatit en
 * `{ success, data, meta }`.
 */
export class PaginatedResult<T> {
  readonly data: T[];
  readonly meta: PaginationMeta;

  constructor(data: T[], meta: PaginationMeta) {
    this.data = data;
    this.meta = meta;
  }

  static from<T>(
    data: T[],
    total: number,
    query: { page: number; limit: number; sort?: string; order?: 'asc' | 'desc' },
  ): PaginatedResult<T> {
    return new PaginatedResult(data, {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: query.limit > 0 ? Math.ceil(total / query.limit) : 0,
      sort: query.sort,
      order: query.order,
    });
  }

  /** Applique une projection aux éléments en conservant la pagination. */
  map<U>(transform: (item: T) => U): PaginatedResult<U> {
    return new PaginatedResult(this.data.map(transform), this.meta);
  }
}
