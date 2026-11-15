"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button, Card, Field, Input } from "@/components/ui";
import type { BookingResult, PublicBusiness } from "@/lib/types";
import { ServicePicker } from "@/components/ServicePicker";
import { DayStrip, todayISO } from "@/components/DayStrip";
import { CheckIcon, PhoneIcon } from "@/components/icons";
import { formatTime, formatTotal, publicDuration } from "@/lib/format";
import { brandStyle } from "@/lib/brand";

const MAX_SERVICES = 5; // igual que MAX_SERVICES_PER_BOOKING en el backend

const longDate = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  });

// Mayúscula solo al inicio ("Lunes, 16 de noviembre"); la clase `capitalize`
// la pondría en cada palabra
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// "Peluquería Demo" -> "PD": la marca del negocio mientras no suba un logo
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

function BusinessHeader({
  name,
  phone,
  logoUrl,
}: {
  name: string;
  phone?: string | null;
  logoUrl?: string | null;
}) {
  return (
    <header>
      <div className="flex items-center gap-4">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- el logo ya viene reducido; no usamos el optimizador de Vercel
          <img
            src={logoUrl}
            alt={`Logo de ${name}`}
            className="h-14 w-14 shrink-0 rounded-2xl border border-gray-200 bg-white object-contain"
          />
        ) : (
          <div
            aria-hidden
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand text-xl font-semibold text-brand-fg"
          >
            {initials(name)}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
          <p className="text-gray-600">Reserva tu hora online</p>
        </div>
      </div>
      {phone && (
        <a
          href={`tel:${phone.replace(/[^\d+]/g, "")}`}
          className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          <PhoneIcon className="h-4 w-4 text-gray-500" />
          {phone}
        </a>
      )}
    </header>
  );
}

function SectionTitle({
  id,
  children,
  aside,
}: {
  id?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-3 mt-8 flex items-baseline justify-between gap-3">
      <h2
        id={id}
        className="scroll-mt-6 text-base font-semibold text-gray-900"
      >
        {children}
      </h2>
      {aside && <p className="text-right text-xs text-gray-500">{aside}</p>}
    </div>
  );
}

