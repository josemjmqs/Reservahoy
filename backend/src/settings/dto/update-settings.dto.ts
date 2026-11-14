import type { NotifyScope } from '@prisma/client';
import { IsIn } from 'class-validator';

export class UpdateSettingsDto {
  // ALL: todas las reservas del negocio (solo un dueño); OWN: las que atiende;
  // NONE: ninguna
  @IsIn(['ALL', 'OWN', 'NONE'])
  newBookings: NotifyScope;
}
