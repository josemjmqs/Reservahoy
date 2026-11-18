// Centra un elemento en lo visible de la pantalla, descontando lo que va fijo
// abajo (lo que lleva data-fixed-bottom, como la barra "Ver horas" de la página
// pública). Si es más alto que lo visible, lo deja pegado arriba para que se vea
// desde su comienzo. Lo usa el detalle de un servicio al abrirse (ServicePicker),
// que al cerrarse vuelve con smoothScrollBy

const GAP = 16; // px de aire arriba cuando no cabe centrado

export function centerInView(el: Element) {
  const bar = document.querySelector("[data-fixed-bottom]");
  const visible = bar
    ? Math.min(window.innerHeight, bar.getBoundingClientRect().top)
    : window.innerHeight;
  const rect = el.getBoundingClientRect();
  const top =
    rect.height <= visible - 2 * GAP
      ? rect.top - (visible - rect.height) / 2
      : rect.top - GAP;
  if (Math.abs(top) < 1) return;
  void smoothScrollBy(top);
}

// Desplaza la página con el mismo deslizamiento que centerInView (al instante si
// se pidió menos movimiento) y avisa cuando termina. Si el navegador no tiene
// scrollend, o el desplazamiento no llega a ocurrir, avisa igual al rato
const MAX_SCROLL_MS = 700;

export function smoothScrollBy(top: number): Promise<void> {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.scrollBy({ top });
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener("scrollend", done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, MAX_SCROLL_MS);
    window.addEventListener("scrollend", done);
    window.scrollBy({ top, behavior: "smooth" });
  });
}
