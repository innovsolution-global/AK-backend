import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateSiteDto {
  @ApiProperty({ format: 'uuid', description: 'Ville de rattachement' })
  @IsUUID('4', { message: 'La ville doit être un UUID valide.' })
  locationId!: string;

  @ApiProperty({ example: 'Lambanyi' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères.' })
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'CKY-LAM' })
  @Transform(upper)
  @IsString()
  @Matches(/^[A-Z0-9-]{2,30}$/, {
    message:
      'Le code doit contenir 2 à 30 caractères : majuscules, chiffres ou tirets.',
  })
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;

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
}

export class UpdateSiteDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;

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
}

export class QuerySitesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  locationId?: string;
}
