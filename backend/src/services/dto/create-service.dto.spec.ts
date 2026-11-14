import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateServiceDto } from './create-service.dto';
import { UpdateServiceDto } from './update-service.dto';

const base = { name: 'Corte de pelo', durationMin: 30 };

const parse = async (
  body: object,
  Dto: new () => object = CreateServiceDto,
) => {
  const dto = plainToInstance(Dto, body) as CreateServiceDto;
  const errors = await validate(dto);
  return {
    dto,
    errors: errors.map((e) => e.property),
    messages: errors.flatMap((e) => Object.values(e.constraints ?? {})),
  };
};

describe('CreateServiceDto', () => {
  it('quita los espacios sobrantes del nombre', async () => {
    const { dto, errors } = await parse({ ...base, name: '  Corte  ' });
    expect(errors).toEqual([]);
    expect(dto.name).toBe('Corte');
  });

  it.each(['  ', ' a ', 'a'])(
    'rechaza el nombre "%s" (menos de 2 caracteres sin espacios), en español',
    async (name) => {
      const { errors, messages } = await parse({ ...base, name });
      expect(errors).toEqual(['name']);
      expect(messages).toEqual(['El nombre debe tener al menos 2 caracteres']);
    },
  );

  it('acepta hasta 80 caracteres en el nombre y rechaza más', async () => {
    expect((await parse({ ...base, name: 'a'.repeat(80) })).errors).toEqual([]);
    const { errors, messages } = await parse({ ...base, name: 'a'.repeat(81) });
    expect(errors).toEqual(['name']);
    expect(messages).toEqual(['El nombre puede tener hasta 80 caracteres']);
  });

  it('acepta hasta 40 caracteres en la categoría y rechaza más', async () => {
    expect((await parse({ ...base, category: 'c'.repeat(40) })).errors).toEqual(
      [],
    );
    const { errors, messages } = await parse({
      ...base,
      category: 'c'.repeat(41),
    });
    expect(errors).toEqual(['category']);
    expect(messages).toEqual(['La categoría puede tener hasta 40 caracteres']);
  });

  it('la duración total puede ser de hasta 30 días', async () => {
    expect((await parse({ ...base, totalMin: 43200 })).errors).toEqual([]);
    const { errors, messages } = await parse({ ...base, totalMin: 43201 });
    expect(errors).toEqual(['totalMin']);
    expect(messages).toEqual(['La duración total puede ser de hasta 30 días']);
  });

  it('la atención va de 5 a 480 minutos, en enteros', async () => {
    for (const durationMin of [5, 480]) {
      expect((await parse({ ...base, durationMin })).errors).toEqual([]);
    }
    for (const durationMin of [4, 481, 30.5, '30']) {
      expect((await parse({ ...base, durationMin })).errors).toEqual([
        'durationMin',
      ]);
    }
    expect((await parse({ name: 'Corte' })).errors).toEqual(['durationMin']);
  });

  it('el precio es opcional, entero y desde 0', async () => {
    for (const price of [0, 15000, null, undefined]) {
      expect((await parse({ ...base, price })).errors).toEqual([]);
    }
    for (const price of [-1, 990.5, '15000']) {
      expect((await parse({ ...base, price })).errors).toEqual(['price']);
    }
  });

  it('la duración total parte en 5 minutos', async () => {
    expect((await parse({ ...base, totalMin: 5 })).errors).toEqual([]);
    expect((await parse({ ...base, totalMin: 4 })).errors).toEqual([
      'totalMin',
    ]);
  });

  it('acepta hasta 300 caracteres en la descripción y rechaza más', async () => {
    expect(
      (await parse({ ...base, description: 'd'.repeat(300) })).errors,
    ).toEqual([]);
    const { errors, messages } = await parse({
      ...base,
      description: 'd'.repeat(301),
    });
    expect(errors).toEqual(['description']);
    expect(messages).toEqual([
      'La descripción puede tener hasta 300 caracteres',
    ]);
  });

  it('al editar todo es opcional y "active" debe ser booleano', async () => {
    expect((await parse({}, UpdateServiceDto)).errors).toEqual([]);
    expect((await parse({ active: false }, UpdateServiceDto)).errors).toEqual(
      [],
    );
    expect((await parse({ active: 'false' }, UpdateServiceDto)).errors).toEqual(
      ['active'],
    );
  });

  it('al editar también quita espacios y exige el mínimo del nombre', async () => {
    const ok = await parse({ name: ' Barba ' }, UpdateServiceDto);
    expect(ok.errors).toEqual([]);
    expect(ok.dto.name).toBe('Barba');
    expect((await parse({ name: '   ' }, UpdateServiceDto)).errors).toEqual([
      'name',
    ]);
  });
});
