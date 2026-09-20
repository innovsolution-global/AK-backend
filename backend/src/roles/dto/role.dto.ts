import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class UpdateRolePermissionsDto {
  @ApiProperty({
    type: [String],
    example: ['property.read', 'property.create'],
    description: 'Liste complète des permissions du rôle : elle remplace la précédente.',
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'Au moins une permission est requise.' })
  @IsString({ each: true })
  permissions!: string[];
}
