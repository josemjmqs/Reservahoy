import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AcceptInvitationDto } from './accept-invitation.dto';

const parse = async (body: object) => {
  const dto = plainToInstance(AcceptInvitationDto, body);
  return { dto, errors: (await validate(dto)).map((e) => e.property) };
};
const ok = { name: 'Diego Fuentes', password: 'clave-segura' };

describe('AcceptInvitationDto', () => {
  it('acepta nombre y contraseña, quitando espacios al nombre', async () => {
    const { dto, errors } = await parse({ ...ok, name: '  Diego  ' });
    expect(errors).toEqual([]);
    expect(dto.name).toBe('Diego');
  });

  it.each(['', ' a ', 'x'.repeat(81)])(
    'rechaza el nombre "%s"',
    async (name) => {
      expect((await parse({ ...ok, name })).errors).toEqual(['name']);
    },
  );

  it('la contraseña tiene al menos 8 caracteres', async () => {
    expect((await parse({ ...ok, password: '1234567' })).errors).toEqual([
      'password',
    ]);
    expect((await parse({ ...ok, password: '12345678' })).errors).toEqual([]);
  });

  it('exige ambos campos', async () => {
    expect((await parse({})).errors.sort()).toEqual(['name', 'password']);
  });
});
