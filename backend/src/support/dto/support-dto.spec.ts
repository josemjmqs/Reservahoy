import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSupportRequestDto } from './create-support-request.dto';

const errors = async (body: object) =>
  (await validate(plainToInstance(CreateSupportRequestDto, body))).map(
    (e) => e.property,
  );

const valid = { kind: 'PROBLEM', message: 'No carga la agenda' };

describe('CreateSupportRequestDto', () => {
  it('acepta los tres tipos, con o sin pantalla', async () => {
    for (const kind of ['PROBLEM', 'SUGGESTION', 'QUESTION']) {
      expect(await errors({ ...valid, kind })).toEqual([]);
    }
    expect(await errors({ ...valid, page: '/dashboard' })).toEqual([]);
    expect(await errors({ ...valid, page: '/dashboard/agenda' })).toEqual([]);
  });

  it('rechaza un tipo desconocido', async () => {
    expect(await errors({ ...valid, kind: 'SPAM' })).toEqual(['kind']);
  });

  it('el mensaje se recorta y tiene entre 10 y 2000 caracteres', async () => {
    const dto = plainToInstance(CreateSupportRequestDto, {
      ...valid,
      message: '   No carga la agenda   ',
    });
    expect(dto.message).toBe('No carga la agenda');
    expect(await errors({ ...valid, message: '   corto    ' })).toEqual([
      'message',
    ]);
    expect(await errors({ ...valid, message: 'x'.repeat(2001) })).toEqual([
      'message',
    ]);
    expect(await errors({ ...valid, message: 'x'.repeat(2000) })).toEqual([]);
  });

  it('la pantalla solo puede ser una ruta del panel', async () => {
    for (const page of [
      '/login',
      'https://evil.test/dashboard',
      '/dashboard/agenda?date=2032-01-20',
      '/dashboard/../login',
    ]) {
      expect(await errors({ ...valid, page })).toEqual(['page']);
    }
  });
});
