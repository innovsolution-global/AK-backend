import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Champ facultatif : une chaîne vide devient `null`. En modification, vider
 * un champ l'efface réellement ; et un email ou un site vide n'échoue plus sur
 * la validation de format (`@IsOptional` ignore `null`).
 */
const trimOrNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export class CreateCompanyDto {
  @ApiProperty({ example: 'Entreprise Générale de Construction' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères.' })
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: "Numéro d'enregistrement (RCCM)" })
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(100)
  registrationNumber?: string | null;

  @ApiPropertyOptional({ description: 'Numéro fiscal (NIF)' })
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(100)
  taxNumber?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const normalized = value.trim().toLowerCase();
    return normalized === '' ? null : normalized;
  })
  @IsEmail({}, { message: "L'adresse email est invalide." })
  @MaxLength(255)
  email?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOrNull)
  @IsUrl(
    { require_protocol: true },
    { message: 'Le site web doit être une URL complète (https://…).' },
  )
  @MaxLength(500)
  website?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(200)
  contactPerson?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(5000)
  notes?: string | null;
}

export class UpdateCompanyDto extends CreateCompanyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  declare name: string;
}

export class QueryCompaniesDto extends PaginationQueryDto {}
