"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Button } from "@/components/ui";
import { brandStyle } from "@/lib/brand";
import { encodeCanvas } from "@/lib/image";

// Encuadre del logo antes de subirlo: la página pública lo muestra en un
// círculo (como la foto de perfil de Instagram), así que aquí se ve ese
// círculo, se arrastra la imagen para moverla y se cambia su tamaño con la
// barra (o pellizcando en el celular). Al guardar se recorta en el navegador
// a un cuadrado de OUTPUT px: lo que se sube es justo lo que se vio. Panel
// propio (<dialog>, desde abajo en el celular), como el ColorPicker

const OUTPUT = 512; // px del lado: el logo se muestra a 64 px, hasta 3x en pantallas densas
const MAX_ZOOM = 4;
const KEY_STEP = 0.02; // fracción del círculo que mueve cada flecha

// Tamaño 1 = la imagen cubre el cuadrado (su lado corto mide lo que el
// círculo); menos que 1 la achica hasta que entra entera. x e y: cuánto se
// corrió su centro, en fracciones del lado del cuadrado
type Frame = { zoom: number; x: number; y: number };
type Loaded = { bitmap: ImageBitmap; url: string; wf: number; hf: number };

const clampTo = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

// Mínimo: la imagen entra entera en el cuadrado
const minZoom = ({ wf, hf }: Loaded) => 1 / Math.max(wf, hf);

// Nunca queda un borde vacío si la imagen cubre, ni se sale si es más chica
function clampFrame(f: Frame, img: Loaded): Frame {
  const zoom = clampTo(f.zoom, minZoom(img), MAX_ZOOM);
  const lx = Math.abs(img.wf * zoom - 1) / 2;
  const ly = Math.abs(img.hf * zoom - 1) / 2;
  return { zoom, x: clampTo(f.x, -lx, lx), y: clampTo(f.y, -ly, ly) };
}

// Posición en porcentajes del cuadrado: sirve igual para el editor grande y
// para la vista previa de 64 px
function placement({ zoom, x, y }: Frame, { wf, hf }: Loaded) {
  const w = wf * zoom;
  const h = hf * zoom;
  return { left: 0.5 + x - w / 2, top: 0.5 + y - h / 2, w, h };
}

function placeStyle(f: Frame, img: Loaded): CSSProperties {
  const p = placement(f, img);
  return {
    left: `${p.left * 100}%`,
    top: `${p.top * 100}%`,
    width: `${p.w * 100}%`,
    height: `${p.h * 100}%`,
  };
}

function Framed({ img, frame }: { img: Loaded; frame: Frame }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- imagen local (blob:) mientras se encuadra
    <img
      src={img.url}
      alt=""
      draggable={false}
      style={placeStyle(frame, img)}
      className="pointer-events-none absolute max-w-none select-none"
    />
  );
}

