import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import "./globals.css";
import { OverflowWatch } from "@/components/OverflowWatch";

// Una sola familia para todo. El eje de ancho (wdth) da la versión angosta de
// las horas (utilidad `time` en globals.css)
const instrumentSans = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  axes: ["wdth"],
});

export const metadata: Metadata = {
  title: {
    default: "Reservahoy · Reservas online para tu negocio",
    template: "%s · Reservahoy",
  },
  description:
    "Tus clientes reservan una hora desde un enlace, sin crear cuenta. Tú ves tu agenda al instante.",
};

// viewport-fit=cover: la página llega hasta el borde del teléfono y
// env(safe-area-inset-*) mide lo que tapa el sistema. Sin esto, Chrome en
// Android (135+, navegación por gestos) muestra una franja abajo que se esconde
// al desplazar, y lo fijo con bottom-0 queda debajo de la barra de gestos (la
// barra del panel se veía cortada). Cómo dejarle lugar a lo fijo abajo:
// --safe-bottom-max en globals.css
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${instrumentSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Solo en navegadores donde Tailwind v4 no funciona (iPhone que no
            pasa de iOS 16.3, Chrome sin actualizar): globals.css lo esconde en
            los demás. Estilos en línea y sin JavaScript, porque ahí ni las
            clases ni el JavaScript de Next funcionan bien */}
        <div
          className="old-browser"
          role="alert"
          style={{
            background: "#fff7ed",
            color: "#7c2d12",
            borderBottom: "1px solid #fed7aa",
            padding: "12px 16px",
            fontSize: "15px",
            lineHeight: 1.4,
          }}
        >
          Tu navegador es antiguo y esta página puede verse mal. Actualiza el
          sistema de tu teléfono (en Android, también Chrome) o ábrela desde
          otro equipo.
        </div>
        {children}
        <OverflowWatch />
      </body>
    </html>
  );
}
