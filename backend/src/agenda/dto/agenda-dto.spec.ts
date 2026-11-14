import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListAgendaDto, NextAgendaDto } from './list-agenda.dto';
import { UpdateStatusDto } from './update-status.dto';

const errors = async <T extends object>(cls: new () => T, body: object) =>
  (await validate(plainToInstance(cls, body))).map((e) => e.property);

describe('ListAgendaDto', () => {
  it('acepta un rango de fechas, con o sin profesional', async () => {
    expect(
      await errors(ListAgendaDto, { from: '2032-01-20', to: '2032-01-21' }),
    ).toEqual([]);
    expect(
      await errors(ListAgendaDto, {
        from: '2032-01-20',
        to: '2032-01-21',
        memberId: 'abc',
      }),
    ).toEqual([]);
  });

  it.each(['20-01-2032', '2032-1-20', '2032-01-20T10:00', 'hoy', ''])(
    'rechaza la fecha "%s"',
    async (date) => {
      expect(
        await errors(ListAgendaDto, { from: date, to: '2032-01-21' }),
      ).toEqual(['from']);
      expect(
        await errors(ListAgendaDto, { from: '2032-01-20', to: date }),
      ).toEqual(['to']);
    },
  );

  it('exige las dos fechas', async () => {
    expect(await errors(ListAgendaDto, {})).toEqual(['from', 'to']);
  });
});

describe('NextAgendaDto', () => {
  it('el profesional es opcional, pero debe ser texto', async () => {
    expect(await errors(NextAgendaDto, {})).toEqual([]);
    expect(await errors(NextAgendaDto, { memberId: 123 })).toEqual([
      'memberId',
    ]);
  });
});

describe('UpdateStatusDto', () => {
  it.each(['CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'])(
    'acepta el estado %s',
    async (status) => {
      expect(await errors(UpdateStatusDto, { status })).toEqual([]);
    },
  );

  // PENDING solo lo pone la reserva pública; el panel no vuelve a él
  it.each(['PENDING', 'cancelled', 'DELETED', ''])(
    'rechaza el estado "%s"',
    async (status) => {
      expect(await errors(UpdateStatusDto, { status })).toEqual(['status']);
    },
  );

  it('el motivo es opcional y tiene hasta 300 caracteres', async () => {
    const status = 'CANCELLED';
    expect(await errors(UpdateStatusDto, { status })).toEqual([]);
    expect(
      await errors(UpdateStatusDto, { status, reason: 'a'.repeat(300) }),
    ).toEqual([]);
    expect(
      await errors(UpdateStatusDto, { status, reason: 'a'.repeat(301) }),
    ).toEqual(['reason']);
  });
});
