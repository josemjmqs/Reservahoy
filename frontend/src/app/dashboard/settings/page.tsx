"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ColorPicker } from "@/components/ColorPicker";
import { LogoCropper } from "@/components/LogoCropper";
import { PhotoPicker } from "@/components/PhotoPicker";
import { Button, buttonClass, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { brandStyle, DEFAULT_BRAND } from "@/lib/brand";
import { removeBusinessLogo, uploadBusinessLogo } from "@/lib/image";
import { isOwner, useMe } from "@/lib/me";
import type {
  BusinessInfo,
  NotifyScope,
  Settings,
  TeamMember,
} from "@/lib/types";

type BusinessForm = {
  name: string;
  phone: string;
  address: string;
  brandColor: string;
};

const toForm = (b: BusinessInfo): BusinessForm => ({
  name: b.name,
  phone: b.phone ?? "",
  address: b.address ?? "",
  brandColor: b.brandColor ?? "",
});

const isHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);

// Colores sugeridos: tonos apagados (la paleta del sistema solo trae colores
// muy saturados) y todos con texto blanco legible (4,5:1 o más)
const SUGGESTED_COLORS = [
  { name: "Salvia", hex: "#5b7560" },
  { name: "Verde agua", hex: "#4e7c78" },
  { name: "Petróleo", hex: "#4f6d7a" },
  { name: "Pizarra", hex: "#5a6b8c" },
  { name: "Lavanda", hex: "#6d6593" },
  { name: "Malva", hex: "#8a5a6e" },
  { name: "Rosa viejo", hex: "#9b5f5f" },
  { name: "Terracota", hex: "#a0583f" },
  { name: "Café", hex: "#8a6a4a" },
  { name: "Grafito", hex: "#4b5563" },
];

// Arcoíris del círculo "Otro color" mientras no hay uno propio elegido
const RAINBOW =
  "conic-gradient(#e0605a, #e8a04a, #e6d35a, #6fbf73, #4fa3d9, #7d6bd1, #c45fae, #e0605a)";

