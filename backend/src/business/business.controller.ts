import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BusinessService } from './business.service';
import { UpdateBusinessDto } from './dto/update-business.dto';

// El navegador reduce el logo antes de subirlo; 2 MB deja margen (igual que las fotos)
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

interface AuthenticatedRequest {
  user: { userId: string; email: string };
}

@UseGuards(JwtAuthGuard)
@Controller('business')
export class BusinessController {
  constructor(private readonly business: BusinessService) {}

  @Get()
  get(@Request() req: AuthenticatedRequest) {
    return this.business.get(req.user.userId);
  }

  @Patch()
  update(@Request() req: AuthenticatedRequest, @Body() dto: UpdateBusinessDto) {
    return this.business.update(req.user.userId, dto);
  }

  @Post('logo')
  @UseInterceptors(
    FileInterceptor('logo', {
      limits: { fileSize: LOGO_MAX_BYTES, files: 1 },
    }),
  )
  setLogo(
    @Request() req: AuthenticatedRequest,
    @UploadedFile() file?: { buffer: Buffer },
  ) {
    return this.business.setLogo(req.user.userId, file);
  }

  @Delete('logo')
  removeLogo(@Request() req: AuthenticatedRequest) {
    return this.business.removeLogo(req.user.userId);
  }
}
