import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  DEMO,
  loginAsDemo,
  loginAsStaff,
  openSlots,
  workdayFrom,
} from "./helpers";

// Logo y color de marca del negocio: el dueño los elige en Ajustes y la página
// pública los usa. En CI no hay R2, así que la subida real del logo responde
// 503: la vista previa y la página pública con logo se prueban simulando la
// respuesta de la API (la subida y sus permisos los cubren las pruebas de integración)

const TEAL = "#0f766e"; // texto blanco
const YELLOW = "#fde047"; // claro: texto oscuro
const rgb = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
};
// Botón de la grilla de días ("lunes, 17 de noviembre"), no el del servicio
const DAY = /^\S+,? \d{1,2} de \S+$/;
const WHITE = "rgb(255, 255, 255)";
const DARK = rgb("#111827");

// PNG de 1x1 válido: el navegador lo reduce antes de subirlo
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

// Colores de un elemento, esperando a que termine la transición de color
const expectColors = (el: Locator, expected: { bg?: string; fg?: string }) =>
  expect
    .poll(() =>
      el.evaluate((node) => {
        const s = getComputedStyle(node);
        return { bg: s.backgroundColor, fg: s.color };
      }),
    )
    .toMatchObject(expected);

const pressed = (page: Page, name: RegExp) =>
  page.getByRole("button", { name, pressed: true }).first();
const TIME = /^\d{1,2}:\d{2}/;

test("el color de marca reemplaza al índigo en la página pública, con texto legible", async ({
  page,
}) => {
  await loginAsDemo(page);
  await page.goto("/dashboard/settings");
  const color = page.getByLabel("Color de tu página");
  await expect(color).toHaveValue("");

  // Un color sugerido llena el campo y queda marcado (sin guardar)
  const sage = page.getByRole("button", { name: "Salvia" });
  await sage.click();
  await expect(color).toHaveValue("#5b7560");
  await expect(sage).toHaveAttribute("aria-pressed", "true");

  try {
    await color.fill(TEAL.toUpperCase());
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Guardado." }),
    ).toBeVisible();
    await expect(color).toHaveValue(TEAL); // se guarda en minúsculas

    // dentro de las dos semanas de la grilla de días; no reserva nada
    const date = workdayFrom(5);
    await openSlots(page, { category: "Pelo", service: "Corte de pelo", date });
    await expectColors(pressed(page, DAY), { bg: rgb(TEAL), fg: WHITE });
    await expectColors(page.getByRole("link", { name: "Ver horas" }), {
      bg: rgb(TEAL),
      fg: WHITE,
    });

    await page.getByRole("button", { name: TIME }).first().click();
    await expectColors(pressed(page, TIME), { bg: rgb(TEAL), fg: WHITE });
    await expectColors(
      page.getByRole("button", { name: "Confirmar reserva" }),
      {
        bg: rgb(TEAL),
        fg: WHITE,
      },
    );

    // Un color claro lleva texto oscuro
    await page.request.patch("/api/business", {
      data: { brandColor: YELLOW },
    });
    await openSlots(page, { category: "Pelo", service: "Corte de pelo", date });
    await expectColors(pressed(page, DAY), { bg: rgb(YELLOW), fg: DARK });

    // Volver al color de Reservahoy (índigo)
    await page.goto("/dashboard/settings");
    await page.getByRole("button", { name: "Usar el de Reservahoy" }).click();
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Guardado." }),
    ).toBeVisible();
    await openSlots(page, { category: "Pelo", service: "Corte de pelo", date });
    await expectColors(pressed(page, DAY), { bg: rgb("#4f46e5"), fg: WHITE });
  } finally {
    // Deja el negocio demo como estaba
    await page.request.patch("/api/business", { data: { brandColor: null } });
  }
});

test("un color con otro formato se rechaza con un mensaje claro", async ({
  page,
}) => {
  await loginAsDemo(page);
  const res = await page.request.patch("/api/business", {
    data: { brandColor: "red" },
  });
  expect(res.status()).toBe(400);
  expect(JSON.stringify(await res.json())).toContain("#RRGGBB");
});

test("el profesional no ve el logo ni el color, y la API no lo deja cambiarlos", async ({
  page,
}) => {
  await loginAsStaff(page);
  await page.goto("/dashboard/settings");
  await expect(page.getByText("Notificaciones")).toBeVisible();
  await expect(page.getByRole("button", { name: /logo/ })).toHaveCount(0);
  await expect(page.getByLabel("Color de tu página")).toHaveCount(0);

  const upload = await page.request.post("/api/business/logo", {
    multipart: {
      logo: { name: "logo.png", mimeType: "image/png", buffer: PNG },
    },
  });
  expect(upload.status()).toBe(403);
  expect((await page.request.delete("/api/business/logo")).status()).toBe(403);
  expect(
    (
      await page.request.patch("/api/business", {
        data: { brandColor: TEAL },
      })
    ).status(),
  ).toBe(403);
});

test("el dueño sube y quita el logo, y la página pública lo muestra en vez de las iniciales", async ({
  page,
}) => {
  await loginAsDemo(page);
  const logoUrl = `data:image/png;base64,${PNG.toString("base64")}`;
  const requests: string[] = [];
  // Sin R2 la API respondería 503: se simula la respuesta del bucket. Solo
  // importa logoUrl; el negocio demo no cambia
  await page.route("**/api/business/logo", async (route) => {
    const method = route.request().method();
    requests.push(method);
    await route.fulfill({
      json: { logoUrl: method === "POST" ? logoUrl : null },
    });
  });

  await page.goto("/dashboard/settings");
  await expect(page.getByText("Sin logo")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(
    page.getByRole("img", { name: "Logo del negocio" }),
  ).toHaveAttribute("src", logoUrl);
  await page.getByRole("button", { name: "Quitar" }).click();
  await expect(page.getByText("Sin logo")).toBeVisible();
  expect(requests).toEqual(["POST", "DELETE"]);

  // Sin logo, la página pública muestra las iniciales; con logo, la imagen
  await page.goto(`/${DEMO.slug}`);
  await expect(page.getByText("PD", { exact: true })).toBeVisible();
  await page.route(`**/api/public/${DEMO.slug}`, async (route) => {
    const res = await route.fetch();
    await route.fulfill({
      response: res,
      json: { ...(await res.json()), logoUrl },
    });
  });
  await page.reload();
  await expect(
    page.getByRole("img", { name: "Logo de Peluquería Demo" }),
  ).toBeVisible();
  await expect(page.getByText("PD", { exact: true })).toHaveCount(0);
});
