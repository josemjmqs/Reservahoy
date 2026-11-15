"use client";

const STRIP_DAYS = 14;

// Fecha local en formato YYYY-MM-DD (lo que usan el input de fecha y la API)
export function localISO(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const todayISO = () => localISO(new Date());

// Las próximas dos semanas como botones ("lun 16") en dos filas de 7, sin
// desplazamiento lateral (que con mouse no se descubre), y un campo para
// elegir una fecha más adelante
export function DayStrip({
  value,
  onChange,
}: {
  value: string;
  onChange: (date: string) => void;
}) {
  const now = new Date();
  const days = Array.from({ length: STRIP_DAYS }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    return {
      iso: localISO(d),
      weekday: d.toLocaleDateString("es-CL", { weekday: "short" }).replace(".", ""),
      day: d.getDate(),
      label: d.toLocaleDateString("es-CL", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    };
  });

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {days.map((d) => {
            const selected = d.iso === value;
            return (
              <button
                key={d.iso}
                type="button"
                aria-pressed={selected}
                aria-label={d.label}
                onClick={() => onChange(d.iso)}
                className={`flex h-14 flex-col items-center justify-center rounded-lg border transition ${
                  selected
                    ? "border-brand bg-brand text-brand-fg"
                    : "border-gray-200 bg-white hover:border-brand/40"
                }`}
              >
                <span
                  className={`text-xs capitalize ${selected ? "text-brand-fg/80" : "text-gray-500"}`}
                >
                  {d.weekday}
                </span>
                <span className="text-base font-semibold tabular-nums sm:text-lg">
                  {d.day}
                </span>
              </button>
            );
          })}
      </div>
      <label className="mt-2 flex items-center gap-2 text-sm text-gray-600">
        Otra fecha
        <input
          type="date"
          value={value}
          min={todayISO()}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="min-h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
      </label>
    </div>
  );
}
