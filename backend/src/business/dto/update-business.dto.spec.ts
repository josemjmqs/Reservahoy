import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateBusinessDto } from './update-business.dto';

const parse = async (body: object) => {
  const dto = plainToInstance(UpdateBusinessDto, body);
  return { dto, errors: (await validate(dto)).map((e) => e.property) };
};

describe('UpdateBusinessDto', () => {
  it.each(['+56 9 1234 5678', '22 345 6789', '(2) 2345-6789', '912345678'])(
    'acepta el teléfono "%s"',
    async (phone) => {
      expect((await parse({ phone })).errors).toEqual([]);
    },
  );

  it.each(['hola', '1234', '+56 9 1234 5678 ext 2', '<b>912345678</b>'])(
    'rechaza el teléfono "%s"',
    async (phone) => {
      expect((await parse({ phone })).errors).toEqual(['phone']);
    },
  );

  it('un teléfono vacío se guarda como null (lo borra)', async () => {
    const { dto, errors } = await parse({ phone: '   ' });
    expect(errors).toEqual([]);
    expect(dto.phone).toBeNull();
  });

  it('acepta un color #RRGGBB y lo guarda en minúsculas', async () => {
    const { dto, errors } = await parse({ brandColor: ' #0F766E ' });
    expect(errors).toEqual([]);
    expect(dto.brandColor).toBe('#0f766e');
  });

  it.each(['0f766e', '#0f7', '#0f766e00', 'red', 'rgb(0,0,0)', '#gggggg', 7])(
    'rechaza el color %p',
    async (brandColor) => {
      expect((await parse({ brandColor })).errors).toEqual(['brandColor']);
    },
  );

  it('un color vacío o null vuelve al de Reservahoy (null)', async () => {
    expect((await parse({ brandColor: '' })).dto.brandColor).toBeNull();
    const { dto, errors } = await parse({ brandColor: null });
    expect(errors).toEqual([]);
    expect(dto.brandColor).toBeNull();
  });

  it('quita espacios al nombre y exige al menos 2 letras', async () => {
    expect((await parse({ name: '  Taller Pérez ' })).dto.name).toBe(
      'Taller Pérez',
    );
    expect((await parse({ name: ' a ' })).errors).toEqual(['name']);
  });
});
