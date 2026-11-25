import { expect, test, type Locator, type Page } from "@playwright/test";
import { bookFirstSlot, loginAsDemo, loginAsStaff, workdayFrom } from "./helpers";

// El panel en un celular (375 px, el ancho de un iPhone chico): la navegación
// es una barra fija abajo con todas las pestañas a la vista, y ninguna
// pantalla se sale de lado

// isMobile: como un teléfono, sin la barra de desplazamiento de escritorio (que
// con scrollbar-gutter resta 15 px al ancho)
test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

const OWNER_TABS = ["Agenda", "Servicios", "Equipo", "Horario", "Bloqueos", "Ajustes"];
const STAFF_TABS = ["Agenda", "Horario", "Bloqueos", "Ajustes"];

async function checkTabs(page: Page, names: string[]) {
  // En local (`npm run dev`) el indicador de Next queda sobre la primera
  // pestaña y no deja hacer clic; en CI se usa `next start` y no aparece. Las
  // pestañas cambian de página sin recargar, así que el estilo dura toda la prueba
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });

  const nav = page.getByRole("navigation");
  const links = nav.getByRole("link");
  expect((await links.allTextContents()).map((t) => t.trim())).toEqual(names);

  // La barra queda pegada al pie de la pantalla
  const viewport = page.viewportSize()!;
  const bar = (await nav.boundingBox())!;
  expect(bar.y + bar.height).toBeCloseTo(viewport.height, 0);

  for (const name of names) {
    const link = nav.getByRole("link", { name });
    await link.click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");

    // Solo la pestaña abierta se marca
    await expect(link).toHaveAttribute("aria-current", "page");
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);

    // Cada pestaña se ve completa dentro de la pantalla
    for (const other of await links.all()) {
      const box = (await other.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
      expect(await other.evaluate((a) => a.scrollWidth <= a.clientWidth)).toBe(true);
    }

    // Sin scroll horizontal de la página
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `scroll horizontal en ${name}`).toBeLessThanOrEqual(0);

    // Al final de la página, la barra no tapa el contenido
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const contentBottom = await page
      .getByRole("main")
      .evaluate((el) => (el.lastElementChild ?? el).getBoundingClientRect().bottom);
    const barTop = (await nav.boundingBox())!.y;
    expect(contentBottom, `la barra tapa el final de ${name}`).toBeLessThanOrEqual(barTop);
  }
}

test("el dueño ve sus 6 pestañas en la barra de abajo", async ({ page }) => {
  await loginAsDemo(page);
  await checkTabs(page, OWNER_TABS);
});

test("el profesional ve sus 4 pestañas en la barra de abajo", async ({ page }) => {
  await loginAsStaff(page);
  await checkTabs(page, STAFF_TABS);
});

