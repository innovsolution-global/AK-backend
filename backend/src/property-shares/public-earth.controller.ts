import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators';
import { sendKml } from '../maps/kml-response';
import type { RequestContext } from '../auth/auth.service';
import { EarthLinkService } from './earth-link.service';

/**
 * Point d'entrée public des fichiers Google Earth partagés.
 *
 * Aucune session : c'est ce qui permet d'ouvrir le lien depuis Google Earth
 * Pro, l'application mobile ou un simple clic dans un message. La sécurité
 * repose sur la signature du token et sur l'état du partage (voir
 * `EarthLinkService`).
 */
@ApiTags('Accès partagé')
@Controller('public/earth')
export class PublicEarthController {
  constructor(private readonly earthLinks: EarthLinkService) {}

  @Public()
  @Get(':token')
  // Un token vaut 384 bits : le brute-force est illusoire, mais on limite
  // tout de même le débit pour ne pas servir de générateur de KML à volonté.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiParam({ name: 'token', description: 'Token signé, suffixé de « .kml »' })
  @ApiProduces('application/vnd.google-earth.kml+xml')
  @ApiOperation({
    summary: 'Fichier KML d’un bien partagé',
    description:
      'Valide tant que le partage est actif et autorise Google Earth. Révocation ou expiration → 404.',
  })
  async download(
    @Param('token') token: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const document = await this.earthLinks.resolve(token, contextOf(request));
    sendKml(response, document.fileName, document.kml);
  }
}

function contextOf(request: Request): RequestContext {
  return {
    ip: request.ip,
    userAgent: request.get('user-agent') ?? undefined,
  };
}
