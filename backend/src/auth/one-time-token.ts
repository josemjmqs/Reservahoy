import { createHash, randomBytes } from 'crypto';

// Tokens de un solo uso (enlaces por correo): el token viaja solo en el enlace
// y en la base se guarda únicamente su hash SHA-256
export const newToken = () => randomBytes(32).toString('hex');

export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
