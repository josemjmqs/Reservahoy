"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { isOwner, useMe } from "@/lib/me";
import type { BusinessInfo, NotifyScope, Settings } from "@/lib/types";

// Nombre y teléfono del negocio: los ven los clientes en la página pública,
// en su reserva y en los correos
function BusinessSection() {
  const [form, setForm] = useState<{ name: string; phone: string } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<BusinessInfo>("/business")
      .then((b) => setForm({ name: b.name, phone: b.phone ?? "" }))
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Error inesperado"),
      );
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const b = await api<BusinessInfo>("/business", {
        method: "PATCH",
        body: JSON.stringify({ name: form.name, phone: form.phone }),
      });
      setForm({ name: b.name, phone: b.phone ?? "" });
      setSaved(true);
      window.dispatchEvent(new Event("business-updated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <h2 className="mb-2 mt-6 text-sm font-medium text-gray-900">
        Datos del negocio
      </h2>
      <form
        onSubmit={save}
        className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
      >
        {form ? (
          <>
            <Field label="Nombre del negocio">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                minLength={2}
                maxLength={80}
              />
            </Field>
            <Field
              label="Teléfono"
              hint="Lo ven tus clientes en tu página, en su reserva y en los correos. Déjalo vacío para no mostrarlo."
            >
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+56 9 1234 5678"
                maxLength={20}
              />
            </Field>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando..." : "Guardar"}
              </Button>
              {saved && (
                <span role="status" className="text-sm text-green-700">
                  Guardado.
                </span>
              )}
            </div>
          </>
        ) : (
          !error && <p className="text-sm text-gray-500">Cargando...</p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </>
  );
}

export default function SettingsPage() {
  const owner = isOwner(useMe());
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Settings>("/settings")
      .then(setSettings)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Error inesperado"),
      );
  }, []);

  // Todas las del negocio es solo para un dueño (el backend también lo niega):
  // un profesional no recibe datos de clientes de otros
  const options: { value: NotifyScope; label: string; hint: string }[] = [
    ...(owner
      ? [
          {
            value: "ALL" as const,
            label: "Todas las reservas del negocio",
            hint: "Las de cualquier profesional.",
          },
        ]
      : []),
    {
      value: "OWN",
      label: "Solo las que atiendo yo",
      hint: "Cuando un cliente reserva contigo.",
    },
    { value: "NONE", label: "Ninguna", hint: "No te escribimos." },
  ];

  async function changeNewBookings(newBookings: NotifyScope) {
    if (!settings || newBookings === settings.newBookings) return;
    // Se marca al instante; si no se guarda, vuelve a la opción anterior
    const previous = settings;
    setSettings({ ...settings, newBookings });
    setSaving(true);
    setError("");
    try {
      setSettings(
        await api<Settings>("/settings", {
          method: "PATCH",
          body: JSON.stringify({ newBookings }),
        }),
      );
    } catch (e) {
      setSettings(previous);
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Ajustes</h1>

      {/* Los datos del negocio son del dueño */}
      {owner && <BusinessSection />}

      <h2 className="mb-2 mt-6 text-sm font-medium text-gray-900">
        Notificaciones
      </h2>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        {settings ? (
          <fieldset disabled={saving}>
            <legend className="font-medium">
              Correo cuando entra una reserva
            </legend>
            <p className="mt-0.5 text-sm text-gray-600">
              Te escribimos a <strong>{settings.email}</strong> con el servicio,
              la hora y los datos de contacto del cliente.
            </p>
            <div className="mt-3 space-y-2">
              {options.map((o) => (
                <label
                  key={o.value}
                  className={`flex min-h-10 cursor-pointer items-start gap-3 rounded-md border px-3 py-2 transition has-[:disabled]:cursor-default has-[:disabled]:opacity-60 ${
                    settings.newBookings === o.value
                      ? "border-indigo-600 bg-indigo-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="new-bookings"
                    value={o.value}
                    checked={settings.newBookings === o.value}
                    onChange={() => changeNewBookings(o.value)}
                    className="mt-1 h-4 w-4 accent-indigo-600"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">
                      {o.label}
                    </span>
                    <span className="block text-sm text-gray-600">
                      {o.hint}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {saving && (
              <p role="status" className="mt-2 text-sm text-gray-500">
                Guardando...
              </p>
            )}
          </fieldset>
        ) : (
          !error && <p className="text-sm text-gray-500">Cargando...</p>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
