import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthContextService } from './services/auth-context.service';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    // Les secrets et durées sont passés explicitement à chaque signature
    // (TokenService) : le module reste sans configuration globale, ce qui évite
    // qu'un token soit signé par erreur avec le mauvais secret.
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    AuthContextService,
    JwtStrategy,
    JwtAuthGuard,
  ],
  exports: [AuthService, PasswordService, TokenService, AuthContextService],
})
export class AuthModule {}