test("en la Agenda el día cabe en una fila y los botones de la reserva son cómodos", async ({
  page,
}) => {
  const date = workdayFrom(17);
  const customer = `Celular E2E ${Date.now().toString(36)}`;
  await bookFirstSlot(page, {
    category: "Pelo",
    service: "Lavado y peinado",
    date,
    customer,
  });

  await loginAsDemo(page);
  await page.goto(`/dashboard/agenda?date=${date}`);
  const card = page.getByRole("listitem").filter({ hasText: customer });
  const filterSelect = page.getByRole("combobox", { name: "Profesional" });
  await expect(card).toBeVisible();
  await expect(filterSelect).toBeVisible();

  // ← día → Hoy en una sola fila, dentro de la pantalla
  const controls = [
    page.getByRole("button", { name: "Día anterior" }),
    page.getByLabel("Día", { exact: true }),
    page.getByRole("button", { name: "Día siguiente" }),
    page.getByRole("button", { name: "Hoy" }),
  ];
  const boxes = await Promise.all(controls.map(async (c) => (await c.boundingBox())!));
  for (const box of boxes) {
    expect(Math.abs(box.y - boxes[0].y)).toBeLessThanOrEqual(2);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
  }
  // El filtro de profesionales va debajo, a todo el ancho
  const filter = (await filterSelect.boundingBox())!;
  expect(filter.y).toBeGreaterThan(boxes[0].y + boxes[0].height);
  expect(filter.width).toBeGreaterThan(300);

  // "Actualizar" con su texto, debajo del filtro, junto a la hora de la
  // última carga (la agenda no está en vivo)
  const refresh = page.getByRole("button", { name: "Actualizar" });
  await expect(refresh).toHaveText("Actualizar");
  const refreshBox = (await refresh.boundingBox())!;
  expect(refreshBox.y).toBeGreaterThan(filter.y + filter.height);
  expect(refreshBox.height).toBeGreaterThanOrEqual(40);
  expect(refreshBox.x + refreshBox.width).toBeLessThanOrEqual(375);
  await expect(page.getByText(/^Actualizada a las \d{2}:\d{2}$/)).toBeVisible();

  // Los tres botones de la reserva en una fila y de al menos 40 px de alto
  const buttons = ["Completada", "No se presentó", "Cancelar"].map((name) =>
    card.getByRole("button", { name }),
  );
  const first = (await buttons[0].boundingBox())!;
  for (const button of buttons) {
    const box = (await button.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(40);
    expect(Math.abs(box.y - first.y)).toBeLessThanOrEqual(1);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
  }

  // Deja la reserva cerrada (no se puede borrar desde la API). Completada
  // siempre pasa por el diálogo que avisa al cliente
  await card.getByRole("button", { name: "Completada" }).click();
  const dialog = page.getByRole("dialog", { name: "Avisar que está listo" });
  await dialog.getByRole("button", { name: "Completar y avisar" }).click();
  await expect(dialog).toBeHidden();
  await expect(card).toContainText("Completada");
  await expect(card.getByRole("button", { name: "Cancelar" })).toHaveCount(0);
});

// Visible sin bajar: dentro de la pantalla y por encima de la barra de abajo
async function expectAboveTabBar(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  const box = (await target.boundingBox())!;
  const barTop = (await page.getByRole("navigation").boundingBox())!.y;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(barTop);
}

test("en Servicios la lista se ve sin bajar y el formulario abre y cierra", async ({
  page,
}) => {
  await loginAsDemo(page);
  await page.goto("/dashboard/services");

  // Cerrado: el primer servicio del seed se ve sin bajar
  const firstRow = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: "Editar" }) })
    .first();
  await expectAboveTabBar(page, firstRow);
  const form = page.locator("form").filter({ hasText: "Nuevo servicio" });
  await expect(form).toHaveCount(0);

  // Abre; "Cancelar" lo cierra y lo deja vacío
  await page.getByRole("button", { name: "Nuevo servicio" }).click();
  const name = form.getByRole("textbox", { name: /^Nombre/ });
  await name.fill("No se guarda");
  await form.getByRole("button", { name: "Cancelar" }).click();
  await expect(form).toHaveCount(0);
  await page.getByRole("button", { name: "Nuevo servicio" }).click();
  await expect(name).toHaveValue("");
  await form.getByRole("button", { name: "Cancelar" }).click();
  await expectAboveTabBar(page, firstRow);
});

test("en Horario el dueño ve 'Guardar horario' sin bajar y no tapa al domingo", async ({
  page,
}) => {
  await loginAsDemo(page);
  await page.goto("/dashboard/hours");
  const domingo = page.getByRole("listitem").filter({ hasText: "Domingo" });
  await expect(domingo).toBeVisible();

  const save = page.getByRole("button", { name: "Guardar horario" });
  await expectAboveTabBar(page, save);

  // Al final de la página, el domingo queda por encima de la barra del botón
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const sunday = (await domingo.boundingBox())!;
  const saveTop = (await save.boundingBox())!.y;
  expect(sunday.y + sunday.height).toBeLessThan(saveTop);
});

test("en Equipo los botones de cada tarjeta van debajo y son cómodos", async ({
  page,
}) => {
  await loginAsDemo(page);
  await page.goto("/dashboard/team");

  // Camila (2 botones) y Diego (3) se ven iguales: botones bajo el nombre
  for (const name of ["Camila", "Diego"]) {
    const card = page.getByRole("listitem").filter({ hasText: name });
    // La primera línea: nombre, "(tú)" y la etiqueta del rol
    const title = (await card.locator("p").first().boundingBox())!;
    // "Horario" es un enlace con forma de botón, no un botón dentro de un enlace
    const actions = [
      card.getByRole("link", { name: "Horario" }),
      card.getByRole("button", { name: "Editar" }),
    ];
    for (const action of actions) {
      const box = (await action.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(40);
      expect(box.y).toBeGreaterThan(title.y + title.height);
      expect(box.x + box.width).toBeLessThanOrEqual(375);
    }
  }
  await expect(page.locator("a button")).toHaveCount(0);
});
