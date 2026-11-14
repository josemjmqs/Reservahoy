import { expect, test, type Page } from "@playwright/test";
import { loginAsDemo, loginAsStaff } from "./helpers";

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
