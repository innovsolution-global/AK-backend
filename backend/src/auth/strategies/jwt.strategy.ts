import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppConfigService } from '../../config/app-config.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuthContextService } from '../services/auth-context.service';
import type { AccessTokenPayload } from '../services/token.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: AppConfigService,
    private readonly authContext: AuthContextService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwt.accessSecret,
    });
  }

  /**
   * Appelée après vérification de la signature et de l'expiration.
   * La valeur retournée devient `request.user`.
   */
  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    return this.authContext.loadForUser(payload.sub, payload.tokenVersion);
  }
}
