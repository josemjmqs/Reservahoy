import { expect, test, type Page } from "@playwright/test";
import { loginAsDemo, loginAsStaff } from "./helpers";

// El panel en un celular (375 px, el ancho de un iPhone chico): la navegación
// es una barra fija abajo con todas las pestañas a la vista, y ninguna
// pantalla se sale de lado

test.use({ viewport: { width: 375, height: 812 } });

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
