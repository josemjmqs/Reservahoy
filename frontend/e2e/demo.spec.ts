import { expect, test } from "@playwright/test";

// Demo de solo lectura (la misma de producción, que el seed crea en /demo):
// se entra sin contraseña desde /login, se puede recorrer todo, pero el backend
// rechaza cualquier cambio y la página pública no guarda reservas

const DEMO_SLUG = "demo";
const READ_ONLY = /Es una cuenta de demostración: puedes recorrer todo, pero los cambios no se guardan/;

test("se entra al panel de demostración sin contraseña y no se puede cambiar nada", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Ver el panel de demostración" }).click();
  await page.waitForURL("**/dashboard/agenda");
  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
  await expect(page.locator("p", { hasText: "Panel de demostración" })).toContainText("la dueña");

  // Lo que no es lectura se rechaza en el backend, en cualquier ruta
  for (const [method, path, data] of [
    ["PATCH", "/api/business", { name: "Otro nombre" }],
    ["POST", "/api/services", { name: "Nuevo", durationMin: 30 }],
    ["PATCH", "/api/settings", { newBookings: "NONE" }],
    ["POST", "/api/support", { kind: "QUESTION", message: "Hola, una pregunta larga" }],
  ] as const) {
    const res = await page.request.fetch(path, { method, data });
    expect(res.status(), `${method} ${path}`).toBe(403);
    expect(await res.json()).toMatchObject({ code: "DEMO_READ_ONLY" });
  }

  // En pantalla: guardar los datos del negocio muestra el aviso y no cambia nada
  await page.getByRole("link", { name: "Ajustes" }).click();
  const name = page.getByLabel("Nombre del negocio");
  await expect(name).toHaveValue("Peluquería Demo");
  await name.fill("Nombre cambiado");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText(READ_ONLY)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Nombre del negocio")).toHaveValue("Peluquería Demo");

  // Se puede ver el panel del profesional
  await page.getByRole("button", { name: "Ver como profesional" }).click();
  await page.waitForURL("**/dashboard/agenda");
  await expect(page.locator("p", { hasText: "Panel de demostración" })).toContainText("un profesional");
  await expect(page.getByRole("link", { name: "Servicios" })).toHaveCount(0);

  // Cerrar sesión funciona (no es un cambio del negocio)
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await page.waitForURL("**/login");
});

test("la página pública de la demo deja probar la reserva sin guardarla", async ({
  page,
}) => {
  await page.goto(`/${DEMO_SLUG}`);
  await expect(page.getByText("Negocio de demostración.")).toBeVisible();

  await page.getByRole("button", { name: "Seleccionar Color completo", exact: true }).click();
  // Una fecha lejos de hoy, para que haya horas libres a cualquier hora del día
  const date = new Date(Date.now() + 9 * 86_400_000);
  if (date.getDay() === 0) date.setDate(date.getDate() + 1);
  await page.getByLabel("Otra fecha").fill(date.toLocaleDateString("en-CA"));
  await page.getByRole("button", { name: /^\d{1,2}:\d{2}/ }).first().click();
  await page.getByLabel("Nombre").fill("Visita de prueba");
  await page.getByLabel("Correo").fill("visita@ejemplo.cl");
  await page.getByRole("button", { name: "Confirmar reserva" }).click();

  await expect(page.getByText(/Es un negocio de demostración: la reserva no se guarda/)).toBeVisible();
  await expect(page.getByText("¡Reserva confirmada!")).toHaveCount(0);
});
