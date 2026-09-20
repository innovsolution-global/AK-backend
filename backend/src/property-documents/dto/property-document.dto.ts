import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PropertyDocumentType } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UploadPropertyDocumentDto {
  @ApiProperty({ example: 'Titre foncier — parcelle nord' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères.' })
  @MaxLength(200)
  name!: string;

  @ApiProperty({ enum: PropertyDocumentType })
  @IsEnum(PropertyDocumentType, {
    message: `Le type doit valoir : ${Object.values(PropertyDocumentType).join(', ')}.`,
  })
  type!: PropertyDocumentType;
}

export class UploadDocumentVersionDto {
  @ApiPropertyOptional({
    description: "Nouveau libellé ; conserve celui de la version précédente si absent.",
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;
}

export class QueryPropertyDocumentsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PropertyDocumentType })
  @IsOptional()
  @IsEnum(PropertyDocumentType)
  type?: PropertyDocumentType;

  @ApiPropertyOptional({
    default: false,
    description: "Inclure l'historique des versions antérieures.",
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  includeVersions?: boolean;
}

export class DocumentDownloadResponseDto {
  @ApiProperty({ description: 'URL signée à durée limitée' })
  url!: string;

  @ApiProperty({ description: 'Durée de validité en secondes' })
  expiresIn!: number;

  @ApiProperty() fileName!: string;
  @ApiProperty() mimeType!: string;
}
