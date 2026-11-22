import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./lib/sentry-options";

// Errores en el servidor de Next (páginas que se arman en el servidor)
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    Sentry.init(sentryOptions);
    return;
  }
  // En Node, la integración Http además cuenta cada petición como "sesión" (un
  // resumen por minuto): solo queremos los errores. httpIntegration no existe
  // en el runtime edge, por eso solo aquí
  Sentry.init({
    ...sentryOptions,
    integrations: (defaults) => [
      ...sentryOptions.integrations(defaults).filter((i) => i.name !== "Http"),
      Sentry.httpIntegration({ sessions: false }),
    ],
  });
}

export const onRequestError = Sentry.captureRequestError;
