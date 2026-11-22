import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./lib/sentry-options";

// Errores en el servidor de Next (páginas que se arman en el servidor)
export function register() {
  Sentry.init(sentryOptions);
}

export const onRequestError = Sentry.captureRequestError;
