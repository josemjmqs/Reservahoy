import { expect, test, type Page } from "@playwright/test";
import { loginAsDemo, loginAsStaff, STAFF } from "./helpers";

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
