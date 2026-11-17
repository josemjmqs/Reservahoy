"use client";

import { useRef } from "react";

// Vista previa + botones para elegir, cambiar o quitar una foto (o el logo del
// negocio, con `noun="logo"`). No es un <label>: tiene varios botones dentro
export function PhotoPicker({
  imageUrl,
  busy = false,
  onPick,
  onRemove,
  noun = "foto",
  alt = "Foto del servicio",
  hint = "Opcional. JPG, PNG o WebP; se ajusta de tamaño automáticamente",
  square = false,
}: {
  imageUrl: string | null;
  busy?: boolean;
  onPick: (file: File) => void;
  onRemove?: () => void;
  noun?: "foto" | "logo";
  alt?: string;
  hint?: string;
  square?: boolean; // vista previa cuadrada (logo) en vez de apaisada (foto)
}) {
  const input = useRef<HTMLInputElement>(null);
  const size = square ? "h-20 w-20" : "h-20 w-28";

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-700">
        {noun === "foto" ? "Foto" : "Logo"}
      </span>
      <div className="flex items-center gap-3">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- la foto ya viene reducida; no usamos el optimizador de Vercel
          <img
            src={imageUrl}
            alt={alt}
            className={`${size} shrink-0 rounded-control border border-gray-200 bg-gray-50 object-contain`}
          />
        ) : (
          <div
            className={`${size} flex shrink-0 items-center justify-center rounded-control border border-dashed border-gray-300 text-xs text-gray-400`}
          >
            Sin {noun}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="min-h-10 rounded-control border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            {busy ? "Subiendo..." : `${imageUrl ? "Cambiar" : "Subir"} ${noun}`}
          </button>
          {imageUrl && onRemove && (
            <button
              type="button"
              disabled={busy}
              onClick={onRemove}
              className="min-h-10 rounded-control px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            >
              Quitar
            </button>
          )}
        </div>
      </div>
      <span className="text-xs text-gray-500">{hint}</span>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // permite volver a elegir el mismo archivo
          if (file) onPick(file);
        }}
      />
    </div>
  );
}
