import type { CSSProperties } from "react";

// Color de Reservahoy (el del logo, indigo-600 de Tailwind 4): el de la página pública si el negocio no eligió uno
export const DEFAULT_BRAND = "#4f39f6";

const WHITE = "#ffffff";
const DARK = "#16152b"; // gray-900 del sistema visual (globals.css)

// Luminancia relativa de un color "#rrggbb" (WCAG 2)
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Texto sobre el color de marca: blanco mientras se lea bien (4,5:1, WCAG AA);
// en colores claros (amarillo, celeste...) el que contraste más, que es el oscuro
export function textOn(brand: string) {
  const white = contrast(WHITE, brand);
  return white >= 4.5 || white > contrast(DARK, brand) ? WHITE : DARK;
}

// Bordes y marcas sobre fondo claro (`border-brand-ring`): el color de marca si
// contrasta 3:1 con el blanco (WCAG para lo que no es texto); si es claro, más oscuro
export function ringOn(brand: string) {
  return contrast(WHITE, brand) >= 3
    ? brand
    : `color-mix(in oklab, ${brand} 55%, black)`;
}

// Variables CSS que usan las clases `bg-brand`, `text-brand-fg`, etc. (globals.css)
export function brandStyle(color: string | null | undefined): CSSProperties {
  const brand = color ?? DEFAULT_BRAND;
  return {
    "--brand": brand,
    "--brand-fg": textOn(brand),
    "--brand-ring": ringOn(brand),
  } as CSSProperties;
}
