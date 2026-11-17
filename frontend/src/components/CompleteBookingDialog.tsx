"use client";

import { useEffect, useRef, useState } from "react";
import { resizeImage } from "@/lib/image";
import { deleteDraft, getDraft, saveDraft } from "@/lib/photo-drafts";
import type { AgendaBooking } from "@/lib/types";
import { Button } from "./ui";

// Lo mismo que MAX_COMPLETED_PHOTOS en el backend (agenda.service.ts)
export const MAX_COMPLETED_PHOTOS = 4;

type Picked = { blob: Blob; url: string };

const preview = (blob: Blob): Picked => ({
  blob,
  url: URL.createObjectURL(blob),
});

// Se abre al marcar Completada cuando el negocio tiene el aviso de "servicio
// listo": deja claro que se le escribe al cliente y permite sumar fotos de
// cómo quedó, que van dentro del correo. Las fotos quedan guardadas en este
// navegador como borrador de la reserva (lib/photo-drafts.ts): se puede
// cerrar, volver más tarde y sumar otra antes de enviar. Usa <dialog> nativo,
// como el de cancelar (foco atrapado, Esc para cerrar, fondo)
export function CompleteBookingDialog({
  booking,
  onClose,
  onConfirm,
}: {
  booking: AgendaBooking | null;
  // Al cerrar sin enviar (el borrador puede haber cambiado)
  onClose: () => void;
  // Lanza si no se pudo: el diálogo sigue abierto y muestra el error
  onConfirm: (photos: Blob[]) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Picked[]>([]);
  // Mientras se reducen las fotos recién elegidas
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bookingId = booking?.id;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (booking && !dialog.open) dialog.showModal();
    if (!booking && dialog.open) dialog.close();
  }, [booking]);

  // Al abrir, las fotos que quedaron guardadas de la vez anterior
  useEffect(() => {
    if (!bookingId) return;
    let stale = false;
    getDraft(bookingId).then((blobs) => {
      if (stale || !blobs.length) return;
      // Si ya se eligió alguna mientras cargaba, se queda la de ahora
      setPhotos((current) => (current.length ? current : blobs.map(preview)));
    });
    return () => {
      stale = true;
    };
  }, [bookingId]);

  // Se reducen al elegirlas (no al enviar), así el borrador ocupa poco
  async function add(files: File[]) {
    if (!bookingId) return;
    const room = MAX_COMPLETED_PHOTOS - photos.length;
    setPreparing(true);
    setError("");
    try {
      const blobs = await Promise.all(
        files.slice(0, room).map((f) => resizeImage(f)),
      );
      const next = [...photos, ...blobs.map(preview)];
      setPhotos(next);
      await saveDraft(
        bookingId,
        next.map((p) => p.blob),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setPreparing(false);
    }
  }

  function remove(index: number) {
    if (!bookingId) return;
    URL.revokeObjectURL(photos[index].url);
    const next = photos.filter((_, i) => i !== index);
    setPhotos(next);
    void saveDraft(
      bookingId,
      next.map((p) => p.blob),
    );
  }

  // Vacía la vista; el borrador guardado se queda (o ya se borró al enviar)
  function reset() {
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]);
    setError("");
  }

  async function confirm() {
    if (!bookingId) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm(photos.map((p) => p.blob));
      await deleteDraft(bookingId);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (busy || preparing) return;
    reset();
    onClose();
  }

  const locked = busy || preparing;

  return (
    <dialog
      ref={ref}
      aria-labelledby="complete-title"
      onCancel={(e) => {
        e.preventDefault(); // Esc: se cierra por el mismo camino que "Volver"
        close();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-sheet p-0 shadow-float backdrop:bg-black/40"
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
              cómo quedó. Quedan guardadas en este dispositivo hasta que las
              envíes: puedes cerrar y volver a sumar otra.
            </p>
            {photos.length > 0 && (
              <ul className="mt-2 grid grid-cols-4 gap-2">
                {photos.map((p, i) => (
                  <li key={p.url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
                    <img
                      src={p.url}
                      alt={`Foto ${i + 1}`}
                      className="aspect-square w-full rounded-control border border-gray-200 bg-gray-50 object-cover"
                    />
                    <button
                      type="button"
                      aria-label={`Quitar foto ${i + 1}`}
                      disabled={locked}
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
                disabled={locked}
                onClick={() => input.current?.click()}
                className="mt-2 min-h-10 rounded-control border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                {preparing
                  ? "Preparando..."
                  : photos.length
                    ? "Agregar otra foto"
                    : "Agregar fotos"}
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
                const files = Array.from(e.target.files ?? []);
                e.target.value = ""; // permite volver a elegir el mismo archivo
                if (files.length) void add(files);
              }}
            />
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              className="h-10 sm:h-auto"
              onClick={close}
              disabled={locked}
            >
              Volver
            </Button>
            <Button
              className="h-10 sm:h-auto"
              onClick={confirm}
              disabled={locked}
            >
              {busy ? "Enviando..." : "Completar y avisar"}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
