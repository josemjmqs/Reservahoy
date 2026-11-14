import { jest } from '@jest/globals'; // en modo ESM, jest no es global
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

// Sin red: R2 se configura con valores falsos y el cliente S3 se reemplaza
const FULL = {
  R2_ACCOUNT_ID: 'cuenta',
  R2_ACCESS_KEY_ID: 'id',
  R2_SECRET_ACCESS_KEY: 'secreto',
  R2_IMAGES_BUCKET: 'fotos',
  R2_PUBLIC_URL: 'https://img.reservahoy.test',
};

const make = (env: Record<string, string | undefined>) =>
  new StorageService({
    get: (key: string) => env[key],
  } as unknown as ConfigService);

let warn: ReturnType<typeof jest.spyOn>;
beforeEach(() => {
  // el aviso "R2 no configurado" y el de borrado fallido no ensucian la salida
  warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('StorageService', () => {
  it('con todas las variables queda activo', () => {
    expect(make(FULL).enabled).toBe(true);
  });

  it.each(Object.keys(FULL).filter((k) => k !== 'R2_ACCOUNT_ID'))(
    'sin %s queda desactivado',
    (missing) => {
      expect(make({ ...FULL, [missing]: undefined }).enabled).toBe(false);
    },
  );

  it('sin cuenta ni R2_ENDPOINT queda desactivado; con R2_ENDPOINT, activo', () => {
    const noAccount = { ...FULL, R2_ACCOUNT_ID: undefined };
    expect(make(noAccount).enabled).toBe(false);
    expect(
      make({ ...noAccount, R2_ENDPOINT: 'http://localhost:9000' }).enabled,
    ).toBe(true);
  });

  it('urlFor arma la URL pública y quita las barras finales', () => {
    const storage = make({ ...FULL, R2_PUBLIC_URL: 'https://img.test//' });
    expect(storage.urlFor('services/b/s/abc.jpg')).toBe(
      'https://img.test/services/b/s/abc.jpg',
    );
  });

  it('urlFor responde null sin foto o sin URL pública', () => {
    expect(make(FULL).urlFor(null)).toBeNull();
    expect(make({}).urlFor('services/b/s/abc.jpg')).toBeNull();
  });

  it('put sin configuración lanza error', async () => {
    await expect(
      make({}).put('k', Buffer.from('x'), 'image/jpeg'),
    ).rejects.toThrow('R2 no configurado');
  });

  it('remove sin configuración no hace nada', async () => {
    await expect(make({}).remove('k')).resolves.toBeUndefined();
  });

  it('remove nunca lanza aunque R2 falle: solo deja un aviso', async () => {
    const storage = make(FULL);
    const client = (
      storage as unknown as { client: { send: (cmd: unknown) => unknown } }
    ).client;
    client.send = () => Promise.reject(new Error('sin conexión'));
    await expect(
      storage.remove('services/b/s/abc.jpg'),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      'No se pudo borrar services/b/s/abc.jpg: sin conexión',
    );
  });
});
