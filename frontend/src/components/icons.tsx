// Íconos propios del panel (trazo de 24×24, toman el color del texto). Son
// decorativos: el nombre visible de la pestaña o del botón ya los describe
type IconProps = { className?: string };

function Svg({
  className = "h-6 w-6",
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export const PhoneIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
  </Svg>
);

// Globo de conversación con un teléfono: el enlace abre WhatsApp
export const ChatPhoneIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 20.5 5 16.4A8.5 8.5 0 1 1 8.4 19.2Z" />
    <path d="M9.5 8.5h1.6l.8 2-1 .7a4.5 4.5 0 0 0 1.9 1.9l.7-1 2 .8v1.6a.8.8 0 0 1-.8.8A6.5 6.5 0 0 1 8.7 9.3a.8.8 0 0 1 .8-.8Z" />
  </Svg>
);

export const MapPinIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);

export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
);

export const TagIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 3h9l9 9-9 9-9-9z" />
    <circle cx="7.5" cy="7.5" r="1.5" />
  </Svg>
);

export const UsersIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M17 14c2.8 0 5 2 5 5" />
  </Svg>
);

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

export const BanIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M5.6 5.6l12.8 12.8" />
  </Svg>
);

export const SlidersIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h3M11 6h9M4 12h9M17 12h3M4 18h1M9 18h11" />
    <circle cx="9" cy="6" r="2" />
    <circle cx="15" cy="12" r="2" />
    <circle cx="7" cy="18" r="2" />
  </Svg>
);

export const HelpIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.6" />
    <path d="M12 17h.01" />
  </Svg>
);

export const RefreshIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5" />
    <path d="M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5" />
  </Svg>
);
