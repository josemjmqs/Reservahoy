"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { Button } from "@/components/ui";
import "./globals.css";

// Error que ninguna pantalla atrapó: reemplaza todo el sitio (también el
// layout), por eso lleva su propio <html>. Se avisa a Sentry y se ofrece reintentar
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body className="flex min-h-screen items-center justify-center bg-paper px-4 font-sans text-ink">
        <main className="max-w-sm text-center">
          <h1 className="text-xl font-semibold">Algo salió mal</h1>
          <p className="mt-2 text-sm text-muted">
            Ya nos llegó el aviso del error. Prueba de nuevo en un momento.
          </p>
          <Button className="mt-6 h-10" onClick={reset}>
            Reintentar
          </Button>
        </main>
      </body>
    </html>
  );
}
