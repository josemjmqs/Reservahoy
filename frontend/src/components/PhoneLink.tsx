import { ChatPhoneIcon, PhoneIcon } from "@/components/icons";
import { whatsappUrl } from "@/lib/whatsapp";

// Teléfono del negocio para sus clientes (página pública y enlace de la
// reserva): un celular abre WhatsApp (en el teléfono, la app; en el
// computador, WhatsApp Web); un fijo, la llamada
export function PhoneLink({
  phone,
  className,
}: {
  phone: string;
  className: string;
}) {
  const whatsapp = whatsappUrl(phone);
  if (!whatsapp) {
    return (
      <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className={className}>
        <PhoneIcon className="h-4 w-4 shrink-0 opacity-80" />
        {phone}
      </a>
    );
  }
  return (
    <a
      href={whatsapp}
      target="_blank"
      rel="noopener noreferrer"
      title="Escribir por WhatsApp"
      className={className}
    >
      <ChatPhoneIcon className="h-4 w-4 shrink-0 opacity-80" />
      <span>
        <span className="sr-only">WhatsApp </span>
        {phone}
      </span>
    </a>
  );
}
