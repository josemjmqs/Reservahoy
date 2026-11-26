import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  bookFirstSlot,
  loginAsDemo,
  openSlots,
  STAFF,
  workdayFrom,
} from "./helpers";

// La pantalla de Bloqueos del dueño: elige a quién se aplica ("Aplica a") y la
// página pública deja de ofrecer esas horas. (La del profesional, sin "Aplica
// a", está en staff-panel.spec.ts.)

const SERVICE = { category: "Cortes", service: "Corte de pelo" };
// Va en el motivo de cada bloqueo de este archivo
const run = Date.now().toString(36);

// Las pruebas eliminan sus bloqueos desde la pantalla; si una falla antes, se
// borran aquí por la API, para que no le quiten horas a las pruebas siguientes
test.afterEach(async ({ page }) => {
  const res = await page.request.get("/api/time-blocks");
  if (!res.ok()) return;
  const { blocks } = (await res.json()) as {
    blocks: { id: string; reason: string | null }[];
  };
  for (const b of blocks.filter((b) => b.reason?.endsWith(run)))
    await page.request.delete(`/api/time-blocks/${b.id}`);
});

async function openBlocks(page: Page) {
  await loginAsDemo(page);
  await page.getByRole("link", { name: "Bloqueos" }).click();
  await expect(
    page.getByText("no se ofrecen horas en tu página pública"),
  ).toBeVisible();
}

// Elimina un bloqueo con su confirmación
async function removeBlock(row: Locator) {
  await row.getByRole("button", { name: "Eliminar", exact: true }).click();
  await row.getByRole("button", { name: "Sí, eliminar" }).click();
  await expect(row).toHaveCount(0);
}

test("el dueño bloquea unos días a un profesional y solo él deja de recibir reservas", async ({
  page,
}) => {
  const date = workdayFrom(25);
  const end = new Date(`${date}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 2);

  await openBlocks(page);
  // "Aplica a" ofrece todo el negocio y a cada miembro activo
  const appliesTo = page.getByLabel("Aplica a");
  await expect(appliesTo).toHaveValue("");
  await expect(
    appliesTo.getByRole("option", { name: STAFF.name }),
  ).toBeAttached();
  await appliesTo.selectOption({ label: STAFF.name });
  await page
    .getByPlaceholder("Vacaciones, feriado, trámite...")
    .fill(`E2E vacaciones ${run}`);
  const [from, to] = await page.locator('input[type="date"]').all();
  await from.fill(date);
  await to.fill(end.toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Bloquear" }).click();

  const row = page
    .getByRole("listitem")
    .filter({ hasText: `${STAFF.name} · E2E vacaciones ${run}` });
  await expect(row).toBeVisible();
  await expect(row).toContainText(" al ");
  await expect(row).toContainText("Todo el día");

  // En la página pública no hay horas con él ese día, pero sí con la dueña
  expect(
    await openSlots(page, { ...SERVICE, date, member: STAFF.name }),
  ).toEqual([]);
  expect(
    (await openSlots(page, { ...SERVICE, date, member: "Camila" })).length,
  ).toBeGreaterThan(0);

  // Eliminar pide confirmación: con "No" el bloqueo sigue
  await openBlocks(page);
  await row.getByRole("button", { name: "Eliminar", exact: true }).click();
  await row.getByRole("button", { name: "No", exact: true }).click();
  await expect(
    row.getByRole("button", { name: "Eliminar", exact: true }),
  ).toBeVisible();
  await removeBlock(row);

  // Sin el bloqueo vuelve a tener horas
  expect(
    (await openSlots(page, { ...SERVICE, date, member: STAFF.name })).length,
  ).toBeGreaterThan(0);
});

test("al bloquear un día con reservas, avisa que no se cancelan solas", async ({
  page,
}) => {
  const date = workdayFrom(27);
  await bookFirstSlot(page, {
    ...SERVICE,
    date,
    customer: `Antes del bloqueo E2E ${run}`,
  });

  await openBlocks(page);
  // Lo que viene elegido: todo el negocio y el día completo
  await page
    .getByPlaceholder("Vacaciones, feriado, trámite...")
    .fill(`E2E feriado ${run}`);
  await page.locator('input[type="date"]').first().fill(date);
  await page.getByRole("button", { name: "Bloquear" }).click();

  const row = page
    .getByRole("listitem")
    .filter({ hasText: `Todo el negocio · E2E feriado ${run}` });
  await expect(row).toBeVisible();
  // (1 en una base recién sembrada; las reservas de pruebas anteriores se
  // acumulan hasta el próximo seed)
  await expect(
    page.getByText(/^Ojo: ya hay \d+ reservas? en ese período\. No se cancelan? solas?; revísalas? en la Agenda\.$/),
  ).toBeVisible();
  await removeBlock(row);
});
