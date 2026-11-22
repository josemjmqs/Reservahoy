import * as Sentry from '@sentry/nestjs';
import { scrubBreadcrumb, scrubEvent } from './monitoring/scrub';

// Monitoreo de errores. Se importa antes que todo en main.ts. Sin SENTRY_DSN
// (local, CI, pruebas) Sentry no envía nada. Solo errores, sin trazas de
// rendimiento. Sentry 11 recolecta todo por defecto (cookies, headers, cuerpos,
// variables locales, datos de las consultas): aquí se apaga todo, porque ahí
// van datos de clientes y la cookie de sesión, y scrubEvent borra el resto
Sentry.init({
  dsn: process.env.SENTRY_DSN || undefined,
  environment: process.env.SENTRY_ENVIRONMENT || 'production',
  // Commit desplegado (Render lo pone solo): cada error dice de qué versión es,
  // así se ve si apareció justo después de un merge
  release: process.env.RENDER_GIT_COMMIT || undefined,
  // Con release, Sentry también manda "sesiones" (la vida del proceso y un
  // resumen de peticiones por minuto): solo queremos los errores
  integrations: (defaults) => [
    ...defaults.filter((i) => i.name !== 'ProcessSession' && i.name !== 'Http'),
    Sentry.httpIntegration({ sessions: false }),
  ],
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
});
