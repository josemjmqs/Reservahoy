import { expect, test, type Page } from "@playwright/test";
import {
  bookFirstSlot,
  DEMO,
  loginAsDemo,
  openSlots,
  STAFF,
  workdayFrom,
} from "./helpers";

// Lo que de verdad le importa a un negocio: un cliente reserva desde la página
// pública y el dueño la ve en su agenda. Usa el negocio demo del seed.
test("un cliente reserva desde la página pública y el dueño la ve en su agenda", async ({
  page,
}) => {
  const date = workdayFrom(9);
  const customer = `Cliente E2E ${Date.now().toString(36)}`;

  // 1. Cliente: elige servicio, día y hora, y reserva sin cuenta
  const time = await bookFirstSlot(page, {
    category: "Pelo",
    service: "Corte de pelo",
    date,
    customer,
  });

  // 2. Dueño: inicia sesión y la ve en la agenda de ese día
  await loginAsDemo(page);
  await page.goto(`/dashboard/agenda?date=${date}`);
  const card = page.getByRole("listitem").filter({ hasText: customer });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Corte de pelo");
  await expect(card).toContainText("Confirmada");
  await expect(card).toContainText(time);
});

// Si más de un profesional hace el servicio, el cliente puede elegir con quién
test("el cliente elige con qué profesional reserva", async ({ page }) => {
  const date = workdayFrom(11);
  const customer = `Con Diego E2E ${Date.now().toString(36)}`;

  await bookFirstSlot(page, {
    category: "Pelo",
    service: "Corte de pelo",
    date,
    customer,
    member: STAFF.name,
  });

  await loginAsDemo(page);
  await page.goto(`/dashboard/agenda?date=${date}`);
  const card = page.getByRole("listitem").filter({ hasText: customer });
  await expect(card).toContainText(`Con ${STAFF.name}`);
});

// Cambia los servicios que recibe la página pública (los del seed no tienen
// foto ni descripción). Solo la respuesta: el negocio demo no cambia
async function patchPublicServices(
  page: Page,
  patch: (
    services: {
      name: string;
      description: string | null;
      imageUrl: string | null;
    }[],
  ) => unknown[],
) {
  await page.route(`**/api/public/${DEMO.slug}`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      json: { ...body, services: patch(body.services) },
    });
  });
}

async function openPelo(page: Page) {
  await page.goto(`/${DEMO.slug}`);
  const category = page.getByRole("button", { name: /^Pelo/ });
  if ((await category.getAttribute("aria-expanded")) === "false")
    await category.click();
}

// La categoría muestra los nombres de sus servicios. Las miniaturas van por
// categoría: donde algún servicio tiene foto, los demás muestran su inicial;
// una categoría sin fotos va sin recuadros
test("las categorías muestran sus servicios y las miniaturas solo donde hay fotos", async ({
  page,
}) => {
  const photo = "https://fotos.e2e.test/corte.png";
  await page.route(photo, (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>',
    }),
  );
  await patchPublicServices(page, (services) =>
    services.map((s) =>
      s.name === "Corte de pelo" ? { ...s, imageUrl: photo } : s,
    ),
  );
  await openPelo(page);

  await expect(page.getByRole("button", { name: /^Barba/ })).toContainText(
    "Perfilado de barba",
  );

  // Pelo tiene una foto: "Lavado y peinado" muestra su inicial
  const pelo = page.locator("#category-Pelo");
  await expect(pelo.locator(`img[src="${photo}"]`)).toBeVisible();
  await expect(pelo.getByText("L", { exact: true })).toBeVisible();

  // Barba no tiene fotos: sin recuadro con la inicial
  await page.getByRole("button", { name: /^Barba/ }).click();
  const barba = page.locator("#category-Barba");
  await expect(
    barba.getByRole("button", { name: /^Perfilado de barba/ }),
  ).toBeVisible();
  await expect(barba.getByText("P", { exact: true })).toHaveCount(0);
});

