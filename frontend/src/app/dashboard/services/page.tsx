"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import { formatTotal } from "@/lib/format";
import { removeServiceImage, uploadServiceImage } from "@/lib/image";
import { PhotoPicker } from "@/components/PhotoPicker";
import { PriceInput } from "@/components/PriceInput";
import { CategoryInput } from "@/components/CategoryInput";
import { DurationInput } from "@/components/DurationInput";
import { ServiceThumb } from "@/components/ServiceThumb";
import { groupByCategory } from "@/lib/services";
import { scrollFieldUp } from "@/lib/scroll-field";
import type { Service } from "@/lib/types";

const NO_CATEGORY = "Sin categoría";
// Iguales que en el backend (create-service.dto.ts)
const DESCRIPTION_MAX = 300;
const NAME_MAX = 80;
const CATEGORY_MAX = 40;
const TOTAL_MAX = 43200; // 30 días, en minutos

const empty = {
  name: "",
  category: "",
  description: "",
  durationMin: "30", // texto, para que el campo pueda quedar vacío mientras se escribe
  totalMin: "",
  price: "",
};

type ServiceForm = typeof empty;

const fetchServices = () => api<Service[]>("/services");

// Campos de un servicio, iguales al crear y al editar
function ServiceFields({
  value,
  onChange,
  categories,
  editing = false,
}: {
  value: ServiceForm;
  onChange: (value: ServiceForm) => void;
  categories: string[];
  editing?: boolean;
}) {
  const set = (patch: Partial<ServiceForm>) => onChange({ ...value, ...patch });
  return (
    // en el celular, el campo que se toca sube para no quedar bajo el teclado
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" onFocus={scrollFieldUp}>
      <Field label="Nombre" className="sm:col-span-2">
        <Input
          value={value.name}
          onChange={(e) => {
            e.currentTarget.setCustomValidity("");
            set({ name: e.target.value });
          }}
          placeholder="Ej. Corte clásico"
          required
          maxLength={NAME_MAX}
          // al menos 2 caracteres sin contar espacios, como valida el backend
          pattern=".*\S.*\S.*"
          onInvalid={(e) =>
            e.currentTarget.setCustomValidity(
              e.currentTarget.validity.patternMismatch
                ? "El nombre debe tener al menos 2 caracteres"
                : "",
            )
          }
        />
      </Field>
      <Field
        label="Categoría"
        hint={`Utilízalo para agrupar servicios${editing ? ". Vacío = sin categoría" : ""}`}
      >
        <CategoryInput
          value={value.category}
          onChange={(category) => set({ category })}
          options={categories}
          placeholder="Ej. Cortes de pelo"
          maxLength={CATEGORY_MAX}
        />
      </Field>
      <Field label="Tiempo de atención (min)" hint="Bloquea la agenda">
        <Input
          type="number"
          min={5}
          max={480}
          value={value.durationMin}
          onChange={(e) => set({ durationMin: e.target.value })}
          required
        />
      </Field>
      <Field
        label="Duración total del servicio"
        hint="Opcional, solo necesario si el servicio tiene una duración mayor al tiempo de atención"
      >
        <DurationInput
          value={value.totalMin}
          onChange={(totalMin) => set({ totalMin })}
          // no menor que el tiempo de atención (lo revisa también el backend)
          minMinutes={Math.max(5, Number(value.durationMin) || 5)}
          maxMinutes={TOTAL_MAX}
        />
      </Field>
      <Field label="Precio (CLP)" hint="Opcional">
        <PriceInput value={value.price} onChange={(price) => set({ price })} />
      </Field>
      <Field
        label="Información adicional"
        hint={`Opcional. Indica en qué consiste el servicio · ${value.description.length}/${DESCRIPTION_MAX}`}
        className="sm:col-span-3"
      >
        <Textarea
          value={value.description}
          onChange={(e) => set({ description: e.target.value })}
          maxLength={DESCRIPTION_MAX}
          rows={2}
          // crece con el texto para que se vea completo (sin field-sizing,
          // como en Firefox, queda de 2 líneas con desplazamiento)
          className="min-h-[3.75rem] field-sizing-content"
        />
      </Field>
    </div>
  );
}

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [form, setForm] = useState(empty);
  // El formulario de servicio nuevo abre con un botón: cerrado, la lista queda
  // arriba (en el celular el formulario ocupa más de una pantalla)
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<ServiceForm>(empty);
  const [error, setError] = useState("");
  // foto elegida para el servicio nuevo; se sube después de crearlo
  const [newPhoto, setNewPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [photoBusyId, setPhotoBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setServices(await fetchServices());
  }, []);

  useEffect(() => {
    fetchServices()
      .then(setServices)
      .catch((e) => setError(e.message));
  }, []);

  const categories = useMemo(
    () => [
      ...new Set(
        services.map((s) => s.category).filter((c): c is string => !!c),
      ),
    ],
    [services],
  );

  function pickNewPhoto(file: File) {
    if (newPhoto) URL.revokeObjectURL(newPhoto.preview);
    setNewPhoto({ file, preview: URL.createObjectURL(file) });
  }

  function clearNewPhoto() {
    if (newPhoto) URL.revokeObjectURL(newPhoto.preview);
    setNewPhoto(null);
  }

  function closeNew() {
    setAdding(false);
    setForm(empty);
    clearNewPhoto();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    let created: Service;
    try {
      created = await api<Service>("/services", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          durationMin: Number(form.durationMin),
          ...(form.category.trim() !== "" && { category: form.category }),
          ...(form.description.trim() !== "" && {
            description: form.description,
          }),
          ...(form.totalMin !== "" && { totalMin: Number(form.totalMin) }),
          ...(form.price !== "" && { price: Number(form.price) }),
        }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
      return;
    }
    setForm(empty);
    setAdding(false);
    if (newPhoto) {
      try {
        await uploadServiceImage(created.id, newPhoto.file);
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Error inesperado";
        setError(`El servicio se creó, pero la foto no se pudo subir: ${reason}`);
      }
      clearNewPhoto();
    }
    await load();
  }

  async function changePhoto(id: string, file: File | null) {
    setError("");
    setPhotoBusyId(id);
    try {
      if (file) await uploadServiceImage(id, file);
      else await removeServiceImage(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setPhotoBusyId(null);
    }
  }

  function startEdit(s: Service) {
    setError("");
    setEditingId(s.id);
    setEdit({
      name: s.name,
      category: s.category ?? "",
      description: s.description ?? "",
      durationMin: String(s.durationMin),
      totalMin: s.totalMin === null ? "" : String(s.totalMin),
      price: s.price === null ? "" : String(s.price),
    });
  }

  async function saveEdit(id: string) {
    setError("");
    try {
      await api(`/services/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: edit.name,
          durationMin: Number(edit.durationMin),
          category: edit.category.trim() === "" ? null : edit.category,
          description: edit.description,
          totalMin: edit.totalMin === "" ? null : Number(edit.totalMin),
          price: edit.price === "" ? null : Number(edit.price),
        }),
      });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    }
  }

  async function toggle(s: Service) {
    setError("");
    try {
      if (s.active) {
        await api(`/services/${s.id}`, { method: "DELETE" });
      } else {
        await api(`/services/${s.id}`, {
          method: "PATCH",
          body: JSON.stringify({ active: true }),
        });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    }
  }

  const groups = groupByCategory(services, NO_CATEGORY);
  // Sin ninguna categoría se muestra una sola lista, sin encabezados
  const showGroupHeaders = groups.some(([name]) => name !== NO_CATEGORY);

  const renderRow = (s: Service) =>
    editingId === s.id ? (
      <li key={s.id} className="flex flex-col gap-3 bg-gray-50 p-4">
        <ServiceFields value={edit} onChange={setEdit} categories={categories} editing />
        <PhotoPicker
          imageUrl={s.imageUrl}
          busy={photoBusyId === s.id}
          onPick={(file) => changePhoto(s.id, file)}
          onRemove={() => changePhoto(s.id, null)}
        />
        <div className="flex gap-2">
          <Button className="px-3 py-1" onClick={() => saveEdit(s.id)}>
            Guardar
          </Button>
          <Button
            variant="secondary"
            className="px-3 py-1"
            onClick={() => setEditingId(null)}
          >
            Cancelar
          </Button>
        </div>
      </li>
    ) : (
      <li
        key={s.id}
        className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 gap-y-3 p-4 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] sm:items-center"
      >
        <div className={s.active ? "" : "opacity-50"}>
          <ServiceThumb src={s.imageUrl} />
        </div>
        <div className={s.active ? "" : "opacity-50"}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="break-words font-medium">{s.name}</p>
            {!s.active && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                Desactivado
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-gray-600">
            {s.durationMin} min de atención
            {s.totalMin && ` · total ${formatTotal(s.totalMin)}`}
            {s.price !== null && ` · $${s.price.toLocaleString("es-CL")}`}
          </p>
          {s.description && (
            <p className="mt-1 whitespace-pre-line break-words text-sm text-gray-500">
              {s.description}
            </p>
          )}
        </div>
        {/* En celular los botones bajan a su propia fila, alineados con el texto */}
        <div className="col-start-2 flex gap-2 sm:col-start-3 sm:row-start-1">
          <Button
            variant="secondary"
            className="px-3 py-1"
            onClick={() => startEdit(s)}
          >
            Editar
          </Button>
          <Button
            variant="secondary"
            className="px-3 py-1"
            onClick={() => toggle(s)}
          >
            {s.active ? "Desactivar" : "Activar"}
          </Button>
        </div>
      </li>
    );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Servicios</h1>
        {!adding && (
          <Button onClick={() => setAdding(true)}>Nuevo servicio</Button>
        )}
      </div>

      {adding && (
        <Card className="mb-4">
          <form onSubmit={create} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-gray-900">Nuevo servicio</h2>
            <ServiceFields value={form} onChange={setForm} categories={categories} />
            <PhotoPicker
              imageUrl={newPhoto?.preview ?? null}
              onPick={pickNewPhoto}
              onRemove={clearNewPhoto}
            />
            <div className="flex gap-2">
              <Button>Agregar</Button>
              <Button type="button" variant="secondary" onClick={closeNew}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {services.length === 0 ? (
        <Card className="p-6 text-center text-sm text-gray-500">
          Aún no tienes servicios.
        </Card>
      ) : (
        groups.map(([name, items]) => (
          <section key={name} className="mb-6">
            {showGroupHeaders && (
              <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-gray-900">
                {name}
                <span className="text-xs font-normal text-gray-500">
                  {items.length} {items.length === 1 ? "servicio" : "servicios"}
                </span>
              </h2>
            )}
            <ul className="divide-y divide-gray-200 rounded-card border border-line bg-white">
              {items.map(renderRow)}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
