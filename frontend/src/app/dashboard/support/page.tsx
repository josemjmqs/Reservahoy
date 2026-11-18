"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { scrollFieldUp } from "@/lib/scroll-field";

type Kind = "PROBLEM" | "SUGGESTION" | "QUESTION";

const MESSAGE_MIN = 10;
const MESSAGE_MAX = 2000;

const KINDS: {
  value: Kind;
  label: string;
  hint: string;
  field: string;
  placeholder: string;
}[] = [
  {
    value: "PROBLEM",
    label: "Reportar un problema",
    hint: "Algo no funciona o se ve mal.",
    field: "¿Qué pasó?",
    placeholder:
      "Ej.: al guardar el horario sale un error. Cuéntanos qué estabas haciendo y qué esperabas que pasara.",
  },
  {
    value: "SUGGESTION",
    label: "Sugerir una mejora",
    hint: "Algo que cambiarías o una función nueva que te serviría.",
    field: "¿Qué te gustaría?",
    placeholder:
      "Ej.: que los clientes reciban un recordatorio el día antes de su hora.",
  },
  {
    value: "QUESTION",
    label: "Tengo una duda",
    hint: "No sabes cómo hacer algo en Reservahoy.",
    field: "¿Cuál es tu duda?",
    placeholder: "Ej.: ¿cómo agrego a otra persona del equipo?",
  },
];

// Pantalla del panel desde donde se abrió (?from=, lo pone el enlace del
// encabezado). Misma regla que el backend: solo una ruta del panel
function fromPage(): string | undefined {
  const from = new URLSearchParams(window.location.search).get("from");
  return from && /^\/dashboard(\/[a-z0-9-]+)*$/.test(from) ? from : undefined;
}

// "Ayuda y sugerencias": cualquier miembro (dueño o profesional) le escribe al
// equipo de Reservahoy, que le responde a su correo
export default function SupportPage() {
  const me = useMe();
  const [kind, setKind] = useState<Kind>("PROBLEM");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const current = KINDS.find((k) => k.value === kind)!;
  const length = message.trim().length;

  async function send(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      await api("/support", {
        method: "POST",
        body: JSON.stringify({ kind, message, page: fromPage() }),
      });
      setSent(true);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">
        Ayuda y sugerencias
      </h1>
      <p className="mt-1 text-sm text-gray-600">
        Escríbenos si algo no funciona, si se te ocurre una mejora o si tienes
        una duda. Te respondemos a <strong>{me.email}</strong>.
      </p>

      {sent ? (
        <div
          role="status"
          className="mt-6 rounded-card border border-green-200 bg-green-50 p-4"
        >
          <p className="font-medium text-green-900">
            ¡Gracias! Recibimos tu mensaje.
          </p>
          <p className="mt-1 text-sm text-green-800">
            Lo leemos y te respondemos a tu correo lo antes posible.
          </p>
          <Button
            variant="secondary"
            onClick={() => setSent(false)}
            className="mt-3 h-10 sm:h-auto"
          >
            Escribir otro mensaje
          </Button>
        </div>
      ) : (
        <form
          onSubmit={send}
          onFocus={scrollFieldUp}
          className="mt-6 space-y-4 rounded-card border border-line bg-white p-4"
        >
          <fieldset disabled={sending}>
            <legend className="font-medium">¿Sobre qué nos escribes?</legend>
            <div className="mt-3 space-y-2">
              {KINDS.map((k) => (
                <label
                  key={k.value}
                  className={`flex min-h-10 cursor-pointer items-start gap-3 rounded-control border px-3 py-2 transition has-[:disabled]:cursor-default has-[:disabled]:opacity-60 ${
                    kind === k.value
                      ? "border-indigo-600 bg-indigo-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="kind"
                    value={k.value}
                    checked={kind === k.value}
                    onChange={() => setKind(k.value)}
                    className="mt-1 h-4 w-4 accent-indigo-600"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">
                      {k.label}
                    </span>
                    <span className="block text-sm text-gray-600">
                      {k.hint}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <Field label={current.field}>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={current.placeholder}
              required
              minLength={MESSAGE_MIN}
              maxLength={MESSAGE_MAX}
              rows={6}
              disabled={sending}
              className="resize-y"
            />
          </Field>
          <p
            className={`-mt-2 text-right text-xs ${
              length > 0 && length < MESSAGE_MIN
                ? "text-amber-700"
                : "text-muted"
            }`}
          >
            {length > 0 && length < MESSAGE_MIN
              ? `Cuéntanos un poco más (al menos ${MESSAGE_MIN} caracteres)`
              : `${message.length} / ${MESSAGE_MAX}`}
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button
            type="submit"
            disabled={sending || length < MESSAGE_MIN}
            className="h-10 w-full sm:h-auto sm:w-auto"
          >
            {sending ? "Enviando..." : "Enviar mensaje"}
          </Button>
        </form>
      )}
    </div>
  );
}
