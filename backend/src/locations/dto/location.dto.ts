import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsISO31661Alpha2,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { LocationType } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateLocationDto {
  @ApiProperty({ example: 'Conakry' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères.' })
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    example: 'CKY',
    description: 'Code court unique, en majuscules (lettres, chiffres, tirets).',
  })
  @Transform(upper)
  @IsString()
  @Matches(/^[A-Z0-9-]{2,20}$/, {
    message:
      'Le code doit contenir 2 à 20 caractères : majuscules, chiffres ou tirets.',
  })
  code!: string;

  @ApiProperty({ enum: LocationType, default: LocationType.VILLE })
  @IsEnum(LocationType, {
    message: `Le type doit valoir : ${Object.values(LocationType).join(', ')}.`,
  })
  type!: LocationType;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Entité parente — une ville appartient à une préfecture.',
  })
  @IsOptional()
  @IsUUID('4', { message: "L'identifiant parent doit être un UUID valide." })
  parentId?: string;

  @ApiPropertyOptional({ default: 'GN' })
  @IsOptional()
  @Transform(upper)
  @IsISO31661Alpha2({ message: 'Le code pays doit suivre la norme ISO 3166-1 alpha-2.' })
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  region?: string;

  @ApiPropertyOptional({ example: 9.6412 })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude({ message: 'La latitude doit être comprise entre -90 et 90.' })
  latitude?: number;

  @ApiPropertyOptional({ example: -13.5784 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude({ message: 'La longitude doit être comprise entre -180 et 180.' })
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class UpdateLocationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(LocationType)
  type?: LocationType;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  parentId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  region?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class QueryLocationsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: LocationType })
  @IsOptional()
  @IsEnum(LocationType)
  type?: LocationType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  parentId?: string;
}
