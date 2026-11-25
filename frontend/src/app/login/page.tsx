"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button, Card, Input } from "@/components/ui";

// ?reset=1 viene de restablecer la contraseña; ?expired=1, de una petición
// del panel que respondió 401 (lib/api.ts); ?revoked=1, del panel cuando
// /auth/me responde 403 porque lo desactivaron (dashboard/layout.tsx)
function LoginNotice() {
  const params = useSearchParams();
  if (params.get("reset") === "1") {
    return (
      <p className="mt-3 rounded-card bg-green-50 p-3 text-sm text-green-700">
        Contraseña actualizada, ya puedes entrar.
      </p>
    );
  }
  if (params.get("expired") === "1") {
    return (
      <p
        role="status"
        className="mt-3 rounded-card bg-amber-50 p-3 text-sm text-amber-800"
      >
        Tu sesión expiró. Vuelve a iniciar sesión.
      </p>
    );
  }
  if (params.get("revoked") === "1") {
    return (
      <p
        role="status"
        className="mt-3 rounded-card bg-amber-50 p-3 text-sm text-amber-800"
      >
        Ya no tienes acceso al panel de este negocio. Si crees que es un error,
        habla con el dueño.
      </p>
    );
  }
  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoError, setDemoError] = useState("");
  const [demoLoading, setDemoLoading] = useState(false);

  // Panel de demostración sin contraseña (solo lectura: POST /auth/demo)
  async function enterDemo() {
    setDemoError("");
    setDemoLoading(true);
    try {
      await api("/auth/demo", {
        method: "POST",
        body: JSON.stringify({ role: "owner" }),
      });
      router.push("/dashboard/agenda");
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : "Error inesperado");
      setDemoLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-10">
      <Card className="p-6">
        <h1 className="text-xl font-semibold tracking-tight">
          Iniciar sesión
        </h1>
        <Suspense fallback={null}>
          <LoginNotice />
        </Suspense>
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
          <Input
            type="email"
            placeholder="Correo"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
          <Link
            href="/forgot-password"
            className="text-sm text-indigo-600 hover:underline"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </form>
        <p className="mt-4 text-sm text-gray-600">
          ¿No tienes cuenta?{" "}
          <Link href="/register" className="text-indigo-600 hover:underline">
            Regístrate
          </Link>
        </p>
      </Card>
      <section className="mt-4 rounded-card border border-line p-5 text-sm">
        <h2 className="font-semibold text-ink">¿Solo quieres ver cómo funciona?</h2>
        <p className="mt-1 text-muted">
          Entra al panel de una peluquería de ejemplo, sin cuenta. Puedes
          recorrer todo; los cambios no se guardan.
        </p>
        <Button
          type="button"
          variant="secondary"
          onClick={enterDemo}
          disabled={demoLoading}
          className="mt-3 h-10 w-full sm:h-auto"
        >
          {demoLoading ? "Entrando..." : "Ver el panel de demostración"}
        </Button>
        {demoError && <p className="mt-2 text-red-600">{demoError}</p>}
      </section>
    </main>
  );
}
