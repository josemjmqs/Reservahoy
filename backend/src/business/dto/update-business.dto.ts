import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Vacío o solo espacios = null (borra el dato)
const emptyToNull = ({ value }: { value: unknown }) => {
  const v = trim({ value });
  return v === '' ? null : v;
};

export class UpdateBusinessDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  // Teléfono que ven los clientes. Vacío o null lo borra
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Matches(/^\+?[0-9 ()-]{8,20}$/, {
    message:
      'El teléfono solo puede tener números, espacios, +, - y paréntesis',
  })
  phone?: string | null;

  // Color de marca de la página pública ("#rrggbb", se guarda en minúsculas).
  // Vacío o null vuelve al color de Reservahoy
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    const v = emptyToNull({ value });
    return typeof v === 'string' ? v.toLowerCase() : v;
  })
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Matches(/^#[0-9a-f]{6}$/, {
    message: 'El color debe tener el formato #RRGGBB',
  })
  brandColor?: string | null;

  // Dirección que ven los clientes, con un enlace a Google Maps armado con
  // este texto. Una sola línea. Vacía o null la borra
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MinLength(5)
  @MaxLength(150)
  @Matches(/^[^\r\n<>]*$/, {
    message: 'La dirección debe ser una sola línea, sin < ni >',
  })
  address?: string | null;
}
