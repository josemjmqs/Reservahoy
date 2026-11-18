import {
  Body,
  Controller,
  Headers,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';
import { SupportService } from './support.service';

interface AuthenticatedRequest {
  user: { userId: string; email: string };
}

@UseGuards(JwtAuthGuard)
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  // Además del máximo por hora de cada miembro (SupportService)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post()
  create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateSupportRequestDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.support.create(req.user.userId, { ...dto, userAgent });
  }
}