// Con el máximo elegido, el detalle de otro servicio tiene "Seleccionar"
// deshabilitado y explica por qué no se puede sumar
test("con el máximo elegido, otro servicio explica por qué no se suma", async ({
  page,
}) => {
  // dos servicios más en Pelo para llegar al máximo (5) y que sobre uno
  await patchPublicServices(page, (services) => [
    ...services,
    { ...services[0], id: "e2e-extra-1", name: "Extra uno", category: "Pelo" },
    { ...services[0], id: "e2e-extra-2", name: "Extra dos", category: "Pelo" },
  ]);
  await openPelo(page);
  const select = page.getByRole("button", { name: "Seleccionar", exact: true });
  for (const name of [
    /^Corte de pelo/,
    /^Color completo/,
    /^Lavado y peinado/,
    /^Extra uno/,
    /^Extra dos/,
  ]) {
    await page.getByRole("button", { name }).click();
    await select.click();
  }

  await page.getByRole("button", { name: /^Barba/ }).click();
  const row = page.getByRole("button", { name: /^Perfilado de barba/ });
  await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await expect(select).toBeDisabled();
  await expect(page.getByText("Ya elegiste el máximo")).toBeVisible();
});

// Tocar un servicio abre su detalle (foto y descripción) sin elegirlo: se elige
// con "Seleccionar" y se quita con "Quitar" o tocando el check de la fila
test("tocar un servicio muestra su detalle y se elige con Seleccionar", async ({
  page,
}) => {
  await openPelo(page);

  const row = page.getByRole("button", { name: /^Corte de pelo/ });
  const select = page.getByRole("button", { name: "Seleccionar", exact: true });
  const seeTimes = page.getByRole("link", { name: "Ver horas" });

  await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await expect(select).toBeVisible();
  await expect(seeTimes).toHaveCount(0);

  // abrir otro servicio cierra el anterior: un solo detalle a la vez
  await page.getByRole("button", { name: /^Lavado y peinado/ }).click();
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await expect(select).toHaveCount(1);

  // tocar el detalle fuera de sus botones lo cierra sin elegir
  await row.click();
  const detail = page.locator(`#${await row.getAttribute("aria-controls")}`);
  await detail.click({ position: { x: 4, y: 4 } });
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await expect(seeTimes).toHaveCount(0);

  await row.click();
  await select.click();
  await expect(seeTimes).toBeVisible();
  await expect(row).toHaveAttribute("aria-expanded", "false");

  await row.click();
  await page.getByRole("button", { name: "Quitar", exact: true }).click();
  await expect(seeTimes).toHaveCount(0);

  // el check de un servicio elegido lo quita sin abrir su detalle
  await row.click();
  await select.click();
  await expect(seeTimes).toBeVisible();
  await page.getByRole("button", { name: "Desmarcar Corte de pelo" }).click();
  await expect(seeTimes).toHaveCount(0);
  await expect(row).toHaveAttribute("aria-expanded", "false");
});

// En la barra de abajo, tocar los servicios elegidos despliega qué se está
// reservando (cada servicio con su duración y precio) y permite quitarlos
// En el celular "Tus datos" queda debajo de la grilla de horas, fuera de la
// pantalla: al tocar una hora la página baja hasta ahí
test("elegir una hora lleva a Tus datos", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const [time] = await openSlots(page, {
    category: "Pelo",
    service: "Corte de pelo",
    date: workdayFrom(10),
  });
  expect(time, "debería haber horas libres ese día").toBeTruthy();

  await page.getByRole("button", { name: time, exact: true }).click();
  const heading = page.getByRole("heading", { name: "Tus datos" });
  await expect(heading).toBeInViewport();
  await expect(page.getByLabel("Nombre")).toBeInViewport();
});

test("la barra de abajo muestra el detalle de lo elegido", async ({ page }) => {
  await page.goto(`/${DEMO.slug}`);
  const category = page.getByRole("button", { name: /^Pelo/ });
  if ((await category.getAttribute("aria-expanded")) === "false")
    await category.click();

  for (const name of [/^Corte de pelo/, /^Lavado y peinado/]) {
    await page.getByRole("button", { name }).click();
    await page
      .getByRole("button", { name: "Seleccionar", exact: true })
      .click();
  }

  const toggle = page.getByRole("button", {
    name: "Lo que estás reservando: Corte de pelo + Lavado y peinado",
  });
  const details = page.locator("#booking-details");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(details).toContainText("Corte de pelo");
  await expect(details).toContainText("Lavado y peinado");
  await expect(details).toContainText("Se hacen seguidos");

  // quitar uno desde el detalle lo saca de la reserva
  await page.getByRole("button", { name: "Quitar Lavado y peinado" }).click();
  await expect(details).not.toContainText("Lavado y peinado");
  await expect(details).not.toContainText("Se hacen seguidos");

  // Escape lo cierra
  await page.keyboard.press("Escape");
  await expect(details).toHaveCount(0);
});
