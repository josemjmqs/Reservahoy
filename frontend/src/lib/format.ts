// Mayúscula solo al inicio ("Lunes, 16 de noviembre"): la clase `capitalize`
// de CSS la pone en cada palabra ("Lunes, 16 De Noviembre")
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Duración legible: días si es exacta en días, si no horas y minutos
// (90 -> "1 h 30 min", 120 -> "2 h", 45 -> "45 min")
export function formatTotal(min: number): string {
  if (min % 1440 === 0) {
    const d = min / 1440;
    return d === 1 ? '1 día' : `${d} días`;
  }
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// Hora en formato de 24 horas ("13:45"), en la zona del negocio. Sin
// `hourCycle`, es-CL da "01:45 p. m."
export function formatTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  });
}

// Duración que se muestra al cliente en la página pública
export function publicDuration(durationMin: number, totalMin: number | null): string {
  return formatTotal(
    totalMin && totalMin !== durationMin ? totalMin : durationMin,
  );
}