import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AgendaService } from '../agenda/agenda.service';
import { MembersService } from '../members/members.service';
import type {
  CancelledByBusinessEmailData,
  NotificationsService,
} from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ServicesService } from '../services/services.service';
import type { StorageService } from '../storage/storage.service';
import { TimeBlocksService } from '../time-blocks/time-blocks.service';
import { WorkingHoursService } from '../working-hours/working-hours.service';

// Qué puede hacer un profesional (STAFF) con cuenta dentro de su negocio.
// Ana es STAFF con cuenta; Beto, STAFF sin cuenta. El dueño sirve de control
const prisma = new PrismaClient();
const db = prisma as unknown as PrismaService;
// Correos simulados: se anotan en vez de enviarse
const cancelledEmails: CancelledByBusinessEmailData[] = [];
const notifications = {
  bookingCancelledByBusiness: (data: CancelledByBusinessEmailData) => {
    cancelledEmails.push(data);
    return Promise.resolve();
  },
} as unknown as NotificationsService;
// El correo sale en segundo plano: espera a que llegue
const settle = () => new Promise((r) => setTimeout(r, 300));
// Sin R2: así se comprueba que el rol se revisa antes que la subida (403, no 503)
const storage = {
  enabled: false,
  urlFor: () => null,
} as unknown as StorageService;

const agenda = new AgendaService(db, notifications);
const hours = new WorkingHoursService(db);
const blocks = new TimeBlocksService(db);
const services = new ServicesService(db, storage);
const members = new MembersService(db);
const run = Date.now().toString(36);

let businessId: string;
let ownerUserId: string;
let anaUserId: string;
let anaId: string;
let betoId: string;
let serviceId: string;
let anaBookingId: string;
let betoBookingId: string;
let anaBlockId: string;
let betoBlockId: string;
let businessBlockId: string;

const at = (iso: string) => new Date(iso);
const forbidden = (p: Promise<unknown>) =>
  expect(p).rejects.toBeInstanceOf(ForbiddenException);
const notFound = (p: Promise<unknown>) =>
  expect(p).rejects.toBeInstanceOf(NotFoundException);

beforeAll(async () => {
  businessId = (
    await prisma.business.create({
      data: { name: 'Permisos', slug: `int-staff-perms-${run}` },
    })
  ).id;
  [ownerUserId, anaUserId] = await Promise.all(
    ['owner', 'ana'].map(async (key) => {
      const user = await prisma.user.create({
        data: {
          email: `staff-perms-${key}-${run}@test.local`,
          name: key,
          password: 'x',
        },
      });
      return user.id;
    }),
  );
  await prisma.member.create({
    data: {
      role: 'OWNER',
      displayName: 'Dueña',
      userId: ownerUserId,
      businessId,
    },
  });
  anaId = (
    await prisma.member.create({
      data: {
        role: 'STAFF',
        displayName: 'Ana',
        userId: anaUserId,
        businessId,
      },
    })
  ).id;
  betoId = (
    await prisma.member.create({
      data: { role: 'STAFF', displayName: 'Beto', businessId },
    })
  ).id;
  serviceId = (
    await prisma.service.create({
      data: { name: 'Corte', durationMin: 30, businessId },
    })
  ).id;
  await prisma.workingHours.createMany({
    data: [anaId, betoId].map((memberId) => ({
      weekday: 1,
      opensAt: '09:00',
      closesAt: '18:00',
      memberId,
    })),
  });
  const customerId = (
    await prisma.customer.create({
      data: { name: 'C', email: `staff-perms-c-${run}@test.local`, businessId },
    })
  ).id;
  // La de Beto es antes: si Ana viera todo, `next` le devolvería la de Beto
  const book = (memberId: string, hour: string) =>
    prisma.booking.create({
      data: {
        startsAt: at(`2033-03-01T${hour}:00Z`),
        endsAt: at(`2033-03-01T${hour}:30Z`),
        businessId,
        memberId,
        customerId,
      },
    });
  anaBookingId = (await book(anaId, '15')).id;
  betoBookingId = (await book(betoId, '13')).id;
  const block = (memberId: string | null) =>
    prisma.timeBlock.create({
      data: {
        startsAt: at('2033-05-01T12:00:00Z'),
        endsAt: at('2033-05-01T14:00:00Z'),
        businessId,
        memberId,
      },
    });
  anaBlockId = (await block(anaId)).id;
  betoBlockId = (await block(betoId)).id;
  businessBlockId = (await block(null)).id;
});

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { businessId } });
  await prisma.customer.deleteMany({ where: { businessId } });
  await prisma.timeBlock.deleteMany({ where: { businessId } });
  await prisma.workingHours.deleteMany({ where: { member: { businessId } } });
  await prisma.memberService.deleteMany({ where: { member: { businessId } } });
  await prisma.service.deleteMany({ where: { businessId } });
  await prisma.member.deleteMany({ where: { businessId } });
  await prisma.user.deleteMany({
    where: { id: { in: [ownerUserId, anaUserId] } },
  });
  await prisma.business.delete({ where: { id: businessId } });
  await prisma.$disconnect();
});

