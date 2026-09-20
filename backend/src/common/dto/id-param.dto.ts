import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class IdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: "L'identifiant doit être un UUID valide" })
  id!: string;
}
