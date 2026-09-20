import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { SearchService } from './search.service';

export class SearchQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(200)
  q!: string;
}

@ApiTags('Recherche')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @ApiQuery({ name: 'q', description: 'Terme recherché (2 caractères minimum)' })
  @ApiOperation({
    summary: 'Recherche globale',
    description:
      "Couvre terrains, projets, sites, localités, documents et entreprises. Chaque catégorie est filtrée par les permissions et le périmètre de l'utilisateur.",
  })
  find(@CurrentUser() user: AuthenticatedUser, @Query() query: SearchQueryDto) {
    return this.search.search(user, query.q);
  }
}
