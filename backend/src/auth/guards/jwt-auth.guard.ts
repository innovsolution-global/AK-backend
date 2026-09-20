import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../common/decorators';

/**
 * Niveau 1 de la chaîne d'accès : l'access token est valide et le compte
 * utilisable. Appliqué globalement ; les routes marquées `@Public()` sont
 * ignorées.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    return isPublic ? true : super.canActivate(context);
  }

  handleRequest<TUser>(err: unknown, user: TUser, info: unknown): TUser {
    if (err || !user) {
      // On ne distingue pas « token expiré » de « token invalide » côté client :
      // le frontend tente un refresh dans les deux cas.
      if (err instanceof UnauthorizedException) throw err;

      throw new UnauthorizedException({
        message: 'Authentification requise.',
        error: 'UNAUTHORIZED',
        details:
          info instanceof Error && info.name === 'TokenExpiredError'
            ? [{ message: 'Token expiré', code: 'TOKEN_EXPIRED' }]
            : [],
      });
    }

    return user;
  }
}
