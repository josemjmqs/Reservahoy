import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { DateTime } from 'luxon';
import { Resend } from 'resend';
import * as Sentry from '@sentry/nestjs';
import { scrubText } from '../monitoring/scrub';

type EmailOptions = Parameters<Resend['emails']['send']>[0];
interface SendError {
  name: string;
  message: string;
  statusCode: number | null;
}

// Fallas pasajeras de Resend (saturación, error interno o sin conexión): vale la
// pena reintentar. Las definitivas (clave inválida, dirección mal escrita, cuota
// del día agotada) fallarían igual, así que no se reintentan
const TRANSIENT = new Set([
  'rate_limit_exceeded',
  'application_error',
  'internal_server_error',
  'concurrent_idempotent_requests',
]);
export const isTransient = (e: SendError) =>
  TRANSIENT.has(e.name) || (e.statusCode !== null && e.statusCode >= 500);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface BookingEmailData {
  to: string;
  customerName: string;
  businessName: string;
  serviceName: string;
  startsAt: Date;
  timezone: string;
  manageToken: string;
  businessAddress: string | null;
}

// Enlace de búsqueda de Google Maps: no necesita clave y en el celular abre la
// app de Maps. Igual que mapsUrl en el frontend (lib/maps.ts), lo revisa
// shared-rules.spec.ts
export const mapsUrl = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

export interface CancelledByBusinessEmailData {
  to: string;
  customerName: string;
  businessName: string;
  businessSlug: string;
  businessPhone: string | null;
  serviceName: string;
  startsAt: Date;
  timezone: string;
  reason: string | null;
}

// Foto que va dentro del correo (imagen en línea, referenciada con cid:)
export interface EmailPhoto {
  content: Buffer;
  mime: string;
  ext: string;
}

export interface CompletedEmailData {
  to: string;
  customerName: string;
  businessName: string;
  businessPhone: string | null;
  businessAddress: string | null;
  serviceName: string;
  photos?: EmailPhoto[];
}

export interface MemberInvitationEmailData {
  to: string;
  memberName: string;
  businessName: string;
  inviterName: string;
  token: string;
}

export interface NewBookingEmailData {
  to: string;
  recipientName: string;
  businessName: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  serviceName: string;
  memberName: string;
  notes: string | null;
  startsAt: Date;
  timezone: string;
}

export interface SupportRequestEmailData {
  id: string;
  kind: 'PROBLEM' | 'SUGGESTION' | 'QUESTION';
  message: string;
  page: string | null;
  userAgent: string | null;
  createdAt: Date;
  userName: string;
  userEmail: string;
  memberName: string;
  role: string;
  businessName: string;
  businessSlug: string;
}

