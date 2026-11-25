import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { closeDb, createInvitation, deleteMember } from "./db";
import {
  AUTH_FILE,
  DEMO,
  loginAsDemo,
  loginAsStaff,
  openSlots,
  workdayFrom,
} from "./helpers";

// Cada página se ve completa en celulares de todo tamaño, sin zoom.
// - Anchos: 280 (pantalla de afuera de un plegable), 320 (iPhone SE de primera
//   generación, o un Android con la letra o la pantalla en "grande": Chrome
//   agranda la página y la deja más angosta), 360 y 412 (Android comunes), y
//   el celular de lado (740 × 360)
// - isMobile: el navegador respeta la etiqueta viewport como un teléfono. Si
//   algo no cabe, la página queda más ancha que la pantalla y el teléfono la
//   muestra achicada o cortada
// - Campos de 16 px o más: con menos, Safari en iPhone agranda la página al
//   tocar el campo y no la vuelve a achicar. Playwright no reproduce ese zoom,
//   así que se revisa el tamaño de la letra
// - Corre en Chromium (Android) y en WebKit (el motor de Safari en iPhone):
//   proyectos `chromium` y `webkit` de playwright.config.ts
// - Los diálogos (horas, color, completar y cancelar una reserva) caben en la
//   pantalla, también de lado
// En los teléfonos de verdad, OverflowWatch avisa a Sentry lo que esto no vio

const WIDTHS = [280, 320, 360, 412];
const LANDSCAPE = { width: 740, height: 360 };

const PUBLIC_PAGES = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password?token=e2e",
  "/privacidad",
  "/terminos",
  `/${DEMO.slug}`,
];
const OWNER_PAGES = [
  "/dashboard/agenda",
  "/dashboard/services",
  "/dashboard/team",
  "/dashboard/hours",
  "/dashboard/blocks",
  "/dashboard/settings",
  "/dashboard/support",
];
const STAFF_PAGES = [
  "/dashboard/agenda",
  "/dashboard/hours",
  "/dashboard/blocks",
  "/dashboard/settings",
  "/dashboard/support",
];

// Lo que se sale por la derecha de la pantalla (vacío si todo cabe). Nombra
// los elementos más adentro que se salen, sin contar lo fijo (como la barra de
// abajo), que se estira con la página cuando otra cosa la ensancha. La misma
// detección que findOverflow (src/lib/overflow.ts), contra el ancho pedido
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

async function check(page: Page, name: string) {
  const { width } = page.viewportSize()!;
  // Las páginas del panel cargan sus datos después: se espera a que llegue todo
  await page.waitForLoadState("networkidle");
  expect.soft(await overflow(page, width), `${name} se sale de lado a ${width} px`).toEqual([]);
  expect.soft(await smallFields(page), `${name}: campos con letra menor a 16 px`).toEqual([]);
  // El aviso de navegador antiguo (app/layout.tsx) no aparece en uno actual
  await expect.soft(page.locator(".old-browser"), "aviso de navegador antiguo").toBeHidden();
}

// Elegir una imagen para el logo abre el diálogo para encuadrarla (no se sube
// nada: checkDialog lo cierra con Esc). PNG de 1x1
const pickLogo = (page: Page) =>
  page.locator('input[type="file"]').setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    ),
  });

// Abre un diálogo, revisa que quepa entero en la pantalla y que su contenido no
// se salga de lado (si es más alto que la pantalla, se desplaza por dentro), y
// lo cierra con Esc
async function checkDialog(
  page: Page,
  open: Locator | (() => Promise<unknown>),
  name: string,
) {
  const { width, height } = page.viewportSize()!;
  await (typeof open === "function" ? open() : open.click());
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  // Algunos entran deslizándose desde abajo
  await page.waitForTimeout(400);
  const box = (await dialog.boundingBox())!;
  const where = `${name} a ${width}×${height}`;
  expect.soft(box.x, `${where}: se sale por la izquierda`).toBeGreaterThanOrEqual(-0.5);
  expect.soft(box.x + box.width, `${where}: se sale por la derecha`).toBeLessThanOrEqual(width + 0.5);
  expect.soft(box.y, `${where}: se sale por arriba`).toBeGreaterThanOrEqual(-0.5);
  expect.soft(box.y + box.height, `${where}: se sale por abajo`).toBeLessThanOrEqual(height + 0.5);
  expect
    .soft(await dialog.evaluate((d) => d.scrollWidth - d.clientWidth), `${where}: contenido más ancho`)
    .toBeLessThanOrEqual(0);
  expect.soft(await smallFields(page), `${where}: campos con letra menor a 16 px`).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
}

// Datos que comparten las pruebas: una reserva (para su enlace y para abrir
// sus diálogos en la Agenda sin cambiarla) y un profesional con una invitación
// vigente. Se crean una vez por navegador
const run = Date.now().toString(36);
const customer = `Celulares E2E ${run}`;
let booking = { date: "", manageToken: "" };
let invitee = { id: "", token: "" };
let owner: APIRequestContext;

