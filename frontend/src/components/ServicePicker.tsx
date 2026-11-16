"use client";

import { useRef, useState } from "react";
import { ServiceThumb } from "@/components/ServiceThumb";
import { publicDuration } from "@/lib/format";
import { groupByCategory } from "@/lib/services";
import type { PublicBusiness } from "@/lib/types";

type PublicService = PublicBusiness["services"][number];

// Foco del teclado dentro de la tarjeta (que recorta lo que sobresale)
const focusRing =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-ring";

// Servicios de la página pública: una tarjeta por categoría (una sola, sin
// título, si no hay categorías) con los servicios como filas. Tocar una fila
// abre su detalle (foto y descripción) y ahí se elige con "Seleccionar"
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
  const rows = (items: PublicService[]) => (
    <div className="divide-y divide-gray-100">
      {items.map((s) => (
        <ServiceRow
          key={s.id}
          service={s}
          selected={selectedIds.includes(s.id)}
          disabled={maxReached && !selectedIds.includes(s.id)}
          open={openId === s.id}
          onOpenChange={(o) => setOpenId(o ? s.id : null)}
          onToggle={onToggle}
        />
      ))}
    </div>
  );

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
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
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
            className="overflow-hidden rounded-xl border border-gray-200 bg-white"
          >
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setOpen(isOpen ? null : name)}
              className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-gray-50 ${focusRing}`}
            >
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold text-gray-900">{name}</span>
                  {/* cerrada, deja ver que adentro hay algo elegido */}
                  {chosen > 0 && !isOpen && (
                    <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-medium text-brand-fg">
                      {chosen} {chosen === 1 ? "elegido" : "elegidos"}
                    </span>
                  )}
                </span>
                <span className="block text-sm text-gray-500">
                  {items.length} {items.length === 1 ? "servicio" : "servicios"}
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
  selected,
  disabled,
  open,
  onOpenChange,
  onToggle,
}: {
  service: PublicService;
  selected: boolean;
  disabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: (id: string) => void;
}) {
  const headerRef = useRef<HTMLButtonElement>(null);
  const detailId = `service-${s.id}`;

  function choose() {
    onToggle(s.id);
    // elegido (o quitado) se cierra: la fila ya muestra el check y la lista
    // queda corta para seguir eligiendo. El foco vuelve a la fila, no se pierde
    onOpenChange(false);
    headerRef.current?.focus();
  }

  return (
    <div
      className={
        selected
          ? // franja a la izquierda: se ve aunque el color de marca sea claro
            // (--brand-ring directo: la variable del tema se resuelve en :root)
            "bg-brand/10 shadow-[inset_4px_0_0_var(--brand-ring,#4f46e5)]"
          : ""
      }
    >
      {/* tocar la fila solo abre el detalle; elegir es el botón de adentro */}
      <button
        ref={headerRef}
        type="button"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => onOpenChange(!open)}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${focusRing} ${
          selected ? "" : "hover:bg-gray-50"
        }`}
      >
        {/* abierto, la foto se ve completa abajo: no se repite en miniatura */}
        {s.imageUrl && !open && (
          <ServiceThumb src={s.imageUrl} className="h-12 w-12" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-gray-900">{s.name}</span>
          <span className="block text-sm text-gray-500">
            {publicDuration(s.durationMin, s.totalMin)}
          </span>
        </span>
        {s.price !== null && (
          <span className="shrink-0 font-semibold tabular-nums text-gray-900">
            ${s.price.toLocaleString("es-CL")}
          </span>
        )}
        {selected ? (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-brand-ring bg-brand text-brand-fg">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <title>Elegido</title>
              <path
                fillRule="evenodd"
                d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        ) : (
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
      {open && (
        <div id={detailId} className="flex flex-col gap-3 px-4 pb-4">
          {s.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- la foto ya viene reducida; no usamos el optimizador de Vercel
            <img
              src={s.imageUrl}
              alt={s.name}
              // foto completa en su proporción; el alto máximo evita que una
              // foto vertical ocupe toda la pantalla del celular
              className="mx-auto h-auto max-h-[60vh] w-auto max-w-full rounded-lg"
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
              className="h-10 w-full rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Quitar
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={choose}
                disabled={disabled}
                className="h-10 w-full rounded-lg bg-brand text-sm font-medium text-brand-fg hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
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
