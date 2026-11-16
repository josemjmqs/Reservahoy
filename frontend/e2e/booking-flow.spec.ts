import { expect, test } from "@playwright/test";
import {
  bookFirstSlot,
  DEMO,
  loginAsDemo,
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

// Tocar un servicio abre su detalle (foto y descripción) sin elegirlo: se elige
// con "Seleccionar" y se quita con "Quitar"
test("tocar un servicio muestra su detalle y se elige con Seleccionar", async ({
  page,
}) => {
  await page.goto(`/${DEMO.slug}`);
  const category = page.getByRole("button", { name: /^Pelo/ });
  if ((await category.getAttribute("aria-expanded")) === "false")
    await category.click();

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
});

// En la barra de abajo, tocar los servicios elegidos despliega qué se está
// reservando (cada servicio con su duración y precio) y permite quitarlos
test("la barra de abajo muestra el detalle de lo elegido", async ({ page }) => {
  await page.goto(`/${DEMO.slug}`);
  const category = page.getByRole("button", { name: /^Pelo/ });
  if ((await category.getAttribute("aria-expanded")) === "false")
    await category.click();

  for (const name of [/^Corte de pelo/, /^Lavado y peinado/]) {
    await page.getByRole("button", { name }).click();
    await page.getByRole("button", { name: "Seleccionar", exact: true }).click();
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
