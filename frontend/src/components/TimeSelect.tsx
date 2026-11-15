import type { ComponentProps } from 'react';

// Las horas del panel (horario y bloqueos) van de 15 en 15 minutos y se eligen
// de una lista, no con <input type="time">: en Android ese abre el reloj del
// sistema, que no respeta step, muestra "6:00 p. m." según el idioma del
// teléfono y en pantallas angostas corta el botón "Establecer"
export const STEP_MIN = 15;
export const offStep = (hhmm: string) =>
  Number(hhmm.slice(3, 5)) % STEP_MIN !== 0;
// 00:00, 00:15 … 23:45
const TIMES = Array.from({ length: (24 * 60) / STEP_MIN }, (_, i) => {
  const min = i * STEP_MIN;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
});

// Una hora que no está en la lista (guardada antes con otros minutos) se
// agrega para que se vea; quien la use decide si la acepta (dayError del
// horario pide cambiarla)
export function TimeSelect({
  value,
  ...props
}: ComponentProps<'select'> & { value: string }) {
  const options = TIMES.includes(value) ? TIMES : [...TIMES, value].sort();
  return (
    <select
      value={value}
      {...props}
      className="h-10 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm tabular-nums sm:h-auto focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:cursor-default disabled:bg-gray-50 disabled:text-gray-600"
    >
      {options.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}
