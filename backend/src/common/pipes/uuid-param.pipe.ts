import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';

/**
 * Valide un paramètre de route UUID v4.
 *
 * À utiliser sous la forme `@Param('id', UuidParam)` dès qu'une route porte
 * **plusieurs** paramètres : un `@Param()` sans clé lie la totalité des
 * paramètres au DTO, et le `ValidationPipe` global (`forbidNonWhitelisted`)
 * rejette alors ceux qui n'y sont pas déclarés.
 */
export const UuidParam = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () =>
    new BadRequestException({
      message: "L'identifiant fourni n'est pas un UUID valide.",
      error: 'VALIDATION_ERROR',
    }),
});
