// Enlace de búsqueda de Google Maps con la dirección del negocio: no necesita
// clave y en el celular abre la app de Maps. Igual que mapsUrl en el backend
// (notifications.service.ts), que lo usa en el correo de confirmación
export const mapsUrl = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
