import { expect, test as setup, type Page } from "@playwright/test";
import { AUTH_FILE, DEMO, STAFF, STAFF_AUTH_FILE } from "./helpers";

// Inicia sesión una vez con cada usuario demo (desde la pantalla de login) y
// guarda la sesión para las pruebas que la necesitan: el login admite 5 por
// minuto y varias pruebas usan estas sesiones
async function loginAndSave(page: Page, email: string, file: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(DEMO.password);
  await page.locator('input[type="password"]').press("Enter");
  await page.waitForURL("**/dashboard/**");
  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
  await page.context().storageState({ path: file });
}

setup("el dueño demo inicia sesión", async ({ page }) => {
  await loginAndSave(page, DEMO.email, AUTH_FILE);
});

setup("el profesional demo inicia sesión", async ({ page }) => {
  await loginAndSave(page, STAFF.email, STAFF_AUTH_FILE);
});
