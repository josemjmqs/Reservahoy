import Link from "next/link";
import { Logo, LogoMark } from "@/components/Logo";
import { WhatsAppLink, WhatsAppNumber } from "@/components/WhatsAppLink";
import { CONTACT_EMAIL } from "@/lib/contact";

// Sin display: `hidden` e `inline-flex` en la misma clase chocan
const primaryLook =
  "items-center justify-center rounded-xl bg-indigo-600 font-semibold text-white transition hover:bg-indigo-700";
const primaryLink = `inline-flex ${primaryLook}`;
const secondaryLink =
  "inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white font-semibold text-gray-900 transition hover:bg-gray-50";

const STEPS = [
  {
    title: "Crea tu negocio",
    text: "Agrega tus servicios con precio y duración, tu equipo y tus horarios de atención. Toma unos minutos.",
  },
  {
    title: "Comparte tu link",
    text: "Tu página queda en reservahoy.cl/tu-negocio. Ponla en tu Instagram, mándala por WhatsApp o imprímela como QR para el mesón.",
  },
  {
    title: "Recibe reservas",
    text: "Tus clientes eligen servicio, día y hora. La reserva aparece en tu agenda y te llega un correo para que no se te pase.",
  },
];

const BUSINESS_TYPES = [
  "Peluquerías y barberías",
  "Talleres mecánicos",
  "Dentistas",
  "Tatuadores",
];

const FEATURES = [
  {
    title: "Tus clientes no crean cuenta",
    text: "Solo dejan sus datos de contacto y listo.",
  },
  {
    title: "Tu equipo, cada uno con su horario",
    text: "Define qué servicios hace cada persona y cuándo atiende.",
  },
  {
    title: "Fotos de tus servicios",
    text: "Muestra tu trabajo en tu página de reservas.",
  },
  {
    title: "Aviso por correo",
    text: "Te enteras de cada reserva nueva al momento.",
  },
  {
    title: "Cancelación con un link",
    text: "Si tu cliente no puede ir, cancela solo y la hora queda libre.",
  },
  {
    title: "Bloquea horas",
    text: "Almuerzo, trámites o vacaciones, en un par de clics.",
  },
  {
    title: "Varios servicios en una reserva",
    text: "Corte y barba en la misma hora, con el tiempo sumado.",
  },
];

const PRICE_POINTS = [
  "Sin tarjeta de crédito",
  "Sin permanencia: te vas cuando quieras",
  "Todas las funciones incluidas",
  "Soporte directo por WhatsApp",
];

function CheckIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M5 12.5 L10 17.5 L19 7.5"
        fill="none"
        stroke="#4F39F6"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Ilustración de la página pública de reservas (no es una captura real)
