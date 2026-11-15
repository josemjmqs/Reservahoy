'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { isOwner, useMe } from '@/lib/me';
import { Button } from '@/components/ui';
import { TimePicker } from '@/components/TimePicker';
import type { TeamMember, WorkingHour } from '@/lib/types';

// Orden de la semana para mostrar: lunes primero (weekday 0 = domingo)
const DAYS = [
  { weekday: 1, label: 'Lunes' },
  { weekday: 2, label: 'Martes' },
  { weekday: 3, label: 'Miércoles' },
  { weekday: 4, label: 'Jueves' },
  { weekday: 5, label: 'Viernes' },
  { weekday: 6, label: 'Sábado' },
  { weekday: 0, label: 'Domingo' },
];

// Día que ofrece "Copiar a los días marcados" (el primero de la lista)
const COPY_FROM = 1;

interface DayState {
  enabled: boolean;
  opensAt: string;
  closesAt: string;
  // Almuerzo: al quitarlo se conservan las horas por si se vuelve a agregar
  hasBreak: boolean;
  breakStartsAt: string;
  breakEndsAt: string;
}

const defaultDay: DayState = {
  enabled: false,
  opensAt: '09:00',
  closesAt: '18:00',
  hasBreak: false,
  breakStartsAt: '13:00',
  breakEndsAt: '14:00',
};

// Mismas reglas que el backend (dayHoursError), para avisar qué día está mal
// antes de guardar. Las horas HH:MM se comparan como texto
function dayError(d: DayState): string | null {
  if (d.opensAt >= d.closesAt) {
    return 'la hora de apertura debe ser anterior al cierre';
  }
  if (!d.hasBreak) return null;
  if (d.breakStartsAt >= d.breakEndsAt) {
    return 'el almuerzo debe empezar antes de terminar';
  }
  if (d.breakStartsAt <= d.opensAt || d.breakEndsAt >= d.closesAt) {
    return 'el almuerzo debe quedar dentro del horario, después de abrir y antes de cerrar';
  }
  return null;
}


const emptyWeek = () =>
  Object.fromEntries(DAYS.map((d) => [d.weekday, defaultDay])) as Record<
    number,
    DayState
  >;

