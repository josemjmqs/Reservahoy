import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  isTransient,
  mapsUrl,
  NotificationsService,
} from './notifications.service';

type Result = {
  error: { name: string; message: string; statusCode: number | null } | null;
};

// Resend simulado: devuelve las respuestas en orden y anota cada llamada
function setup(responses: (Result | Error)[]) {
  const calls: {
    to: unknown;
    subject?: string;
    replyTo?: unknown;
    html?: string;
    attachments?: unknown;
    idempotencyKey?: string;
  }[] = [];
  const service = new NotificationsService({
    get: () => undefined,
  } as unknown as ConfigService);
  Object.assign(service, {
    retryDelaysMs: [0, 0],
    resend: {
      emails: {
        send: (
          email: {
            to: unknown;
            subject?: string;
            replyTo?: unknown;
            html?: string;
            attachments?: unknown;
          },
          opts: { idempotencyKey?: string },
        ) => {
          calls.push({
            to: email.to,
            subject: email.subject,
            replyTo: email.replyTo,
            html: email.html,
            attachments: email.attachments,
            idempotencyKey: opts?.idempotencyKey,
          });
          const next = responses.shift() ?? { error: null };
          return next instanceof Error
            ? Promise.reject(next)
            : Promise.resolve(next);
        },
      },
    },
  });
  return { service, calls };
}

const fail = (name: string, statusCode: number | null = null): Result => ({
  error: { name, message: name, statusCode },
});
const reset = (service: NotificationsService) =>
  service.passwordReset('a@test.local', 'A', 'token');

beforeAll(() => Logger.overrideLogger(false)); // sin ruido de logs en los tests

describe('NotificationsService: reintentos de correo', () => {
  it('reintenta una falla pasajera y usa la misma clave de idempotencia', async () => {
    const { service, calls } = setup([fail('rate_limit_exceeded', 429)]);
    await reset(service);
    expect(calls).toHaveLength(2);
    expect(calls[0].idempotencyKey).toBeTruthy();
    expect(calls[1].idempotencyKey).toBe(calls[0].idempotencyKey);
  });

  it('reintenta si se cae la conexión (excepción) y se rinde tras 3 intentos sin lanzar', async () => {
    const { service, calls } = setup([
      new Error('ECONNRESET'),
      fail('application_error'),
      fail('internal_server_error', 500),
      fail('internal_server_error', 500),
    ]);
    await expect(reset(service)).resolves.toBeUndefined();
    expect(calls).toHaveLength(3);
  });

  it('no reintenta errores definitivos', async () => {
    const { service, calls } = setup([fail('validation_error', 422)]);
    await reset(service);
    expect(calls).toHaveLength(1);
  });

  it('cada correo tiene su propia clave de idempotencia', async () => {
    const { service, calls } = setup([]);
    await reset(service);
    await reset(service);
    expect(calls[0].idempotencyKey).not.toBe(calls[1].idempotencyKey);
  });
});

describe('NotificationsService: confirmación de reserva', () => {
  const booking = {
    to: 'cliente@test.local',
    customerName: 'Ana',
    businessName: 'Taller',
    serviceName: 'Corte',
    startsAt: new Date('2026-12-01T15:00:00Z'),
    timezone: 'America/Santiago',
    manageToken: 'tok',
  };

  it('incluye la dirección con su enlace a Google Maps, escapada', async () => {
    const { service, calls } = setup([]);
    await service.bookingConfirmed({
      ...booking,
      businessAddress: 'Av. Matta & Lira 100, Ñuñoa',
    });
    const html = calls[0].html ?? '';
    expect(html).toContain(
      'href="https://www.google.com/maps/search/?api=1&amp;query=Av.%20Matta%20%26%20Lira%20100%2C%20%C3%91u%C3%B1oa"',
    );
    expect(html).toContain('>Av. Matta &amp; Lira 100, Ñuñoa</a>');
  });

  it('sin dirección no muestra la línea', async () => {
    const { service, calls } = setup([]);
    await service.bookingConfirmed({ ...booking, businessAddress: null });
    expect(calls[0].html).not.toContain('Dirección');
  });
});

