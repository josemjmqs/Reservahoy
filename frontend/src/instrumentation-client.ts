import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./lib/sentry-options";

// Errores en el navegador (Next carga este archivo antes que la página)
Sentry.init(sentryOptions);
