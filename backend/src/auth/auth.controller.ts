import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { AppConfigService } from '../config/app-config.service';
import { CurrentUser, Public } from '../common/decorators';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AuthService, type RequestContext } from './auth.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  LoginResponseDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';

export const REFRESH_COOKIE_NAME = 'ak_refresh_token';

@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Limite stricte : la protection par compte (verrouillage) est complétée par
  // une limite par IP, sinon un attaquant balaierait plusieurs comptes.
  @Throttle({ auth: { limit: 10, ttl: 300_000 } })
  @ApiOperation({ summary: 'Connexion' })
  @ApiOkResponse({ type: LoginResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const result = await this.auth.login(dto, this.contextOf(request));

    this.setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);

    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 60, ttl: 300_000 } })
  @ApiOperation({ summary: 'Rotation du refresh token' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Omit<LoginResponseDto, 'user'>> {
    const refreshToken = this.readRefreshCookie(request);

    if (!refreshToken) {
      throw new UnauthorizedException({
        message: 'Session absente, veuillez vous reconnecter.',
        error: 'UNAUTHORIZED',
      });
    }

    const issued = await this.auth.refresh(refreshToken, this.contextOf(request));
    this.setRefreshCookie(response, issued.refreshToken, issued.refreshExpiresAt);

    return { accessToken: issued.accessToken, expiresIn: issued.expiresIn };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Déconnexion' })
  async logout(
    @CurrentUser('id') userId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(
      userId,
      this.readRefreshCookie(request),
      this.contextOf(request),
    );

    response.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ auth: { limit: 5, ttl: 900_000 } })
  @ApiOperation({
    summary: 'Demande de réinitialisation',
    description:
      "Répond toujours 204, que l'adresse existe ou non, afin de ne pas révéler les comptes enregistrés.",
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.auth.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ auth: { limit: 10, ttl: 900_000 } })
  @ApiOperation({ summary: 'Réinitialisation via token' })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.resetPassword(dto);
    response.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Changement de mot de passe' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.changePassword(user, dto, this.contextOf(request));
    response.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Vérification de l'adresse email" })
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<void> {
    await this.auth.verifyEmail(dto.token);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Profil, rôles et permissions effectives' })
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  // --- Cookies --------------------------------------------------------------

  /**
   * Le refresh token voyage en cookie `httpOnly` : inaccessible au JavaScript,
   * il reste hors de portée d'une injection XSS, contrairement au localStorage.
   */
  private setRefreshCookie(
    response: Response,
    token: string,
    expiresAt: Date,
  ): void {
    response.cookie(REFRESH_COOKIE_NAME, token, {
      ...this.cookieOptions(),
      expires: expiresAt,
    });
  }

  private readRefreshCookie(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, string> | undefined;
    return cookies?.[REFRESH_COOKIE_NAME];
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: 'strict',
      domain: this.config.cookieDomain,
      // Restreint l'envoi du cookie aux seules routes d'authentification.
      path: `/${this.config.apiPrefix}/auth`,
    };
  }

  private contextOf(request: Request): RequestContext {
    return {
      ip: request.ip,
      userAgent: request.get('user-agent') ?? undefined,
    };
  }
}
