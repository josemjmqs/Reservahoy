import { api } from "@/lib/api";
import type { BookingStatus, BusinessInfo, Service } from "@/lib/types";

const MAX_SIDE = 1200; // px del lado más largo
const QUALITY = 0.82;

// Reduce la foto en el navegador antes de subirla: una foto de celular pasa de
// 3-5 MB a ~150 KB, así sube rápido y casi no ocupa espacio en el bucket.
// `fallback` es el formato si el navegador no genera WebP: PNG para un logo,
// que suele tener fondo transparente (JPG lo dejaría negro)
export async function resizeImage(
  file: File,
  { maxSide = MAX_SIDE, fallback = "image/jpeg" } = {},
): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("No se pudo leer la imagen. Prueba con una foto JPG o PNG");
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return encodeCanvas(canvas, fallback);
}

// WebP, o `fallback` si el navegador no lo genera
export async function encodeCanvas(canvas: HTMLCanvasElement, fallback: string) {
  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));
  // Safari antiguo no genera WebP: en ese caso entrega PNG y usamos el de respaldo
  const webp = await encode("image/webp");
  if (webp?.type === "image/webp") return webp;
  const other = await encode(fallback);
  if (!other) throw new Error("No se pudo procesar la imagen");
  return other;
}

const EXT: Record<string, string> = { "image/webp": "webp", "image/png": "png" };
const fileName = (blob: Blob, name: string) => `${name}.${EXT[blob.type] ?? "jpg"}`;

export async function uploadServiceImage(serviceId: string, file: File) {
  const blob = await resizeImage(file);
  const body = new FormData();
  body.append("image", blob, fileName(blob, "foto"));
  return api<Service>(`/services/${serviceId}/image`, { method: "POST", body });
}

export function removeServiceImage(serviceId: string) {
  return api<Service>(`/services/${serviceId}/image`, { method: "DELETE" });
}

// El logo llega ya recortado y reducido por el LogoCropper (cuadrado de 512 px)
export async function uploadBusinessLogo(blob: Blob) {
  const body = new FormData();
  body.append("logo", blob, fileName(blob, "logo"));
  return api<BusinessInfo>("/business/logo", { method: "POST", body });
}

// Completa una reserva desde la agenda. Las fotos (opcionales, ya reducidas
// con resizeImage al elegirlas) van dentro del correo de "servicio listo"; el
// servidor no las guarda
export async function completeBooking(id: string, photos: Blob[]) {
  const body = new FormData();
  for (const [index, blob] of photos.entries()) {
    body.append("photos", blob, fileName(blob, `foto-${index + 1}`));
  }
  return api<{ id: string; status: BookingStatus; notified: boolean }>(
    `/agenda/${id}/complete`,
    { method: "POST", body },
  );
}

export function removeBusinessLogo() {
  return api<BusinessInfo>("/business/logo", { method: "DELETE" });
}
