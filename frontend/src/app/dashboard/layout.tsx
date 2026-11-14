"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui";
import {
  BanIcon,
  CalendarIcon,
  ClockIcon,
  SlidersIcon,
  TagIcon,
  UsersIcon,
} from "@/components/icons";
import { isOwner, MeProvider } from "@/lib/me";
import type { Me } from "@/lib/types";

// ownerOnly: pestañas que un profesional no ve (Servicios y Equipo son del
// dueño; el backend igual responde 403 a sus cambios). Icon: solo en la barra
// de abajo del celular
const TABS = [
  { href: "/dashboard/agenda", label: "Agenda", Icon: CalendarIcon },
  {
    href: "/dashboard/services",
    label: "Servicios",
    Icon: TagIcon,
    ownerOnly: true,
  },
  { href: "/dashboard/team", label: "Equipo", Icon: UsersIcon, ownerOnly: true },
  { href: "/dashboard/hours", label: "Horario", Icon: ClockIcon },
  { href: "/dashboard/blocks", label: "Bloqueos", Icon: BanIcon },
  { href: "/dashboard/settings", label: "Ajustes", Icon: SlidersIcon },
];

const ownerOnly = (pathname: string) =>
  TABS.some((t) => t.ownerOnly && pathname.startsWith(t.href));

function VerifyEmailBanner({ email }: { email: string }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  async function resend() {
    setStatus("sending");
    setError("");
    try {
      const r = await api<{ alreadyVerified: boolean }>(
        "/auth/resend-verification",
        { method: "POST" },
      );
      if (r.alreadyVerified) window.location.reload();
      else setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
      setStatus("idle");
    }
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-amber-900 sm:px-6">
        <p>
          Confirma tu correo (<strong>{email}</strong>) para que tu página
          pública empiece a recibir reservas.
        </p>
        {status === "sent" ? (
          <span className="font-medium">Te enviamos un correo nuevo</span>
        ) : (
          <button
            type="button"
            onClick={resend}
            disabled={status === "sending"}
            className="font-medium underline hover:no-underline disabled:opacity-50"
          >
            {status === "sending" ? "Enviando..." : "Reenviar correo"}
          </button>
        )}
        {error && <p className="w-full text-red-700">{error}</p>}
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    // Sin sesión, al login. Con sesión pero sin membresía activa (403: lo
    // desactivaron), se cierra la sesión y el login lo explica, en vez de
    // mostrar un panel donde todo responde 403
    const loadMe = () =>
      api<Me>("/auth/me")
        .then(setMe)
        .catch(async (err) => {
          if (err instanceof ApiError && err.status === 403) {
            await api("/auth/logout", { method: "POST" }).catch(() => {});
            router.replace("/login?revoked=1");
          } else {
            router.replace("/login");
          }
        });
    loadMe();
    // Ajustes avisa cuando cambia el nombre del negocio, para el encabezado
    window.addEventListener("business-updated", loadMe);
    return () => window.removeEventListener("business-updated", loadMe);
  }, [router]);

  // Servicios y Equipo son del dueño: un profesional que abre esas direcciones
  // a mano va a su Agenda
  useEffect(() => {
    if (me && !isOwner(me) && ownerOnly(pathname)) {
      router.replace("/dashboard/agenda");
    }
  }, [me, pathname, router]);

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
  }

  if (!me) return <p className="p-6 text-gray-600">Cargando...</p>;

  const owner = isOwner(me);
  const { business } = me.membership;
  // Mientras se va a la Agenda no se muestra la pantalla del dueño
  const redirecting = !owner && ownerOnly(pathname);

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2 sm:px-6 sm:py-3">
          <div className="min-w-0">
            <p className="truncate font-semibold tracking-tight">
              {business.name}
            </p>
            <Link
              href={`/${business.slug}`}
              target="_blank"
              className="text-xs text-indigo-600 hover:underline"
            >
              {owner ? "Ver mi página pública ↗" : "Ver la página del negocio ↗"}
            </Link>
          </div>
          <Button
            variant="secondary"
            onClick={logout}
            className="shrink-0 px-3 py-1.5 sm:px-4 sm:py-2"
          >
            Cerrar sesión
          </Button>
        </div>
        {/* Un solo menú que cambia de forma: en el celular es una barra fija
            abajo, una columna por pestaña con su ícono (como una app); desde
            `sm`, pestañas debajo del encabezado. Su alto es --tabbar-h
            (globals.css) más el borde del iPhone (safe-area) */}
        <nav className="fixed inset-x-0 bottom-0 z-20 grid h-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] auto-cols-fr grid-flow-col border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] sm:static sm:mx-auto sm:flex sm:h-auto sm:max-w-3xl sm:gap-6 sm:border-0 sm:px-6 sm:pb-0">
          {TABS.filter((t) => owner || !t.ownerOnly).map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-w-0 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition sm:shrink-0 sm:border-b-2 sm:py-2 sm:text-sm ${
                  active
                    ? "text-indigo-600 sm:border-indigo-600"
                    : "text-gray-600 hover:text-gray-900 sm:border-transparent"
                }`}
              >
                <t.Icon className="h-6 w-6 sm:hidden" />
                {t.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {/* Solo el dueño: sin su correo verificado el negocio no recibe reservas
          ni puede invitar (quien acepta una invitación entra ya verificado) */}
      {owner && !me.emailVerifiedAt && <VerifyEmailBanner email={me.email} />}
      <MeProvider value={me}>
        {/* En el celular deja lugar abajo para la barra de navegación */}
        <main className="mx-auto max-w-3xl px-4 pt-6 pb-[calc(var(--tabbar-h)+2.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
          {redirecting ? null : children}
        </main>
      </MeProvider>
    </div>
  );
}