const range = ['2033-02-28', '2033-03-02'] as const;
const ids = (list: { id: string }[]) => list.map((x) => x.id).sort();

describe('agenda de un profesional', () => {
  it('sin filtro ve solo sus reservas', async () => {
    expect(ids(await agenda.list(anaUserId, ...range))).toEqual([anaBookingId]);
  });

  it('puede pedir su propia agenda por su id', async () => {
    expect(ids(await agenda.list(anaUserId, ...range, anaId))).toEqual([
      anaBookingId,
    ]);
  });

  it('pedir la agenda de otro profesional responde 404', async () => {
    await notFound(agenda.list(anaUserId, ...range, betoId));
    await notFound(agenda.next(anaUserId, betoId));
  });

  it('su próxima reserva es la suya, aunque otra sea antes', async () => {
    const { booking } = await agenda.next(
      anaUserId,
      undefined,
      at('2033-01-01'),
    );
    expect(booking?.id).toBe(anaBookingId);
  });

  it('cambia el estado de sus reservas', async () => {
    expect(
      (await agenda.updateStatus(anaUserId, anaBookingId, 'COMPLETED')).status,
    ).toBe('COMPLETED');
    expect(
      (await agenda.updateStatus(anaUserId, anaBookingId, 'CONFIRMED')).status,
    ).toBe('CONFIRMED');
  });

  it('cancela sus reservas y el cliente recibe el aviso una vez', async () => {
    await settle();
    cancelledEmails.length = 0;
    expect(
      (
        await agenda.updateStatus(
          anaUserId,
          anaBookingId,
          'CANCELLED',
          'Me enfermé',
        )
      ).status,
    ).toBe('CANCELLED');
    await settle();
    expect(cancelledEmails).toHaveLength(1);
    expect(cancelledEmails[0]).toMatchObject({
      to: `staff-perms-c-${run}@test.local`,
      reason: 'Me enfermé',
    });
  });

  it('la reserva de otro profesional responde 404, sin avisar a nadie', async () => {
    cancelledEmails.length = 0;
    await notFound(agenda.updateStatus(anaUserId, betoBookingId, 'CANCELLED'));
    await settle();
    expect(cancelledEmails).toEqual([]);
    const beto = await prisma.booking.findUniqueOrThrow({
      where: { id: betoBookingId },
    });
    expect(beto.status).toBe('CONFIRMED');
  });

  it('el dueño sigue viendo todas las reservas', async () => {
    expect(ids(await agenda.list(ownerUserId, ...range))).toEqual(
      [anaBookingId, betoBookingId].sort(),
    );
  });
});

