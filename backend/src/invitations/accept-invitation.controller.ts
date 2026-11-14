import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { SESSION_COOKIE } from '../auth/session';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { InvitationsService } from './invitations.service';

// Rutas públicas del enlace de invitación: no piden sesión, el token es la
// prueba. Con límite por IP, como el login
@Controller('invitations')
export class AcceptInvitationController {
  constructor(private readonly invitations: InvitationsService) {}

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get(':token')
  lookup(@Param('token') token: string) {
    return this.invitations.lookup(token);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post(':token/accept')
  async accept(
    @Param('token') token: string,
    @Body() dto: AcceptInvitationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken } = await this.invitations.accept(
      token,
      dto.name,
      dto.password,
    );
    res.cookie('token', accessToken, SESSION_COOKIE);
    return { ok: true };
  }
}
