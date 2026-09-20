import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PaginatedResult } from '../dto/paginated-result';

/**
 * Enveloppe uniforme des réponses : `{ success: true, data, meta? }`.
 *
 * Un `PaginatedResult` est aplati en `data` + `meta` ; toute autre valeur est
 * placée telle quelle dans `data`.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((payload: unknown) => {
        // 204 et réponses déjà streamées : rien à envelopper.
        if (payload === undefined || payload === null) {
          return payload;
        }

        if (payload instanceof PaginatedResult) {
          return {
            success: true,
            data: serialize(payload.data),
            meta: payload.meta,
          };
        }

        return { success: true, data: serialize(payload) };
      }),
    );
  }
}

/**
 * Rend la charge utile sérialisable en JSON.
 *
 * `JSON.stringify` lève une `TypeError` sur un `BigInt` — or les tailles de
 * fichiers sont des `BigInt` côté Prisma. On les convertit en nombre tant que
 * la précision est garantie, sinon en chaîne.
 */
function serialize(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }

  if (value instanceof Date || value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(serialize);
  }

  // Les Decimal de Prisma exposent toJSON() : on les laisse tels quels pour ne
  // pas perdre en précision sur les superficies et les coordonnées.
  if (typeof (value as { toJSON?: unknown }).toJSON === 'function') {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = serialize(entry);
  }
  return result;
}
