import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ROLES, type RoleCode } from '../../common/constants/rbac.constants';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../../auth/dto/auth.dto';

/**
 * Rôles qu'un administrateur peut attribuer.
 *
 * `UTILISATEUR_PARTAGE` en est exclu : ce rôle est réservé aux comptes créés par
 * l'activation d'un partage (§21) et ne doit jamais être posé manuellement, ni
 * cumulé avec un autre.
 */
export const ASSIGNABLE_ROLES: RoleCode[] = [
  ROLES.ADMIN,
  ROLES.GESTIONNAIRE,
  ROLES.CONSULTANT,
];

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateUserDto {
  @ApiProperty()
  @Transform(normalizeEmail)
  @IsEmail({}, { message: "L'adresse email est invalide." })
  @MaxLength(255)
  email!: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiProperty({ enum: ASSIGNABLE_ROLES, isArray: true })
  @IsArray()
  @IsIn(ASSIGNABLE_ROLES, {
    each: true,
    message: `Rôle invalide. Valeurs acceptées : ${ASSIGNABLE_ROLES.join(', ')}.`,
  })
  roles!: RoleCode[];

  /**
   * Optionnel : sans mot de passe, le compte est créé inactif et l'utilisateur
   * reçoit un lien d'activation — préférable à un mot de passe transmis par un
   * tiers (§21).
   */
  @ApiPropertyOptional({ minLength: PASSWORD_MIN_LENGTH })
  @IsOptional()
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`,
  })
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message:
      'Le mot de passe doit contenir au moins une minuscule, une majuscule et un chiffre.',
  })
  password?: string;
}

/**
 * Email et mot de passe ne figurent pas ici : ils ont leurs propres parcours
 * (vérification d'adresse, réinitialisation) et ne sont pas modifiables par
 * cette route.
 */
export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ enum: ASSIGNABLE_ROLES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(ASSIGNABLE_ROLES, { each: true })
  roles?: RoleCode[];
}

export class AssignRoleDto {
  @ApiProperty({ enum: ASSIGNABLE_ROLES })
  @IsIn(ASSIGNABLE_ROLES, {
    message: `Rôle invalide. Valeurs acceptées : ${ASSIGNABLE_ROLES.join(', ')}.`,
  })
  role!: RoleCode;
}

export class QueryUsersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: Object.values(ROLES) })
  @IsOptional()
  @IsIn(Object.values(ROLES))
  role?: RoleCode;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;
}

export class UserIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  id!: string;
}

// --- Réponse ---------------------------------------------------------------

export class UserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiPropertyOptional() phone?: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiPropertyOptional() emailVerifiedAt?: Date | null;
  @ApiPropertyOptional() lastLoginAt?: Date | null;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty() createdAt!: Date;
}