// Color de los botones de la página pública: uno sugerido u "Otro color" (tono,
// saturación y brillo en `ColorPicker`), y una vista previa. El código (#RRGGBB) queda escondido
// para quien ya tiene el de su marca. Vacío = el color de Reservahoy
function BrandColorField({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const valid = isHex(value);
  const custom =
    valid && !SUGGESTED_COLORS.some((c) => c.hex === value.toLowerCase());
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-700">
        Color de tu página
      </span>
      <div
        role="group"
        aria-label="Colores sugeridos"
        className="flex flex-wrap gap-2"
      >
        {SUGGESTED_COLORS.map((c) => {
          const selected = value.toLowerCase() === c.hex;
          return (
            <button
              key={c.hex}
              type="button"
              aria-label={c.name}
              aria-pressed={selected}
              title={c.name}
              onClick={() => onChange(c.hex)}
              style={{ backgroundColor: c.hex }}
              className={`h-10 w-10 rounded-full transition ${
                selected
                  ? "ring-2 ring-gray-900 ring-offset-2"
                  : "hover:scale-110"
              }`}
            />
          );
        })}
        <ColorPicker
          label="Otro color"
          value={valid ? value.toLowerCase() : DEFAULT_BRAND}
          onChange={onChange}
          style={{ background: custom ? value : RAINBOW }}
          className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
            custom
              ? "ring-2 ring-gray-900 ring-offset-2"
              : "hover:scale-110"
          }`}
        >
          {!custom && (
            <span
              aria-hidden
              className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-sm leading-none font-semibold text-gray-700"
            >
              +
            </span>
          )}
        </ColorPicker>
      </div>
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="-ml-3 min-h-10 self-start rounded-control px-3 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
        >
          Usar el de Reservahoy
        </button>
      )}
      <span className="text-xs text-gray-500">
        Lo usan los botones de tu página de reservas. Si es un color claro, el
        texto de los botones se ve oscuro para que se lea bien.
      </span>
      <div
        aria-hidden
        style={brandStyle(valid ? value : null)}
        className="mt-1 flex flex-wrap items-center gap-2 rounded-card bg-gray-50 p-3"
      >
        <span className="text-xs text-gray-500">Vista previa</span>
        <span className="rounded-control bg-brand px-3 py-2 text-sm font-medium text-brand-fg">
          Confirmar reserva
        </span>
        <span className="rounded-control border border-brand bg-brand px-3 py-2 text-[15px] time text-brand-fg">
          10:30
        </span>
        <span className="rounded-control border border-gray-200 bg-white px-3 py-2 text-[15px] time">
          11:00
        </span>
      </div>
      <details className="group text-xs text-gray-500">
        <summary className="flex min-h-10 w-fit cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden
            className="inline-block transition group-open:rotate-90"
          >
            ›
          </span>
          Ya tengo el código de mi color
        </summary>
        <div className="flex flex-wrap items-center gap-2 pb-1">
          <Input
            aria-label="Código del color"
            value={value}
            onChange={(e) => onChange(e.target.value.trim())}
            placeholder={DEFAULT_BRAND}
            pattern="#[0-9a-fA-F]{6}"
            title="Seis cifras o letras después del #, por ejemplo #0f766e"
            maxLength={7}
            className="w-28 font-mono"
          />
          <span>
            Por ejemplo #0f766e. Te lo puede dar quien diseñó tu logo.
          </span>
        </div>
      </details>
    </div>
  );
}

// Nombre, teléfono, dirección, logo y color del negocio: los ven los clientes
// en la página pública (nombre, teléfono y dirección también en su reserva y
// en los correos)
function BusinessSection() {
  const [form, setForm] = useState<BusinessForm | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState("");
  // Imagen recién elegida, mientras se encuadra antes de subirla
  const [logoFile, setLogoFile] = useState<File | null>(null);
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

  const logoUnreadable = useCallback((message: string) => {
    setLogoFile(null);
    setLogoError(message);
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
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          address: form.address,
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
        className="space-y-3 rounded-card border border-line bg-white p-4"
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
            <Field
              label="Dirección"
              hint="Tus clientes la ven con un enlace a Google Maps en tu página y en el correo de su reserva. Incluye la comuna; déjala vacía para no mostrarla."
            >
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Av. Providencia 1234, local 5, Providencia"
                minLength={5}
                maxLength={150}
                autoComplete="street-address"
              />
            </Field>
            <div>
              <PhotoPicker
                noun="logo"
                round
                alt="Logo del negocio"
                hint="Opcional. Aparece en tu página en un círculo, junto al nombre: puedes usar tu foto de perfil de Instagram. JPG, PNG o WebP."
                imageUrl={logoUrl}
                busy={logoBusy}
                onPick={(file) => {
                  setLogoError("");
                  setLogoFile(file);
                }}
                onRemove={() => changeLogo(removeBusinessLogo)}
              />
              {logoFile && (
                <LogoCropper
                  file={logoFile}
                  businessName={form.name}
                  // El color del formulario, aunque no esté guardado todavía
                  brandColor={
                    /^#[0-9a-f]{6}$/i.test(form.brandColor)
                      ? form.brandColor
                      : null
                  }
                  onCancel={() => setLogoFile(null)}
                  onError={logoUnreadable}
                  onSave={(logo) => {
                    setLogoFile(null);
                    changeLogo(() => uploadBusinessLogo(logo));
                  }}
                />
              )}
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
  const me = useMe();
  const owner = isOwner(me);
  const myMemberId = me.membership.memberId;
  const [settings, setSettings] = useState<Settings | null>(null);
  // Cuántos miembros activos hay además de uno (solo se pide para un dueño)
  const [others, setOthers] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Settings>("/settings")
      .then(setSettings)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Error inesperado"),
      );
  }, []);

  useEffect(() => {
    if (!owner) return;
    api<TeamMember[]>("/members")
      .then((list) =>
        setOthers(list.filter((m) => m.active && m.id !== myMemberId).length),
      )
      // Sin saber del equipo, se muestran todas las opciones
      .catch(() => setOthers(1));
  }, [owner, myMemberId]);

  // Un dueño sin equipo atiende todas las reservas: "todas" y "las que atiendo
  // yo" son lo mismo, así que solo elige recibirlas o no. "Recibir" guarda ALL
  // para que, al sumar a alguien, siga recibiendo las de todo el negocio
  const alone = owner && others === 0;
  const ready = settings !== null && (!owner || others !== null);
  const isChecked = (value: NotifyScope) =>
    alone
      ? (value === "NONE") === (settings?.newBookings === "NONE")
      : settings?.newBookings === value;

  // Todas las del negocio es solo para un dueño (el backend también lo niega):
  // un profesional no recibe datos de clientes de otros
  const options: { value: NotifyScope; label: string; hint: string }[] = alone
    ? [
        { value: "ALL", label: "Recibir", hint: "Por cada reserva nueva." },
        { value: "NONE", label: "No recibir", hint: "No te escribimos." },
      ]
    : [
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
    if (!settings || isChecked(newBookings)) return;
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
      <div className="rounded-card border border-line bg-white p-4">
        {settings && ready ? (
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
                  className={`flex min-h-10 cursor-pointer items-start gap-3 rounded-control border px-3 py-2 transition has-[:disabled]:cursor-default has-[:disabled]:opacity-60 ${
                    isChecked(o.value)
                      ? "border-indigo-600 bg-indigo-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="new-bookings"
                    value={o.value}
                    checked={isChecked(o.value)}
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

      <h2 className="mb-2 mt-6 text-sm font-medium text-gray-900">
        Ayuda y sugerencias
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-white p-4">
        <p className="text-sm text-gray-600">
          ¿Algo no funciona, se te ocurre una mejora o tienes una duda?
          Escríbenos.
        </p>
        <Link
          href="/dashboard/support?from=/dashboard/settings"
          className={buttonClass(
            "secondary",
            "inline-flex h-10 items-center sm:h-auto",
          )}
        >
          Escribirnos
        </Link>
      </div>
    </div>
  );
}
