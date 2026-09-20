import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ShareStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../../auth/dto/auth.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' || value === true;

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
      'Liste blanche des documents visibles. Sans cette liste, aucun document n\'est accessible.',
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
}

export class ActivateShareDto {
  @ApiProperty({ description: "Token reçu dans l'email d'invitation" })
  @IsString()
  @MinLength(10)
  @MaxLength(255)
  token!: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, format: 'password' })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`,
  })
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message:
      'Le mot de passe doit contenir au moins une minuscule, une majuscule et un chiffre.',
  })
  password!: string;
}

export class ValidateTokenResponseDto {
  @ApiProperty() valid!: boolean;
  @ApiPropertyOptional() propertyReference?: string;
  @ApiPropertyOptional() beneficiaryFirstName?: string;
  @ApiPropertyOptional() expiresAt?: Date;
  @ApiPropertyOptional() requiresPassword?: boolean;
}
