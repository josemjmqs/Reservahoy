// Enlace de WhatsApp (wa.me) para el teléfono del negocio en su página
// pública: los clientes prefieren escribir antes que llamar. null si es un
// fijo chileno (no tiene WhatsApp: ahí el enlace llama) o si no se reconoce.
// Sin código de país se asume Chile: "9 1234 5678" es +56 9 1234 5678
export function whatsappUrl(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");
  const international = phone.trim().startsWith("+") || digits.startsWith("00");
  digits = digits.replace(/^0+/, "");
  if (!international && digits.length === 9) digits = `56${digits}`;
  // Chile: los celulares son +56 9 y ocho cifras; el resto son fijos
  if (digits.startsWith("56")) {
    return digits.length === 11 && digits[2] === "9"
      ? `https://wa.me/${digits}`
      : null;
  }
  return international && digits.length >= 8 && digits.length <= 15
    ? `https://wa.me/${digits}`
    : null;
}
