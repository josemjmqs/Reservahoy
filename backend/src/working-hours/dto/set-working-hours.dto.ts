import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
  IsOptional,
  IsString
} from 'class-validator';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// Hay descanso si viene cualquiera de los dos: entonces ambos son obligatorios
const hasBreak = (d: DayHoursDto) =>
  d.breakStartsAt != null || d.breakEndsAt != null;

export class DayHoursDto {
  @IsInt()
  @Min(0)
  @Max(6)
  weekday: number;

  @Matches(TIME, { message: 'opensAt debe tener formato HH:MM' })
  opensAt: string;

  @Matches(TIME, { message: 'closesAt debe tener formato HH:MM' })
  closesAt: string;

  // Descanso opcional (almuerzo): null o ausente los dos para no tener
  @ValidateIf(hasBreak)
  @Matches(TIME, { message: 'breakStartsAt debe tener formato HH:MM' })
  breakStartsAt?: string | null;

  @ValidateIf(hasBreak)
  @Matches(TIME, { message: 'breakEndsAt debe tener formato HH:MM' })
  breakEndsAt?: string | null;
}

// Reglas entre campos de un día (las horas HH:MM se comparan como texto).
// El almuerzo queda dentro del horario y los dos tramos que deja, la mañana y
// la tarde, no se solapan ni quedan vacíos. Devuelve el error o null. El panel
// avisa con la misma regla (dayError, frontend/src/lib/hours.ts), lo revisa
// shared-rules.spec.ts
export function dayHoursError(d: DayHoursDto): string | null {
  if (d.opensAt >= d.closesAt) {
    return 'La hora de apertura debe ser anterior al cierre';
  }
  if (!hasBreak(d)) return null;
  if (!d.breakStartsAt || !d.breakEndsAt) {
    return 'El almuerzo necesita hora de inicio y de término';
  }
  if (d.breakStartsAt >= d.breakEndsAt) {
    return 'El almuerzo debe empezar antes de terminar';
  }
  if (d.breakStartsAt <= d.opensAt || d.breakEndsAt >= d.closesAt) {
    return 'El almuerzo debe quedar dentro del horario, después de abrir y antes de cerrar';
  }
  return null;
}

export class SetWorkingHoursDto {
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => DayHoursDto)
  days: DayHoursDto[];

  @IsOptional()
  @IsString()
  memberId?: string;
}
