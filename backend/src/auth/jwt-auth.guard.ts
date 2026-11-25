import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import {
  blockedForDemo,
  DEMO_READ_ONLY,
  renewSession,
  type SessionUser,
} from './session';

// Además de exigir sesión, la renueva (como mucho una vez al día) para que
// venza recién tras 30 días sin uso, y a la cuenta demo solo la deja leer.
// JwtService viene del JwtModule global, así los módulos que usan este guard
// no necesitan importar AuthModule
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly jwt: JwtService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ok = (await super.canActivate(context)) as boolean;
    if (ok) {
      const http = context.switchToHttp();
      const req = http.getRequest<Request>();
      if (blockedForDemo(req.user as SessionUser, req.method)) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'DEMO_READ_ONLY',
          message: DEMO_READ_ONLY,
        });
      }
      await renewSession(req, http.getResponse<Response>(), this.jwt);
    }
    return ok;
  }
}
