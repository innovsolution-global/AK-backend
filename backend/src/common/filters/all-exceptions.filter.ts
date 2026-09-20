import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import {
  ERROR_CODES,
  ErrorCode,
  ErrorDetail,
  errorCodeFromStatus,
} from '../exceptions/error-codes';

interface NormalizedError {
  status: number;
  message: string;
  error: ErrorCode;
  details: ErrorDetail[];
}

/**
 * Filtre global : toute exception sort au format standardisé du §39.
 *
 * Aucune trace technique (message Prisma, pile d'appel) n'atteint le client sur
 * une 5xx : elle est journalisée côté serveur et remplacée par un message
 * générique.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const normalized = this.normalize(exception);

    if (normalized.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} → ${normalized.status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else if (normalized.status === HttpStatus.FORBIDDEN) {
      // Log de sécurité (§29) : un refus d'accès est toujours tracé.
      this.logger.warn(
        `Accès refusé : ${request.method} ${request.url} — ${normalized.message}`,
      );
    }

    response.status(normalized.status).json({
      success: false,
      statusCode: normalized.status,
      message: normalized.message,
      error: normalized.error,
      details: normalized.details,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrismaError(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Les données transmises sont invalides.',
        error: ERROR_CODES.VALIDATION_ERROR,
        details: [],
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Une erreur interne est survenue.',
      error: ERROR_CODES.INTERNAL_ERROR,
      details: [],
    };
  }

  private fromHttpException(exception: HttpException): NormalizedError {
    const status = exception.getStatus();
    const payload = exception.getResponse();
    const fallbackCode = errorCodeFromStatus(status);

    if (typeof payload === 'string') {
      return { status, message: payload, error: fallbackCode, details: [] };
    }

    const body = payload as {
      message?: string | string[];
      error?: string;
      details?: ErrorDetail[];
    };

    // Le ValidationPipe renvoie un tableau de messages : on le convertit en
    // `details[]` exploitable champ par champ par le frontend.
    if (Array.isArray(body.message)) {
      return {
        status,
        message: 'Les données transmises sont invalides.',
        error: ERROR_CODES.VALIDATION_ERROR,
        details: body.message.map((message) => this.toDetail(message)),
      };
    }

    return {
      status,
      message: body.message ?? exception.message,
      error: (body.error as ErrorCode) ?? fallbackCode,
      details: body.details ?? [],
    };
  }

  /**
   * `class-validator` produit « champ contrainte non respectée ».
   * On isole le nom du champ pour permettre un affichage sous l'input concerné.
   */
  private toDetail(message: string): ErrorDetail {
    const [field] = message.split(' ');
    const looksLikeField = /^[a-z][a-zA-Z0-9.[\]]*$/.test(field ?? '');

    return looksLikeField ? { field, message } : { message };
  }

  private fromPrismaError(
    exception: Prisma.PrismaClientKnownRequestError,
  ): NormalizedError {
    const target = exception.meta?.target;
    const fields = Array.isArray(target) ? target.map(String) : [];

    switch (exception.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          message:
            fields.length > 0
              ? `Cette valeur est déjà utilisée (${fields.join(', ')}).`
              : 'Cette valeur est déjà utilisée.',
          error: ERROR_CODES.CONFLICT,
          details: fields.map((field) => ({
            field,
            message: 'Valeur déjà utilisée',
            code: 'UNIQUE',
          })),
        };

      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: "La ressource demandée n'existe pas.",
          error: ERROR_CODES.NOT_FOUND,
          details: [],
        };

      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Une référence transmise est introuvable.',
          error: ERROR_CODES.VALIDATION_ERROR,
          details: fields.map((field) => ({
            field,
            message: 'Référence introuvable',
            code: 'FOREIGN_KEY',
          })),
        };

      case 'P2014':
        return {
          status: HttpStatus.CONFLICT,
          message:
            'Cette ressource est liée à des éléments existants et ne peut pas être supprimée.',
          error: ERROR_CODES.CONFLICT,
          details: [],
        };

      default:
        this.logger.error(
          `Erreur Prisma non gérée ${exception.code}: ${exception.message}`,
        );
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Une erreur interne est survenue.',
          error: ERROR_CODES.INTERNAL_ERROR,
          details: [],
        };
    }
  }
}
