import { jest } from '@jest/globals'; // en modo ESM, jest no es global
import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';
import type {
  CancelledByBusinessEmailData,
  CompletedEmailData,
  NotificationsService,
} from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import { AgendaService } from './agenda.service';

// Servicio de Nest real contra PostgreSQL (posible porque Jest corre en ESM)
const prisma = new PrismaClient();
// Correos simulados: se anotan en vez de enviarse
const cancelled: CancelledByBusinessEmailData[] = [];
const completed: CompletedEmailData[] = [];
const notifications = {
  bookingCancelledByBusiness: (data: CancelledByBusinessEmailData) => {
    cancelled.push(data);
    return Promise.resolve();
  },
  bookingCompleted: (data: CompletedEmailData) => {
    completed.push(data);
    return Promise.resolve();
  },
} as unknown as NotificationsService;
const service = new AgendaService(
  prisma as unknown as PrismaService,
  notifications,
);
// El correo sale en segundo plano: espera a que llegue (o a que pase el plazo)
const settle = () => new Promise((r) => setTimeout(r, 300));
const run = Date.now().toString(36);
const tz = 'America/Santiago';

let businessId: string;
let otherBusinessId: string;
let ownerUserId: string;
let otherUserId: string;
let memberId: string;
let secondMemberId: string;
let otherMemberId: string;

const local = (date: string, time: string) =>
  DateTime.fromISO(`${date}T${time}`, { zone: tz }).toJSDate();

// "Ahora" fijo para las pruebas: 2032-03-10 a las 12:00
const now = local('2032-03-10', '12:00');

beforeAll(async () => {
  const [b1, b2] = await Promise.all(
    ['a', 'b'].map((x) =>
      prisma.business.create({
        data: { name: `Agenda ${x}`, slug: `int-agenda-${x}-${run}` },
      }),
    ),
  );
  businessId = b1.id;
  otherBusinessId = b2.id;

  const [u1, u2] = await Promise.all(
    ['a', 'b'].map((x) =>
      prisma.user.create({
        data: {
          email: `agenda-${x}-${run}@test.local`,
          name: x,
          password: 'x',
        },
      }),
    ),
  );
  ownerUserId = u1.id;
  otherUserId = u2.id;

  memberId = (
    await prisma.member.create({
      data: { role: 'OWNER', displayName: 'Dueña', userId: u1.id, businessId },
    })
  ).id;
  secondMemberId = (
    await prisma.member.create({
      data: { role: 'STAFF', displayName: 'Ayudante', businessId },
    })
  ).id;
  otherMemberId = (
    await prisma.member.create({
      data: {
        role: 'OWNER',
        displayName: 'Otro',
        userId: u2.id,
        businessId: otherBusinessId,
      },
    })
  ).id;

  const svc = await prisma.service.create({
    data: { name: 'Corte', durationMin: 60, businessId },
  });
  const customer = await prisma.customer.create({
    data: { name: 'C', email: `agenda-c-${run}@test.local`, businessId },
  });

  const book = (
    date: string,
    time: string,
    member: string,
    status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' = 'CONFIRMED',
  ) =>
    prisma.booking.create({
      data: {
        startsAt: local(date, time),
        endsAt: DateTime.fromJSDate(local(date, time))
          .plus({ hours: 1 })
          .toJSDate(),
        status,
        businessId,
        memberId: member,
        customerId: customer.id,
        items: { create: { serviceId: svc.id, position: 0 } },
      },
    });

  await Promise.all([
    book('2032-03-10', '09:00', memberId), // ya pasó
    book('2032-03-11', '10:00', memberId, 'CANCELLED'), // cancelada
    book('2032-03-12', '15:00', memberId), // la próxima de la dueña
    book('2032-03-11', '16:00', secondMemberId), // la próxima del negocio
  ]);
});