export default function PublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [business, setBusiness] = useState<PublicBusiness | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [memberId, setMemberId] = useState("");
  // servicios elegidos, en el orden en que se marcaron (es el orden en que se hacen)
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [date, setDate] = useState(todayISO());
  const [slots, setSlots] = useState<string[]>([]);
  // Para qué búsqueda son las horas de `slots`: si no es la actual, se están
  // cargando (así no se muestra "No hay horas" mientras llega la respuesta)
  const [slotsFor, setSlotsFor] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<BookingResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api<PublicBusiness>(`/public/${slug}`)
      .then(setBusiness)
      .catch(() => setNotFound(true));
  }, [slug]);

  const serviceKey = serviceIds.join(",");
  const slotsKey = `${serviceKey}|${date}|${memberId}`;

  const fetchSlots = useCallback(
    (signal?: AbortSignal) =>
      api<{ slots: string[] }>(
        `/public/${slug}/availability?serviceIds=${serviceKey}&date=${date}${
          memberId ? `&memberId=${memberId}` : ""
        }`,
        { signal },
      ),
    [slug, serviceKey, date, memberId],
  );

  // Recarga las horas tras un error al reservar (ej. alguien tomó la hora)
  async function reloadSlots() {
    try {
      setSlots((await fetchSlots()).slots);
      setStartsAt("");
    } catch {
      // el error de la reserva es el que importa mostrar
    }
  }

  useEffect(() => {
    if (!serviceKey || !date) return;
    const controller = new AbortController();
    fetchSlots(controller.signal)
      .then((r) => {
        setSlots(r.slots);
        setSlotsFor(slotsKey);
        setStartsAt("");
        setError("");
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setSlots([]);
        setSlotsFor(slotsKey);
        setError(err instanceof Error ? err.message : "Error inesperado");
      });
    return () => controller.abort();
  }, [fetchSlots, serviceKey, date, slotsKey]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await api<BookingResult>(`/public/${slug}/bookings`, {
        method: "POST",
        body: JSON.stringify({
          serviceIds,
          startsAt,
          ...(memberId && { memberId }),
          name: form.name,
          email: form.email,
          ...(form.phone && { phone: form.phone }),
        }),
      });
      setDone(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error inesperado";
      await reloadSlots();
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (notFound)
    return (
      <main className="mx-auto w-full max-w-md px-6 py-16 text-center">
        <h1 className="text-xl font-semibold tracking-tight">
          No encontramos este negocio
        </h1>
        <p className="mt-2 text-gray-600">
          Revisa que el enlace esté bien escrito o pídeselo de nuevo al negocio.
        </p>
      </main>
    );

  if (!business)
    return (
      <main
        className="mx-auto w-full max-w-md px-6 py-10"
        aria-busy="true"
        aria-label="Cargando"
      >
        <div className="flex animate-pulse items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-gray-200" />
          <div className="flex flex-col gap-2">
            <div className="h-6 w-44 rounded bg-gray-200" />
            <div className="h-4 w-32 rounded bg-gray-200" />
          </div>
        </div>
        <div className="mt-10 flex animate-pulse flex-col gap-2">
          <div className="h-16 rounded-lg bg-gray-200/70" />
          <div className="h-16 rounded-lg bg-gray-200/70" />
        </div>
      </main>
    );

  if (!business.acceptsBookings)
    return (
      <main
        style={brandStyle(business.brandColor)}
        className="mx-auto w-full max-w-md px-6 py-10"
      >
        <BusinessHeader
          name={business.name}
          phone={business.phone}
          logoUrl={business.logoUrl}
        />
        <p className="mt-6 text-gray-600">
          Este negocio todavía no recibe reservas online. Vuelve a intentarlo
          pronto.
        </p>
      </main>
    );

  const tz = business.timezone;
  const fmt = (iso: string) => formatTime(iso, tz);
  const slotsLoading = slotsFor !== slotsKey;

  const selected = serviceIds
    .map((id) => business.services.find((s) => s.id === id))
    .filter((s) => s !== undefined);
  // Un mismo profesional hace todos los servicios elegidos
  const eligible = business.members.filter((m) =>
    serviceIds.every((id) => m.services.some((s) => s.serviceId === id)),
  );
  const noOneDoesAll = selected.length > 1 && eligible.length === 0;
  const totalMin = selected.reduce((sum, s) => sum + s.durationMin, 0);
  const totalPrice = selected.every((s) => s.price !== null)
    ? selected.reduce((sum, s) => sum + (s.price ?? 0), 0)
    : null;
  const summary = [
    selected.length === 1
      ? publicDuration(selected[0].durationMin, selected[0].totalMin)
      : `${selected.length} servicios seguidos · ${formatTotal(totalMin)}`,
    totalPrice !== null && `$${totalPrice.toLocaleString("es-CL")}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const member = eligible.find((m) => m.id === memberId);

  function toggleService(id: string) {
    setServiceIds((ids) =>
      ids.includes(id)
        ? ids.filter((x) => x !== id)
        : ids.length < MAX_SERVICES
          ? [...ids, id]
          : ids,
    );
    setMemberId("");
    setStartsAt("");
  }

  if (done) {
    const link = `${window.location.origin}/reserva/${done.manageToken}`;

    return (
      <main
        style={brandStyle(business.brandColor)}
        className="mx-auto w-full max-w-md px-6 py-12"
      >
        <Card className="p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700">
            <CheckIcon className="h-6 w-6" />
          </div>
          <h1 className="mt-3 text-xl font-semibold tracking-tight">
            ¡Reserva confirmada!
          </h1>
          <p className="mt-2 text-gray-600">
            {capitalize(longDate(done.startsAt, tz))}, a las{" "}
            {fmt(done.startsAt)}, en {business.name}.
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {selected.map((s) => s.name).join(" + ")}
            {member && ` · con ${member.displayName}`}
          </p>

          <div className="mt-5 rounded-lg bg-gray-50 p-3 text-left">
            <p className="text-sm font-medium text-gray-700">
              Guarda este enlace para ver o cancelar tu reserva
            </p>
            <p className="mt-1 break-all text-xs text-gray-500">{link}</p>
            <div className="mt-3 flex gap-2">
              <Link
                href={`/reserva/${done.manageToken}`}
                className="inline-flex min-h-10 items-center rounded-lg bg-brand px-3 text-sm font-medium text-brand-fg hover:bg-brand-hover"
              >
                Abrir mi reserva
              </Link>
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard
                    .writeText(link)
                    .then(() => setCopied(true))
                    .catch(() => {})
                }
                className="inline-flex min-h-10 items-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {copied ? "Copiado" : "Copiar enlace"}
              </button>
            </div>
          </div>
        </Card>
      </main>
    );
  }

  // La barra de abajo acompaña mientras se elige; con la hora elegida se
  // oculta para no tapar el formulario (que ya muestra el resumen)
  const showBar = selected.length > 0 && !startsAt;

  return (
    <main
      // El color de marca del negocio reemplaza al índigo en lo elegido y en
      // los botones principales (clases `bg-brand`, `text-brand-fg`...)
      style={brandStyle(business.brandColor)}
      className={`mx-auto w-full max-w-md px-6 py-10 ${showBar ? "pb-32" : ""}`}
    >
      <BusinessHeader
        name={business.name}
        phone={business.phone}
        logoUrl={business.logoUrl}
      />

      <SectionTitle
        aside={
          serviceIds.length >= MAX_SERVICES
            ? `Máximo ${MAX_SERVICES} por reserva`
            : "Puedes elegir más de uno"
        }
      >
        Servicios
      </SectionTitle>
      <ServicePicker
        services={business.services}
        selectedIds={serviceIds}
        onToggle={toggleService}
        maxReached={serviceIds.length >= MAX_SERVICES}
      />

      {showBar && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto w-full max-w-md px-6 py-3">
            {noOneDoesAll ? (
              <p className="text-sm text-amber-800">
                Ningún profesional hace todos estos servicios en una misma
                visita. Quita alguno o resérvalos por separado.
              </p>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {selected.map((s) => s.name).join(" + ")}
                  </p>
                  <p className="text-sm text-gray-600">{summary}</p>
                </div>
                <a
                  href="#dia-y-hora"
                  className="inline-flex min-h-10 shrink-0 items-center rounded-lg bg-brand px-3 text-sm font-medium text-brand-fg hover:bg-brand-hover"
                >
                  Ver horas
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {selected.length > 0 && !noOneDoesAll && (
        <>
          {eligible.length > 1 && (
            <>
              <SectionTitle>Profesional</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {[{ id: "", displayName: "Sin preferencia" }, ...eligible].map(
                  (m) => (
                    <button
                      key={m.id || "any"}
                      type="button"
                      aria-pressed={memberId === m.id}
                      onClick={() => {
                        setMemberId(m.id);
                        setStartsAt("");
                      }}
                      className={`min-h-10 rounded-lg border px-3 text-sm transition ${
                        memberId === m.id
                          ? "border-brand bg-brand text-brand-fg"
                          : "border-gray-200 bg-white hover:border-brand/40"
                      }`}
                    >
                      {m.displayName}
                    </button>
                  ),
                )}
              </div>
            </>
          )}

          <SectionTitle id="dia-y-hora">Día y hora</SectionTitle>
          {selected.some((s) => s.totalMin && s.totalMin !== s.durationMin) && (
            <p className="mb-3 text-sm text-gray-600">
              Elige la hora en que llegarás al local.
            </p>
          )}
          <DayStrip value={date} onChange={setDate} />
          <p className="mb-3 mt-4 text-sm font-medium text-gray-700">
            {capitalize(longDate(`${date}T12:00:00`, tz))}
          </p>

          {slotsLoading ? (
            // mismo tamaño que los botones: la página no salta al llegar las horas
            <div
              className="grid grid-cols-4 gap-2 sm:grid-cols-5"
              aria-busy="true"
              aria-label="Buscando horas"
            >
              {Array.from({ length: 8 }, (_, i) => (
                <div
                  key={i}
                  className="h-10 animate-pulse rounded-lg bg-gray-200/70"
                />
              ))}
            </div>
          ) : slots.length > 0 ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {slots.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={startsAt === s}
                  onClick={() => setStartsAt(s)}
                  className={`h-10 rounded-lg border text-sm tabular-nums transition ${
                    startsAt === s
                      ? "border-brand bg-brand text-brand-fg"
                      : "border-gray-200 bg-white hover:border-brand/40"
                  }`}
                >
                  {fmt(s)}
                </button>
              ))}
            </div>
          ) : (
            !error && (
              <p className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-600">
                No hay horas disponibles ese día. Prueba con otro.
              </p>
            )
          )}
        </>
      )}

      {startsAt && (
        <form onSubmit={submit}>
          <SectionTitle>Tus datos</SectionTitle>
          <div className="mb-4 rounded-lg border border-brand/20 bg-brand/5 p-3 text-sm">
            <p className="font-medium text-gray-900">
              {selected.map((s) => s.name).join(" + ")}
            </p>
            <p className="mt-0.5 text-gray-700">
              {capitalize(longDate(startsAt, tz))}, a las {fmt(startsAt)}
              {member && ` · con ${member.displayName}`}
            </p>
            <p className="mt-0.5 text-gray-600">{summary}</p>
          </div>
          <div className="flex flex-col gap-3">
            <Field label="Nombre">
              <Input
                autoComplete="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Correo" hint="Te enviaremos la confirmación">
              <Input
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </Field>
            <Field label="Teléfono (opcional)">
              <Input
                type="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button
              disabled={loading}
              className="mt-1 h-11 w-full bg-brand text-brand-fg hover:bg-brand-hover"
            >
              {loading ? "Reservando..." : "Confirmar reserva"}
            </Button>
            <p className="text-xs text-gray-500">
              Al reservar aceptas que {business.name} use tus datos para
              gestionar tu reserva. Más información en la{" "}
              <Link href="/privacidad" className="underline">
                política de privacidad
              </Link>
              .
            </p>
          </div>
        </form>
      )}
      {!startsAt && error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}
    </main>
  );
}
