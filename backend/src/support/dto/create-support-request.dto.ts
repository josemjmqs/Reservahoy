import type { SupportKind } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export const SUPPORT_MESSAGE_MIN = 10;
export const SUPPORT_MESSAGE_MAX = 2000;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateSupportRequestDto {
  // PROBLEM: reporta un problema; SUGGESTION: una mejora o algo nuevo;
  // QUESTION: una duda
  @IsIn(['PROBLEM', 'SUGGESTION', 'QUESTION'])
  kind: SupportKind;

  @Transform(trim)
  @IsString()
  @MinLength(SUPPORT_MESSAGE_MIN, {
    message: `Cuéntanos un poco más (al menos ${SUPPORT_MESSAGE_MIN} caracteres)`,
  })
  @MaxLength(SUPPORT_MESSAGE_MAX, {
    message: `El mensaje puede tener hasta ${SUPPORT_MESSAGE_MAX} caracteres`,
  })
  message: string;

  // Pantalla del panel desde donde se abrió: ayuda a reproducir un problema.
  // Solo una ruta del panel, sin parámetros
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^\/dashboard(\/[a-z0-9-]+)*$/)
  page?: string;
}