test.beforeAll(async ({ playwright }, testInfo) => {
  owner = await playwright.request.newContext({
    baseURL: testInfo.project.use.baseURL,
    storageState: AUTH_FILE,
  });

  // Reserva por la API en el primer día con horas libres (se acumulan hasta el
  // próximo seed, como las de las otras pruebas)
  const business = await (await owner.get(`/api/public/${DEMO.slug}`)).json();
  const service = business.services.find((s: { name: string }) => s.name === "Corte de pelo");
  for (let days = 40; !booking.manageToken && days < 70; days++) {
    const date = workdayFrom(days);
    const { slots } = await (
      await owner.get(`/api/public/${DEMO.slug}/availability?serviceId=${service.id}&date=${date}`)
    ).json();
    if (!slots.length) continue;
    const res = await owner.post(`/api/public/${DEMO.slug}/bookings`, {
      data: {
        serviceId: service.id,
        startsAt: slots[0],
        name: customer,
        email: `e2e-celulares-${run}@ejemplo.cl`,
      },
    });
    expect(res.status()).toBe(201);
    booking = { date, manageToken: (await res.json()).manageToken };
  }
  expect(booking.manageToken, "debería haber horas libres").toBeTruthy();

  const member = await owner.post("/api/members", {
    data: { displayName: `E2E Celular ${run}` },
  });
  expect(member.status()).toBe(201);
  invitee.id = (await member.json()).id;
  invitee.token = await createInvitation(invitee.id, `e2e-celular-${run}@test.local`);
});

// Deja el negocio demo sin el profesional de prueba
test.afterAll(async () => {
  if (invitee.id) await deleteMember(invitee.id);
  await closeDb();
  await owner?.dispose();
  booking = { date: "", manageToken: "" };
  invitee = { id: "", token: "" };
});

async function bookingForm(page: Page) {
  // El formulario con nombre, teléfono y correo aparece al elegir una hora
  await openSlots(page, {
    category: "Pelo",
    service: "Corte de pelo",
    date: workdayFrom(35),
  });
  await page.getByRole("button", { name: /^\d{1,2}:\d{2}/ }).first().click();
  await expect(page.getByLabel("Nombre")).toBeVisible();
  await check(page, "formulario de reserva");
}

async function agendaDialogs(page: Page) {
  await page.goto(`/dashboard/agenda?date=${booking.date}`);
  const card = page.getByRole("listitem").filter({ hasText: customer });
  await expect(card).toBeVisible();
  await check(page, "Agenda con reservas");
  await checkDialog(page, card.getByRole("button", { name: "Completada" }), "Completar reserva");
  await checkDialog(page, card.getByRole("button", { name: "Cancelar" }), "Cancelar reserva");
}

async function hoursDialog(page: Page) {
  await page.goto("/dashboard/hours");
  await checkDialog(page, page.getByLabel("Lunes: apertura"), "Elegir hora");
}

for (const width of WIDTHS) {
  test.describe(`${width} px`, () => {
    test.use({ viewport: { width, height: 740 }, isMobile: true, hasTouch: true });
    // Recorre varias páginas en cada prueba
    test.setTimeout(120_000);

    test("páginas públicas, formulario de reserva, enlace e invitación", async ({ page }) => {
      for (const path of PUBLIC_PAGES) {
        await page.goto(path);
        await check(page, path);
      }
      await bookingForm(page);

      await page.goto(`/reserva/${booking.manageToken}`);
      await expect(page.getByRole("heading", { name: "Tu reserva" })).toBeVisible();
      await check(page, "enlace de la reserva");

      await page.goto(`/invitacion/${invitee.token}`);
      await expect(page.getByRole("heading", { name: "Únete a Peluquería Demo" })).toBeVisible();
      await check(page, "invitación");
    });

    test("panel del dueño y sus diálogos", async ({ page }) => {
      await loginAsDemo(page);
      for (const path of OWNER_PAGES) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await check(page, path);
      }
      await agendaDialogs(page);
      await hoursDialog(page);
      await page.goto("/dashboard/settings");
      await checkDialog(page, page.getByRole("button", { name: "Otro color" }), "Otro color");
      await checkDialog(page, () => pickLogo(page), "Ajustar logo");
    });

    test("panel del profesional", async ({ page }) => {
      await loginAsStaff(page);
      for (const path of STAFF_PAGES) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await check(page, `${path} (profesional)`);
      }
    });
  });
}

test.describe("celular de lado", () => {
  test.use({ viewport: LANDSCAPE, isMobile: true, hasTouch: true });
  test.setTimeout(120_000);

  test("página pública, reserva y panel", async ({ page }) => {
    await page.goto(`/${DEMO.slug}`);
    await check(page, "página pública");
    await bookingForm(page);

    await loginAsDemo(page);
    await agendaDialogs(page);
    await hoursDialog(page);
    await page.goto("/dashboard/settings");
    await checkDialog(page, () => pickLogo(page), "Ajustar logo");
  });
});
