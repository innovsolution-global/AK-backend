import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ShareStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const toBoolean = ({ value }: { value: unknown }) => value === 'true' || value === true;

export class CreateShareDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Le prénom doit contenir au moins 2 caractères.' })
  @MaxLength(100)
  firstName!: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères.' })
  @MaxLength(100)
  lastName!: string;

  @ApiProperty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: "L'adresse email est invalide." })
  @MaxLength(255)
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ description: "Message joint à l'invitation" })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  message?: string;

  @ApiProperty({
    format: 'date-time',
    description: "Date d'expiration de l'accès — obligatoirement future.",
  })
  @IsDateString({}, { message: "La date d'expiration doit être au format ISO." })
  expiresAt!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  allowDocuments?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  allowCoordinates?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  allowGoogleEarth?: boolean;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      "Liste blanche des documents visibles. Sans cette liste, aucun document n'est accessible.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  documentIds?: string[];
}

export class QuerySharesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ShareStatus })
  @IsOptional()
  @IsEnum(ShareStatus)
  status?: ShareStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  propertyId?: string;

  /**
   * Ne garde que les accès qui prennent fin dans les N jours (§27).
   *
   * C'est le filtre derrière l'indicateur « Expirent sous 7 jours » : sans
   * lui, cliquer dessus ramenait tous les accès actifs, et l'échéance qu'on
   * cherchait restait noyée dans la liste. Un partage déjà expiré en est
   * exclu — il n'y a plus rien à renouveler, son statut l'a déjà dit.
   */
  @ApiPropertyOptional({ minimum: 1, maximum: 365, description: 'Expire dans N jours' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  expiringInDays?: number;
}
