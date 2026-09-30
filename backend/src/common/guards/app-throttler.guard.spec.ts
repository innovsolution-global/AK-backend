import { Controller, Get, INestApplication, Module, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AppThrottlerGuard } from './app-throttler.guard';

/**
 * Reproduit la configuration de l'AppModule sur un mini-contrôleur :
 *   - « auth » ne s'applique qu'aux routes qui le déclarent ;
 *   - « default » compte par utilisateur quand il y en a un, sinon par IP.
 */
@Controller()
class DemoController {
  @Get('fiche')
  fiche() {
    return 'ok';
  }

  @Post('login')
  @Throttle({ auth: { limit: 2, ttl: 60_000 } })
  login() {
    return 'ok';
  }
}

/** Simule JwtAuthGuard : un en-tête `x-user` tient lieu d'utilisateur vérifié. */
class FakeAuthGuard {
  canActivate(context: import('@nestjs/common').ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const user = req.headers['x-user'];
    if (user) req.user = { id: user };
    return true;
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 5 },
      {
        name: 'auth',
        ttl: 300_000,
        limit: 10,
        skipIf: (context) =>
          !Reflect.getMetadata('THROTTLER:LIMITauth', context.getHandler()) &&
          !Reflect.getMetadata('THROTTLER:LIMITauth', context.getClass()),
      },
    ]),
  ],
  controllers: [DemoController],
  providers: [
    { provide: APP_GUARD, useClass: FakeAuthGuard },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
  ],
})
class DemoModule {}

describe('AppThrottlerGuard', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [DemoModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("n'applique pas le limiteur « auth » aux routes ordinaires", async () => {
    // Avec « auth » global (10 / 5 min), la 11e consultation échouait : ici le
    // seul plafond est « default » (5), atteint à la 6e.
    for (let i = 0; i < 5; i += 1) {
      await request(app.getHttpServer()).get('/fiche').set('x-user', 'u1').expect(200);
    }
    await request(app.getHttpServer()).get('/fiche').set('x-user', 'u1').expect(429);
  });

  it('compte par utilisateur : deux collègues derrière la même IP ont chacun leur quota', async () => {
    for (let i = 0; i < 5; i += 1) {
      await request(app.getHttpServer()).get('/fiche').set('x-user', 'u1').expect(200);
    }
    await request(app.getHttpServer()).get('/fiche').set('x-user', 'u1').expect(429);
    await request(app.getHttpServer()).get('/fiche').set('x-user', 'u2').expect(200);
  });

  it('garde le limiteur « auth » strict, par IP, sur les routes qui le déclarent', async () => {
    await request(app.getHttpServer()).post('/login').expect(201);
    await request(app.getHttpServer()).post('/login').expect(201);
    await request(app.getHttpServer()).post('/login').expect(429);
  });
});
