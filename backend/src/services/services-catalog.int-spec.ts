import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import { ServicesService } from './services.service';

// Catálogo de servicios contra PostgreSQL: a quién se asigna un servicio nuevo,
// borrado lógico, aislamiento entre negocios, textos y fallas de R2.
// R2 se simula en memoria y cada prueba puede apagarlo o hacerlo fallar
const prisma = new PrismaClient();
const bucket = new Map<string, string>();
const r2 = { enabled: true, failPut: false, removed: [] as string[] };
const storage = {
  get enabled() {
    return r2.enabled;
  },
  urlFor: (key: string | null) => (key ? `https://img.test/${key}` : null),
  put: (key: string, _body: Buffer, contentType: string) => {
    if (r2.failPut) return Promise.reject(new Error('R2 caído'));
    bucket.set(key, contentType);
    return Promise.resolve();
  },
  remove: (key: string) => {
    r2.removed.push(key);
    bucket.delete(key);
    return Promise.resolve();
  },
} as unknown as StorageService;
const service = new ServicesService(
  prisma as unknown as PrismaService,
  storage,
);

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const run = Date.now().toString(36);

let businessId: string;
let otherBusinessId: string;
let userId: string;
let otherUserId: string;
let coOwnerUserId: string;
let ownerMemberId: string;
let coOwnerMemberId: string;
let staffMemberId: string;

beforeAll(async () => {
  [businessId, otherBusinessId] = (
    await Promise.all(
      ['a', 'b'].map((x) =>
        prisma.business.create({
          data: { name: `Catálogo ${x}`, slug: `int-catalog-${x}-${run}` },
        }),
      ),
    )
  ).map((b) => b.id);
  [userId, otherUserId, coOwnerUserId] = await Promise.all(
    ['a', 'b', 'c'].map(
      async (x) =>
        (
          await prisma.user.create({
            data: {
              email: `catalog-${x}-${run}@test.local`,
              name: x,
              password: 'x',
            },
          })
        ).id,
    ),
  );
  ownerMemberId = (
    await prisma.member.create({
      data: { role: 'OWNER', displayName: 'Dueña', userId, businessId },
    })
  ).id;
  // Un segundo dueño (como queda quien acepta una invitación)
  coOwnerMemberId = (
    await prisma.member.create({
      data: {
        role: 'OWNER',
        displayName: 'Socia',
        userId: coOwnerUserId,
        businessId,
      },
    })
  ).id;
  staffMemberId = (
    await prisma.member.create({
      data: { role: 'STAFF', displayName: 'Ayudante', businessId },
    })
  ).id;
  await prisma.member.create({
    data: {
      role: 'OWNER',
      displayName: 'Otro',
      userId: otherUserId,
      businessId: otherBusinessId,
    },
  });
});

beforeEach(() => {
  r2.enabled = true;
  r2.failPut = false;
  r2.removed.length = 0;
});