function HoursContent() {
  const memberId = useSearchParams().get('memberId');
  const me = useMe();
  // El profesional ve su horario en solo lectura: lo define el dueño
  const readOnly = !isOwner(me);
  // Sin ?memberId= es el horario propio (de quien entró); con él, el del
  // profesional elegido en Equipo
  const [otherName, setOtherName] = useState('');
  const memberName = memberId ? otherName : me.membership.displayName;
  const [days, setDays] = useState<Record<number, DayState>>(emptyWeek());
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  // Profesional cuyo horario ya llegó del servidor. Hasta entonces la semana
  // está vacía: guardar en ese momento borraría el horario real
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loaded = loadedFor === (memberId ?? '');

  useEffect(() => {
    const url = memberId
      ? `/working-hours?memberId=${memberId}`
      : '/working-hours';

    api<WorkingHour[]>(url)
      .then((rows) => {
        setError('');
        setSaved(false);
        const next = emptyWeek();
        for (const r of rows) {
          next[r.weekday] = {
            enabled: true,
            opensAt: r.opensAt,
            closesAt: r.closesAt,
            hasBreak: !!(r.breakStartsAt && r.breakEndsAt),
            breakStartsAt: r.breakStartsAt ?? defaultDay.breakStartsAt,
            breakEndsAt: r.breakEndsAt ?? defaultDay.breakEndsAt,
          };
        }
        setDays(next);
        setLoadedFor(memberId ?? '');
      })
      .catch((e) => setError(e.message));

    // Nombre del profesional elegido, para el título
    if (!memberId) return;
    api<TeamMember[]>('/members')
      .then((list) =>
        setOtherName(list.find((x) => x.id === memberId)?.displayName ?? ''),
      )
      .catch(() => {});
  }, [memberId]);

  function update(weekday: number, patch: Partial<DayState>) {
    setSaved(false);
    setDays((d) => ({ ...d, [weekday]: { ...d[weekday], ...patch } }));
  }

  // Pone el horario (y almuerzo) del día elegido en los demás días marcados;
  // los desmarcados quedan cerrados y con sus horas. Solo cambia la pantalla:
  // se guarda con "Guardar horario"
  function copyToChecked(from: number) {
    setSaved(false);
    setDays(
      (d) =>
        Object.fromEntries(
          DAYS.map(({ weekday }) => [
            weekday,
            d[weekday].enabled ? { ...d[from] } : d[weekday],
          ]),
        ) as Record<number, DayState>,
    );
  }

  async function save() {
    setError('');
    setSaved(false);
    const open = DAYS.filter((d) => days[d.weekday].enabled);
    for (const { weekday, label } of open) {
      const problem = dayError(days[weekday]);
      if (problem) {
        setError(`${label}: ${problem}.`);
        return;
      }
    }
    setSaving(true);
    try {
      const payload = open.map(({ weekday }) => {
        const day = days[weekday];
        return {
          weekday,
          opensAt: day.opensAt,
          closesAt: day.closesAt,
          breakStartsAt: day.hasBreak ? day.breakStartsAt : null,
          breakEndsAt: day.hasBreak ? day.breakEndsAt : null,
        };
      });
      await api('/working-hours', {
        method: 'PUT',
        body: JSON.stringify({ ...(memberId && { memberId }), days: payload }),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {memberId && (
        <Link
          href="/dashboard/team"
          className="text-sm text-indigo-600 hover:underline"
        >
          ← Volver al equipo
        </Link>
      )}
      <h1 className="mt-1 text-xl font-semibold tracking-tight">
        {readOnly ? 'Mi horario' : 'Horario de atención'}
        {memberName && ` · ${memberName}`}
      </h1>
      {readOnly ? (
        <p className="mt-1 text-sm text-gray-600">
          Tu horario lo define el dueño del negocio. Para ausencias puntuales
          usa{' '}
          <Link href="/dashboard/blocks" className="text-indigo-600 underline">
            Bloqueos
          </Link>
          .
        </p>
      ) : (
        <p className="mt-1 text-sm text-gray-600">
          Marca los días en que atiende y define su horario. El almuerzo corta
          el día: esa franja no se ofrece a los clientes.
        </p>
      )}

      {!loaded && !error && (
        <p className="my-4 text-sm text-gray-500">Cargando horario...</p>
      )}
      <ul
        hidden={!loaded}
        className="my-4 divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-sm"
      >
        {DAYS.map(({ weekday, label }) => {
          const day = days[weekday];
          return (
            // El día va arriba, a la altura de la primera fila de horas
            // (sm:h-9.5 = alto de la lista de horas), aunque haya almuerzo
            <li
              key={weekday}
              className="flex flex-wrap items-start gap-3 p-4"
            >
              {readOnly ? (
                // Sin casilla: deshabilitada se ve gris y parece "apagado"
                // aunque el día se atienda; las horas ya lo dicen
                <span className="flex w-36 items-center font-medium sm:h-9.5">
                  {label}
                </span>
              ) : (
                <label className="flex w-36 cursor-pointer items-center gap-3 font-medium sm:h-9.5">
                  <input
                    type="checkbox"
                    checked={day.enabled}
                    onChange={(e) =>
                      update(weekday, { enabled: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-gray-300 accent-indigo-600"
                  />
                  {label}
                </label>
              )}
              {day.enabled ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <TimePicker
                      label={`${label}: apertura`}
                      value={day.opensAt}
                      disabled={readOnly}
                      onChange={(v) => update(weekday, { opensAt: v })}
                    />
                    <span className="text-sm text-gray-500">a</span>
                    <TimePicker
                      label={`${label}: cierre`}
                      value={day.closesAt}
                      disabled={readOnly}
                      onChange={(v) => update(weekday, { closesAt: v })}
                    />
                  </div>
                  {day.hasBreak ? (
                    // El almuerzo corta el día en dos: esa franja no se
                    // ofrece a los clientes. items-stretch: "Quitar" mide
                    // lo mismo que los campos
                    <div className="flex flex-wrap items-stretch gap-2">
                      <span className="w-full text-xs font-medium text-gray-600">
                        Almuerzo
                      </span>
                      <TimePicker
                        label={`${label}: inicio del almuerzo`}
                        value={day.breakStartsAt}
                        disabled={readOnly}
                        onChange={(v) => update(weekday, { breakStartsAt: v })}
                      />
                      <span className="self-center text-sm text-gray-500">a</span>
                      <TimePicker
                        label={`${label}: término del almuerzo`}
                        value={day.breakEndsAt}
                        disabled={readOnly}
                        onChange={(v) => update(weekday, { breakEndsAt: v })}
                      />
                      {!readOnly && (
                        <Button
                          variant="secondary"
                          aria-label={`Quitar almuerzo del ${label.toLowerCase()}`}
                          onClick={() => update(weekday, { hasBreak: false })}
                          className="h-10 px-3 sm:h-auto"
                        >
                          Quitar
                        </Button>
                      )}
                    </div>
                  ) : null}
                  {!readOnly && (!day.hasBreak || weekday === COPY_FROM) && (
                    <div className="flex flex-wrap gap-2">
                      {!day.hasBreak && (
                        <Button
                          variant="secondary"
                          aria-label={`Agregar almuerzo al ${label.toLowerCase()}`}
                          onClick={() => update(weekday, { hasBreak: true })}
                          className="h-10 px-3 sm:h-auto sm:py-1.5"
                        >
                          + Almuerzo
                        </Button>
                      )}
                      {weekday === COPY_FROM && (
                        <Button
                          variant="secondary"
                          aria-label={`Copiar el horario del ${label.toLowerCase()} a los días marcados`}
                          onClick={() => copyToChecked(weekday)}
                          className="h-10 px-3 sm:h-auto sm:py-1.5"
                        >
                          Copiar a los días marcados
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-sm leading-6 text-gray-500 sm:leading-9.5">
                  Cerrado
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {readOnly ? (
        error && <p className="mb-3 text-sm text-red-600">{error}</p>
      ) : (
        // En el celular, el botón (con su aviso) queda fijo sobre la barra de
        // navegación: los 7 días no caben en la pantalla. El espacio de abajo
        // evita que tape al domingo
        <>
          <div className="h-16 sm:hidden" />
          <div className="fixed inset-x-0 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] z-10 border-t border-gray-200 bg-white px-4 py-3 sm:static sm:border-0 sm:bg-transparent sm:p-0">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-1">
              <Button onClick={save} disabled={saving || !loaded}>
                {saving ? 'Guardando...' : 'Guardar horario'}
              </Button>
              {error && <p className="text-sm text-red-600">{error}</p>}
              {saved && (
                <p className="text-sm text-green-700">Horario guardado.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function HoursPage() {
  return (
    <Suspense fallback={null}>
      <HoursContent />
    </Suspense>
  );
}