describe('horario de un profesional', () => {
  it('ve su propio horario', async () => {
    const own = await hours.findAll(anaUserId);
    expect(own.map((h) => h.memberId)).toEqual([anaId]);
    expect((await hours.findAll(anaUserId, anaId)).length).toBe(1);
  });

  it('el horario de otro profesional responde 404', async () => {
    await notFound(hours.findAll(anaUserId, betoId));
  });

  it('no puede cambiar horarios, ni el suyo', async () => {
    const days = [{ weekday: 2, opensAt: '10:00', closesAt: '12:00' }];
    await forbidden(hours.replace(anaUserId, { days }));
    await forbidden(hours.replace(anaUserId, { memberId: anaId, days }));
  });

  it('el dueño sí cambia el horario de un profesional', async () => {
    const days = [{ weekday: 1, opensAt: '10:00', closesAt: '17:00' }];
    const saved = await hours.replace(ownerUserId, { memberId: betoId, days });
    expect(saved.map((h) => h.opensAt)).toEqual(['10:00']);
  });
});

describe('bloqueos de un profesional', () => {
  const day = { startDate: '2033-06-01', endDate: '2033-06-01', allDay: true };

  it('ve todos los bloqueos del negocio', async () => {
    const { blocks: list } = await blocks.list(anaUserId);
    expect(ids(list)).toEqual(
      [anaBlockId, betoBlockId, businessBlockId].sort(),
    );
  });

  it('crea y borra bloqueos de su propio horario', async () => {
    const created = await blocks.create(anaUserId, { ...day, memberId: anaId });
    expect(created.member?.id).toBe(anaId);
    expect(await blocks.remove(anaUserId, created.id)).toEqual({
      id: created.id,
    });
  });

  it('no bloquea a todo el negocio ni a otro profesional', async () => {
    await forbidden(blocks.create(anaUserId, day));
    await forbidden(blocks.create(anaUserId, { ...day, memberId: betoId }));
  });

  it('el bloqueo de otro o de todo el negocio responde 404', async () => {
    await notFound(blocks.remove(anaUserId, betoBlockId));
    await notFound(blocks.remove(anaUserId, businessBlockId));
    expect(await prisma.timeBlock.count({ where: { businessId } })).toBe(3);
  });

  it('el dueño sí bloquea a todo el negocio', async () => {
    const created = await blocks.create(ownerUserId, day);
    expect(created.member).toBeNull();
    await blocks.remove(ownerUserId, created.id);
  });
});

describe('servicios y equipo para un profesional', () => {
  it('ve los servicios y el equipo', async () => {
    expect(ids(await services.findAll(anaUserId))).toEqual([serviceId]);
    expect((await members.list(anaUserId)).length).toBe(3);
  });

  it('no crea ni cambia servicios', async () => {
    await forbidden(
      services.create(anaUserId, { name: 'Nuevo', durationMin: 30 }),
    );
    await forbidden(services.update(anaUserId, serviceId, { name: 'X' }));
    await forbidden(services.deactivate(anaUserId, serviceId));
    await forbidden(services.removeImage(anaUserId, serviceId));
    // Sin R2 el dueño recibiría 503; el profesional recibe 403 antes
    await forbidden(
      services.setImage(anaUserId, serviceId, { buffer: Buffer.from('x') }),
    );
    const service = await prisma.service.findUniqueOrThrow({
      where: { id: serviceId },
    });
    expect(service).toMatchObject({ name: 'Corte', active: true });
  });

  it('no agrega ni cambia profesionales, ni a sí mismo', async () => {
    await forbidden(members.create(anaUserId, { displayName: 'Intrusa' }));
    await forbidden(members.update(anaUserId, betoId, { active: false }));
    await forbidden(members.update(anaUserId, anaId, { displayName: 'Ana 2' }));
    expect(await prisma.member.count({ where: { businessId } })).toBe(3);
  });

  it('el dueño sí crea servicios y profesionales', async () => {
    const created = await services.create(ownerUserId, {
      name: 'Barba',
      durationMin: 20,
    });
    expect(created.businessId).toBe(businessId);
    const member = await members.create(ownerUserId, { displayName: 'Caro' });
    expect(member.displayName).toBe('Caro');
  });
});
