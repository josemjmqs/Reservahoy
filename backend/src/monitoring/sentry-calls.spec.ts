import { jest } from '@jest/globals'; // en modo ESM, jest no es global
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { NotificationsService as Notifications } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AvailabilityService } from '../availability/availability.service';

// Lo que llega a Sentry desde el backend, con @sentry/nestjs simulado: nada
// sale a la red y se revisa con qué se llamó. Sentry es un tercero que ve todos
// los negocios: ninguna llamada lleva correos de clientes ni de usuarios
const init = jest.fn();
const captureMessage = jest.fn();
const captureException = jest.fn();
jest.unstable_mockModule('@sentry/nestjs', () => ({
  init,
  captureMessage,
  captureException,
}));

// Los módulos que usan Sentry se importan después de simularlo
const { NotificationsService } =
  await import('../notifications/notifications.service');
const { BookingsService } = await import('../bookings/bookings.service');
const { AgendaService } = await import('../agenda/agenda.service');
const { scrubBreadcrumb, scrubEvent } = await import('./scrub');

const config = (values: Record<string, string> = {}) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

// Una base que falla en la primera consulta, como si se cayera la conexión
const brokenDb = () =>
  ({
    booking: {
      findUniqueOrThrow: () => Promise.reject(new Error('base caída')),
    },
  }) as unknown as PrismaService;

beforeAll(() => Logger.overrideLogger(false)); // sin ruido de logs en los tests
beforeEach(() => jest.clearAllMocks());

describe('instrument.ts', () => {
  it('apaga toda la recolección, limpia cada evento y sin DSN no envía', async () => {
    const dsn = process.env.SENTRY_DSN;
    process.env.SENTRY_DSN = '';
    try {
      await import('../instrument');
    } finally {
      process.env.SENTRY_DSN = dsn;
    }

    expect(init).toHaveBeenCalledTimes(1);
    const options = init.mock.calls[0][0] as Record<string, unknown>;
    expect(options.dsn).toBeUndefined();
    expect(options.beforeSend).toBe(scrubEvent);
    expect(options.beforeBreadcrumb).toBe(scrubBreadcrumb);
    // Sin trazas de rendimiento ni grabación de sesiones
    expect(options.tracesSampleRate).toBeUndefined();
    expect(options.tracesSampler).toBeUndefined();
    // Cada opción de dataCollection apagada: una nueva que se agregue
    // encendida en Sentry también debe apagarse aquí
    const collection = options.dataCollection as Record<string, unknown>;
    expect(Object.keys(collection).length).toBeGreaterThan(0);
    for (const [key, value] of Object.entries(collection)) {
      expect([key, value]).toEqual([key, Array.isArray(value) ? [] : false]);
    }
  });
});

describe('NotificationsService', () => {
  it('sin RESEND_API_KEY avisa una vez que no sale ningún correo', () => {
    new NotificationsService(config());
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith(
      'RESEND_API_KEY no configurada: no se envía ningún correo',
      'warning',
    );
  });

  it('con RESEND_API_KEY no avisa nada al arrancar', () => {
    new NotificationsService(config({ RESEND_API_KEY: 're_prueba' }));
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('un correo que no sale avisa el tipo y el error, sin el destinatario', async () => {
    const service = new NotificationsService(
      config({ RESEND_API_KEY: 're_prueba' }),
    );
    const send = jest.fn(() =>
      Promise.resolve({
        error: {
          name: 'validation_error',
          message: 'Invalid `to` field: ana.perez@gmail.com',
          statusCode: 422,
        },
      }),
    );
    Object.assign(service, {
      retryDelaysMs: [0, 0],
      resend: { emails: { send } },
    });

    await service.passwordReset('ana.perez@gmail.com', 'Ana Pérez', 'token');

    expect(send).toHaveBeenCalledTimes(1); // error definitivo: sin reintentos
    expect(captureMessage).toHaveBeenCalledTimes(1);
    const [message, context] = captureMessage.mock.calls[0] as [
      string,
      { extra: Record<string, unknown>; tags: Record<string, unknown> },
    ];
    expect(message).toBe(
      'Correo "restablecer contraseña" no enviado: validation_error',
    );
    expect(context.tags).toEqual({
      email: 'restablecer contraseña',
      resendError: 'validation_error',
    });
    expect(context.extra).toEqual({
      attempts: 1,
      statusCode: 422,
      message: 'Invalid `to` field: [correo]',
    });
    expect(JSON.stringify(captureMessage.mock.calls)).not.toMatch(
      /ana\.perez|gmail|Ana Pérez|token/,
    );
  });

  it('tras agotar los reintentos avisa una sola vez', async () => {
    const service = new NotificationsService(
      config({ RESEND_API_KEY: 're_prueba' }),
    );
    const send = jest.fn(() => Promise.reject(new Error('ECONNRESET')));
    Object.assign(service, {
      retryDelaysMs: [0, 0],
      resend: { emails: { send } },
    });

    await service.passwordReset('ana.perez@gmail.com', 'Ana', 'token');

    expect(send).toHaveBeenCalledTimes(3);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage.mock.calls[0][1]).toMatchObject({
      extra: { attempts: 3, message: 'ECONNRESET' },
    });
  });

  it('un correo que sale no avisa nada', async () => {
    const service = new NotificationsService(
      config({ RESEND_API_KEY: 're_prueba' }),
    );
    const send = jest.fn(() => Promise.resolve({ error: null }));
    Object.assign(service, { resend: { emails: { send } } });

    await service.passwordReset('ana.perez@gmail.com', 'Ana', 'token');

    expect(send).toHaveBeenCalledTimes(1);
    expect(captureMessage).not.toHaveBeenCalled();
  });
});

describe('avisos que fallan sin romper el flujo', () => {
  it('el aviso de reserva nueva al negocio llega a Sentry', async () => {
    const bookings = new BookingsService(
      brokenDb(),
      {} as AvailabilityService,
      {} as Notifications,
    );
    await expect(bookings.notifyStaff('reserva')).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(new Error('base caída'));
  });

  it('el aviso de cancelación al cliente llega a Sentry', async () => {
    const agenda = new AgendaService(brokenDb(), {} as Notifications);
    await expect(
      agenda['notifyCancelled']('reserva', null),
    ).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalledWith(new Error('base caída'));
  });

  it('el aviso de servicio listo al cliente llega a Sentry', async () => {
    const agenda = new AgendaService(brokenDb(), {} as Notifications);
    await expect(
      agenda['notifyCompleted']('reserva', []),
    ).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalledWith(new Error('base caída'));
  });
});
