'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button, Card, Input } from '@/components/ui';
import type { InvitationPreview } from '@/lib/types';

// Enlace del correo de invitación: el profesional crea su cuenta y entra al panel
export default function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<InvitationPreview>(`/invitations/${token}`)
      .then((inv) => {
        setInvitation(inv);
        setName(inv.memberName);
      })
      .catch(() => setInvalid(true));
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setLoading(true);
    try {
      await api(`/invitations/${token}/accept`, {
        method: 'POST',
        body: JSON.stringify({ name, password }),
      });
      // Navegación completa a propósito: el panel carga de cero con la sesión
      // nueva (sin restos de otra sesión que hubiera en este navegador)
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/dashboard/agenda');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <Card className="p-6">
        {invalid ? (
          <>
            <h1 className="text-xl font-semibold tracking-tight">
              Este enlace no es válido o expiró
            </h1>
            <p className="mt-3 text-sm text-gray-600">
              Pídele al dueño del negocio que te envíe una invitación nueva. Si
              ya creaste tu cuenta,{' '}
              <Link href="/login" className="text-indigo-600 underline">
                inicia sesión
              </Link>
              .
            </p>
          </>
        ) : !invitation ? (
          <p className="text-sm text-gray-600">Cargando...</p>
        ) : (
          <>
            <h1 className="text-xl font-semibold tracking-tight">
              Únete a {invitation.businessName}
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Hola {invitation.memberName}, crea tu cuenta para administrar la
              agenda y el negocio desde el panel.
            </p>
            <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
              <label className="text-sm text-gray-700">
                Correo
                <Input
                  value={invitation.email}
                  readOnly
                  className="mt-1 bg-gray-50 text-gray-600"
                />
              </label>
              <label className="text-sm text-gray-700">
                Tu nombre
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  minLength={2}
                  maxLength={80}
                  className="mt-1"
                  required
                />
              </label>
              <Input
                type="password"
                placeholder="Contraseña (mínimo 8 caracteres)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
              />
              <Input
                type="password"
                placeholder="Repite la contraseña"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button disabled={loading}>
                {loading ? 'Creando tu cuenta...' : 'Crear mi cuenta'}
              </Button>
            </form>
          </>
        )}
      </Card>
    </main>
  );
}
