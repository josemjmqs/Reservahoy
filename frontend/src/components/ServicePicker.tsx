"use client";

import { useEffect, useRef, useState } from "react";
import { ServiceThumb } from "@/components/ServiceThumb";
import { centerInView, smoothScrollBy } from "@/lib/center-in-view";
import { publicDuration } from "@/lib/format";
import { groupByCategory } from "@/lib/services";
import type { PublicBusiness } from "@/lib/types";

type PublicService = PublicBusiness["services"][number];

// Foco del teclado dentro de la tarjeta (que recorta lo que sobresale)
const focusRing =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-ring";

// Servicios de la página pública: una tarjeta por categoría (una sola, sin
// título, si no hay categorías) con los servicios como filas. Tocar una fila
// abre su detalle (foto y descripción) y ahí se elige con "Seleccionar": la
// flecha deja claro que hay más información. El check de un servicio elegido
// lo quita
export function ServicePicker({
  services,
  selectedIds,
  onToggle,
  maxReached = false,
}: {
  services: PublicService[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  maxReached?: boolean; // ya se eligió el máximo: no se pueden sumar más
}) {
  // Por categoría: si alguno tiene foto, los que no la tienen muestran su
  // inicial en el mismo recuadro, así las filas se ven iguales y el texto queda
  // alineado. Una categoría sin fotos va sin recuadros (las iniciales solas
  // ocupan espacio y parecen avatares)
  const rows = (items: PublicService[]) => {
    const withThumbs = items.some((s) => s.imageUrl);
    return (
      <div className="divide-y divide-gray-100">
        {items.map((s) => (
          <ServiceRow
            key={s.id}
            service={s}
            withThumb={withThumbs}
            selected={selectedIds.includes(s.id)}
            disabled={maxReached && !selectedIds.includes(s.id)}
            open={openId === s.id}
            // cerrar solo cierra este: el cierre llega después de deslizar la
            // página y en ese rato pudo abrirse otro
            onOpenChange={(o) =>
              setOpenId((cur) => (o ? s.id : cur === s.id ? null : cur))
            }
            onToggle={onToggle}
          />
        ))}
      </div>
    );
  };

  // Un solo servicio abierto a la vez (en cualquier categoría): su detalle trae
  // la foto, la descripción y el botón para elegirlo
  const [openId, setOpenId] = useState<string | null>(null);

  const groups = groupByCategory(services, "Otros");
  // Con una sola categoría (o ninguna) no tiene sentido pedir un clic extra
  const collapsible = groups.length > 1;
  // La primera categoría parte abierta: se ven servicios y precios sin un clic
  const [open, setOpen] = useState<string | null>(groups[0]?.[0] ?? null);

  if (services.length === 0)
    return <p className="text-sm text-gray-600">Sin servicios disponibles.</p>;

  if (!collapsible)
    return (
      <div className="overflow-hidden rounded-card border border-gray-200 bg-white">
        {rows(services)}
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      {groups.map(([name, items]) => {
        const isOpen = open === name;
        const chosen = items.filter((s) => selectedIds.includes(s.id)).length;
        const panelId = `category-${name.replace(/\W+/g, "-")}`;
        return (
          <div
            key={name}
            className="overflow-hidden rounded-card border border-gray-200 bg-white"
          >
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setOpen(isOpen ? null : name)}
              className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-gray-50 ${focusRing}`}
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold text-gray-900">{name}</span>
                  {/* cerrada, deja ver que adentro hay algo elegido */}
                  {chosen > 0 && !isOpen && (
                    <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-medium text-brand-fg">
                      {chosen} {chosen === 1 ? "elegido" : "elegidos"}
                    </span>
                  )}
                </span>
                {/* los nombres que quepan en una línea dicen qué hay adentro
                  mejor que "4 servicios"; el resto se corta con "…" */}
                <span className="block truncate text-sm text-gray-500">
                  {items.map((s) => s.name).join(", ")}
                </span>
              </span>
              <svg
                aria-hidden
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            {isOpen && (
              <div id={panelId} className="border-t border-gray-100">
                {rows(items)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ServiceRow({
  service: s,
  withThumb,
  selected,
  disabled,
  open,
  onOpenChange,
  onToggle,
}: {
  service: PublicService;
  withThumb: boolean;
  selected: boolean;
  disabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: (id: string) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLButtonElement>(null);
  const detailId = `service-${s.id}`;

  // Dónde estaba la fila en la pantalla al tocarla (antes de centrarla), para
  // devolverla ahí al cerrar. Si no, con los últimos servicios el centrado baja
  // la página y al contraerse el detalle queda a la vista lo de abajo
  // (profesional, día y hora) en vez de la lista
  const topBeforeOpen = useRef<number | null>(null);
  // Cerrándose (deslizando de vuelta): un segundo toque en "Seleccionar" o
  // "Quitar" no deshace lo que se acaba de elegir
  const closing = useRef(false);

  // Al abrirse, el servicio (fila y detalle) queda centrado en la pantalla. Corre
  // después de que se cierra el que estaba abierto, con las posiciones ya al día
  useEffect(() => {
    if (open && rowRef.current) {
      closing.current = false;
      topBeforeOpen.current = rowRef.current.getBoundingClientRect().top;
      centerInView(rowRef.current);
    }
  }, [open]);

  // Cerrar desde esta fila (la fila, el detalle, "Seleccionar", "Quitar" o el
  // check) es abrir al revés: al abrir aparece el detalle y la página se
  // desliza; al cerrar la página se desliza de vuelta, con el detalle todavía
  // abierto, y recién ahí se cierra. Así lo de abajo no salta antes de tiempo.
  // Si la fila no quedó más arriba que donde estaba, se cierra al tiro (nunca
  // la baja). Si se cerró porque se abrió otro, manda el centrado de ese
  function closeHere() {
    if (closing.current) return;
    closing.current = true;
    const row = rowRef.current;
    const before = topBeforeOpen.current;
    const top =
      row && before !== null ? row.getBoundingClientRect().top - before : 0;
    if (top < -1) void smoothScrollBy(top).then(() => onOpenChange(false));
    else onOpenChange(false);
  }

  // El foco vuelve a la fila al cerrar, no se pierde
  function close() {
    closeHere();
    headerRef.current?.focus({ preventScroll: true });
  }

  function choose() {
    if (closing.current) return;
    onToggle(s.id);
    // elegido (o quitado) se cierra: la fila ya muestra el check y la lista
    // queda corta para seguir eligiendo
    close();
  }

  // Desde el check de la fila: si su detalle estaba abierto se cierra (como con
  // "Quitar"), pero no toca otro detalle abierto. El check desaparece, así que
  // el foco pasa a la fila
  function unselect() {
    onToggle(s.id);
    if (open) closeHere();
    headerRef.current?.focus({ preventScroll: true });
  }

  return (
    <div
      ref={rowRef}
      className={
        selected
          ? // franja a la izquierda: se ve aunque el color de marca sea claro
            // (--brand-ring directo: la variable del tema se resuelve en :root)
            "bg-brand/10 shadow-[inset_4px_0_0_var(--brand-ring,#4f39f6)]"
          : ""
      }
    >
      <div className="flex">
        {/* tocar la fila solo abre el detalle; elegir es el botón de adentro */}
        <button
          ref={headerRef}
          type="button"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={() => (open ? closeHere() : onOpenChange(true))}
          className={`flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left transition ${focusRing} ${
            selected ? "" : "pr-4 hover:bg-gray-50"
          }`}
        >
          {/* abierto, la foto se ve completa abajo: no se repite en miniatura
            (sin foto, la inicial se queda: abajo no hay nada que la reemplace) */}
          {withThumb && !(s.imageUrl && open) && (
            <ServiceThumb
              src={s.imageUrl}
              name={s.name}
              className="h-12 w-12"
            />
          )}
          {/* el precio va en la línea de la duración (alineado a la derecha, en
            columna con los demás): así el nombre tiene todo el ancho y en el
            celular no se parte en varias líneas */}
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-gray-900">{s.name}</span>
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-gray-500">
                {publicDuration(s.durationMin, s.totalMin)}
              </span>
              {s.price !== null && (
                <span className="shrink-0 font-semibold tabular-nums text-gray-900">
                  ${s.price.toLocaleString("es-CL")}
                </span>
              )}
            </span>
          </span>
          {!selected && (
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </button>
        {selected && (
          // el check es un botón aparte (no se anida en la fila): tocarlo quita
          // el servicio sin abrir el detalle. Ocupa todo el alto de la fila para
          // que sea fácil de tocar en el celular
          <button
            type="button"
            aria-label={`Desmarcar ${s.name}`}
            onClick={unselect}
            className={`flex shrink-0 items-center pl-3 pr-4 ${focusRing}`}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-brand-ring bg-brand text-brand-fg">
              <svg
                aria-hidden
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-3.5 w-3.5"
              >
                <path
                  fillRule="evenodd"
                  d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
          </button>
        )}
      </div>
      {open && (
        // tocar cualquier parte del detalle (foto, descripción, aviso) lo
        // cierra, salvo sus botones. Un botón deshabilitado ("Seleccionar" con
        // el máximo elegido) también se excluye: Chrome pasa su clic al padre
        // y cerrar escondería el aviso de por qué no se puede. Con teclado se
        // cierra desde la fila
        <div
          id={detailId}
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest("button")) close();
          }}
          className="flex cursor-pointer flex-col gap-3 px-4 pb-4"
        >
          {s.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- la foto ya viene reducida; no usamos el optimizador de Vercel
            <img
              src={s.imageUrl}
              alt={s.name}
              // hasta que carga no se sabe su alto: al cargar el detalle crece
              // y se vuelve a centrar
              onLoad={() => rowRef.current && centerInView(rowRef.current)}
              // foto completa en su proporción; el alto máximo evita que una
              // foto vertical ocupe toda la pantalla del celular
              className="mx-auto h-auto max-h-[60vh] w-auto max-w-full rounded-control"
            />
          )}
          {s.description && (
            <p className="whitespace-pre-line text-sm text-gray-700">
              {s.description}
            </p>
          )}
          {selected ? (
            <button
              type="button"
              onClick={choose}
              className="h-10 w-full rounded-control border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Quitar
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={choose}
                disabled={disabled}
                className="h-10 w-full rounded-control bg-brand text-sm font-medium text-brand-fg hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Seleccionar
              </button>
              {disabled && (
                <p className="text-center text-sm text-gray-600">
                  Ya elegiste el máximo de servicios por reserva. Quita alguno
                  para sumar este.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
