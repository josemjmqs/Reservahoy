// En el celular el teclado tapa media pantalla y el navegador solo desplaza lo
// justo para que el campo quede pegado encima del teclado, así que los de abajo
// siguen tapados. Esto sube el campo enfocado (con su etiqueta, el <label> de
// Field) hasta arriba de lo visible; solo baja, nunca sube la página.
// Uso: onFocus={scrollFieldUp} en el contenedor de los campos (el evento burbujea)

const TOP_GAP = 16; // px sobre la etiqueta
const NOT_TYPED = new Set(["button", "checkbox", "file", "radio", "reset", "submit"]);

function scrollUp(field: Element) {
  // la parte visible empieza en offsetTop cuando el navegador movió la vista
  // por el teclado (Chrome en Android no achica la página, solo lo visible)
  const top =
    field.getBoundingClientRect().top -
    (window.visualViewport?.offsetTop ?? 0) -
    TOP_GAP;
  if (top > 1) window.scrollBy({ top, behavior: "smooth" });
}

export function scrollFieldUp(e: React.FocusEvent<HTMLElement>) {
  const el = e.target;
  const typed =
    (el instanceof HTMLInputElement && !NOT_TYPED.has(el.type)) ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement;
  // con mouse no hay teclado en pantalla que tape nada
  if (!typed || !window.matchMedia("(pointer: coarse)").matches) return;

  const field = el.closest("label") ?? el;
  scrollUp(field);

  // Si el teclado recién se abre, el navegador hace su propio desplazamiento y
  // puede cortar el nuestro a medias: se repite cuando termina de abrirse
  const vv = window.visualViewport;
  if (!vv) return;
  let timer: number | undefined;
  const onResize = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (document.activeElement === el) scrollUp(field);
    }, 150);
  };
  vv.addEventListener("resize", onResize);
  window.setTimeout(() => vv.removeEventListener("resize", onResize), 1500);
}
