export interface Service {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  totalMin: number | null;
  price: number | null;
  active: boolean;
  category: string | null;
  imageUrl: string | null;
}

export interface WorkingHour {
  weekday: number;
  opensAt: string;
  closesAt: string;
  breakStartsAt: string | null;
  breakEndsAt: string | null;
}

export interface PublicBusiness {
  name: string;
  slug: string;
  timezone: string;
  phone: string | null;
  address: string | null;
  brandColor: string | null;
  logoUrl: string | null;
  acceptsBookings: boolean;
  // Hoy, de la primera apertura al último cierre del equipo ("HH:mm"); null si
  // hoy no atiende nadie (AvailabilityService.todayHours)
  todayHours: { opensAt: string; closesAt: string } | null;
  services: Omit<Service, "active">[];
  members: {
    id: string;
    displayName: string;
    services: { serviceId: string }[];
  }[];
}

export interface BookingResult {
  id: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  manageToken: string;
}

export type BookingStatus =
  | "PENDING"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";
export type SettableStatus = Exclude<BookingStatus, "PENDING">;

// Se puede marcar Completada (y avisar al cliente) desde una reserva activa o
// desde "No se presentó", por si se marcó por error y el cliente sí vino. La
// misma regla que COMPLETABLE en el backend (agenda.service.ts)
export const canComplete = (status?: string) =>
  status === "PENDING" || status === "CONFIRMED" || status === "NO_SHOW";

export interface AgendaBooking {
  id: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  notes: string | null;
  services: { name: string; durationMin: number }[];
  member: { id: string; displayName: string };
  customer: { name: string; email: string; phone: string | null };
}

export interface ManagedBooking {
  id: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  services: { name: string; durationMin: number }[];
  business: {
    name: string;
    timezone: string;
    phone: string | null;
    address: string | null;
  };
}

export interface TeamMember {
  id: string;
  displayName: string;
  role: "OWNER" | "STAFF";
  bookable: boolean;
  active: boolean;
  services: { serviceId: string }[];
  // 'active': tiene cuenta; 'invited': invitación vigente; 'none': sin cuenta
  account: "active" | "invited" | "none";
  // Solo llega cuando quien pide es el dueño
  invitation?: { email: string; expiresAt: string } | null;
}

// GET /auth/me: la cuenta y su membresía activa (sin ella responde 403)
export interface Me {
  id: string;
  name: string;
  email: string;
  emailVerifiedAt: string | null;
  membership: {
    memberId: string;
    role: "OWNER" | "STAFF";
    displayName: string;
    business: {
      id: string;
      name: string;
      slug: string;
    };
  };
}

// Lo que muestra la página de una invitación antes de aceptarla
export interface InvitationPreview {
  businessName: string;
  memberName: string;
  email: string;
  expiresAt: string;
}

export interface TimeBlock {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  allDay: boolean;
  member: { id: string; displayName: string } | null;
}

export interface TimeBlockList {
  timezone: string;
  blocks: TimeBlock[];
}

// Qué reservas nuevas llegan por correo: todas las del negocio (solo un
// dueño), solo las que atiende o ninguna
export type NotifyScope = "ALL" | "OWN" | "NONE";

export interface Settings {
  newBookings: NotifyScope;
  email: string;
}

export interface BusinessInfo {
  name: string;
  slug: string;
  phone: string | null;
  address: string | null;
  brandColor: string | null;
  logoUrl: string | null;
}
