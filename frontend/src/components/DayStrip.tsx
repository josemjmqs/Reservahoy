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

  // El mes (o los dos, si las dos semanas cruzan de mes): sin él, "3" no dice
  // si es de este mes o del próximo
  const month = (d: Date) => d.toLocaleDateString("es-CL", { month: "long" });
  const first = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const last = new Date(now.getFullYear(), now.getMonth(), now.getDate() + STRIP_DAYS - 1);
  const months =
    month(first) === month(last)
      ? month(first)
      : `${month(first)} y ${month(last)}`;

  return (
    <div>
      <p className="mb-2 text-sm text-gray-600 first-letter:uppercase">{months}</p>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {days.map((d, i) => {
            const selected = d.iso === value;
            return (
              <button
                key={d.iso}
                type="button"
                aria-pressed={selected}
                aria-label={d.label}
                onClick={() => onChange(d.iso)}
                className={`flex h-16 flex-col items-center justify-center gap-0.5 rounded-control border transition ${
                  selected
                    ? "border-brand bg-brand text-brand-fg"
                    : "border-gray-200 bg-white hover:border-brand/40"
                }`}
              >
                {/* El primero dice "Hoy": es el día que más se busca */}
                <span
                  className={`text-[13px] leading-none font-medium capitalize ${selected ? "text-brand-fg/85" : "text-gray-600"}`}
                >
                  {i === 0 ? "Hoy" : d.weekday}
                </span>
                <span className="text-lg leading-none time sm:text-xl">
                  {d.day}
                </span>
              </button>
            );
          })}
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-gray-600">
        Otra fecha
        <input
          type="date"
          value={value}
          min={todayISO()}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="min-h-10 rounded-control border border-gray-300 bg-white px-3 text-base text-gray-900 sm:text-sm hover:border-gray-400 focus:border-brand-ring focus:outline-none focus:ring-3 focus:ring-brand/15"
        />
      </label>
    </div>
  );
}
