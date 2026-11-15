"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PhotoPicker } from "@/components/PhotoPicker";
import { Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { brandStyle, DEFAULT_BRAND } from "@/lib/brand";
import { removeBusinessLogo, uploadBusinessLogo } from "@/lib/image";
import { isOwner, useMe } from "@/lib/me";
import type { BusinessInfo, NotifyScope, Settings } from "@/lib/types";

type BusinessForm = { name: string; phone: string; brandColor: string };

const toForm = (b: BusinessInfo): BusinessForm => ({
  name: b.name,
  phone: b.phone ?? "",
  brandColor: b.brandColor ?? "",
});

const isHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);

// Color de los botones de la página pública, con paleta o escrito (#RRGGBB) y
// una vista previa. Vacío = el color de Reservahoy
function BrandColorField({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const valid = isHex(value);
  return (
    <div className="flex flex-col gap-1">
      <span
        id="brand-color-label"
        className="text-xs font-medium text-gray-700"
      >
        Color de tu página
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          aria-label="Elegir el color en la paleta"
          value={valid ? value.toLowerCase() : DEFAULT_BRAND}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-gray-300 bg-white p-1"
        />
        <Input
          aria-labelledby="brand-color-label"
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder={DEFAULT_BRAND}
          pattern="#[0-9a-fA-F]{6}"
          title="Formato #RRGGBB, por ejemplo #0f766e"
          maxLength={7}
          className="w-28 font-mono"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="min-h-10 rounded-lg px-3 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
          >
            Usar el de Reservahoy
          </button>
        )}
      </div>
      <span className="text-xs text-gray-500">
        Lo usan los botones de tu página de reservas. Si es un color claro, el
        texto de los botones se ve oscuro para que se lea bien.
      </span>
      <div
        aria-hidden
        style={brandStyle(valid ? value : null)}
        className="mt-1 flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 p-3"
      >
        <span className="text-xs text-gray-500">Vista previa</span>
        <span className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-fg">
          Confirmar reserva
        </span>
        <span className="rounded-lg border border-brand bg-brand px-3 py-2 text-sm tabular-nums text-brand-fg">
          10:30
        </span>
        <span className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm tabular-nums">
          11:00
        </span>
      </div>
    </div>
  );
}

// Nombre, teléfono, logo y color del negocio: los ven los clientes en la
// página pública (el nombre y el teléfono también en su reserva y en los correos)
function BusinessSection() {
  const [form, setForm] = useState<BusinessForm | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<BusinessInfo>("/business")
      .then((b) => {
        setForm(toForm(b));
        setLogoUrl(b.logoUrl);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Error inesperado"),
      );
  }, []);

  // El logo se sube (o se quita) al instante, como las fotos de los servicios
  async function changeLogo(action: () => Promise<BusinessInfo>) {
    setLogoBusy(true);
    setLogoError("");
    try {
      setLogoUrl((await action()).logoUrl);
    } catch (e) {
      setLogoError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLogoBusy(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const b = await api<BusinessInfo>("/business", {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          brandColor: form.brandColor,
        }),
      });
      setForm(toForm(b));
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
            <div>
              <PhotoPicker
                noun="logo"
                square
                alt="Logo del negocio"
                hint="Opcional. Aparece en tu página en vez de las iniciales. JPG, PNG o WebP; mejor cuadrado."
                imageUrl={logoUrl}
                busy={logoBusy}
                onPick={(file) => changeLogo(() => uploadBusinessLogo(file))}
                onRemove={() => changeLogo(removeBusinessLogo)}
              />
              {logoError && (
                <p className="mt-1 text-sm text-red-600">{logoError}</p>
              )}
            </div>
            <BrandColorField
              value={form.brandColor}
              onChange={(brandColor) => setForm({ ...form, brandColor })}
            />
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
