"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { isOwner, useMe } from "@/lib/me";
import { completeBooking } from "@/lib/image";
import { syncDrafts } from "@/lib/photo-drafts";
import { CancelBookingDialog } from "@/components/CancelBookingDialog";
import { CompleteBookingDialog } from "@/components/CompleteBookingDialog";
import { RefreshIcon } from "@/components/icons";
import { Button, Input } from "@/components/ui";
import { canComplete } from "@/lib/types";
import type {
  AgendaBooking,
  BookingStatus,
  SettableStatus,
  TeamMember,
} from "@/lib/types";

const TZ = "America/Santiago";

const LABELS: Record<BookingStatus, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  NO_SHOW: "No se presentó",
};

const BADGE: Record<BookingStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700 ring-amber-200",
  CONFIRMED: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  COMPLETED: "bg-green-50 text-green-700 ring-green-200",
  CANCELLED: "bg-gray-100 text-gray-600 ring-gray-200",
  NO_SHOW: "bg-red-50 text-red-700 ring-red-200",
};

// Botones de una reserva: llenan la fila en el celular
const ACTION =
  "h-10 flex-1 whitespace-nowrap px-2 py-0 sm:h-auto sm:flex-none sm:px-3 sm:py-1";

function iso(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const fetchAgenda = (date: string, memberId: string) =>
  api<AgendaBooking[]>(
    `/agenda?from=${date}&to=${date}${memberId ? `&memberId=${memberId}` : ""}`,
  );

const fetchNext = (memberId: string) =>
  api<{ booking: AgendaBooking | null }>(
    `/agenda/next${memberId ? `?memberId=${memberId}` : ""}`,
  ).then((r) => r.booking);

function AgendaContent() {
  // ?date=YYYY-MM-DD abre ese día (lo usa el enlace del correo de reserva nueva)
  const initialDate = useSearchParams().get("date");
  const [date, setDate] = useState(
    initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)
      ? initialDate
      : iso(new Date()),
  );
  const [bookings, setBookings] = useState<AgendaBooking[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [memberId, setMemberId] = useState(""); // "" = todos
  const [error, setError] = useState("");
  // Aviso tras marcar Completada con el correo de "servicio listo" activado
  const [notice, setNotice] = useState("");
  const [next, setNext] = useState<AgendaBooking | null>(null);
  // Reserva que el dueño está por cancelar (abre la confirmación)
  const [toCancel, setToCancel] = useState<AgendaBooking | null>(null);
  // Reserva que se está por completar avisando al cliente (abre el diálogo)
  const [toComplete, setToComplete] = useState<AgendaBooking | null>(null);
  // Fotos guardadas sin enviar por reserva (borradores en este navegador) y
  // un contador para volver a leerlas al cerrar el diálogo
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [draftsVersion, setDraftsVersion] = useState(0);
  // Hora de la última carga correcta: la agenda no está en vivo (se recarga
  // cada 30 s y con "Actualizar"), así que se muestra de cuándo es
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Hoy, las reservas que ya terminaron bajan a "Ya pasaron"; las en curso
  // siguen arriba. Otros días se muestran todas juntas, por hora
  const now = new Date();
  const isToday = date === iso(now);
  const hasEnded = (b: AgendaBooking) => new Date(b.endsAt) <= now;
  const upcoming = isToday ? bookings.filter((b) => !hasEnded(b)) : bookings;
  const past = isToday ? bookings.filter(hasEnded) : [];

  // La próxima reserva (de otro día) se muestra si hoy no queda ninguna por venir
  const showNext = isToday && upcoming.length === 0;

  const load = useCallback(async () => {
    try {
      setBookings(await fetchAgenda(date, memberId));
      setUpdatedAt(new Date().toISOString());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    }
  }, [date, memberId]);

  // Clic en "Actualizar": el ícono gira mientras carga (la recarga
  // automática no lo hace girar, para no distraer)
  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // Solo el dueño elige profesional: el profesional ve únicamente su agenda,
  // sin el filtro ni el "Con {nombre}" (ambos aparecen con más de un miembro)
  const me = useMe();
  const owner = isOwner(me);
  // Ajuste del negocio: al marcar Completada se le escribe al cliente
  const notifyCompleted = me.membership.business.notifyCompleted;
  useEffect(() => {
    if (!owner) return;
    api<TeamMember[]>("/members")
      .then((list) => setMembers(list.filter((m) => m.active)))
      .catch(() => {});
  }, [owner]);

  useEffect(() => {
    // al cambiar de día, ignora la respuesta del día anterior si llega tarde
    let stale = false;
    fetchAgenda(date, memberId)
      .then((list) => {
        if (stale) return;
        setBookings(list);
        setUpdatedAt(new Date().toISOString());
        setError("");
      })
      .catch((e) => {
        if (!stale) setError(e instanceof Error ? e.message : "Error inesperado");
      });
    return () => {
      stale = true;
    };
  }, [date, memberId]);

  useEffect(() => {
    if (!showNext) return;
    let stale = false;
    fetchNext(memberId)
      .then((b) => {
        if (!stale) setNext(b);
      })
      .catch(() => {
        if (!stale) setNext(null);
      });
    return () => {
      stale = true;
    };
  }, [showNext, memberId, bookings]);

  // Al cargar la agenda: cuántas fotos guardadas tiene cada reserva, y se
  // borran las de reservas que ya no están activas
  useEffect(() => {
    let stale = false;
    syncDrafts(next ? [...bookings, next] : bookings).then((counts) => {
      if (!stale) setDrafts(counts);
    });
    return () => {
      stale = true;
    };
  }, [bookings, next, draftsVersion]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") load();
    };

    const id = setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  function shift(days: number) {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + days);
    setDate(iso(d));
  }

  async function setStatus(
    id: string,
    status: SettableStatus,
    reason?: string,
  ) {
    setError("");
    setNotice("");
    try {
      await api(`/agenda/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          ...(reason?.trim() && { reason: reason.trim() }),
        }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    }
  }

  // Desde el diálogo: si falla, lanza y el diálogo muestra el error
  async function complete(b: AgendaBooking, photos: Blob[]) {
    setError("");
    setNotice("");
    const { notified } = await completeBooking(b.id, photos);
    setToComplete(null);
    setDraftsVersion((v) => v + 1);
    if (notified) {
      setNotice(
        `Le avisamos a ${b.customer.name} por correo que su servicio está listo.`,
      );
    }
    await load();
  }

  const time = (s: string) => formatTime(s, TZ);

  const dayLabel = new Date(`${date}T12:00:00`).toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const nextDay = (s: string) =>
    new Date(s).toLocaleDateString("es-CL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: TZ,
    });

  // Tarjeta de una reserva (la misma para el día y para la próxima)
  const renderBooking = (b: AgendaBooking) => (
    <li key={b.id} className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          {/* La hora primero y grande (utilidad `time`): es lo que se busca
              al mirar la agenda; el término, más suave */}
          <p className="time text-xl leading-tight">
            {time(b.startsAt)}
            <span className="text-gray-500"> – {time(b.endsAt)}</span>
          </p>
          <p className="mt-1 font-medium">
            {b.services.map((s) => s.name).join(" + ")}
          </p>
          <p className="mt-0.5 text-sm text-gray-600">
            {b.customer.name} · {b.customer.email}
            {b.customer.phone && ` · ${b.customer.phone}`}
          </p>
          {members.length > 1 && (
            <p className="mt-0.5 text-xs text-gray-500">
              Con {b.member.displayName}
            </p>
          )}
          {/* Fotos elegidas en el diálogo de Completada que aún no se envían
              (quedan en este dispositivo) */}
          {notifyCompleted && drafts[b.id] > 0 && (
            <p className="mt-1 text-xs font-medium text-amber-700">
              {drafts[b.id] === 1
                ? "1 foto guardada, sin enviar"
                : `${drafts[b.id]} fotos guardadas, sin enviar`}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE[b.status]}`}
        >
          {LABELS[b.status]}
        </span>
      </div>

      {/* En el celular, los tres en una fila y de 40 px de alto (cómodos
          para el dedo); desde `sm`, más chicos. "No se presentó" deja solo
          Completada, por si se marcó por error y el cliente sí vino */}
      {canComplete(b.status) && (
        <div className="mt-3 flex gap-1.5 sm:gap-2">
          <Button
            variant="secondary"
            className={ACTION}
            onClick={() =>
              // Con el aviso de "servicio listo" se confirma en un diálogo
              // (y se pueden sumar fotos); sin él, se marca al instante
              notifyCompleted
                ? setToComplete(b)
                : setStatus(b.id, "COMPLETED")
            }
          >
            Completada
          </Button>
          {b.status !== "NO_SHOW" && (
            <>
              <Button
                variant="secondary"
                className={ACTION}
                onClick={() => setStatus(b.id, "NO_SHOW")}
              >
                No se presentó
              </Button>
              <Button
                variant="danger"
                className={ACTION}
                onClick={() => setToCancel(b)}
              >
                Cancelar
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  );

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Agenda</h1>

      {/* En el celular: una fila con el día y otra con el filtro a todo el
          ancho */}
      <div className="my-4 flex flex-wrap items-center gap-2">
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Button
            variant="secondary"
            aria-label="Día anterior"
            className="px-3 sm:px-4"
            onClick={() => shift(-1)}
          >
            ←
          </Button>
          <Input
            type="date"
            aria-label="Día"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="min-w-0 flex-1 sm:w-auto sm:flex-none"
          />
          <Button
            variant="secondary"
            aria-label="Día siguiente"
            className="px-3 sm:px-4"
            onClick={() => shift(1)}
          >
            →
          </Button>
          <Button
            variant="secondary"
            className="px-3 sm:px-4"
            onClick={() => setDate(iso(new Date()))}
          >
            Hoy
          </Button>
        </div>
        {members.length > 1 && (
          <select
            aria-label="Profesional"
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            className="w-full rounded-control border border-gray-300 bg-white px-3 py-2 text-sm sm:w-auto"
          >
            <option value="">Todos los profesionales</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* "Actualizar" junto a la hora de la última carga, con color y texto
          también en el celular: deja claro que la agenda no está en vivo */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm capitalize text-gray-600">{dayLabel}</p>
          {updatedAt && (
            <p className="mt-0.5 text-xs text-gray-500">
              Actualizada a las {time(updatedAt)}
            </p>
          )}
        </div>
        <Button
          variant="secondary"
          className="flex h-10 shrink-0 items-center gap-1.5 border-indigo-200 bg-indigo-50 py-0 text-indigo-700 hover:bg-indigo-100 sm:h-9"
          disabled={refreshing}
          onClick={refresh}
        >
          <RefreshIcon
            className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
          />
          Actualizar
        </Button>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {notice && !error && (
        <p role="status" className="mb-3 text-sm text-green-700">
          {notice}
        </p>
      )}

      <ul className="divide-y divide-gray-200 rounded-card border border-line bg-white">
        {upcoming.map(renderBooking)}
        {upcoming.length === 0 && (
          <li className="p-6 text-center text-sm text-gray-500">
            {bookings.length === 0
              ? "Sin reservas este día."
              : "No quedan reservas por hoy."}
          </li>
        )}
      </ul>

      {showNext && next && (
        <section className="mt-8">
          <h2 className="text-base font-semibold tracking-tight">
            Próxima reserva
          </h2>
          <p className="mb-3 mt-1 text-sm capitalize text-gray-600">
            {nextDay(next.startsAt)}
          </p>
          <ul className="divide-y divide-gray-200 rounded-card border border-line bg-white">
            {renderBooking(next)}
          </ul>
        </section>
      )}

      {/* Sin atenuar y con sus botones: aquí se marcan Completada / No se presentó */}
      {past.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-base font-semibold tracking-tight">
            Ya pasaron
          </h2>
          <ul className="divide-y divide-gray-200 rounded-card border border-line bg-white">
            {past.map(renderBooking)}
          </ul>
        </section>
      )}

      <CompleteBookingDialog
        booking={toComplete}
        onClose={() => {
          setToComplete(null);
          setDraftsVersion((v) => v + 1);
        }}
        onConfirm={async (photos) => {
          if (toComplete) await complete(toComplete, photos);
        }}
      />

      <CancelBookingDialog
        booking={toCancel}
        when={
          toCancel
            ? `${nextDay(toCancel.startsAt)}, ${time(toCancel.startsAt)}`
            : ""
        }
        onClose={() => setToCancel(null)}
        onConfirm={async (reason) => {
          if (!toCancel) return;
          await setStatus(toCancel.id, "CANCELLED", reason);
          setToCancel(null);
        }}
      />
    </div>
  );
}

export default function AgendaPage() {
  return (
    <Suspense fallback={null}>
      <AgendaContent />
    </Suspense>
  );
}