describe('NotificationsService: servicio listo', () => {
  const data = {
    to: 'cliente@test.local',
    customerName: 'Ana <b>',
    businessName: 'Taller & Cía',
    businessPhone: '+56 9 1234 5678',
    businessAddress: 'Av. Matta 100, Ñuñoa',
    serviceName: 'Lavado + Encerado',
  };

  it('le dice al cliente que su servicio está listo, con dirección y teléfono, escapado', async () => {
    const { service, calls } = setup([]);
    await service.bookingCompleted(data);
    const html = calls[0].html ?? '';
    expect(calls[0].to).toBe('cliente@test.local');
    expect(html).toContain('Hola Ana &lt;b&gt;');
    expect(html).toContain('<strong>Taller &amp; Cía</strong> terminó tu');
    expect(html).toContain('<strong>Lavado + Encerado</strong>');
    expect(html).toContain(
      'href="https://www.google.com/maps/search/?api=1&amp;query=Av.%20Matta%20100%2C%20%C3%91u%C3%B1oa"',
    );
    expect(html).toContain('llamar al +56 9 1234 5678');
  });

  it('las fotos van dentro del correo (cid) y como adjuntos en línea', async () => {
    const { service, calls } = setup([]);
    const jpg = Buffer.from([0xff, 0xd8, 0xff]);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await service.bookingCompleted({
      ...data,
      photos: [
        { content: jpg, mime: 'image/jpeg', ext: 'jpg' },
        { content: png, mime: 'image/png', ext: 'png' },
      ],
    });
    expect(calls[0].attachments).toEqual([
      {
        filename: 'foto-1.jpg',
        content: jpg,
        contentType: 'image/jpeg',
        contentId: 'foto-1',
      },
      {
        filename: 'foto-2.png',
        content: png,
        contentType: 'image/png',
        contentId: 'foto-2',
      },
    ]);
    const html = calls[0].html ?? '';
    expect(html).toContain('fotos de cómo quedó');
    expect(html).toContain('src="cid:foto-1"');
    expect(html).toContain('src="cid:foto-2"');
  });

  it('sin fotos no hay adjuntos ni galería', async () => {
    const { service, calls } = setup([]);
    await service.bookingCompleted(data);
    expect(calls[0].attachments).toBeUndefined();
    expect(calls[0].html).not.toContain('cid:');
  });

  it('sin dirección ni teléfono no muestra esas líneas', async () => {
    const { service, calls } = setup([]);
    await service.bookingCompleted({
      ...data,
      businessAddress: null,
      businessPhone: null,
    });
    expect(calls[0].html).not.toContain('Dirección');
    expect(calls[0].html).not.toContain('llamar');
  });
});

describe('NotificationsService: ayuda y sugerencias', () => {
  const data = {
    id: 'req1',
    kind: 'PROBLEM' as const,
    message: 'No puedo <b>guardar</b> el horario\nSale un error rojo',
    page: '/dashboard/hours',
    userAgent: 'Mozilla/5.0 (Android)',
    createdAt: new Date('2032-01-20T15:00:00Z'),
    userName: 'Ana',
    userEmail: 'ana@test.local',
    memberName: 'Ana P.',
    role: 'STAFF',
    businessName: 'Peluquería & Co',
    businessSlug: 'peluqueria',
  };

  it('llega al buzón del equipo, con el correo del usuario para responder', async () => {
    const { service, calls } = setup([]);
    Object.assign(service, { supportEmail: 'equipo@test.local' });
    await service.supportRequest(data);
    expect(calls).toHaveLength(1);
    expect(calls[0].to).toBe('equipo@test.local');
    expect(calls[0].replyTo).toBe('ana@test.local');
    // Solo la primera línea del mensaje va en el asunto
    expect(calls[0].subject).toBe(
      '[Problema] Peluquería & Co: No puedo <b>guardar</b> el horario',
    );
    expect(calls[0].html).toContain('No puedo &lt;b&gt;guardar&lt;/b&gt;');
    expect(calls[0].html).toContain('Peluquería &amp; Co');
    expect(calls[0].html).toContain('profesional');
    expect(calls[0].html).toContain('/dashboard/hours');
    expect(calls[0].html).toContain('Mozilla/5.0 (Android)');
  });

  it('acorta un asunto largo', async () => {
    const { service, calls } = setup([]);
    Object.assign(service, { supportEmail: 'equipo@test.local' });
    await service.supportRequest({
      ...data,
      kind: 'SUGGESTION',
      message: 'x'.repeat(100),
    });
    expect(calls[0].subject).toBe(
      `[Sugerencia] Peluquería & Co: ${'x'.repeat(60)}…`,
    );
  });

  it('sin SUPPORT_EMAIL no envía (el mensaje queda en la base)', async () => {
    const { service, calls } = setup([]);
    await service.supportRequest(data);
    expect(calls).toHaveLength(0);
  });
});

describe('mapsUrl', () => {
  it('arma la búsqueda de Google Maps con la dirección codificada', () => {
    expect(mapsUrl('Av. Providencia 1234, Providencia')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Av.%20Providencia%201234%2C%20Providencia',
    );
  });
});

describe('isTransient', () => {
  it.each([
    ['rate_limit_exceeded', 429, true],
    ['application_error', null, true],
    ['internal_server_error', 500, true],
    ['daily_quota_exceeded', 429, false],
    ['invalid_api_key', 403, false],
    ['validation_error', 422, false],
  ])('%s (%s) → %s', (name, statusCode, expected) => {
    expect(isTransient({ name, message: '', statusCode })).toBe(expected);
  });
});
