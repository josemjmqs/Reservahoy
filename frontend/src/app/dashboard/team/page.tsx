'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useMe } from '@/lib/me';
import { Button, Card, Field, Input, buttonClass } from '@/components/ui';
import type { Service, TeamMember } from '@/lib/types';

const fetchTeam = () =>
  Promise.all([api<TeamMember[]>('/members'), api<Service[]>('/services')]);

// Botones de una tarjeta: 40 px de alto en el celular, compactos desde sm
const ACTION = 'h-10 px-3 py-0 sm:h-auto sm:py-1';

const servicesLabel = (n: number) =>
  n === 0 ? 'Sin servicios' : n === 1 ? '1 servicio' : `${n} servicios`;

// "21 nov." en la zona del negocio
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Santiago',
  });

export default function TeamPage() {
  // Puede haber varios dueños (quien acepta una invitación queda como dueño):
  // a cualquiera se le puede quitar el acceso, salvo a uno mismo
  const { membership } = useMe();
  const isMe = (m: TeamMember) => m.id === membership.memberId;
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editServices, setEditServices] = useState<string[]>([]);
  const [error, setError] = useState('');
  // Invitación por correo: a quién se le está escribiendo y el aviso de envío
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');

  const apply = useCallback(([m, s]: [TeamMember[], Service[]]) => {
    setMembers(m);
    setServices(s.filter((x) => x.active));
  }, []);

  const load = useCallback(async () => {
    apply(await fetchTeam());
  }, [apply]);

  useEffect(() => {
    fetchTeam()
      .then(apply)
      .catch((e) => setError(e.message));
  }, [apply]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/members', {
        method: 'POST',
        body: JSON.stringify({ displayName: name }),
      });
      setName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    }
  }

  function startEdit(m: TeamMember) {
    setError('');
    setEditingId(m.id);
    setEditName(m.displayName);
    setEditServices(m.services.map((s) => s.serviceId));
  }

  function toggleService(id: string) {
    setEditServices((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  }

  async function save(id: string) {
    setError('');
    try {
      await api(`/members/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: editName,
          serviceIds: editServices,
        }),
      });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    }
  }

  function startInvite(m: TeamMember) {
    setError('');
    setNotice('');
    setInvitingId(m.id);
    setInviteEmail(m.invitation?.email ?? '');
  }

  // Invita o reenvía (la invitación nueva anula la anterior)
  async function sendInvite(e: React.FormEvent, id: string) {
    e.preventDefault();
    setError('');
    setNotice('');
    setSending(true);
    try {
      const res = await api<{ email: string }>(`/members/${id}/invitation`, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail }),
      });
      setInvitingId(null);
      setNotice(`Invitación enviada a ${res.email}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setSending(false);
    }
  }

  async function revokeInvite(m: TeamMember) {
    if (!confirm(`¿Anular la invitación de ${m.displayName}?`)) return;
    setError('');
    setNotice('');
    try {
      await api(`/members/${m.id}/invitation`, { method: 'DELETE' });
      setInvitingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    }
  }

  async function toggleActive(m: TeamMember) {
    // Desactivar cierra sus sesiones al instante: se confirma; activar no
    if (m.active) {
      const also =
        m.account === 'active'
          ? ' y se cerrará su sesión en el panel'
          : m.account === 'invited'
            ? ' y se anulará su invitación'
            : '';
      const ok = confirm(
        `¿Desactivar a ${m.displayName}? Dejará de recibir reservas nuevas${also}.`,
      );
      if (!ok) return;
    }
    setError('');
    try {
      await api(`/members/${m.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !m.active }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Equipo</h1>
      <p className="mt-1 text-sm text-gray-600">
        Agrega profesionales, define qué servicios hace cada uno y su horario.
      </p>

      <Card className="my-4">
        <form onSubmit={create} className="flex gap-2">
          <Input
            placeholder="Nombre del profesional"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Button>Agregar</Button>
        </form>
      </Card>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {notice && (
        <p role="status" className="mb-3 text-sm text-green-700">
          {notice}
        </p>
      )}

      <ul className="divide-y divide-gray-200 rounded-card border border-line bg-white">
        {members.map((m) =>
          editingId === m.id ? (
            <li key={m.id} className="p-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save(m.id);
                }}
                className="space-y-3"
              >
                <Field label="Nombre">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                </Field>
                <div>
                  <p className="mb-1 text-sm font-medium text-gray-700">
                    Servicios que realiza
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {services.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="accent-indigo-600"
                          checked={editServices.includes(s.id)}
                          onChange={() => toggleService(s.id)}
                        />
                        {s.name}
                      </label>
                    ))}
                    {services.length === 0 && (
                      <p className="text-sm text-gray-500">
                        Primero crea servicios.
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button className={ACTION}>Guardar</Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className={ACTION}
                    onClick={() => setEditingId(null)}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            </li>
          ) : (
            <li
              key={m.id}
              // En el celular los botones van siempre debajo, así todas las
              // tarjetas se ven iguales; desde sm, al lado si caben
              className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
            >
              <div className={m.active ? '' : 'opacity-50'}>
                <p className="font-medium">
                  {m.displayName}
                  {isMe(m) && (
                    <span className="font-normal text-gray-500"> (tú)</span>
                  )}
                  {/* Igual que isOwner: cualquier rol que no sea dueño se
                      muestra como profesional */}
                  {m.role === 'OWNER' ? (
                    <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                      Dueño
                    </span>
                  ) : (
                    <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                      Profesional
                    </span>
                  )}
                </p>
                <p className="text-sm text-gray-600">
                  {m.services.length === 0 && m.active && m.bookable ? (
                    <span className="text-amber-700">
                      Sin servicios: no recibe reservas
                    </span>
                  ) : (
                    servicesLabel(m.services.length)
                  )}
                  {!m.active && ' · Inactivo'}
                </p>
                {!isMe(m) && m.active && (
                  <p className="mt-1 text-sm">
                    {m.account === 'active' && (
                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">
                        Con acceso
                      </span>
                    )}
                    {m.account === 'invited' && (
                      <span className="text-gray-600">
                        {m.invitation
                          ? `Invitación enviada a ${m.invitation.email} · vence el ${shortDate(m.invitation.expiresAt)}`
                          : 'Invitación enviada'}
                      </span>
                    )}
                    {m.account === 'none' && (
                      <span className="text-gray-500">Sin cuenta</span>
                    )}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {m.active && m.account !== 'active' && (
                  <Button
                    variant="secondary"
                    className={ACTION}
                    onClick={() => startInvite(m)}
                  >
                    {m.account === 'invited' ? 'Reenviar' : 'Invitar'}
                  </Button>
                )}
                {m.account === 'invited' && m.invitation && (
                  <Button
                    variant="secondary"
                    className={ACTION}
                    onClick={() => revokeInvite(m)}
                  >
                    Anular
                  </Button>
                )}
                <Link
                  href={`/dashboard/hours?memberId=${m.id}`}
                  className={buttonClass(
                    'secondary',
                    `inline-flex items-center ${ACTION}`,
                  )}
                >
                  Horario
                </Link>
                <Button
                  variant="secondary"
                  className={ACTION}
                  onClick={() => startEdit(m)}
                >
                  Editar
                </Button>
                {!isMe(m) && (
                  <Button
                    variant="secondary"
                    className={ACTION}
                    onClick={() => toggleActive(m)}
                  >
                    {m.active ? 'Desactivar' : 'Activar'}
                  </Button>
                )}
              </div>
              {invitingId === m.id && (
                <form
                  onSubmit={(e) => sendInvite(e, m.id)}
                  className="flex w-full flex-wrap gap-2"
                >
                  <p className="w-full text-sm text-gray-600">
                    Al aceptar tendrá acceso a todo el panel, igual que tú:
                    agenda, servicios, equipo y datos del negocio.
                  </p>
                  <Input
                    type="email"
                    placeholder={`Correo de ${m.displayName}`}
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="min-w-0 flex-1 basis-56"
                    autoFocus
                    required
                  />
                  <Button className={ACTION} disabled={sending}>
                    {sending ? 'Enviando...' : 'Enviar invitación'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className={ACTION}
                    onClick={() => setInvitingId(null)}
                  >
                    Cancelar
                  </Button>
                </form>
              )}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}