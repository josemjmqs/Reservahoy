import { scrubBreadcrumb, scrubEvent } from "./sentry-scrub";

// Opciones comunes de Sentry para el navegador y el servidor de Next. Sin
// NEXT_PUBLIC_SENTRY_DSN (local, CI, previews) no se envía nada. Solo errores:
// sin trazas de rendimiento ni grabación de sesiones. Sentry 11 recolecta todo
// por defecto (cookies, headers, cuerpos, variables): aquí se apaga todo y
// scrubEvent borra el resto (correos, teléfonos, ids y tokens de las rutas)
export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "production",
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
    queues: false,
    stackFrameVariables: false,
  },
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
};