function PhoneMockup() {
  const services = [
    { name: "Corte de pelo", detail: "45 min · $12.000", selected: true },
    { name: "Perfilado de barba", detail: "30 min · $8.000" },
    { name: "Color completo", detail: "90 min · $35.000" },
  ];
  const days = [
    { name: "Lun", n: 16 },
    { name: "Mar", n: 17, selected: true },
    { name: "Mié", n: 18 },
    { name: "Jue", n: 19 },
  ];
  const times = ["10:00", "10:45", "11:30", "12:15", "15:00", "15:45"];

  return (
    <div
      role="img"
      aria-label="Ejemplo: página de reservas de una peluquería en un celular"
      className="w-[300px] max-w-full overflow-hidden rounded-[40px] border-[10px] border-gray-900 bg-white shadow-2xl shadow-gray-900/20"
    >
      <div className="flex flex-col gap-3.5 px-[18px] pt-[22px] pb-[18px]">
        <div>
          <p className="text-lg font-bold">Peluquería Demo</p>
          <p className="mt-0.5 text-xs text-gray-600">
            Elige tu servicio y tu hora
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {services.map((s) => (
            <div
              key={s.name}
              className={
                s.selected
                  ? "flex items-center justify-between rounded-xl border-2 border-indigo-600 bg-indigo-50 px-3 py-2.5"
                  : "rounded-xl border border-gray-200 px-3 py-2.5"
              }
            >
              <div>
                <p className="text-[13px] font-semibold">{s.name}</p>
                <p className="mt-0.5 text-[11px] text-gray-600">{s.detail}</p>
              </div>
              {s.selected && (
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="11" fill="#4F39F6" />
                  <path
                    d="M7 12.5 L10.5 16 L17 9"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
          ))}
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold">Día</p>
          <div className="flex gap-1.5">
            {days.map((d) => (
              <div
                key={d.n}
                className={
                  d.selected
                    ? "flex-1 rounded-[10px] bg-indigo-600 py-1.5 text-center text-[11px] text-white"
                    : "flex-1 rounded-[10px] border border-gray-200 py-1.5 text-center text-[11px] text-gray-600"
                }
              >
                {d.name}
                <br />
                <strong
                  className={
                    d.selected ? "text-sm" : "text-sm text-gray-900"
                  }
                >
                  {d.n}
                </strong>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold">Hora</p>
          <div className="grid grid-cols-3 gap-1.5 text-center text-[13px] time">
            {times.map((t) => (
              <div
                key={t}
                className={
                  t === "11:30"
                    ? "rounded-lg bg-indigo-600 py-[7px] text-white"
                    : "rounded-lg border border-gray-200 py-[7px]"
                }
              >
                {t}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-indigo-600 py-3 text-center text-sm font-semibold text-white">
          Reservar · mar 17, 11:30
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex-1 bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6">
          <Link href="/" aria-label="Reservahoy, inicio">
            <Logo size={32} />
          </Link>
          <nav className="flex items-center gap-x-5 text-[15px]">
            <a href="#como-funciona" className="hidden text-gray-600 hover:text-gray-900 md:inline">
              Cómo funciona
            </a>
            <a href="#precio" className="hidden text-gray-600 hover:text-gray-900 md:inline">
              Precio
            </a>
            <Link
              href="/login"
              className={`${secondaryLink} min-h-11 px-4 font-medium whitespace-nowrap`}
            >
              Iniciar sesión
            </Link>
            <Link
              href="/register"
              className={`${primaryLook} hidden min-h-11 px-4 whitespace-nowrap sm:inline-flex`}
            >
              Crear mi negocio
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto flex max-w-[1120px] items-center gap-12 px-5 pt-8 pb-10 sm:px-6 md:pt-14 md:pb-12">
          <div className="min-w-0 flex-1">
            <p className="inline-block rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
              Gratis para siempre si te sumas ahora
            </p>
            <h1 className="mt-4 text-[clamp(32px,5vw,54px)] leading-[1.05] font-bold tracking-tight">
              Reservas online para tu negocio, en minutos.
            </h1>
            <p className="mt-4 max-w-[34em] text-[17px] leading-relaxed text-gray-600 md:text-lg">
              Comparte un link y tus clientes eligen servicio, día y hora, sin
              crear cuenta ni descargar nada. La reserva aparece en tu agenda y
              te avisamos por correo.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/register" className={`${primaryLink} min-h-12 px-6 text-[17px]`}>
                Crear mi negocio gratis
              </Link>
              <Link href="/demo" className={`${secondaryLink} min-h-12 px-6 text-[17px]`}>
                Ver una página de ejemplo
              </Link>
            </div>
            <p className="mt-3 text-sm text-gray-600">
              Sin tarjeta de crédito · Sin permanencia
            </p>
          </div>
          {/* En el celular se salta: ocupaba más de una pantalla, y "Ver una
              página de ejemplo" muestra la real */}
          <div className="hidden shrink-0 md:block">
            <PhoneMockup />
          </div>
        </section>

        <section id="como-funciona" className="scroll-mt-4 border-y border-gray-200 bg-white">
          <div className="mx-auto max-w-[1120px] px-5 py-10 sm:px-6 md:py-12">
            <h2 className="text-[28px] font-bold tracking-tight md:text-[32px]">
              Cómo funciona
            </h2>
            <ol className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-3 md:gap-4">
              {STEPS.map((step, i) => (
                <li key={step.title} className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                  <h3 className="flex items-center gap-3 text-lg font-semibold">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-base font-bold text-white">
                      {i + 1}
                    </span>
                    {step.title}
                  </h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-gray-600">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-[1120px] px-5 py-10 sm:px-6 md:py-12">
          <h2 className="text-[28px] font-bold tracking-tight md:text-[32px]">
            Todo lo que necesitas, sin complicaciones
          </h2>
          <p className="mt-3 text-[15px] text-gray-600">Para negocios que atienden con hora:</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {BUSINESS_TYPES.map((type) => (
              <li
                key={type}
                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[15px]"
              >
                {type}
              </li>
            ))}
          </ul>
          <ul className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-x-8 gap-y-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-2.5">
                <span className="mt-0.5">
                  <CheckIcon />
                </span>
                <p className="min-w-0 text-[15px] leading-relaxed text-gray-600">
                  <strong className="font-semibold text-gray-900">{f.title}.</strong>{" "}
                  {f.text}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-y border-gray-200 bg-white">
          <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-8 gap-y-4 px-5 py-10 sm:px-6 md:py-12">
            <div
              role="img"
              aria-label="Iniciales de José Ignacio Díaz Hormazábal"
              className="flex size-16 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-2xl font-bold text-indigo-700 md:size-24 md:text-[32px]"
            >
              JD
            </div>
            <div className="min-w-0 flex-[1_1_420px]">
              <p className="text-sm font-semibold tracking-wider text-indigo-600 uppercase">
                Quién está detrás
              </p>
              <h2 className="mt-1.5 text-2xl font-bold tracking-tight md:text-[28px]">
                Hola, soy José Ignacio Díaz Hormazábal
              </h2>
              <p className="mt-2 text-[17px] leading-relaxed text-gray-600">
                Soy desarrollador de Maipú y creé Reservahoy para que los
                negocios del barrio puedan recibir reservas online de forma
                simple. Si tienes dudas, algún problema o te enredas al crear
                tu negocio, escríbeme.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
                <WhatsAppLink
                  withMessage
                  className="inline-flex min-h-12 items-center gap-2.5 rounded-xl bg-green-700 px-5 font-semibold text-white transition hover:bg-green-800"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M4 20 L5.3 16.2 A8 8 0 1 1 8 18.8 Z"
                      fill="none"
                      stroke="#FFFFFF"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Escríbeme por WhatsApp
                </WhatsAppLink>
                <WhatsAppNumber className="text-[15px] text-gray-600" />
              </div>
            </div>
          </div>
        </section>

        <section id="precio" className="scroll-mt-4">
          <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-10 gap-y-5 px-5 py-10 sm:px-6 md:py-12">
            <div className="min-w-0 flex-[1_1_360px]">
              <h2 className="text-[28px] font-bold tracking-tight md:text-[32px]">Precio</h2>
              <p className="mt-2 max-w-[30em] text-[17px] leading-relaxed text-gray-600">
                Estamos empezando y queremos hacer Reservahoy junto a los
                primeros negocios. Si te sumas ahora, nunca te cobraremos. Solo
                te pedimos que nos cuentes qué te gusta y qué mejorarías.
              </p>
            </div>
            <div className="min-w-0 flex-[1_1_380px] rounded-[22px] border-2 border-indigo-600 bg-white p-6">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="text-[44px] leading-none font-bold tracking-tight">$0</p>
                <p className="text-lg font-semibold">Gratis para siempre</p>
              </div>
              <p className="mt-1.5 text-[15px] text-gray-600">
                Para los negocios que se suman mientras estamos empezando
              </p>
              <ul className="mt-4 flex flex-col gap-2">
                {PRICE_POINTS.map((point) => (
                  <li key={point} className="flex items-center gap-2.5">
                    <CheckIcon />
                    {point}
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-gray-200 pt-3 text-sm leading-normal text-gray-600">
                Cuando empecemos a cobrar, será solo a los negocios nuevos, y lo
                avisaremos con 30 días de anticipación. Tu negocio sigue gratis
                para siempre con todo lo que Reservahoy tenga ese día; si después
                sumamos algo de pago, tú decides si lo quieres.{" "}
                <Link href="/terminos#precio" className="underline hover:text-gray-900">
                  Ver los términos
                </Link>
              </p>
              <Link href="/register" className={`${primaryLink} mt-4 min-h-12 w-full text-[17px]`}>
                Crear mi negocio gratis
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-4 px-5 py-6 text-sm text-gray-600 sm:px-6">
          <div className="flex items-center gap-2.5">
            <LogoMark size={24} />
            <span>© {new Date().getFullYear()} Reservahoy · Hecho en Maipú</span>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/privacidad" className="hover:underline">
              Privacidad
            </Link>
            <Link href="/terminos" className="hover:underline">
              Términos
            </Link>
            <WhatsAppLink className="hover:underline">WhatsApp</WhatsAppLink>
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:underline">
              {CONTACT_EMAIL}
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
