import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InviteMemberDto } from './invite-member.dto';

const parse = async (body: object) => {
  const dto = plainToInstance(InviteMemberDto, body);
  return { dto, errors: (await validate(dto)).map((e) => e.property) };
};

describe('InviteMemberDto', () => {
  it('normaliza el correo (trim + minúsculas)', async () => {
    const { dto, errors } = await parse({ email: '  Diego@Ejemplo.CL ' });
    expect(errors).toEqual([]);
    expect(dto.email).toBe('diego@ejemplo.cl');
  });

  it.each(['', 'diego', 'diego@', '@ejemplo.cl', `${'a'.repeat(250)}@x.cl`])(
    'rechaza el correo "%s"',
    async (email) => {
      expect((await parse({ email })).errors).toEqual(['email']);
    },
  );

  it('exige el correo', async () => {
    expect((await parse({})).errors).toEqual(['email']);
  });
});
