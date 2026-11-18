"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { brandStyle } from "@/lib/brand";

// Color propio (#rrggbb) con tres barras: tono, saturación y brillo. No usa
// <input type="color">: la paleta del sistema primero muestra una grilla de
// colores fijos (en Android hay que tocar "Más" para llegar a las barras) y en
// cada navegador se ve distinta. Aquí un panel propio (<dialog>, desde abajo
// en el celular, como el TimePicker) va directo a las barras

type Hsv = { h: number; s: number; v: number }; // h 0-360, s y v 0-100

const hex2 = (n: number) =>
  Math.round(n * 255)
    .toString(16)
    .padStart(2, "0");

export function hsvToHex({ h, s, v }: Hsv) {
  const [sat, val] = [s / 100, v / 100];
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return val - val * sat * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return `#${hex2(f(5))}${hex2(f(3))}${hex2(f(1))}`;
}

export function hexToHsv(hex: string): Hsv {
  const [r, g, b] = [1, 3, 5].map(
    (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
  );
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return {
    h: Math.round(h < 0 ? h + 360 : h),
    s: Math.round(max ? (d / max) * 100 : 0),
    v: Math.round(max * 100),
  };
}

const HUE_TRACK = `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360]
  .map((h) => hsvToHex({ h, s: 100, v: 100 }))
  .join(", ")})`;

// Barra con el degradado de fondo y un círculo blanco que se arrastra
const slider =
  "h-9 w-full cursor-pointer appearance-none rounded-full border border-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-transparent [&::-moz-range-thumb]:shadow-[0_0_0_1px_rgb(0_0_0/0.35),0_1px_3px_rgb(0_0_0/0.4)] [&::-moz-range-track]:bg-transparent [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-transparent [&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgb(0_0_0/0.35),0_1px_3px_rgb(0_0_0/0.4)]";

function Bar({
  label,
  value,
  max,
  track,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  track: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-gray-700">{label}</span>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ background: track }}
        className={slider}
      />
    </label>
  );
}

export function ColorPicker({
  label,
  value,
  onChange,
  className,
  style,
  children,
}: {
  // Nombre del botón que lo abre y título del panel
  label: string;
  value: string; // #rrggbb: el color con que parte el panel
  onChange: (value: string) => void;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode; // contenido del botón
}) {
  const dialog = useRef<HTMLDialogElement | null>(null);
  // Como el TimePicker: el panel existe solo mientras está abierto
  const [isOpen, setIsOpen] = useState(false);
  const [hsv, setHsv] = useState<Hsv>({ h: 0, s: 0, v: 0 });
  // Sin mover ninguna barra queda el color exacto con que partió: pasar a
  // tono, saturación y brillo redondea (#4f39f6 volvería como #4e38f5)
  const [touched, setTouched] = useState(false);
  const color = touched ? hsvToHex(hsv) : value.toLowerCase();

  function open() {
    setHsv(hexToHsv(value));
    setTouched(false);
    setIsOpen(true);
  }

  function close() {
    dialog.current?.close();
    setIsOpen(false);
  }

  function accept() {
    onChange(color);
    close();
  }

  const set = (part: Partial<Hsv>) => {
    setHsv((c) => ({ ...c, ...part }));
    setTouched(true);
  };

  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        title={label}
        onClick={open}
        style={style}
        className={className}
      >
        {children}
      </button>
      {isOpen && (
        <dialog
          ref={(el) => {
            dialog.current = el;
            if (el && !el.open) el.showModal();
          }}
          onClose={() => setIsOpen(false)}
          aria-label={label}
          // Tocar fuera del panel (el fondo oscuro) lo cierra sin cambiar nada
          onClick={(e) => e.target === e.currentTarget && close()}
          className="m-0 mt-auto w-full max-w-none rounded-t-sheet bg-white p-0 shadow-float text-gray-900 backdrop:bg-black/40 sm:m-auto sm:max-w-sm sm:rounded-sheet"
        >
          <div className="flex flex-col gap-4 px-4 pt-4 pb-[max(1rem,var(--safe-bottom-max))]">
            <h2 className="text-sm font-medium text-gray-600">{label}</h2>
            <div
              style={brandStyle(color)}
              className="flex h-16 items-center justify-center rounded-card bg-brand text-sm font-medium text-brand-fg"
            >
              Confirmar reserva
            </div>
            <Bar
              label="Tono"
              value={hsv.h}
              max={360}
              track={HUE_TRACK}
              onChange={(h) => set({ h })}
            />
            <Bar
              label="Saturación"
              value={hsv.s}
              max={100}
              track={`linear-gradient(to right, ${hsvToHex({ ...hsv, s: 0 })}, ${hsvToHex({ ...hsv, s: 100 })})`}
              onChange={(s) => set({ s })}
            />
            <Bar
              label="Brillo"
              value={hsv.v}
              max={100}
              track={`linear-gradient(to right, #000000, ${hsvToHex({ ...hsv, v: 100 })})`}
              onChange={(v) => set({ v })}
            />
            <div className="flex items-center justify-end gap-2">
              <span className="mr-auto font-mono text-xs text-gray-500">
                {color}
              </span>
              <Button
                type="button"
                variant="secondary"
                onClick={close}
                className="h-10"
              >
                Cancelar
              </Button>
              <Button type="button" onClick={accept} className="h-10">
                Listo
              </Button>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