afterAll(async () => {
  const ids = [businessId, otherBusinessId];
  await prisma.booking.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.customer.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.service.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.member.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.user.deleteMany({
    where: { id: { in: [ownerUserId, otherUserId] } },
  });
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('AgendaService.next', () => {
  it('devuelve la próxima reserva activa del negocio, ignorando pasadas y canceladas', async () => {
    const { booking } = await service.next(ownerUserId, undefined, now);
    expect(booking?.startsAt).toEqual(local('2032-03-11', '16:00'));
    expect(booking?.member.id).toBe(secondMemberId);
    expect(booking?.services).toEqual([{ name: 'Corte', durationMin: 60 }]);
  });

  it('filtra por profesional', async () => {
    const { booking } = await service.next(ownerUserId, memberId, now);
    expect(booking?.startsAt).toEqual(local('2032-03-12', '15:00'));
  });

  it('responde null si no hay reservas futuras', async () => {
    const later = local('2032-03-13', '00:00');
    expect(await service.next(ownerUserId, undefined, later)).toEqual({
      booking: null,
    });
  });

  it('no deja consultar un profesional de otro negocio', async () => {
    await expect(
      service.next(ownerUserId, otherMemberId, now),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AgendaService.list', () => {
  // Reservas en enero de 2032 (antes del "ahora" fijo) para no tocar los tests
  // de next. En enero Santiago está en UTC-3: las 22:00 locales ya son el día
  // siguiente en UTC, así se nota si el rango se calcula en UTC por error
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const [wash, cut] = await Promise.all(
      ['Lavado', 'Peinado'].map((name) =>
        prisma.service.create({ data: { name, durationMin: 30, businessId } }),
      ),
    );
    const customerId = (
      await prisma.customer.create({
        data: { name: 'L', email: `agenda-l-${run}@test.local`, businessId },
      })
    ).id;
    const book = async (
      key: string,
      date: string,
      time: string,
      opts: {
        member?: string;
        status?: 'CONFIRMED' | 'CANCELLED';
        business?: string;
        customer?: string;
        // [serviceId, position]: se insertan en este orden
        items?: [string, number][];
      } = {},
    ) => {
      const startsAt = local(date, time);
      ids[key] = (
        await prisma.booking.create({
          data: {
            startsAt,
            endsAt: DateTime.fromJSDate(startsAt).plus({ hours: 1 }).toJSDate(),
            status: opts.status ?? 'CONFIRMED',
            businessId: opts.business ?? businessId,
            memberId: opts.member ?? memberId,
            customerId: opts.customer ?? customerId,
            items: {
              create: (opts.items ?? [[wash.id, 0]]).map(
                ([serviceId, position]) => ({ serviceId, position }),
              ),
            },
          },
        })
      ).id;
    };

    const otherCustomer = await prisma.customer.create({
      data: {
        name: 'O',
        email: `agenda-o-${run}@test.local`,
        businessId: otherBusinessId,
      },
    });
    const otherService = await prisma.service.create({
      data: { name: 'Ajeno', durationMin: 30, businessId: otherBusinessId },
    });

    await book('eveBefore', '2032-01-19', '22:00'); // fuera: día anterior
    await book('firstMinutes', '2032-01-20', '00:10');
    await book('cancelled', '2032-01-20', '10:00', {
      member: secondMemberId,
      status: 'CANCELLED',
    });
    // Peinado (posición 1) se inserta antes que Lavado (posición 0)
    await book('multi', '2032-01-21', '12:00', {
      items: [
        [cut.id, 1],
        [wash.id, 0],
      ],
    });
    await book('lastMinutes', '2032-01-21', '23:30');
    await book('dayAfter', '2032-01-22', '00:45'); // fuera: día siguiente
    await book('otherBusiness', '2032-01-20', '11:00', {
      business: otherBusinessId,
      member: otherMemberId,
      customer: otherCustomer.id,
      items: [[otherService.id, 0]],
    });
  });

  const listIds = async (memberFilter?: string) =>
    (
      await service.list(ownerUserId, '2032-01-20', '2032-01-21', memberFilter)
    ).map((b) => b.id);

  it('incluye el día completo en la zona del negocio, en orden', async () => {
    expect(await listIds()).toEqual([
      ids.firstMinutes,
      ids.cancelled,
      ids.multi,
      ids.lastMinutes,
    ]);
  });

  it('no incluye reservas de otro negocio', async () => {
    expect(await listIds()).not.toContain(ids.otherBusiness);
  });

  it('incluye las canceladas, con su estado', async () => {
    const list = await service.list(
      ownerUserId,
      '2032-01-20',
      '2032-01-20',
      secondMemberId,
    );
    expect(list.map((b) => [b.id, b.status])).toEqual([
      [ids.cancelled, 'CANCELLED'],
    ]);
  });

  it('filtra por profesional', async () => {
    expect(await listIds(memberId)).toEqual([
      ids.firstMinutes,
      ids.multi,
      ids.lastMinutes,
    ]);
  });

  it('responde los servicios planos, en el orden en que se hacen', async () => {
    const list = await service.list(ownerUserId, '2032-01-21', '2032-01-21');
    const multi = list.find((b) => b.id === ids.multi);
    expect(multi).toMatchObject({
      services: [
        { name: 'Lavado', durationMin: 30 },
        { name: 'Peinado', durationMin: 30 },
      ],
      member: { id: memberId, displayName: 'Dueña' },
      customer: { name: 'L', email: `agenda-l-${run}@test.local`, phone: null },
    });
    expect(multi).not.toHaveProperty('items');
  });

  it('no deja consultar un profesional de otro negocio', async () => {
    await expect(
      service.list(ownerUserId, '2032-01-20', '2032-01-21', otherMemberId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AgendaService.updateStatus', () => {
  // Reservas en febrero de 2032 (antes del "ahora" fijo) para no tocar los tests de next
  let serviceId: string;
  let customerId: string;
  const book = async (
    time: string,
    status: 'CONFIRMED' | 'CANCELLED' | 'PENDING' = 'CONFIRMED',
    member = memberId,
  ) =>
    (
      await prisma.booking.create({
        data: {
          startsAt: local('2032-02-16', time),
          endsAt: DateTime.fromJSDate(local('2032-02-16', time))
            .plus({ hours: 1 })
            .toJSDate(),
          status,
          businessId,
          memberId: member,
          customerId,
          items: { create: { serviceId, position: 0 } },
        },
      })
    ).id;

  beforeAll(async () => {
    serviceId = (
      await prisma.service.create({
        data: { name: 'Color', durationMin: 60, businessId },
      })
    ).id;
    customerId = (
      await prisma.customer.create({
        data: { name: 'E', email: `agenda-e-${run}@test.local`, businessId },
      })
    ).id;
  });

  it.each(['COMPLETED', 'NO_SHOW', 'CANCELLED'] as const)(
    'marca una reserva como %s',
    async (status) => {
      const id = await book(
        { COMPLETED: '09:00', NO_SHOW: '10:00', CANCELLED: '11:00' }[status],
      );
      expect(await service.updateStatus(ownerUserId, id, status)).toEqual({
        id,
        status,
      });
    },
  );

  describe('correo al cliente cuando el negocio cancela', () => {
    beforeEach(async () => {
      await settle(); // correos que aún iban en camino de pruebas anteriores
      cancelled.length = 0;
    });

    it('le avisa una vez, con la reserva y el motivo', async () => {
      const id = await book('12:00');
      await service.updateStatus(
        ownerUserId,
        id,
        'CANCELLED',
        '  Se nos cortó la luz  ',
      );
      await settle();
      expect(cancelled).toHaveLength(1);
      expect(cancelled[0]).toMatchObject({
        to: `agenda-e-${run}@test.local`,
        customerName: 'E',
        serviceName: 'Color',
        startsAt: local('2032-02-16', '12:00'),
        timezone: 'America/Santiago',
        reason: 'Se nos cortó la luz',
      });
      expect(cancelled[0].businessSlug).toMatch(/^int-agenda-a-/);
    });

    it('sin motivo, el correo sale sin motivo', async () => {
      await service.updateStatus(ownerUserId, await book('13:00'), 'CANCELLED');
      await settle();
      expect(cancelled[0].reason).toBeNull();
    });

    it('un motivo con solo espacios cuenta como sin motivo', async () => {
      await service.updateStatus(
        ownerUserId,
        await book('20:00'),
        'CANCELLED',
        '   ',
      );
      await settle();
      expect(cancelled).toHaveLength(1);
      expect(cancelled[0].reason).toBeNull();
    });

    it('cancelar una reserva pendiente también le avisa', async () => {
      const id = await book('21:00', 'PENDING');
      expect(await service.updateStatus(ownerUserId, id, 'CANCELLED')).toEqual({
        id,
        status: 'CANCELLED',
      });
      await settle();
      expect(cancelled).toHaveLength(1);
    });

    it('cancelar dos veces al mismo tiempo manda un solo correo', async () => {
      const id = await book('15:00');
      await Promise.all([
        service.updateStatus(ownerUserId, id, 'CANCELLED'),
        service.updateStatus(ownerUserId, id, 'CANCELLED'),
      ]);
      await settle();
      expect(cancelled).toHaveLength(1);
    });

    it.each(['COMPLETED', 'NO_SHOW'] as const)(
      'marcar %s no le escribe al cliente',
      async (status) => {
        await service.updateStatus(
          ownerUserId,
          await book(status === 'COMPLETED' ? '16:00' : '16:30'),
          status,
        );
        await settle();
        expect(cancelled).toEqual([]);
      },
    );

    it('cancelar una reserva ya completada no le escribe al cliente', async () => {
      const id = await book('19:00');
      await service.updateStatus(ownerUserId, id, 'COMPLETED');
      await service.updateStatus(ownerUserId, id, 'CANCELLED');
      await settle();
      expect(cancelled).toEqual([]);
    });
  });

  describe('correo al cliente de que su servicio está listo', () => {
    const setNotify = (notifyCompleted: boolean) =>
      prisma.business.update({
        where: { id: businessId },
        data: { notifyCompleted },
      });

    beforeEach(async () => {
      await settle();
      completed.length = 0;
    });
    afterEach(() => setNotify(false));

    it('con el aviso activado, completar le avisa una vez con el servicio y el negocio', async () => {
      await setNotify(true);
      await prisma.business.update({
        where: { id: businessId },
        data: { phone: '+56 9 1111 2222', address: 'Calle 1, Ñuñoa' },
      });
      try {
        const id = await book('01:00');
        expect(
          await service.updateStatus(ownerUserId, id, 'COMPLETED'),
        ).toEqual({ id, status: 'COMPLETED' });
        await settle();
        expect(completed).toEqual([
          {
            to: `agenda-e-${run}@test.local`,
            customerName: 'E',
            businessName: 'Agenda a',
            businessPhone: '+56 9 1111 2222',
            businessAddress: 'Calle 1, Ñuñoa',
            serviceName: 'Color',
          },
        ]);
      } finally {
        await prisma.business.update({
          where: { id: businessId },
          data: { phone: null, address: null },
        });
      }
    });

    it('una reserva pendiente también avisa', async () => {
      await setNotify(true);
      await service.updateStatus(
        ownerUserId,
        await book('02:00', 'PENDING'),
        'COMPLETED',
      );
      await settle();
      expect(completed).toHaveLength(1);
    });

    it('con el aviso desactivado, completar no le escribe al cliente', async () => {
      const id = await book('03:00');
      expect(await service.updateStatus(ownerUserId, id, 'COMPLETED')).toEqual({
        id,
        status: 'COMPLETED',
      });
      await settle();
      expect(completed).toEqual([]);
    });

    it('completar dos veces al mismo tiempo manda un solo correo', async () => {
      await setNotify(true);
      const id = await book('04:00');
      await Promise.all([
        service.updateStatus(ownerUserId, id, 'COMPLETED'),
        service.updateStatus(ownerUserId, id, 'COMPLETED'),
      ]);
      await settle();
      expect(completed).toHaveLength(1);
    });

    it('completar una que no estaba activa (cancelada) no le escribe', async () => {
      await setNotify(true);
      const id = await book('05:00', 'CANCELLED');
      await service.updateStatus(ownerUserId, id, 'COMPLETED');
      await settle();
      expect(completed).toEqual([]);
    });

    it('marcar que no se presentó no le escribe', async () => {
      await setNotify(true);
      await service.updateStatus(ownerUserId, await book('06:00'), 'NO_SHOW');
      await settle();
      expect(completed).toEqual([]);
    });

    it('si el correo falla, la reserva igual queda completada', async () => {
      await setNotify(true);
      const logged = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});
      const failing = new AgendaService(
        prisma as unknown as PrismaService,
        {
          bookingCompleted: () => Promise.reject(new Error('Resend caído')),
        } as unknown as NotificationsService,
      );
      try {
        const id = await book('07:00');
        expect(
          await failing.updateStatus(ownerUserId, id, 'COMPLETED'),
        ).toEqual({ id, status: 'COMPLETED' });
        await settle();
        const saved = await prisma.booking.findUniqueOrThrow({ where: { id } });
        expect(saved.status).toBe('COMPLETED');
        expect(logged).toHaveBeenCalledWith(
          'Error avisando que el servicio está listo',
          expect.any(Error),
        );
      } finally {
        logged.mockRestore();
      }
    });
  });

  it('reactivar una cancelada cuya hora ya tomó otra reserva responde 409', async () => {
    const cancelled = await book('14:00', 'CANCELLED');
    await book('14:30'); // otro cliente tomó parte de esa hora
    await expect(
      service.updateStatus(ownerUserId, cancelled, 'CONFIRMED'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reactivar una cancelada con la hora libre funciona', async () => {
    const cancelled = await book('17:00', 'CANCELLED');
    expect(
      await service.updateStatus(ownerUserId, cancelled, 'CONFIRMED'),
    ).toEqual({ id: cancelled, status: 'CONFIRMED' });
  });

  it('no se puede cambiar una reserva de otro negocio (404)', async () => {
    const id = await book('18:00');
    await expect(
      service.updateStatus(otherUserId, id, 'CANCELLED'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('si el correo falla, la cancelación igual queda hecha', async () => {
    const logged = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const failing = new AgendaService(
      prisma as unknown as PrismaService,
      {
        bookingCancelledByBusiness: () =>
          Promise.reject(new Error('Resend caído')),
      } as unknown as NotificationsService,
    );
    try {
      const id = await book('22:00');
      expect(await failing.updateStatus(ownerUserId, id, 'CANCELLED')).toEqual({
        id,
        status: 'CANCELLED',
      });
      await settle();
      const saved = await prisma.booking.findUniqueOrThrow({ where: { id } });
      expect(saved.status).toBe('CANCELLED');
      // El error queda en el log en vez de propagarse
      expect(logged).toHaveBeenCalledWith(
        'Error avisando la cancelación',
        expect.any(Error),
      );
    } finally {
      logged.mockRestore();
    }
  });
});
