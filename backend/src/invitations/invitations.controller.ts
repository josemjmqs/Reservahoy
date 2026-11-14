import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InviteMemberDto } from './dto/invite-member.dto';
import { InvitationsService } from './invitations.service';

interface AuthenticatedRequest {
  user: { userId: string; email: string };
}

// Invitar a un profesional del equipo (solo el dueño)
@UseGuards(JwtAuthGuard)
@Controller('members')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post(':id/invitation')
  create(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.invitations.create(req.user.userId, id, dto.email);
  }

  @Delete(':id/invitation')
  revoke(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.invitations.revoke(req.user.userId, id);
  }
}
