import { expect, test, type Page } from "@playwright/test";
import { DEMO, loginAsDemo, openSlots, workdayFrom } from "./helpers";

// Cada página se ve completa en celulares de todo tamaño, sin zoom.
// - Anchos: 280 (pantalla de afuera de un plegable), 320 (iPhone SE de primera
//   generación, o un Android con la letra o la pantalla en "grande": Chrome
//   agranda la página y la deja más angosta), 360 y 412 (Android comunes)
// - isMobile: el navegador respeta la etiqueta viewport como un teléfono. Si
//   algo no cabe, la página queda más ancha que la pantalla y el teléfono la
//   muestra achicada o cortada
// - Campos de 16 px o más: con menos, Safari en iPhone agranda la página al
//   tocar el campo y no la vuelve a achicar. Playwright no reproduce ese zoom
//   (en CI solo hay Chromium), así que se revisa el tamaño de la letra

const WIDTHS = [280, 320, 360, 412];

const PUBLIC_PAGES = ["/", "/login", "/register", "/forgot-password", `/${DEMO.slug}`];
const PANEL_PAGES = [
  "/dashboard/agenda",
  "/dashboard/services",
  "/dashboard/team",
  "/dashboard/hours",
  "/dashboard/blocks",
  "/dashboard/settings",
  "/dashboard/support",
];

// Lo que se sale por la derecha de la pantalla (vacío si todo cabe). Nombra
// los elementos más adentro que se salen, sin contar lo fijo (como la barra de
// abajo), que se estira con la página cuando otra cosa la ensancha
async function overflow(page: Page, width: number) {
  return page.evaluate((w) => {
    const out = document.documentElement.scrollWidth - w;
    if (out <= 0) return [];
    const sticksOut = (el: Element) => el.getBoundingClientRect().right > w + 0.5;
    const inFixed = (el: Element | null): boolean =>
      !!el && (getComputedStyle(el).position === "fixed" || inFixed(el.parentElement));
    return [...document.querySelectorAll("body *")]
      .filter((el) => sticksOut(el) && ![...el.children].some(sticksOut) && !inFixed(el))
      .slice(0, 3)
      .map((el) => `<${el.tagName.toLowerCase()} class="${el.getAttribute("class") ?? ""}">`)
      .concat(`${out}px de más`);
  }, width);
}

// Campos donde se escribe o se elige con letra menor a 16 px
async function smallFields(page: Page) {
  return page.evaluate(() =>
    [
      ...document.querySelectorAll(
        'input:not([type="checkbox"],[type="radio"],[type="range"],[type="file"],[type="hidden"]), select, textarea',
      ),
    ]
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => `${el.outerHTML.slice(0, 80)} (${getComputedStyle(el).fontSize})`),
  );
}

async function check(page: Page, path: string, width: number) {
  // Las páginas del panel cargan sus datos después: se espera a que llegue todo
  await page.waitForLoadState("networkidle");
  expect.soft(await overflow(page, width), `${path} se sale de lado a ${width} px`).toEqual([]);
  expect.soft(await smallFields(page), `${path}: campos con letra menor a 16 px`).toEqual([]);
}

for (const width of WIDTHS) {
  test.describe(`${width} px`, () => {
    test.use({ viewport: { width, height: 740 }, isMobile: true, hasTouch: true });
    // Recorre varias páginas en cada prueba
    test.setTimeout(120_000);

    test("páginas públicas y formulario de reserva", async ({ page }) => {
      for (const path of PUBLIC_PAGES) {
        await page.goto(path);
        await check(page, path, width);
      }

      // El formulario con nombre, teléfono y correo aparece al elegir una hora
      await openSlots(page, {
        category: "Pelo",
        service: "Corte de pelo",
        date: workdayFrom(35),
      });
      await page.getByRole("button", { name: /^\d{1,2}:\d{2}/ }).first().click();
      await expect(page.getByLabel("Nombre")).toBeVisible();
      await check(page, "formulario de reserva", width);
    });

    test("panel del dueño", async ({ page }) => {
      await loginAsDemo(page);
      for (const path of PANEL_PAGES) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await check(page, path, width);
      }
    });
  });
}
