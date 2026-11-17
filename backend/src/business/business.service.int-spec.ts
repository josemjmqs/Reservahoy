import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import { BusinessService } from './business.service';

// Servicio real contra PostgreSQL; R2 se reemplaza por un registro en memoria
const prisma = new PrismaClient();
const bucket = new Map<string, string>(); // ruta -> content type
const storage = {
  enabled: true,
  urlFor: (key: string | null) => (key ? `https://img.test/${key}` : null),
  put: (key: string, _body: Buffer, contentType: string) => {
    bucket.set(key, contentType);
    return Promise.resolve();
  },
  remove: (key: string) => {
    bucket.delete(key);
    return Promise.resolve();
  },
} as unknown as StorageService;
const service = new BusinessService(
  prisma as unknown as PrismaService,
  storage,
);
const withoutR2 = new BusinessService(
  prisma as unknown as PrismaService,
  {
    ...storage,
    enabled: false,
  } as unknown as StorageService,
);

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const run = Date.now().toString(36);

let businessId: string;
let otherBusinessId: string;
const userIds: Record<'owner' | 'staff' | 'other', string> = {
  owner: '',
  staff: '',
  other: '',
};

beforeAll(async () => {
  [businessId, otherBusinessId] = (
    await Promise.all(
      ['a', 'b'].map((x) =>
        prisma.business.create({
          data: { name: `Taller ${x}`, slug: `int-business-${x}-${run}` },
        }),
      ),
    )
  ).map((b) => b.id);
  for (const key of ['owner', 'staff', 'other'] as const) {
    userIds[key] = (
      await prisma.user.create({
        data: {
          email: `business-${key}-${run}@test.local`,
          name: key,
          password: 'x',
        },
      })
    ).id;
  }
  await prisma.member.createMany({
    data: [
      {
        role: 'OWNER',
        displayName: 'Dueño',
        userId: userIds.owner,
        businessId,
      },
      {
        role: 'STAFF',
        displayName: 'Ayudante',
        userId: userIds.staff,
        businessId,
      },
      {
        role: 'OWNER',
        displayName: 'Otro',
        userId: userIds.other,
        businessId: otherBusinessId,
      },
    ],
  });
});

afterAll(async () => {
  const ids = [businessId, otherBusinessId];
  await prisma.member.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.user.deleteMany({
    where: { id: { in: Object.values(userIds) } },
  });
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('BusinessService', () => {
  it('muestra los datos del propio negocio', async () => {
    expect(await service.get(userIds.owner)).toEqual({
      name: 'Taller a',
      slug: `int-business-a-${run}`,
      phone: null,
      address: null,
      brandColor: null,
      logoUrl: null,
      notifyCompleted: false,
    });
  });

  it('el dueño cambia nombre y teléfono, sin tocar el otro negocio', async () => {
    expect(
      await service.update(userIds.owner, {
        name: 'Taller Pérez',
        phone: '+56 9 8765 4321',
      }),
    ).toMatchObject({ name: 'Taller Pérez', phone: '+56 9 8765 4321' });
    expect((await service.get(userIds.other)).name).toBe('Taller b');
  });

  it('cambiar solo el teléfono deja el nombre como estaba, y null lo borra', async () => {
    await service.update(userIds.owner, { phone: '22 345 6789' });
    expect((await service.get(userIds.owner)).name).toBe('Taller Pérez');
    await service.update(userIds.owner, { phone: null });
    expect((await service.get(userIds.owner)).phone).toBeNull();
  });

  it('el dueño guarda la dirección sin tocar lo demás, y null la borra', async () => {
    const address = 'Av. Providencia 1234, local 5, Providencia';
    expect(await service.update(userIds.owner, { address })).toMatchObject({
      name: 'Taller Pérez',
      address,
    });
    expect((await service.get(userIds.owner)).address).toBe(address);
    expect((await service.get(userIds.other)).address).toBeNull();
    await service.update(userIds.owner, { address: null });
    expect((await service.get(userIds.owner)).address).toBeNull();
  });

  it('un miembro que no es dueño no puede cambiarlos', async () => {
    await expect(
      service.update(userIds.staff, { name: 'Mío' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect((await service.get(userIds.staff)).name).toBe('Taller Pérez');
  });

  it('el dueño elige el color de marca y null vuelve al de Reservahoy', async () => {
    expect(
      await service.update(userIds.owner, { brandColor: '#0f766e' }),
    ).toMatchObject({ brandColor: '#0f766e', name: 'Taller Pérez' });
    expect((await service.get(userIds.staff)).brandColor).toBe('#0f766e');
    await service.update(userIds.owner, { brandColor: null });
    expect((await service.get(userIds.owner)).brandColor).toBeNull();
  });

  it('un miembro que no es dueño no cambia el color', async () => {
    await expect(
      service.update(userIds.staff, { brandColor: '#000000' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('el dueño activa y desactiva el aviso de servicio listo, sin tocar lo demás', async () => {
    expect(
      await service.update(userIds.owner, { notifyCompleted: true }),
    ).toMatchObject({ notifyCompleted: true, name: 'Taller Pérez' });
    expect((await service.get(userIds.staff)).notifyCompleted).toBe(true);
    expect((await service.get(userIds.other)).notifyCompleted).toBe(false);
    await service.update(userIds.owner, { notifyCompleted: false });
    expect((await service.get(userIds.owner)).notifyCompleted).toBe(false);
  });

  it('un miembro que no es dueño no cambia el aviso de servicio listo', async () => {
    await expect(
      service.update(userIds.staff, { notifyCompleted: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('BusinessService: logo', () => {
  it('guarda el logo con el tipo detectado por su contenido y devuelve la URL pública', async () => {
    const b = await service.setLogo(userIds.owner, { buffer: JPG });
    expect(b.logoUrl).toMatch(
      new RegExp(`^https://img\\.test/logos/${businessId}/[0-9a-f]{16}\\.jpg$`),
    );
    expect(b).not.toHaveProperty('logoKey');
    expect([...bucket.values()]).toEqual(['image/jpeg']);
    expect((await service.get(userIds.owner)).logoUrl).toBe(b.logoUrl);
  });

  it('al reemplazarlo borra el logo anterior del bucket', async () => {
    const before = [...bucket.keys()];
    const b = await service.setLogo(userIds.owner, { buffer: PNG });
    expect(b.logoUrl).toMatch(/\.png$/);
    expect(bucket.size).toBe(1);
    expect(bucket.has(before[0])).toBe(false);
  });

  it('rechaza archivos que no son JPG, PNG ni WebP, o sin archivo', async () => {
    await expect(
      service.setLogo(userIds.owner, { buffer: Buffer.from('<svg/>') }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setLogo(userIds.owner)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('un miembro que no es dueño no sube ni quita el logo (403, también sin R2)', async () => {
    await expect(
      service.setLogo(userIds.staff, { buffer: JPG }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.removeLogo(userIds.staff)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      withoutR2.setLogo(userIds.staff, { buffer: JPG }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(bucket.size).toBe(1);
  });

  it('sin R2 el dueño recibe 503', async () => {
    await expect(
      withoutR2.setLogo(userIds.owner, { buffer: JPG }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('quitar el logo lo borra del bucket, sin tocar el otro negocio', async () => {
    const b = await service.removeLogo(userIds.owner);
    expect(b.logoUrl).toBeNull();
    expect(bucket.size).toBe(0);
    expect((await service.get(userIds.other)).logoUrl).toBeNull();
  });
});
