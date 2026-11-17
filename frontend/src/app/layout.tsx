import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import "./globals.css";

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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
