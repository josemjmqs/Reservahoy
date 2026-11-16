"use client";

import { useState } from "react";

// Miniatura cuadrada de un servicio. Sin foto (o si la foto no carga) muestra
// un ícono, así todas las filas reservan el mismo espacio y el texto queda alineado.
// Con `name` (página pública) muestra en cambio la inicial en el color de marca:
// un ícono de "sin foto" se vería como una imagen rota para el cliente
export function ServiceThumb({
  src,
  name,
  className = "h-14 w-14",
}: {
  src: string | null;
  name?: string;
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
        className={`${className} shrink-0 rounded-lg object-cover`}
      />
    );

  if (name !== undefined)
    return (
      <div
        aria-hidden
        // --brand-ring directo: la variable del tema se resuelve en :root
        className={`${className} flex shrink-0 items-center justify-center rounded-lg bg-brand/15 text-lg font-semibold text-[var(--brand-ring,#4f46e5)]`}
      >
        {/* Array.from: la inicial puede ser un emoji (dos unidades UTF-16) */}
        {Array.from(name.trim())[0]?.toLocaleUpperCase("es")}
      </div>
    );

  return (
    <div
      aria-hidden
      className={`${className} flex shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-400`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="1.75" />
        <path d="m21 16-5-5-9 9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
