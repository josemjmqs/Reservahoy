// Detecta en el navegador de quien usa la página si esta quedó más ancha que la
// pantalla (en un celular se ve achicada o cortada) y si el navegador es tan
// antiguo que Tailwind v4 no funciona en él. Lo usa OverflowWatch para avisar a
// Sentry. Sin React: solo el DOM

export interface Overflow {
  // Ancho de la pantalla en px de CSS y cuánto se pasa la página
  width: number;
  overflow: number;
  // Los elementos más adentro que se salen (etiqueta y clases, sin texto: el
  // texto puede ser un nombre o un teléfono)
  culprits: string[];
}

export function findOverflow(doc: Document = document): Overflow | null {
  const root = doc.documentElement;
  // clientWidth es el ancho de la pantalla aunque algo se salga (Chrome en
  // Android agranda innerWidth hasta lo que se sale)
  const width = root.clientWidth;
  const overflow = root.scrollWidth - width;
  if (!width || overflow <= 1) return null;

  const view = doc.defaultView ?? window;
  const sticksOut = (el: Element) => el.getBoundingClientRect().right > width + 0.5;
  // Lo fijo (como la barra de abajo) se estira con la página cuando otra cosa
  // la ensancha: no es la causa
  const inFixed = (el: Element | null): boolean =>
    !!el && (view.getComputedStyle(el).position === "fixed" || inFixed(el.parentElement));
  const culprits = [...doc.body.querySelectorAll("*")]
    .filter((el) => sticksOut(el) && ![...el.children].some(sticksOut) && !inFixed(el))
    .slice(0, 3)
    .map(
      (el) =>
        `<${el.tagName.toLowerCase()} class="${(el.getAttribute("class") ?? "").slice(0, 160)}">`,
    );
  return { width, overflow: Math.round(overflow), culprits };
}

// Tailwind v4 necesita Safari 16.4, Chrome 111 o Firefox 128. color-mix llegó
// casi junto (Safari 16.2): sin él, la página se ve sin colores o desarmada.
// Es la misma condición que esconde el aviso .old-browser en globals.css
export const OLD_BROWSER_TEST = "color-mix(in lab, red, red)";
export const isOldBrowser = () =>
  typeof CSS !== "undefined" && !CSS.supports("color", OLD_BROWSER_TEST);

// Navegador y versión, sin nada más del user agent: para saber dónde pasa. En
// el iPhone todos los navegadores usan el motor de Safari del sistema, así que
// importa la versión de iOS
export function browserLabel(ua: string): string {
  const ios = ua.match(/(?:iPhone|iPad|iPod).* OS (\d+)_/);
  if (ios) return `iOS ${ios[1]}`;
  const rules: [RegExp, string][] = [
    [/SamsungBrowser\/(\d+)/, "Samsung Internet"],
    [/Edg\w*\/(\d+)/, "Edge"],
    [/Firefox\/(\d+)/, "Firefox"],
    [/Chrome\/(\d+)/, "Chrome"],
    [/Version\/(\d+)[\d.]* .*Safari/, "Safari"],
  ];
  for (const [re, name] of rules) {
    const m = ua.match(re);
    if (m) return `${name} ${m[1]}`;
  }
  return "otro";
}
