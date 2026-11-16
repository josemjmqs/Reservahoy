// Centra un elemento en lo visible de la pantalla, descontando lo que va fijo
// abajo (lo que lleva data-fixed-bottom, como la barra "Ver horas" de la página
// pública). Si es más alto que lo visible, lo deja pegado arriba para que se vea
// desde su comienzo. Lo usa el detalle de un servicio al abrirse (ServicePicker)

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
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollBy({ top, behavior: reduce ? "auto" : "smooth" });
}
