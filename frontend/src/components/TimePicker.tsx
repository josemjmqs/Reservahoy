"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";

// Hora del panel (horario y bloqueos) en formato 24 h. No usa
// <input type="time">: en Android ese abre el reloj del sistema, que muestra
// "6:00 p. m." según el idioma del teléfono y en pantallas angostas corta el
// botón "Establecer". Aquí un panel propio (<dialog>, desde abajo en el
// celular) muestra las 24 horas y después los minutos de 5 en 5

const pad = (n: number) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, i) => i);
export const MINUTE_STEP = 5;
const MINUTES = Array.from(
  { length: 60 / MINUTE_STEP },
  (_, i) => i * MINUTE_STEP,
);

const cell =
  "h-11 rounded-lg border text-base tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300";
const cellIdle = "border-gray-200 bg-white text-gray-900 hover:bg-gray-50";
const cellOn = "border-indigo-600 bg-indigo-600 text-white";

export function TimePicker({
  label,
  value,
  onChange,
  disabled,
}: {
  // Nombre del campo ("Lunes: apertura"): es el título del panel y, con la
  // hora, el nombre accesible del botón
  label: string;
  value: string; // HH:MM
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement | null>(null);
  // El panel existe solo mientras está abierto: se abre como modal al montarse
  // y al cerrarse (Listo, Cancelar, Escape o tocar fuera) se desmonta
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"hour" | "minute">("hour");
  const [hour, setHour] = useState(0);
  const [minute, setMinute] = useState(0);

  function open() {
    setHour(Number(value.slice(0, 2)));
    setMinute(Number(value.slice(3, 5)));
    setStep("hour");
    setIsOpen(true);
  }

  // close() devuelve el foco al campo; se desmonta enseguida, sin esperar el
  // evento close (llega después), para que no queden dos con el mismo nombre
  function close() {
    dialog.current?.close();
    setIsOpen(false);
  }

  function accept() {
    onChange(`${pad(hour)}:${pad(minute)}`);
    close();
  }

  const tab = (active: boolean) =>
    `rounded-md px-1 ${active ? "bg-indigo-50 text-indigo-700" : "text-gray-400 hover:text-gray-600"}`;

  return (
    <>
      <button
        type="button"
        aria-label={`${label} ${value}`}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={open}
        className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm tabular-nums sm:h-9.5 hover:border-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:cursor-default disabled:border-gray-300 disabled:bg-gray-50 disabled:text-gray-600"
      >
        {value}
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
          className="m-0 mt-auto w-full max-w-none rounded-t-2xl bg-white p-0 text-gray-900 backdrop:bg-black/40 sm:m-auto sm:max-w-sm sm:rounded-2xl"
        >
          <div className="px-4 pt-4 pb-[max(1rem,var(--safe-bottom-max))]">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-medium text-gray-600">{label}</h2>
              <p className="text-3xl font-semibold tabular-nums">
                <button
                  type="button"
                  aria-label="Cambiar la hora"
                  onClick={() => setStep("hour")}
                  className={tab(step === "hour")}
                >
                  {pad(hour)}
                </button>
                <span className="text-gray-400">:</span>
                <button
                  type="button"
                  aria-label="Cambiar los minutos"
                  onClick={() => setStep("minute")}
                  className={tab(step === "minute")}
                >
                  {pad(minute)}
                </button>
              </p>
            </div>
            <p className="mb-2 text-xs text-gray-600">
              {step === "hour" ? "Elige la hora" : "Elige los minutos"}
            </p>
            {step === "hour" ? (
              <div className="grid grid-cols-6 gap-1.5">
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    aria-pressed={h === hour}
                    onClick={() => {
                      setHour(h);
                      setStep("minute");
                    }}
                    className={`${cell} ${h === hour ? cellOn : cellIdle}`}
                  >
                    {pad(h)}
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-1.5">
                {MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={m === minute}
                    onClick={() => setMinute(m)}
                    className={`${cell} ${m === minute ? cellOn : cellIdle}`}
                  >
                    :{pad(m)}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
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
