import { expect, test, type Page } from "@playwright/test";
import { AUTH_FILE, loginAsDemo, loginAsStaff, STAFF } from "./helpers";

// El panel según el rol: el profesional demo (Diego, STAFF) ve solo lo que
// puede hacer; el dueño sigue viendo todo

const tabNames = async (page: Page) =>
  (await page.getByRole("navigation").getByRole("link").allTextContents()).map(
    (t) => t.trim(),
  );

test("el profesional ve solo sus pestañas y las del dueño lo llevan a la Agenda", async ({
  page,
}) => {
  await loginAsStaff(page);
  expect(await tabNames(page)).toEqual([
    "Agenda",
    "Horario",
    "Bloqueos",
    "Ajustes",
  ]);
  await expect(
    page.getByRole("link", { name: "Ver la página del negocio ↗" }),
  ).toBeVisible();

  for (const path of ["/dashboard/team", "/dashboard/services"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/dashboard\/agenda$/);
    await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
  }
});

test("el dueño ve todas las pestañas", async ({ page }) => {
  await loginAsDemo(page);
  expect(await tabNames(page)).toEqual([
    "Agenda",
    "Servicios",
    "Equipo",
    "Horario",
    "Bloqueos",
    "Ajustes",
  ]);
  await expect(
    page.getByRole("link", { name: "Ver mi página pública ↗" }),
  ).toBeVisible();
});

test("el profesional ve solo su agenda y su horario, sin poder cambiarlo", async ({
  page,
}) => {
  await loginAsStaff(page);
  // Sin el filtro de profesionales (con el dueño sí aparece: prueba siguiente)
  await expect(page.getByRole("combobox")).toHaveCount(0);

  await page.getByRole("link", { name: "Horario" }).click();
  await expect(
    page.getByRole("heading", { name: `Mi horario · ${STAFF.name}` }),
  ).toBeVisible();
  await expect(page.getByText("Tu horario lo define el dueño")).toBeVisible();
  const days = page.getByRole("checkbox");
  await expect(days).toHaveCount(7);
  for (const day of await days.all()) await expect(day).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Guardar horario" }),
  ).toHaveCount(0);
});

test("el dueño filtra la agenda por profesional y su horario lleva su nombre", async ({
  page,
}) => {
  await loginAsDemo(page);
  await expect(
    page.getByRole("combobox").getByRole("option", {
      name: "Todos los profesionales",
    }),
  ).toBeAttached();

  await page.getByRole("link", { name: "Horario" }).click();
  await expect(
    page.getByRole("heading", { name: "Horario de atención · Camila" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Guardar horario" }),
  ).toBeVisible();
});

test("el profesional bloquea y borra solo lo suyo, y ve los bloqueos del negocio", async ({
  page,
  playwright,
}, testInfo) => {
  const run = Date.now().toString(36);
  // Un bloqueo de todo el negocio, creado por el dueño
  const owner = await playwright.request.newContext({
    baseURL: testInfo.project.use.baseURL,
    storageState: AUTH_FILE,
  });
  const res = await owner.post("/api/time-blocks", {
    data: {
      startDate: "2032-03-10",
      endDate: "2032-03-10",
      allDay: true,
      reason: `E2E negocio ${run}`,
    },
  });
  expect(res.status()).toBe(201);
  const businessBlock = (await res.json()).id;

  try {
    await loginAsStaff(page);
    await page.getByRole("link", { name: "Bloqueos" }).click();
    await expect(page.getByText("no se ofrecen horas contigo")).toBeVisible();
    await expect(page.getByText("Aplica a")).toHaveCount(0);

    const rows = page.getByRole("listitem");
    const shared = rows.filter({ hasText: `Todo el negocio · E2E negocio ${run}` });
    await expect(shared).toBeVisible();
    await expect(shared.getByRole("button", { name: "Eliminar" })).toHaveCount(0);

    // Bloquea un día suyo: queda con su nombre y lo puede eliminar
    await page.getByPlaceholder("Vacaciones, feriado, trámite...").fill(`E2E propio ${run}`);
    await page.locator('input[type="date"]').first().fill("2032-03-11");
    await page.getByRole("button", { name: "Bloquear" }).click();
    const own = rows.filter({ hasText: `${STAFF.name} · E2E propio ${run}` });
    await expect(own).toBeVisible();
    await own.getByRole("button", { name: "Eliminar" }).click();
    await own.getByRole("button", { name: "Sí, eliminar" }).click();
    await expect(own).toHaveCount(0);
  } finally {
    await owner.delete(`/api/time-blocks/${businessBlock}`);
    await owner.dispose();
  }
});

test("en Ajustes el profesional ve solo su aviso, sin los datos del negocio", async ({
  page,
}) => {
  await loginAsStaff(page);
  await page.getByRole("link", { name: "Ajustes" }).click();
  await expect(page.getByText("un cliente reserva contigo")).toBeVisible();
  await expect(page.getByText("Datos del negocio")).toHaveCount(0);
  await expect(page.getByLabel("Nombre del negocio")).toHaveCount(0);
});
