// Horas de un día del horario, como las edita el panel: al quitar el almuerzo
// sus horas se conservan (hasBreak en false) por si se vuelve a agregar
export interface DayHours {
  opensAt: string;
  closesAt: string;
  hasBreak: boolean;
  breakStartsAt: string;
  breakEndsAt: string;
}

// Mismas reglas que el backend (dayHoursError, set-working-hours.dto.ts), para
// avisar qué día está mal antes de guardar; lo revisa
// backend/src/shared-rules.spec.ts. Las horas HH:MM se comparan como texto
export function dayError(d: DayHours): string | null {
  if (d.opensAt >= d.closesAt) {
    return "la hora de apertura debe ser anterior al cierre";
  }
  if (!d.hasBreak) return null;
  if (d.breakStartsAt >= d.breakEndsAt) {
    return "el almuerzo debe empezar antes de terminar";
  }
  if (d.breakStartsAt <= d.opensAt || d.breakEndsAt >= d.closesAt) {
    return "el almuerzo debe quedar dentro del horario, después de abrir y antes de cerrar";
  }
  return null;
}
