import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DayHoursDto, dayHoursError } from './set-working-hours.dto';

const errors = async (body: object) =>
  (await validate(plainToInstance(DayHoursDto, body))).map((e) => e.property);

const base = { weekday: 1, opensAt: '09:00', closesAt: '19:00' };

describe('DayHoursDto: almuerzo', () => {
  it('es opcional: ausente o con los dos en null', async () => {
    expect(await errors(base)).toEqual([]);
    expect(
      await errors({ ...base, breakStartsAt: null, breakEndsAt: null }),
    ).toEqual([]);
  });

  it('acepta las dos horas en formato HH:MM', async () => {
    expect(
      await errors({ ...base, breakStartsAt: '13:00', breakEndsAt: '14:00' }),
    ).toEqual([]);
  });

  it('con una hora exige la otra', async () => {
    expect(await errors({ ...base, breakStartsAt: '13:00' })).toEqual([
      'breakEndsAt',
    ]);
    expect(
      await errors({ ...base, breakStartsAt: null, breakEndsAt: '14:00' }),
    ).toEqual(['breakStartsAt']);
  });

  it.each(['13', '1:00', '24:00', '13:60', ''])(
    'rechaza la hora "%s"',
    async (time) => {
      expect(
        await errors({ ...base, breakStartsAt: time, breakEndsAt: '14:00' }),
      ).toEqual(['breakStartsAt']);
    },
  );
});

describe('dayHoursError', () => {
  const day = (breakStartsAt?: string | null, breakEndsAt?: string | null) =>
    Object.assign(new DayHoursDto(), { ...base, breakStartsAt, breakEndsAt });

  it('acepta un almuerzo dentro del horario', () => {
    expect(dayHoursError(day('13:00', '14:00'))).toBeNull();
    expect(dayHoursError(day('09:30', '18:30'))).toBeNull();
    expect(dayHoursError(day())).toBeNull();
  });

  it.each([
    ['09:00', '10:00'], // mañana vacía
    ['18:00', '19:00'], // tarde vacía
    ['08:00', '10:00'],
    ['18:00', '20:00'],
    ['14:00', '13:00'],
    ['13:00', '13:00'],
  ])('rechaza el almuerzo %s–%s', (start, end) => {
    expect(dayHoursError(day(start, end))).toMatch(/almuerzo/);
  });
});
