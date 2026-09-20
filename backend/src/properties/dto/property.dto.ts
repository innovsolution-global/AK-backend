import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AreaUnit, PropertyStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' || value === true;

// --- Coordonnées ------------------------------------------------------------

export class CoordinateDto {
  @ApiPropertyOptional({ example: 'Borne nord-est' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  label?: string;

  @ApiProperty({ example: 9.6412 })
  @Type(() => Number)
  @IsLatitude({ message: 'La latitude doit être comprise entre -90 et 90.' })
  latitude!: number;

  @ApiProperty({ example: -13.5784 })
  @Type(() => Number)
  @IsLongitude({ message: 'La longitude doit être comprise entre -180 et 180.' })
  longitude!: number;

  @ApiPropertyOptional({ example: 23.5, description: 'Altitude en mètres' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: "L'altitude doit être un nombre." })
  @Min(-500)
  @Max(9000)
  altitude?: number;

  @ApiPropertyOptional({ default: 0, description: "Ordre du point dans l'emprise" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  pointOrder?: number;

  @ApiPropertyOptional({
    default: false,
    description: 'Point affiché sur la carte générale — un seul par terrain.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isPrimary?: boolean;
}

export class ReplaceCoordinatesDto {
  @ApiProperty({ type: [CoordinateDto] })
  @IsArray()
  @ArrayMaxSize(500, {
    message: "Une emprise ne peut pas dépasser 500 points ; utilisez un fichier KML.",
  })
  @ValidateNested({ each: true })
  @Type(() => CoordinateDto)
  coordinates!: CoordinateDto[];
}

// --- Terrain ----------------------------------------------------------------

export class CreatePropertyDto {
  @ApiProperty({ example: 'Domaine Lambanyi 1' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères.' })
  @MaxLength(200)
  name!: string;

  @ApiProperty({ format: 'uuid', description: 'Ville' })
  @IsUUID('4', { message: 'La ville doit être un UUID valide.' })
  locationId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Site / quartier' })
  @IsOptional()
  @IsUUID('4', { message: 'Le site doit être un UUID valide.' })
  siteId?: string;

  @ApiProperty({ example: 12500.5, description: 'Superficie, dans l\'unité indiquée' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'La superficie doit être un nombre.' })
  @IsPositive({ message: 'La superficie doit être strictement positive.' })
  @Max(1_000_000_000)
  area!: number;

  @ApiProperty({ enum: AreaUnit, default: AreaUnit.M2 })
  @IsEnum(AreaUnit, {
    message: `L'unité doit valoir : ${Object.values(AreaUnit).join(', ')}.`,
  })
  areaUnit!: AreaUnit;

  @ApiPropertyOptional({ format: 'date', example: '2024-03-15' })
  @IsOptional()
  @IsDateString({}, { message: "La date d'achat doit être au format ISO (AAAA-MM-JJ)." })
  purchaseDate?: string;

  @ApiPropertyOptional({ description: 'Sessionnaire / vendeur' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  sellerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  sellerContact?: string;

  @ApiPropertyOptional({ enum: PropertyStatus, default: PropertyStatus.NON_AMENAGE })
  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @ApiPropertyOptional({ example: 'https://maps.google.com/?q=9.6412,-13.5784' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  googleMapsUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  googleEarthUrl?: string;

  @ApiPropertyOptional({
    type: [CoordinateDto],
    description: 'Coordonnées créées avec le terrain.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CoordinateDto)
  coordinates?: CoordinateDto[];

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Gestionnaires responsables du bien.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  managerIds?: string[];
}

export class UpdatePropertyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  siteId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000_000)
  area?: number;

  @ApiPropertyOptional({ enum: AreaUnit })
  @IsOptional()
  @IsEnum(AreaUnit)
  areaUnit?: AreaUnit;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  sellerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  sellerContact?: string;

  @ApiPropertyOptional({ enum: PropertyStatus })
  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  googleMapsUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  googleEarthUrl?: string;
}

export class QueryPropertiesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PropertyStatus })
  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  siteId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  managerId?: string;

  @ApiPropertyOptional({ description: 'Superficie minimale, en m²' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minArea?: number;

  @ApiPropertyOptional({ description: 'Superficie maximale, en m²' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxArea?: number;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  purchasedFrom?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  purchasedTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasCoordinates?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasDocuments?: boolean;
}

export class AssignManagersDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  managerIds!: string[];
}
