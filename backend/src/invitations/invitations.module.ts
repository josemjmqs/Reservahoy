import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AcceptInvitationController } from './accept-invitation.controller';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

@Module({
  imports: [NotificationsModule],
  controllers: [InvitationsController, AcceptInvitationController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
