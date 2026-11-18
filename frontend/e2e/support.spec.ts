import { expect, test } from "@playwright/test";
import { closeDb, deleteSupportRequestsByEmail } from "./db";
import { DEMO, loginAsDemo, loginAsStaff, STAFF } from "./helpers";

// "Ayuda y sugerencias": cualquier miembro del panel le escribe al equipo de
// Reservahoy desde el enlace del encabezado (o desde Ajustes)

test.afterAll(async () => {
  // Los mensajes cuentan para el máximo por hora de cada miembro
  await deleteSupportRequestsByEmail(STAFF.email);
  await deleteSupportRequestsByEmail(DEMO.email);
  await closeDb();
});

test("el profesional reporta un problema desde el encabezado", async ({
  page,
}) => {
  await loginAsStaff(page);
  await page.getByRole("link", { name: "Ayuda y sugerencias" }).click();
  await expect(page).toHaveURL(/\/dashboard\/support\?from=%2Fdashboard%2Fagenda$/);
  await expect(
    page.getByRole("heading", { name: "Ayuda y sugerencias" }),
  ).toBeVisible();
  await expect(page.getByText(STAFF.email)).toBeVisible();

  // Problema viene elegido; el mensaje corto no se puede enviar
  await expect(
    page.getByRole("radio", { name: /Reportar un problema/ }),
  ).toBeChecked();
  const message = page.getByLabel("¿Qué pasó?");
  const send = page.getByRole("button", { name: "Enviar mensaje" });
  await message.fill("Hola");
  await expect(send).toBeDisabled();
  await expect(page.getByText("Cuéntanos un poco más")).toBeVisible();

  await message.fill("La agenda no carga las reservas de mañana");
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/support") && r.request().method() === "POST",
  );
  await send.click();
  const res = await response;
  expect(res.status()).toBe(201);
  expect(res.request().postDataJSON()).toEqual({
    kind: "PROBLEM",
    message: "La agenda no carga las reservas de mañana",
    page: "/dashboard/agenda",
  });
  await expect(page.getByText("¡Gracias! Recibimos tu mensaje.")).toBeVisible();

  // Puede escribir otro, y el campo cambia según lo que elige
  await page.getByRole("button", { name: "Escribir otro mensaje" }).click();
  await page.getByText("Sugerir una mejora").click();
  await expect(page.getByLabel("¿Qué te gustaría?")).toHaveValue("");
});

test("el dueño llega desde Ajustes y deja una sugerencia", async ({ page }) => {
  await loginAsDemo(page);
  await page.getByRole("link", { name: "Ajustes", exact: true }).click();
  await page.getByRole("link", { name: "Escribirnos" }).click();
  await expect(
    page.getByRole("heading", { name: "Ayuda y sugerencias" }),
  ).toBeVisible();

  await page.getByText("Sugerir una mejora").click();
  await page
    .getByLabel("¿Qué te gustaría?")
    .fill("Recordatorios por WhatsApp para mis clientes");
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/support") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  expect((await response).request().postDataJSON()).toMatchObject({
    kind: "SUGGESTION",
    page: "/dashboard/settings",
  });
  await expect(page.getByText("¡Gracias! Recibimos tu mensaje.")).toBeVisible();
});

test.describe("en el celular", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("el enlace es un ícono en el encabezado y la pantalla no se sale de lado", async ({
    page,
  }) => {
    await loginAsDemo(page);
    const link = page.getByRole("link", { name: "Ayuda y sugerencias" });
    const box = (await link.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(40);
    // No es una pestaña más de la barra de abajo
    await expect(
      page.getByRole("navigation").getByRole("link", { name: "Ayuda y sugerencias" }),
    ).toHaveCount(0);
    await link.click();
    await expect(
      page.getByRole("heading", { name: "Ayuda y sugerencias" }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
