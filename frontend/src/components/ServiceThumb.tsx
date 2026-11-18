"use client";

import { useState } from "react";

// Miniatura cuadrada de un servicio. Sin foto (o si la foto no carga) muestra
// un ícono, así todas las filas reservan el mismo espacio y el texto queda alineado.
// Con `blank` (página pública) deja en cambio el espacio vacío: un ícono de
// "sin foto" se vería como una imagen rota para el cliente, y una inicial en
// un recuadro de color parece un avatar y compite con las fotos de al lado
export function ServiceThumb({
  src,
  blank = false,
  className = "h-14 w-14",
}: {
  src: string | null;
  blank?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);

  if (src && failed !== src)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- la foto ya viene reducida; no usamos el optimizador de Vercel
      <img
        src={src}
        alt=""
        onError={() => setFailed(src)}
        className={`${className} shrink-0 rounded-control object-cover`}
      />
    );

  if (blank) return <div aria-hidden className={`${className} shrink-0`} />;

  return (
    <div
      aria-hidden
      className={`${className} flex shrink-0 items-center justify-center rounded-control bg-gray-100 text-gray-400`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="1.75" />
        <path d="m21 16-5-5-9 9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
