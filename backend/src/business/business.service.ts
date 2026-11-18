import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { assertOwner, getMembership } from '../auth/membership';
import { PrismaService } from '../prisma/prisma.service';
import { detectImageType } from '../storage/image-type';
import { StorageService } from '../storage/storage.service';
import { UpdateBusinessDto } from './dto/update-business.dto';

const SELECT = {
  name: true,
  slug: true,
  phone: true,
  address: true,
  brandColor: true,
  logoKey: true,
} as const;

// Datos del negocio que ven los clientes (página pública y correos)
@Injectable()
export class BusinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // El cliente recibe la URL pública del logo, no la ruta interna del bucket
  private withLogoUrl<T extends { logoKey: string | null }>({
    logoKey,
    ...business
  }: T) {
    return { ...business, logoUrl: this.storage.urlFor(logoKey) };
  }

  async get(userId: string) {
    const { businessId } = await getMembership(this.prisma, userId);
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: SELECT,
    });
    return this.withLogoUrl(business);
  }

  // Solo el dueño cambia los datos del negocio
  private async ownerBusinessId(userId: string) {
    const m = await getMembership(this.prisma, userId);
    assertOwner(m, 'Solo el dueño puede cambiar estos datos');
    return m.businessId;
  }

  async update(userId: string, dto: UpdateBusinessDto) {
    const businessId = await this.ownerBusinessId(userId);
    const business = await this.prisma.business.update({
      where: { id: businessId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.brandColor !== undefined && { brandColor: dto.brandColor }),
      },
      select: SELECT,
    });
    return this.withLogoUrl(business);
  }

  async setLogo(userId: string, file?: { buffer: Buffer }) {
    // El rol se revisa antes que R2: un profesional recibe 403, no 503
    const businessId = await this.ownerBusinessId(userId);
    if (!this.storage.enabled) {
      throw new ServiceUnavailableException(
        'La subida de imágenes todavía no está disponible',
      );
    }
    if (!file) throw new BadRequestException('Falta el logo');
    const type = detectImageType(file.buffer);
    if (!type) {
      throw new BadRequestException('El logo debe ser JPG, PNG o WebP');
    }

    const { logoKey: previous } = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { logoKey: true },
    });
    // Ruta nueva en cada subida: así la caché nunca muestra el logo anterior
    const key = `logos/${businessId}/${randomBytes(8).toString('hex')}.${type.ext}`;
    await this.storage.put(key, file.buffer, type.mime);
    const business = await this.prisma.business.update({
      where: { id: businessId },
      data: { logoKey: key },
      select: SELECT,
    });
    if (previous) void this.storage.remove(previous);
    return this.withLogoUrl(business);
  }

  async removeLogo(userId: string) {
    const businessId = await this.ownerBusinessId(userId);
    const { logoKey: previous } = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { logoKey: true },
    });
    const business = await this.prisma.business.update({
      where: { id: businessId },
      data: { logoKey: null },
      select: SELECT,
    });
    if (previous) void this.storage.remove(previous);
    return this.withLogoUrl(business);
  }
}
