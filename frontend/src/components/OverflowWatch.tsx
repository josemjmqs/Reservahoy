"use client";

import * as Sentry from "@sentry/nextjs";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { browserLabel, findOverflow, isOldBrowser } from "@/lib/overflow";
import { scrubUrl } from "@/lib/sentry-scrub";

// Avisa a Sentry cuando, en el teléfono de alguien, una página queda más ancha
// que la pantalla (se ve achicada o cortada) o el navegador es muy antiguo. Las
// pruebas e2e revisan los anchos de siempre; esto cubre los teléfonos y ajustes
// que nadie probó. Va solo la ruta (sin ids ni tokens: scrubUrl), el ancho, el
// navegador y las clases de lo que se sale, nunca texto de la página. Sin
// NEXT_PUBLIC_SENTRY_DSN no se envía nada; en desarrollo también sale en la consola

// Las páginas del panel cargan sus datos después: se revisa con todo a la vista
const SETTLE_MS = 3000;

// Una vez por visita para cada caso: el aviso no debe gastar la cuota de Sentry
const sent = new Set<string>();
function once(key: string, report: () => void) {
  if (sent.has(key)) return;
  sent.add(key);
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    // sin sessionStorage (ventana privada) basta con la memoria de esta página
  }
  report();
}

export function OverflowWatch() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isOldBrowser()) return;
    once("sentry:old-browser", () =>
      Sentry.captureMessage("Navegador antiguo", {
        level: "info",
        fingerprint: ["old-browser"],
        tags: { browser: browserLabel(navigator.userAgent) },
      }),
    );
  }, []);

  useEffect(() => {
    const check = () => {
      const found = findOverflow();
      if (!found) return;
      const route = scrubUrl(location.pathname);
      once(`sentry:overflow:${route}:${found.width}`, () => {
        if (process.env.NODE_ENV !== "production")
          console.warn("Página más ancha que la pantalla", route, found);
        Sentry.captureMessage("Página más ancha que la pantalla", {
          level: "warning",
          fingerprint: ["overflow", route],
          tags: {
            route,
            viewport: String(found.width),
            browser: browserLabel(navigator.userAgent),
          },
          extra: { overflow: found.overflow, culprits: found.culprits },
        });
      });
    };

    const settle = setTimeout(check, SETTLE_MS);
    // Al girar el teléfono o cambiar el tamaño de la ventana
    let resize: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(resize);
      resize = setTimeout(check, 1000);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(settle);
      clearTimeout(resize);
      window.removeEventListener("resize", onResize);
    };
  }, [pathname]);

  return null;
}
