"use client";

import { useEffect, useRef, useState } from "react";
import type { AgendaBooking } from "@/lib/types";
import { Button } from "./ui";

// Lo mismo que MAX_COMPLETED_PHOTOS en el backend (agenda.service.ts)
export const MAX_COMPLETED_PHOTOS = 4;

type Picked = { file: File; url: string };

// Se abre al marcar Completada cuando el negocio tiene el aviso de "servicio
// listo": deja claro que se le escribe al cliente y permite sumar fotos de
// cómo quedó, que van dentro del correo. Usa <dialog> nativo, como el de
// cancelar (foco atrapado, Esc para cerrar, fondo)
export function CompleteBookingDialog({
  booking,
  onClose,
  onConfirm,
}: {
  booking: AgendaBooking | null;
  onClose: () => void;
  // Lanza si no se pudo: el diálogo sigue abierto y muestra el error
  onConfirm: (photos: File[]) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (booking && !dialog.open) dialog.showModal();
    if (!booking && dialog.open) dialog.close();
  }, [booking]);

  function add(files: FileList) {
    const room = MAX_COMPLETED_PHOTOS - photos.length;
    const next = Array.from(files)
      .slice(0, room)
      .map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPhotos([...photos, ...next]);
  }

  function remove(index: number) {
    URL.revokeObjectURL(photos[index].url);
    setPhotos(photos.filter((_, i) => i !== index));
  }

  function reset() {
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]);
    setError("");
  }

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await onConfirm(photos.map((p) => p.file));
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (busy) return;
    reset();
    onClose();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="complete-title"
      onCancel={(e) => {
        e.preventDefault(); // Esc: se cierra por el mismo camino que "Volver"
        close();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl p-0 shadow-xl backdrop:bg-black/40"
    >
      {booking && (
        <div className="p-5">
          <h2 id="complete-title" className="text-lg font-semibold">
            Avisar que está listo
          </h2>
          <p className="mt-2 text-sm text-gray-900">
            <strong>{booking.customer.name}</strong> ·{" "}
            {booking.services.map((s) => s.name).join(" + ")}
          </p>
          <p className="mt-3 text-sm text-gray-600">
            Le estás avisando a <strong>{booking.customer.name}</strong> que su
            servicio está terminado. Le enviaremos un correo a{" "}
            <strong>{booking.customer.email}</strong> para que pase a buscarlo.
          </p>

          <div className="mt-4">
            <span className="text-sm font-medium text-gray-700">
              Fotos (opcional)
            </span>
            <p className="text-xs text-gray-500">
              Hasta {MAX_COMPLETED_PHOTOS}. Van dentro del correo para que vea
              cómo quedó.
            </p>
            {photos.length > 0 && (
              <ul className="mt-2 grid grid-cols-4 gap-2">
                {photos.map((p, i) => (
                  <li key={p.url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
                    <img
                      src={p.url}
                      alt={`Foto ${i + 1}`}
                      className="aspect-square w-full rounded-lg border border-gray-200 bg-gray-50 object-cover"
                    />
                    <button
                      type="button"
                      aria-label={`Quitar foto ${i + 1}`}
                      disabled={busy}
                      onClick={() => remove(i)}
                      className="absolute -right-1.5 -top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-gray-900/80 text-sm leading-none text-white transition hover:bg-gray-900 disabled:opacity-50"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {photos.length < MAX_COMPLETED_PHOTOS && (
              <button
                type="button"
                disabled={busy}
                onClick={() => input.current?.click()}
                className="mt-2 min-h-10 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                {photos.length ? "Agregar otra foto" : "Agregar fotos"}
              </button>
            )}
            <input
              ref={input}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              aria-label="Elegir fotos"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) add(e.target.files);
                e.target.value = ""; // permite volver a elegir el mismo archivo
              }}
            />
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              className="h-10 sm:h-auto"
              onClick={close}
              disabled={busy}
            >
              Volver
            </Button>
            <Button className="h-10 sm:h-auto" onClick={confirm} disabled={busy}>
              {busy ? "Enviando..." : "Completar y avisar"}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