const SUPPORT_KIND_LABEL: Record<SupportRequestEmailData['kind'], string> = {
  PROBLEM: 'Problema',
  SUGGESTION: 'Sugerencia',
  QUESTION: 'Duda',
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly frontendUrl: string;
  // Buzón del equipo de Reservahoy para "Ayuda y sugerencias"
  private readonly supportEmail: string | null;
  // Espera antes de cada reintento: 3 intentos en total
  private readonly retryDelaysMs = [2000, 5000];

  constructor(config: ConfigService) {
    const key = config.get<string>('RESEND_API_KEY');
    this.resend = key ? new Resend(key) : null;
    // Con Sentry activo (producción) esto significa que no sale ningún correo
    if (!key) {
      Sentry.captureMessage(
        'RESEND_API_KEY no configurada: no se envía ningún correo',
        'warning',
      );
    }
    this.from =
      config.get<string>('MAIL_FROM') ??
      'Reservahoy <reservas@mail.reservahoy.cl>';
    this.frontendUrl =
      config.get<string>('FRONTEND_URL') ?? 'http://localhost:3001';
    this.supportEmail = config.get<string>('SUPPORT_EMAIL') || null;
  }

  // Envía con reintentos ante fallas pasajeras. Nunca lanza: un correo que no
  // sale queda en el log, pero no rompe la reserva ni el registro
  private async send(label: string, email: EmailOptions): Promise<void> {
    if (!this.resend) {
      this.logger.warn(
        `RESEND_API_KEY no configurada: correo "${label}" omitido`,
      );
      return;
    }
    // La misma clave en todos los intentos: si un intento sí llegó a Resend
    // aunque la respuesta se perdió, Resend no manda el correo dos veces
    const idempotencyKey = randomUUID();

    for (let attempt = 0; ; attempt++) {
      let error: SendError | null;
      try {
        ({ error } = await this.resend.emails.send(email, { idempotencyKey }));
      } catch (e) {
        error = {
          name: 'application_error',
          message: (e as Error).message,
          statusCode: null,
        };
      }
      if (!error) return;

      if (!isTransient(error) || attempt >= this.retryDelaysMs.length) {
        this.logger.error(
          `Correo "${label}" no enviado tras ${attempt + 1} intento(s): ${error.name}: ${error.message}`,
        );
        // Un correo que no sale no rompe nada en pantalla: sin este aviso nadie
        // se entera (ej. la cuota diaria de Resend agotada). Agrupado por tipo
        // de correo y de error; sin el destinatario
        Sentry.captureMessage(`Correo "${label}" no enviado: ${error.name}`, {
          level: 'error',
          fingerprint: ['email-not-sent', label, error.name],
          tags: { email: label, resendError: error.name },
          extra: {
            attempts: attempt + 1,
            statusCode: error.statusCode,
            message: scrubText(error.message),
          },
        });
        return;
      }
      this.logger.warn(
        `Correo "${label}" falló (${error.name}); reintento en ${this.retryDelaysMs[attempt] / 1000} s`,
      );
      await sleep(this.retryDelaysMs[attempt]);
    }
  }

  // Nunca lanza: un fallo de correo no debe romper la reserva
  async bookingConfirmed(data: BookingEmailData): Promise<void> {
    const when = DateTime.fromJSDate(data.startsAt, { zone: data.timezone })
      .setLocale('es')
      .toFormat("cccc d 'de' LLLL 'a las' HH:mm");
    const link = `${this.frontendUrl}/reserva/${data.manageToken}`;
    const address = data.businessAddress
      ? `<p>Dirección: <a href="${escapeHtml(mapsUrl(data.businessAddress))}">${escapeHtml(data.businessAddress)}</a> (ver en Google Maps)</p>`
      : '';

    await this.send('confirmación de reserva', {
      from: this.from,
      to: data.to,
      subject: `Reserva confirmada en ${data.businessName}`,
      html: `
          <p>Hola ${escapeHtml(data.customerName)},</p>
          <p>Tu reserva de <strong>${escapeHtml(data.serviceName)}</strong> en
          <strong>${escapeHtml(data.businessName)}</strong> quedó confirmada para
          el <strong>${when}</strong>.</p>
          ${address}
          <p>Si necesitas verla o cancelarla: <a href="${link}">administrar mi reserva</a>.</p>
        `,
    });
  }

  // El negocio canceló la reserva desde su agenda. Nunca lanza
  async bookingCancelledByBusiness(
    data: CancelledByBusinessEmailData,
  ): Promise<void> {
    const start = DateTime.fromJSDate(data.startsAt, {
      zone: data.timezone,
    }).setLocale('es');
    const when = start.toFormat("cccc d 'de' LLLL 'a las' HH:mm");
    const rebook = `${this.frontendUrl}/${data.businessSlug}`;

    await this.send('cancelación por el negocio', {
      from: this.from,
      to: data.to,
      subject: `Tu reserva en ${data.businessName} fue cancelada`,
      html: `
          <p>Hola ${escapeHtml(data.customerName)},</p>
          <p><strong>${escapeHtml(data.businessName)}</strong> canceló tu reserva de
          <strong>${escapeHtml(data.serviceName)}</strong> del <strong>${when}</strong>.</p>
          ${data.reason ? `<p>Motivo: ${escapeHtml(data.reason)}</p>` : ''}
          <p><a href="${rebook}">Reservar otra hora</a></p>
          ${
            data.businessPhone
              ? `<p>Si tienes dudas, puedes llamar al ${escapeHtml(data.businessPhone)}.</p>`
              : ''
          }
        `,
    });
  }

  // El negocio marcó la reserva como completada y tiene activado el aviso: el
  // servicio está listo para que el cliente lo pase a buscar. Nunca lanza
  async bookingCompleted(data: CompletedEmailData): Promise<void> {
    const address = data.businessAddress
      ? `<p>Dirección: <a href="${escapeHtml(mapsUrl(data.businessAddress))}">${escapeHtml(data.businessAddress)}</a> (ver en Google Maps)</p>`
      : '';
    const photos = (data.photos ?? []).map((p, i) => ({
      filename: `foto-${i + 1}.${p.ext}`,
      content: p.content,
      contentType: p.mime,
      contentId: `foto-${i + 1}`,
    }));
    const gallery = photos.length
      ? `<p>Te dejamos ${photos.length === 1 ? 'una foto' : 'fotos'} de cómo quedó:</p>${photos
          .map(
            (p, i) =>
              `<p><img src="cid:${p.contentId}" alt="Foto ${i + 1}" width="480" style="max-width:100%;height:auto;border-radius:8px"></p>`,
          )
          .join('')}`
      : '';

    await this.send('servicio listo', {
      from: this.from,
      to: data.to,
      subject: `Tu servicio en ${data.businessName} está listo`,
      ...(photos.length && { attachments: photos }),
      html: `
          <p>Hola ${escapeHtml(data.customerName)},</p>
          <p><strong>${escapeHtml(data.businessName)}</strong> terminó tu
          <strong>${escapeHtml(data.serviceName)}</strong>. Ya puedes pasar a buscarlo.</p>
          ${gallery}
          ${address}
          ${
            data.businessPhone
              ? `<p>Si tienes dudas, puedes llamar al ${escapeHtml(data.businessPhone)}.</p>`
              : ''
          }
        `,
    });
  }

  // Aviso al dueño (o a quien tenga activada la opción en Ajustes). Nunca lanza
  async newBookingForStaff(data: NewBookingEmailData): Promise<void> {
    const start = DateTime.fromJSDate(data.startsAt, {
      zone: data.timezone,
    }).setLocale('es');
    const when = start.toFormat("cccc d 'de' LLLL 'a las' HH:mm");
    const agenda = `${this.frontendUrl}/dashboard/agenda?date=${start.toISODate()}`;
    const settings = `${this.frontendUrl}/dashboard/settings`;
    const contact = [data.customerEmail, data.customerPhone]
      .filter(Boolean)
      .map((c) => escapeHtml(c!))
      .join(' · ');

    await this.send('reserva nueva al negocio', {
      from: this.from,
      to: data.to,
      subject: `Nueva reserva: ${data.customerName}, ${start.toFormat("ccc d 'de' LLL, HH:mm")}`,
      html: `
          <p>Hola ${escapeHtml(data.recipientName)},</p>
          <p>Tienes una reserva nueva en <strong>${escapeHtml(data.businessName)}</strong>:</p>
          <ul>
            <li><strong>${escapeHtml(data.serviceName)}</strong></li>
            <li>${when}, con ${escapeHtml(data.memberName)}</li>
            <li>${escapeHtml(data.customerName)} · ${contact}</li>
            ${data.notes ? `<li>Nota: ${escapeHtml(data.notes)}</li>` : ''}
          </ul>
          <p><a href="${agenda}">Ver en la agenda</a></p>
          <p style="color:#6b7280;font-size:12px">Recibes este correo porque tienes activados los avisos de reservas nuevas.
          Puedes desactivarlos en <a href="${settings}">Ajustes</a>.</p>
        `,
    });
  }

  async emailVerification(
    to: string,
    name: string,
    token: string,
  ): Promise<void> {
    const link = `${this.frontendUrl}/verify-email?token=${token}`;
    await this.send('verificación de correo', {
      from: this.from,
      to,
      subject: 'Confirma tu correo en Reservahoy',
      html: `<p>Hola ${escapeHtml(name)},</p>
        <p>Confirma tu correo para que tu página pública empiece a recibir reservas (el enlace vale 24 horas):</p>
        <p><a href="${link}">Confirmar mi correo</a></p>
        <p>Si no creaste una cuenta en Reservahoy, ignora este mensaje.</p>`,
    });
  }

  // Invitación a un profesional del equipo para que cree su cuenta. Nunca lanza
  async memberInvitation(data: MemberInvitationEmailData): Promise<void> {
    const link = `${this.frontendUrl}/invitacion/${data.token}`;
    await this.send('invitación al equipo', {
      from: this.from,
      to: data.to,
      subject: `Te invitaron a ${data.businessName} en Reservahoy`,
      html: `<p>Hola ${escapeHtml(data.memberName)},</p>
        <p>${escapeHtml(data.inviterName)} te invitó a unirte al equipo de
        <strong>${escapeHtml(data.businessName)}</strong>. Crea tu cuenta para
        administrar la agenda y el negocio en el panel (el enlace vale 7 días):</p>
        <p><a href="${link}">Crear mi cuenta</a></p>
        <p>Si no esperabas esta invitación, ignora este mensaje.</p>`,
    });
  }

  // Mensaje de "Ayuda y sugerencias" del panel al equipo de Reservahoy. Responder
  // el correo le escribe directo al usuario (replyTo). Nunca lanza
  async supportRequest(data: SupportRequestEmailData): Promise<void> {
    if (!this.supportEmail) {
      this.logger.warn(
        `SUPPORT_EMAIL no configurado: mensaje de ayuda ${data.id} solo quedó en la base`,
      );
      return;
    }
    const kind = SUPPORT_KIND_LABEL[data.kind];
    const when = DateTime.fromJSDate(data.createdAt, {
      zone: 'America/Santiago',
    })
      .setLocale('es')
      .toFormat("d 'de' LLLL yyyy, HH:mm");
    const role = data.role === 'OWNER' ? 'dueño' : 'profesional';
    const page = `${this.frontendUrl}/${data.businessSlug}`;
    const firstLine = data.message.split(/\r?\n/)[0];
    const preview =
      firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;

    await this.send('ayuda y sugerencias', {
      from: this.from,
      to: this.supportEmail,
      replyTo: data.userEmail,
      subject: `[${kind}] ${data.businessName}: ${preview}`,
      html: `
          <p><strong>${kind}</strong> de ${escapeHtml(data.userName)}
          (${escapeHtml(data.userEmail)}), ${role} de
          <a href="${escapeHtml(page)}">${escapeHtml(data.businessName)}</a>.</p>
          <div style="white-space:pre-wrap;border-left:3px solid #4f39f6;padding:8px 12px;margin:12px 0">${escapeHtml(data.message)}</div>
          <ul style="color:#6b7280;font-size:12px">
            <li>Fecha: ${when}</li>
            <li>Nombre en la agenda: ${escapeHtml(data.memberName)}</li>
            ${data.page ? `<li>Pantalla: ${escapeHtml(data.page)}</li>` : ''}
            ${data.userAgent ? `<li>Navegador: ${escapeHtml(data.userAgent)}</li>` : ''}
            <li>Id: ${data.id}</li>
          </ul>
          <p style="color:#6b7280;font-size:12px">Responde este correo para escribirle directo.</p>
        `,
    });
  }

  async passwordReset(to: string, name: string, token: string): Promise<void> {
    const link = `${this.frontendUrl}/reset-password?token=${token}`;
    await this.send('restablecer contraseña', {
      from: this.from,
      to,
      subject: 'Restablece tu contraseña',
      html: `<p>Hola ${escapeHtml(name)},</p>
        <p>Para elegir una contraseña nueva usa este enlace (vale 1 hora):</p>
        <p><a href="${link}">Restablecer contraseña</a></p>
        <p>Si no lo pediste, ignora este mensaje.</p>`,
    });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
