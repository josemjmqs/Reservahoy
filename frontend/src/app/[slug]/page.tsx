"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button, Field, Input } from "@/components/ui";
import type { BookingResult, PublicBusiness } from "@/lib/types";
import { ServicePicker } from "@/components/ServicePicker";
import { ServiceThumb } from "@/components/ServiceThumb";
import { DayStrip, todayISO } from "@/components/DayStrip";
import { CheckIcon, MapPinIcon, PhoneIcon } from "@/components/icons";
import { mapsUrl } from "@/lib/maps";
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

// La franja de arriba sobre el color del negocio: es su letrero, lo que hace
// que la página se vea suya y no de Reservahoy. En el celular llega de borde a
// borde y hasta arriba (anula el relleno del <main>); desde `sm`, una tarjeta.
// El texto encima usa `--brand-fg` (blanco u oscuro según el color, brandStyle)
const headerBand =
  "-mx-6 -mt-10 px-6 pb-7 pt-[max(2.5rem,env(safe-area-inset-top))] sm:mx-0 sm:mt-0 sm:rounded-card sm:p-6";

function BusinessHeader({
  name,
  phone,
  address,
  logoUrl,
  todayHours,
}: {
  name: string;
  phone?: string | null;
  address?: string | null;
  logoUrl?: string | null;
  // Sin pasarlo no se muestra la línea del horario (negocio que no recibe reservas)
  todayHours?: PublicBusiness["todayHours"];
}) {
  // Contacto: enlaces de texto sobre la franja, no botones, para no competir
  // con los pasos de la reserva (40 px de alto igual, para tocarlos fácil)
  const contact =
    "inline-flex min-h-10 max-w-full items-center gap-2 text-sm font-medium underline decoration-current/30 underline-offset-4 transition hover:decoration-current";
  return (
    <header className={`${headerBand} bg-brand text-brand-fg`}>
      <div className="flex items-center gap-4">
        {/* Circular, como la foto de perfil de Instagram, para que el negocio
            use la misma imagen: recortada al círculo (object-cover) */}
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- el logo ya viene reducido; no usamos el optimizador de Vercel
          <img
            src={logoUrl}
            alt={`Logo de ${name}`}
            className="h-16 w-16 shrink-0 rounded-full bg-white object-cover ring-1 ring-black/10"
          />
        ) : (
          // Las iniciales en el color de marca sobre blanco (oscurecido si es
          // claro, como los bordes: --brand-ring)
          <div
            aria-hidden
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white text-2xl font-semibold text-brand-ring"
          >
            {initials(name)}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight text-balance">
            {name}
          </h1>
          {todayHours !== undefined && (
            <p className="mt-1 text-[15px] text-brand-fg/80">
              {todayHours ? (
                <>
                  Hoy atiende de{" "}
                  <span className="time text-brand-fg">{todayHours.opensAt}</span>{" "}
                  a{" "}
                  <span className="time text-brand-fg">{todayHours.closesAt}</span>
                </>
              ) : (
                "Hoy no atiende"
              )}
            </p>
          )}
        </div>
      </div>
      {(phone || address) && (
        <div className="mt-4 flex flex-wrap gap-x-5">
          {phone && (
            <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className={contact}>
              <PhoneIcon className="h-4 w-4 shrink-0 opacity-80" />
              {phone}
            </a>
          )}
          {address && (
            <a
              href={mapsUrl(address)}
              target="_blank"
              rel="noopener noreferrer"
              title="Ver en Google Maps"
              className={`${contact} min-w-0`}
            >
              <MapPinIcon className="h-4 w-4 shrink-0 opacity-80" />
              <span className="min-w-0 break-words">{address}</span>
            </a>
          )}
        </div>
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
  // Detalle de lo elegido desplegado en la barra de abajo
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Al tocar una hora, "Tus datos" aparece debajo de la grilla, a veces fuera
  // de la pantalla: se baja hasta ahí una vez que se dibuja
  const scrollToDetails = useRef(false);
  useEffect(() => {
    if (!startsAt || !scrollToDetails.current) return;
    scrollToDetails.current = false;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    document.getElementById("tus-datos")?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "start",
    });
  }, [startsAt]);

  // Escape lo cierra esté donde esté el foco (al quitar un servicio, su botón
  // desaparece y el foco queda en la página)
  useEffect(() => {
    if (!detailsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetailsOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [detailsOpen]);

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
        {/* La misma franja del encabezado, en gris mientras carga */}
        <div className={`${headerBand} animate-pulse bg-gray-200`}>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-card bg-gray-300/70" />
            <div className="flex flex-col gap-2">
              <div className="h-7 w-44 rounded bg-gray-300/70" />
              <div className="h-4 w-36 rounded bg-gray-300/70" />
            </div>
          </div>
        </div>
        <div className="mt-10 flex animate-pulse flex-col gap-2">
          <div className="h-16 rounded-card bg-gray-200/70" />
          <div className="h-16 rounded-card bg-gray-200/70" />
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
          address={business.address}
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
        className="mx-auto w-full max-w-md px-6 py-10"
      >
        {/* Un comprobante: arriba, sobre el color del negocio, el día y la
            hora en grande (lo que el cliente necesita recordar); abajo el
            detalle y, tras el corte punteado, el enlace para gestionarla */}
        <div className="overflow-hidden rounded-card border border-line bg-white">
          <div className="bg-brand px-6 pt-5 pb-6 text-brand-fg">
            <h1 className="flex items-center gap-2 font-semibold">
              <CheckIcon className="h-5 w-5 shrink-0" />
              ¡Reserva confirmada!
            </h1>
            <p className="mt-5 text-brand-fg/85">
              {capitalize(longDate(done.startsAt, tz))}
            </p>
            <p className="mt-1 time text-6xl leading-none">
              {fmt(done.startsAt)}
            </p>
            <p className="mt-3 text-brand-fg/85">En {business.name}</p>
          </div>

          <dl className="divide-y divide-line px-6 text-sm">
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-gray-600">
                {selected.length > 1 ? "Servicios" : "Servicio"}
              </dt>
              <dd className="text-right font-medium">
                {selected.map((s) => s.name).join(" + ")}
              </dd>
            </div>
            {member && (
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-gray-600">Con</dt>
                <dd className="text-right font-medium">{member.displayName}</dd>
              </div>
            )}
            {business.address && (
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-gray-600">Dónde</dt>
                <dd className="text-right">
                  <a
                    href={mapsUrl(business.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium underline decoration-gray-300 underline-offset-4 hover:decoration-current"
                  >
                    {business.address}
                  </a>
                </dd>
              </div>
            )}
          </dl>

          <div className="border-t border-dashed border-gray-300 bg-paper px-6 py-5">
            <p className="text-sm font-medium text-gray-800">
              Guarda este enlace para ver o cancelar tu reserva
            </p>
            <p className="mt-1 break-all text-xs text-gray-500">{link}</p>
            <div className="mt-3 flex gap-2">
              <Link
                href={`/reserva/${done.manageToken}`}
                className="inline-flex min-h-10 items-center rounded-control bg-brand px-3 text-sm font-medium text-brand-fg hover:bg-brand-hover"
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
                className="inline-flex min-h-10 items-center rounded-control border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {copied ? "Copiado" : "Copiar enlace"}
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // La barra de abajo acompaña mientras se elige; con la hora elegida se
  // oculta para no tapar el formulario (que ya muestra el resumen)
  const showBar = selected.length > 0 && !startsAt;
  // Si alguno tiene foto, el detalle de la barra muestra miniaturas (como la lista)
  const withThumbs = business.services.some((s) => s.imageUrl);

  return (
    <main
      // El color de marca del negocio reemplaza al índigo en lo elegido y en
      // los botones principales (clases `bg-brand`, `text-brand-fg`...)
      style={brandStyle(business.brandColor)}
      className={`mx-auto w-full max-w-md px-6 py-10 ${showBar ? "pb-[calc(8rem+var(--safe-bottom-max))]" : ""}`}
    >
      <BusinessHeader
        name={business.name}
        phone={business.phone}
        address={business.address}
        logoUrl={business.logoUrl}
        todayHours={business.todayHours}
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

      {showBar && detailsOpen && (
        // desplegado, tocar fuera del detalle lo cierra
        <div
          aria-hidden
          onClick={() => setDetailsOpen(false)}
          className="fixed inset-0 z-10 bg-black/20"
        />
      )}
      {showBar && (
        // data-fixed-bottom: centerInView descuenta lo que tapa esta barra
        <div
          data-fixed-bottom
          className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)-var(--safe-bottom-max))] z-20 border-t border-gray-200 bg-white/95 pb-[var(--safe-bottom-max)] backdrop-blur"
        >
          <div className="mx-auto w-full max-w-md px-6 py-3">
            {detailsOpen && (
              <div
                id="booking-details"
                // con muchos servicios se desplaza adentro: la barra no tapa
                // toda la pantalla
                className="mb-3 max-h-[min(55vh,26rem)] overflow-y-auto border-b border-gray-200 pb-3"
              >
                <p className="text-sm font-semibold text-gray-900">
                  Lo que estás reservando
                </p>
                <ul className="mt-2 flex flex-col gap-3">
                  {selected.map((s) => (
                    <li key={s.id} className="flex items-start gap-3">
                      {withThumbs && (
                        <ServiceThumb
                          src={s.imageUrl}
                          blank
                          className="h-10 w-10"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {s.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          {[
                            publicDuration(s.durationMin, s.totalMin),
                            s.price !== null &&
                              `$${s.price.toLocaleString("es-CL")}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {s.description && (
                          // la completa está en el detalle de la lista
                          <p className="mt-0.5 line-clamp-2 text-sm text-gray-600">
                            {s.description}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-label={`Quitar ${s.name}`}
                        onClick={() => {
                          if (selected.length === 1) setDetailsOpen(false);
                          toggleService(s.id);
                        }}
                        className="h-10 shrink-0 rounded-control border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
                {selected.length > 1 && (
                  <p className="mt-3 text-sm text-gray-600">
                    Se hacen seguidos, en este orden y con un mismo
                    profesional.
                  </p>
                )}
                {member && (
                  <p className="mt-1 text-sm text-gray-600">
                    Con {member.displayName}
                  </p>
                )}
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              {/* tocar lo elegido despliega su detalle (y lo vuelve a cerrar) */}
              <button
                type="button"
                aria-expanded={detailsOpen}
                aria-controls="booking-details"
                // nombre propio: si empezara con el del servicio se confundiría
                // con su fila de la lista
                aria-label={`Lo que estás reservando: ${selected.map((s) => s.name).join(" + ")}`}
                onClick={() => setDetailsOpen(!detailsOpen)}
                className="-m-1 flex min-w-0 flex-1 items-center gap-2 rounded-control p-1 text-left transition hover:bg-gray-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-900">
                    {selected.map((s) => s.name).join(" + ")}
                  </span>
                  {noOneDoesAll ? (
                    <span className="block text-sm text-amber-800">
                      Ningún profesional hace todos estos servicios en una
                      misma visita. Quita alguno o resérvalos por separado.
                    </span>
                  ) : (
                    <span className="block text-sm text-gray-600">
                      {summary}
                    </span>
                  )}
                </span>
                <svg
                  aria-hidden
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  // hacia arriba: el detalle se despliega sobre la barra
                  className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${detailsOpen ? "" : "rotate-180"}`}
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              {!noOneDoesAll && (
                <a
                  href="#dia-y-hora"
                  onClick={() => setDetailsOpen(false)}
                  className="inline-flex min-h-10 shrink-0 items-center rounded-control bg-brand px-3 text-sm font-medium text-brand-fg hover:bg-brand-hover"
                >
                  Ver horas
                </a>
              )}
            </div>
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
                      className={`min-h-10 rounded-control border px-3 text-sm transition ${
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
                  className="h-10 animate-pulse rounded-control bg-gray-200/70"
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
                  onClick={() => {
                    scrollToDetails.current = true;
                    setStartsAt(s);
                  }}
                  className={`h-10 rounded-control border text-[15px] time transition ${
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
              <p className="rounded-card border border-dashed border-gray-300 p-4 text-center text-sm text-gray-600">
                No hay horas disponibles ese día. Prueba con otro.
              </p>
            )
          )}
        </>
      )}

      {startsAt && (
        <form onSubmit={submit}>
          <SectionTitle id="tus-datos">Tus datos</SectionTitle>
          <div className="mb-4 rounded-card border border-brand/20 bg-brand/5 p-3 text-sm">
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