export function LogoCropper({
  file,
  businessName,
  brandColor,
  onCancel,
  onSave,
  onError,
}: {
  file: File;
  businessName: string;
  brandColor: string | null; // el de la página pública (null: el de Reservahoy)
  onCancel: () => void;
  onSave: (logo: Blob) => void;
  onError: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement | null>(null);
  const area = useRef<HTMLDivElement | null>(null);
  const [img, setImg] = useState<Loaded | null>(null);
  const [frame, setFrame] = useState<Frame>({ zoom: 1, x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  // Dedos (o el mouse) sobre la imagen: uno la mueve, dos la agrandan
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  // Sin depender de que quien lo usa pase siempre la misma función: si no,
  // cada render volvería a leer la imagen
  const reportError = useRef(onError);
  useEffect(() => {
    reportError.current = onError;
  }, [onError]);

  useEffect(() => {
    let cancelled = false;
    let loaded: ImageBitmap | null = null;
    const url = URL.createObjectURL(file);
    createImageBitmap(file).then(
      (bitmap) => {
        loaded = bitmap;
        if (cancelled) return bitmap.close();
        const side = Math.min(bitmap.width, bitmap.height);
        setImg({ bitmap, url, wf: bitmap.width / side, hf: bitmap.height / side });
      },
      () => {
        if (!cancelled)
          reportError.current(
            "No se pudo leer la imagen. Prueba con una foto JPG o PNG",
          );
      },
    );
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
      loaded?.close();
    };
  }, [file]);

  const update = (next: (f: Frame) => Frame) =>
    img && setFrame((f) => clampFrame(next(f), img));

  function close() {
    dialog.current?.close();
    onCancel();
  }

  async function save() {
    if (!img) return;
    setSaving(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = OUTPUT;
      const p = placement(frame, img);
      canvas
        .getContext("2d")!
        .drawImage(img.bitmap, p.left * OUTPUT, p.top * OUTPUT, p.w * OUTPUT, p.h * OUTPUT);
      // PNG si no hay WebP: el logo puede tener fondo transparente
      onSave(await encodeCanvas(canvas, "image/png"));
    } catch (e) {
      setSaving(false);
      onError(e instanceof Error ? e.message : "No se pudo procesar la imagen");
    }
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const map = pointers.current;
    const prev = map.get(e.pointerId);
    if (!prev || !area.current) return;
    const side = area.current.getBoundingClientRect().width;
    const before = [...map.values()];
    map.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (before.length === 1) {
      const [dx, dy] = [(e.clientX - prev.x) / side, (e.clientY - prev.y) / side];
      update((f) => ({ ...f, x: f.x + dx, y: f.y + dy }));
    } else if (before.length === 2) {
      const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
        Math.hypot(a.x - b.x, a.y - b.y);
      const [a, b] = [...map.values()];
      const ratio = dist(a, b) / Math.max(1, dist(before[0], before[1]));
      update((f) => ({ ...f, zoom: f.zoom * ratio }));
    }
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    update((f) => ({ ...f, x: f.x + move[0], y: f.y + move[1] }));
  }

  return (
    <dialog
      ref={(el) => {
        dialog.current = el;
        if (el && !el.open) el.showModal();
      }}
      // Esc. Tocar fuera no lo cierra: al arrastrar la imagen se suelta a
      // veces fuera del panel y se perdería el encuadre
      onClose={onCancel}
      aria-label="Ajustar logo"
      className="m-0 mt-auto w-full max-w-none rounded-t-sheet bg-white p-0 shadow-float text-gray-900 backdrop:bg-black/40 sm:m-auto sm:max-w-2xl sm:rounded-sheet"
    >
      <div className="flex flex-col gap-4 px-4 pt-4 pb-[max(1rem,var(--safe-bottom-max))]">
        <div>
          {/* Al abrir, el foco va al título y no al encuadre, que si no se
              ve marcado antes de tocarlo */}
          <h2
            tabIndex={-1}
            autoFocus
            className="text-sm font-medium text-gray-900 outline-none"
          >
            Ajustar logo
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Tus clientes lo verán dentro del círculo. Arrastra la imagen para
            moverla y cambia su tamaño con la barra.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-[min(16rem,calc(100dvh-13rem))_minmax(0,1fr)] sm:items-center">
          {/* El cuadrado se achica con pantallas bajas (celular de lado) */}
          <div
            ref={area}
            role="group"
            tabIndex={0}
            aria-label="Encuadre del logo. Arrastra o usa las flechas para moverlo"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            className="relative mx-auto aspect-square w-[min(16rem,100%,calc(100dvh-13rem))] sm:w-full cursor-grab touch-none overflow-hidden rounded-control bg-white outline-offset-2 select-none active:cursor-grabbing"
          >
            {img && <Framed img={img} frame={frame} />}
            {/* Fuera del círculo se oscurece: eso no se verá */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_100vmax_rgb(12_11_27/0.55)] ring-2 ring-white"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-4 sm:gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-700">Tamaño</span>
              <input
                type="range"
                min={img ? minZoom(img) : 1}
                max={MAX_ZOOM}
                step="any"
                value={frame.zoom}
                disabled={!img}
                onChange={(e) => {
                  const zoom = Number(e.target.value);
                  update((f) => ({ ...f, zoom }));
                }}
                className="h-10 w-full cursor-pointer accent-accent"
              />
            </label>
            <div>
              <span className="text-xs font-medium text-gray-700">
                Así se verá en tu página
              </span>
              <div
                style={brandStyle(brandColor)}
                className="mt-1 flex min-w-0 items-center gap-3 rounded-card bg-brand p-3 text-brand-fg sm:py-2"
              >
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-white ring-1 ring-black/10">
                  {img && <Framed img={img} frame={frame} />}
                </div>
                <span className="min-w-0 truncate text-lg font-semibold tracking-tight">
                  {businessName}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={close}
            className="h-10"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={!img || saving}
            className="h-10"
          >
            {saving ? "Guardando..." : "Guardar logo"}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
