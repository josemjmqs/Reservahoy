import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AgendaService, MAX_COMPLETED_PHOTOS } from './agenda.service';
import { ListAgendaDto, NextAgendaDto } from './dto/list-agenda.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

// El navegador reduce cada foto antes de subirla; 2 MB deja margen (igual que
// las fotos de los servicios)
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

interface AuthenticatedRequest {
  user: { userId: string; email: string };
}

@UseGuards(JwtAuthGuard)
@Controller('agenda')
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  @Get()
  list(@Request() req: AuthenticatedRequest, @Query() q: ListAgendaDto) {
    return this.agenda.list(req.user.userId, q.from, q.to, q.memberId);
  }

  @Get('next')
  next(@Request() req: AuthenticatedRequest, @Query() q: NextAgendaDto) {
    return this.agenda.next(req.user.userId, q.memberId);
  }

  @Patch(':id/status')
  updateStatus(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.agenda.updateStatus(
      req.user.userId,
      id,
      dto.status,
      dto.reason,
    );
  }

  // Marca la reserva como completada y, si el negocio tiene el aviso de
  // "servicio listo", le escribe al cliente con las fotos (campo `photos`)
  @Post(':id/complete')
  @UseInterceptors(
    FilesInterceptor('photos', MAX_COMPLETED_PHOTOS, {
      limits: { fileSize: PHOTO_MAX_BYTES },
    }),
  )
  complete(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @UploadedFiles() photos?: { buffer: Buffer }[],
  ) {
    return this.agenda.complete(req.user.userId, id, photos);
  }
}
