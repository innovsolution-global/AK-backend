import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { BuildingPermitStatus } from '@prisma/client';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateBuildingPermitDto {
  @ApiProperty({ example: 'PC-2026-00145' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Le numéro doit contenir au moins 2 caractères.' })
  @MaxLength(100)
  number!: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString({}, { message: "La date d'émission doit être au format ISO." })
  issueDate?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString({}, { message: "La date d'expiration doit être au format ISO." })
  expiryDate?: string;

  @ApiPropertyOptional({ example: 'Direction de l\'urbanisme' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  authority?: string;

  @ApiPropertyOptional({
    enum: BuildingPermitStatus,
    default: BuildingPermitStatus.EN_ATTENTE,
  })
  @IsOptional()
  @IsEnum(BuildingPermitStatus, {
    message: `Le statut doit valoir : ${Object.values(BuildingPermitStatus).join(', ')}.`,
  })
  status?: BuildingPermitStatus;

  @ApiPropertyOptional({ format: 'uuid', description: 'Document associé' })
  @IsOptional()
  @IsUUID('4')
  documentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class UpdateBuildingPermitDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  number?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  authority?: string;

  @ApiPropertyOptional({ enum: BuildingPermitStatus })
  @IsOptional()
  @IsEnum(BuildingPermitStatus)
  status?: BuildingPermitStatus;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  documentId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  notes?: string;
}
