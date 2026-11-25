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
const DARK = rgb("#16152b");

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
  // El código queda escondido hasta pedirlo
  const color = page.getByLabel("Código del color");
  await expect(color).toBeHidden();
  await page.getByText("Ya tengo el código de mi color").click();
  await expect(color).toHaveValue("");

  // Un color sugerido llena el código y queda marcado (sin guardar)
  const sage = page.getByRole("button", { name: "Salvia" });
  await sage.click();
  await expect(color).toHaveValue("#5b7560");
  await expect(sage).toHaveAttribute("aria-pressed", "true");

  // "Otro color" abre directo tono, saturación y brillo, partiendo del color
  // elegido; Cancelar no cambia nada y Listo deja de marcar el sugerido
  const other = page.getByRole("button", { name: "Otro color" });
  const picker = page.getByRole("dialog", { name: "Otro color" });
  await other.click();
  await expect(picker.getByLabel("Saturación")).toHaveValue("22"); // Salvia
  await picker.getByLabel("Tono").fill("0");
  await picker.getByRole("button", { name: "Cancelar" }).click();
  await expect(picker).toHaveCount(0);
  await expect(color).toHaveValue("#5b7560");
  // Listo sin mover nada deja el color exacto (sin redondeos)
  await other.click();
  await picker.getByRole("button", { name: "Listo" }).click();
  await expect(color).toHaveValue("#5b7560");

  await other.click();
  await picker.getByLabel("Tono").fill("210");
  await picker.getByLabel("Saturación").fill("100");
  await picker.getByLabel("Brillo").fill("50");
  await picker.getByRole("button", { name: "Listo" }).click();
  await expect(color).toHaveValue("#004080");
  await expect(sage).toHaveAttribute("aria-pressed", "false");

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
    await expectColors(pressed(page, DAY), { bg: rgb("#4f39f6"), fg: WHITE });
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
  await expect(page.getByText("Color de tu página")).toHaveCount(0);

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

test("el dueño sube y quita el logo, y la página pública lo muestra solo si hay uno", async ({
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
  // Antes de subirlo se encuadra en el círculo; cancelar no sube nada
  const cropper = page.getByRole("dialog", { name: "Ajustar logo" });
  await expect(cropper.getByText("Así se verá en tu página")).toBeVisible();
  await cropper.getByRole("button", { name: "Cancelar" }).click();
  await expect(cropper).toBeHidden();
  await expect(page.getByText("Sin logo")).toBeVisible();
  expect(requests).toEqual([]);

  await page.locator('input[type="file"]').setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await cropper.getByRole("button", { name: "Guardar logo" }).click();
  await expect(cropper).toBeHidden();
  await expect(
    page.getByRole("img", { name: "Logo del negocio" }),
  ).toHaveAttribute("src", logoUrl);
  await page.getByRole("button", { name: "Quitar" }).click();
  await expect(page.getByText("Sin logo")).toBeVisible();
  expect(requests).toEqual(["POST", "DELETE"]);

  // Sin logo, la página pública muestra solo el nombre (ni imagen ni
  // iniciales); con logo, la imagen junto al nombre
  await page.goto(`/${DEMO.slug}`);
  const header = page.locator("header").filter({
    has: page.getByRole("heading", { name: "Peluquería Demo" }),
  });
  await expect(header).toBeVisible();
  await expect(header.getByRole("img")).toHaveCount(0);
  await expect(header.getByText("PD", { exact: true })).toHaveCount(0);
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
});

test("el logo se sube recortado tal como se encuadró en el círculo", async ({
  page,
}) => {
  await loginAsDemo(page);
  await page.goto("/dashboard/settings");
  await expect(page.getByText("Sin logo")).toBeVisible();

  // Imagen apaisada (200 × 100): mitad izquierda roja, derecha azul
  const wide = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 100;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 100, 100);
    ctx.fillStyle = "#0000ff";
    ctx.fillRect(100, 0, 100, 100);
    return canvas.toDataURL("image/png").split(",")[1];
  });

  // Responde como logoUrl la imagen que se subió, para medirla en la página
  await page.route("**/api/business/logo", async (route) => {
    const req = route.request();
    const body = req.postDataBuffer()!;
    const boundary = `--${/boundary=(.+)$/.exec(req.headers()["content-type"])![1]}`;
    const start = body.indexOf("\r\n\r\n") + 4;
    const end = body.indexOf(`\r\n${boundary}`, start);
    const type = /Content-Type: (\S+)/i.exec(body.subarray(0, start).toString())![1];
    await route.fulfill({
      json: {
        logoUrl: `data:${type};base64,${body.subarray(start, end).toString("base64")}`,
      },
    });
  });

  await page.locator('input[type="file"]').setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: Buffer.from(wide, "base64"),
  });
  const cropper = page.getByRole("dialog", { name: "Ajustar logo" });
  const area = cropper.getByRole("group", { name: /Encuadre del logo/ });
  await expect(area.locator("img")).toBeVisible();
  // Arrastrar a la derecha deja a la vista solo la mitad izquierda (roja)
  const box = (await area.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await cropper.getByRole("button", { name: "Guardar logo" }).click();

  // Cuadrado de 512 px, rojo de un borde al otro
  const logo = page.getByRole("img", { name: "Logo del negocio" });
  await expect(logo).toHaveAttribute("src", /^data:image\//);
  const pixels = await logo.evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const at = (x: number) => [...ctx.getImageData(x, 256, 1, 1).data.slice(0, 3)];
    return { w: img.naturalWidth, h: img.naturalHeight, left: at(10), right: at(500) };
  });
  expect(pixels.w).toBe(512);
  expect(pixels.h).toBe(512);
  for (const [r, g, b] of [pixels.left, pixels.right]) {
    expect(r).toBeGreaterThan(200);
    expect(g + b).toBeLessThan(60);
  }
});
