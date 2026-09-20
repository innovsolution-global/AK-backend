import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ProjectDocumentType } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UploadProjectDocumentDto {
  @ApiProperty({ example: 'Étude géotechnique — phase 1' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères.' })
  @MaxLength(200)
  name!: string;

  @ApiProperty({ enum: ProjectDocumentType })
  @IsEnum(ProjectDocumentType, {
    message: `Le type doit valoir : ${Object.values(ProjectDocumentType).join(', ')}.`,
  })
  type!: ProjectDocumentType;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Composante concernée, si le document ne vise pas tout le projet.',
  })
  @IsOptional()
  @IsUUID('4')
  componentId?: string;
}

export class QueryProjectDocumentsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ProjectDocumentType })
  @IsOptional()
  @IsEnum(ProjectDocumentType)
  type?: ProjectDocumentType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  componentId?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  includeVersions?: boolean;
}