afterAll(async () => {
  const ids = [businessId, otherBusinessId];
  await prisma.booking.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.customer.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.service.deleteMany({ where: { businessId: { in: ids } } }); // borra MemberService en cascada
  await prisma.member.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.user.deleteMany({
    where: { id: { in: [userId, otherUserId, coOwnerUserId] } },
  });
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

const stored = (id: string) =>
  prisma.service.findUniqueOrThrow({ where: { id } });

describe('crear servicios', () => {
  // Con varios dueños, cada uno hace sus servicios: los demás se suman en Equipo
  it('se asignan solo a quien los crea, no a los otros dueños ni profesionales', async () => {
    const assignedTo = async (serviceId: string) =>
      (
        await prisma.memberService.findMany({
          where: { serviceId },
          select: { memberId: true },
        })
      ).map((a) => a.memberId);

    const corte = await service.create(userId, { name: 'Corte', durationMin: 30 });
    expect(await assignedTo(corte.id)).toEqual([ownerMemberId]);
    const barba = await service.create(coOwnerUserId, {
      name: 'Barba',
      durationMin: 20,
    });
    expect(await assignedTo(barba.id)).toEqual([coOwnerMemberId]);
    expect(await assignedTo(corte.id)).not.toContain(staffMemberId);
  });

  it('guarda la categoría sin espacios sobrantes; vacía queda en null', async () => {
    const withCategory = await service.create(userId, {
      name: 'Uñas gel',
      durationMin: 45,
      category: '  Uñas  ',
    });
    expect(withCategory.category).toBe('Uñas');
    const blank = await service.create(userId, {
      name: 'Sin categoría',
      durationMin: 30,
      category: '   ',
    });
    expect(blank.category).toBeNull();
  });
});

describe('editar servicios', () => {
  let id: string;

  beforeAll(async () => {
    id = (
      await service.create(userId, {
        name: 'Barba',
        durationMin: 20,
        price: 8000,
        category: 'Hombres',
      })
    ).id;
  });

  it('editar sin enviar la categoría no la cambia; vacía la borra', async () => {
    await service.update(userId, id, { name: 'Barba completa' });
    expect((await stored(id)).category).toBe('Hombres');
    await service.update(userId, id, { category: '  Caballeros ' });
    expect((await stored(id)).category).toBe('Caballeros');
    await service.update(userId, id, { category: '  ' });
    expect((await stored(id)).category).toBeNull();
  });

  it('el precio se puede quitar con null', async () => {
    expect((await stored(id)).price).toBe(8000);
    await service.update(userId, id, { price: null });
    expect((await stored(id)).price).toBeNull();
  });

  it('otro negocio no puede editarlo ni desactivarlo (404)', async () => {
    await expect(
      service.update(otherUserId, id, { name: 'Hackeado' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deactivate(otherUserId, id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(await stored(id)).toMatchObject({
      name: 'Barba completa',
      active: true,
    });
  });
});

describe('desactivar servicios (borrado lógico)', () => {
  it('queda inactivo, se sigue listando y sus reservas no se tocan', async () => {
    const s = await service.create(userId, {
      name: 'Alisado',
      durationMin: 60,
    });
    const customer = await prisma.customer.create({
      data: { name: 'C', email: `catalog-c-${run}@test.local`, businessId },
    });
    const booking = await prisma.booking.create({
      data: {
        startsAt: new Date('2031-05-05T13:00:00Z'),
        endsAt: new Date('2031-05-05T14:00:00Z'),
        businessId,
        memberId: ownerMemberId,
        customerId: customer.id,
        items: { create: { serviceId: s.id, position: 0 } },
      },
    });

    expect((await service.deactivate(userId, s.id)).active).toBe(false);

    const listed = (await service.findAll(userId)).find((x) => x.id === s.id);
    expect(listed?.active).toBe(false);
    const kept = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { items: true },
    });
    expect(kept.status).toBe('CONFIRMED');
    expect(kept.items.map((i) => i.serviceId)).toEqual([s.id]);
  });
});

describe('listar servicios', () => {
  it('en orden de creación y sin servicios de otro negocio', async () => {
    const foreign = await service.create(otherUserId, {
      name: 'Ajeno',
      durationMin: 30,
    });
    const list = await service.findAll(userId);
    expect(list.map((s) => s.id)).not.toContain(foreign.id);
    const created = list.map((s) => s.createdAt.getTime());
    expect(created).toEqual([...created].sort((a, b) => a - b));
    expect(list.length).toBeGreaterThan(1);
  });
});

describe('foto de servicios cuando R2 falla', () => {
  let id: string;
  let firstKey: string;

  beforeAll(async () => {
    id = (await service.create(userId, { name: 'Con foto', durationMin: 30 }))
      .id;
    await service.setImage(userId, id, { buffer: JPG });
    firstKey = (await stored(id)).imageKey!;
  });

  it('sin R2 configurado, el dueño recibe 503 y la foto no cambia', async () => {
    r2.enabled = false;
    await expect(
      service.setImage(userId, id, { buffer: PNG }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect((await stored(id)).imageKey).toBe(firstKey);
  });

  it('si la subida falla, conserva la foto anterior y no la borra', async () => {
    r2.failPut = true;
    await expect(service.setImage(userId, id, { buffer: PNG })).rejects.toThrow(
      'R2 caído',
    );
    expect((await stored(id)).imageKey).toBe(firstKey);
    expect(r2.removed).toEqual([]);
    expect(bucket.has(firstKey)).toBe(true);
  });

  it('quitar la foto de un servicio sin foto no llama a R2', async () => {
    const plain = await service.create(userId, {
      name: 'Sin foto',
      durationMin: 30,
    });
    const s = await service.removeImage(userId, plain.id);
    expect(s.imageUrl).toBeNull();
    expect(r2.removed).toEqual([]);
  });
});
