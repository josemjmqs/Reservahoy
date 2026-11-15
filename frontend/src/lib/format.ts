export function formatTotal(min: number): string {
  if (min % 1440 === 0) {
    const d = min / 1440;
    return d === 1 ? '1 día' : `${d} días`;
  }
  if (min >= 60 && min % 60 === 0) return `${min / 60} h`;
  return `${min} min`;
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