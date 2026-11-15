import { DateTime } from 'luxon';

export interface Interval {
  startsAt: Date;
  endsAt: Date;
}

export interface ComputeSlotsInput {
  date: string; // "2026-11-02", fecha local del negocio
  timezone: string; // "America/Santiago"
  opensAt: string; // "09:00"
  closesAt: string; // "18:00"
  breakStartsAt?: string | null; // "13:00", descanso opcional (almuerzo)
  breakEndsAt?: string | null; // "14:00"
  durationMin: number;
  busy: Interval[]; // reservas activas + bloqueos
  stepMin?: number; // cada cuánto se ofrece una hora (por defecto, la duración)
  now?: Date; // para no ofrecer horas pasadas
}

// Tramos de atención del día en hora local: el horario completo o, con
// descanso, la mañana y la tarde por separado
export function workingSpans(
  opensAt: string,
  closesAt: string,
  breakStartsAt?: string | null,
  breakEndsAt?: string | null,
): [string, string][] {
  if (!breakStartsAt || !breakEndsAt) return [[opensAt, closesAt]];
  return [
    [opensAt, breakStartsAt],
    [breakEndsAt, closesAt],
  ];
}

export function computeSlots(input: ComputeSlotsInput): Date[] {
  const {
    date,
    timezone,
    durationMin,
    busy,
    stepMin = durationMin,
    now = new Date(),
  } = input;

  // Se construye en la zona del negocio y luego se pasa a UTC
  const at = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return DateTime.fromISO(date, { zone: timezone }).set({
      hour: h,
      minute: m,
    });
  };

  const slots: Date[] = [];
  // Cada tramo tiene su propia grilla: después del almuerzo se vuelve a
  // ofrecer desde la hora en que termina, y una reserva (aunque tenga varios
  // servicios, es un solo bloque) nunca cruza el descanso
  const spans = workingSpans(
    input.opensAt,
    input.closesAt,
    input.breakStartsAt,
    input.breakEndsAt,
  );
  for (const [from, to] of spans) {
    const closeMs = at(to).toMillis();
    let start = at(from);

    while (start.plus({ minutes: durationMin }).toMillis() <= closeMs) {
      const s = start.toMillis();
      const e = start.plus({ minutes: durationMin }).toMillis();

      const isFuture = s > now.getTime();
      const overlaps = busy.some(
        (b) => s < b.endsAt.getTime() && e > b.startsAt.getTime(),
      );

      if (isFuture && !overlaps) slots.push(start.toJSDate());
      start = start.plus({ minutes: stepMin });
    }
  }
  return slots;
}
