import type { Breadcrumb, ErrorEvent } from '@sentry/nestjs';

// Lo que va a Sentry no lleva datos personales ni enlaces secretos: Sentry es
// un tercero y ve errores de todos los negocios. Se borran el cuerpo, los
// headers, las cookies y la query de cada petición, los correos que aparezcan
// en un mensaje y los identificadores de las rutas (el enlace de una reserva o
// de una invitación es un id más y quien lo tiene puede cancelarla o aceptarla).
// La misma regla está en frontend/src/lib/sentry-scrub.ts (iguales)

const EMAIL = /[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+\.[a-z]{2,}/gi;
// cuid (ids y manageToken) y tokens hex de 64: un segmento largo de letras,
// números, - o _ es un id. Las rutas con parámetro (`/manage/:token`) quedan igual
const ID_SEGMENT = /^[A-Za-z0-9_-]{20,}$/;

// Teléfonos y otros números largos (+56 9 1234 5678, 912345678)
const LONG_NUMBER = /\+?\d[\d\s-]{7,}\d/g;

// Los errores de Prisma copian la consulta entera con sus valores (nombres,
// teléfonos, notas de clientes): queda la primera línea, que dice qué consulta
// falló, y el último párrafo, que dice por qué
const PRISMA_INVOCATION = /invocation in\s*\n/;
function shortenPrisma(text: string): string {
  if (!PRISMA_INVOCATION.test(text)) return text;
  const trimmed = text.trim();
  const first = trimmed.split('\n')[0].replace(/ in$/, '');
  const reason = trimmed.slice(trimmed.lastIndexOf('\n\n') + 2);
  return `${first}: ${reason}`;
}

export const scrubText = (text: string) =>
  shortenPrisma(text).replace(EMAIL, '[correo]').replace(LONG_NUMBER, '[número]');

export function scrubUrl(url: string): string {
  const [path] = url.split(/[?#]/);
  return path
    .split('/')
    .map((s) => (ID_SEGMENT.test(s) ? ':id' : s))
    .join('/');
}

const URL_KEYS = ['url', 'from', 'to'] as const;

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  // Lo que se escribe en la consola puede llevar cualquier cosa
  if (crumb.category === 'console') return null;
  if (crumb.message) crumb.message = scrubText(crumb.message);
  if (crumb.data) {
    for (const key of URL_KEYS) {
      const value: unknown = crumb.data[key];
      if (typeof value === 'string') crumb.data[key] = scrubUrl(value);
    }
  }
  return crumb;
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    event.request = {
      method: event.request.method,
      url: event.request.url && scrubUrl(event.request.url),
    };
  }
  delete event.user;
  if (event.transaction) event.transaction = scrubUrl(event.transaction);
  if (event.message) event.message = scrubText(event.message);
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubText(ex.value);
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map(scrubBreadcrumb)
      .filter((b): b is Breadcrumb => b !== null);
  }
  return event;
}
