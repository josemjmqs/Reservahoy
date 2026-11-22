import { scrubBreadcrumb, scrubEvent } from "./sentry-scrub";

// Opciones comunes de Sentry para el navegador y el servidor de Next. Sin
// NEXT_PUBLIC_SENTRY_DSN (local, CI, previews) no se envía nada. Solo errores:
// sin trazas de rendimiento ni grabación de sesiones. Sentry 11 recolecta todo
// por defecto (cookies, headers, cuerpos, variables): aquí se apaga todo y
// scrubEvent borra el resto (correos, teléfonos, ids y tokens de las rutas)
export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "production",
  // Commit desplegado (next.config.ts lo toma de Vercel al compilar): cada
  // error dice de qué versión es, así se ve si apareció justo después de un merge
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || undefined,
  // Con release, Sentry también manda "sesiones": el navegador, una por visita
  // (también en la página pública), y el servidor, la vida del proceso. Solo
  // queremos los errores. Las del servidor por petición: instrumentation.ts
  integrations: <T extends { name: string }>(defaults: T[]) =>
    defaults.filter(
      (i) => i.name !== "BrowserSession" && i.name !== "ProcessSession",
    ),
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
