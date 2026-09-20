import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/**
 * Paramètres de liste communs à toutes les collections (§24).
 *
 * Les DTO de requête spécifiques étendent cette classe et y ajoutent leurs
 * propres filtres.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: DEFAULT_PAGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page doit être un entier' })
  @Min(1, { message: 'page doit être supérieur ou égal à 1' })
  page: number = DEFAULT_PAGE;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit doit être un entier' })
  @Min(1, { message: 'limit doit être supérieur ou égal à 1' })
  @Max(MAX_LIMIT, { message: `limit ne peut pas dépasser ${MAX_LIMIT}` })
  limit: number = DEFAULT_LIMIT;

  @ApiPropertyOptional({ description: 'Champ de tri' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sort?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @Transform(({ value }) => String(value).toLowerCase())
  @IsIn(['asc', 'desc'], { message: "order doit valoir 'asc' ou 'desc'" })
  order: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({ description: 'Recherche plein texte' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }

  /**
   * Construit la clause `orderBy` Prisma en n'acceptant que des champs
   * explicitement autorisés — un `sort` arbitraire venu du client ne doit
   * jamais atteindre la requête.
   */
  buildOrderBy<T extends string>(
    allowedFields: readonly T[],
    fallback: T,
  ): Record<string, 'asc' | 'desc'> {
    const field =
      this.sort && (allowedFields as readonly string[]).includes(this.sort)
        ? this.sort
        : fallback;

    return { [field]: this.order };
  }
}
