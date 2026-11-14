import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';

export class InviteMemberDto {
  // Los correos se normalizan como en el registro y el login
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Escribe un correo válido' })
  @MaxLength(254)
  email: string;
}
