import { expect, test, type Page } from "@playwright/test";
import { bookFirstSlot, loginAsDemo, workdayFrom } from "./helpers";

// PNG de 1x1 válido: el navegador lo reduce antes de guardarlo
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const photo = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });

// Borradores guardados en IndexedDB de este navegador (lib/photo-drafts.ts)
const storedDrafts = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open("reservahoy", 1);
        req.onupgradeneeded = () =>
          req.result.createObjectStore("photo-drafts", {
            keyPath: "bookingId",
          });
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const count = req.result
            .transaction("photo-drafts")
            .objectStore("photo-drafts")
            .count();
          count.onsuccess = () => {
            req.result.close();
            resolve(count.result);
          };
        };
      }),
  );

// Las fotos del diálogo de Completada quedan guardadas en el dispositivo como
// borrador de la reserva: se puede elegir una, salir (incluso recargar),
// volver, sumar otra y enviarlas juntas. La agenda avisa cuántas hay sin
// enviar, y cerrar la sesión las borra
test("las fotos de Completada quedan guardadas hasta enviarlas y se borran al cerrar sesión", async ({
  page,
}) => {
  const date = workdayFrom(23);
  const run = Date.now().toString(36);
  const first = `Borrador E2E ${run}`;
  const second = `Borrador2 E2E ${run}`;
  for (const customer of [first, second]) {
    await bookFirstSlot(page, {
      category: "Barba",
      service: "Perfilado de barba",
      date,
      customer,
    });
  }
  await loginAsDemo(page);

  await page.goto(`/dashboard/agenda?date=${date}`);
  const card = (customer: string) =>
    page.getByRole("listitem").filter({ hasText: customer });
  const dialog = page.getByRole("dialog", { name: "Avisar que está listo" });
  const open = async (customer: string) => {
    await card(customer).getByRole("button", { name: "Completada" }).click();
    await expect(dialog).toBeVisible();
  };

  // Una foto y se cierra sin enviar: la tarjeta avisa que quedó guardada
  await open(first);
  await dialog.getByLabel("Elegir fotos").setInputFiles(photo("a.png"));
  await expect(dialog.getByRole("img")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Volver" }).click();
  await expect(card(first)).toContainText("1 foto guardada, sin enviar");

  // Sigue ahí después de recargar; se suma otra
  await page.reload();
  await expect(card(first)).toContainText("1 foto guardada, sin enviar");
  await open(first);
  await expect(dialog.getByRole("img")).toHaveCount(1);
  await dialog.getByLabel("Elegir fotos").setInputFiles(photo("b.png"));
  await expect(dialog.getByRole("img")).toHaveCount(2);
  await dialog.getByRole("button", { name: "Volver" }).click();
  await expect(card(first)).toContainText("2 fotos guardadas, sin enviar");

  // Se envían las dos juntas. Chromium no expone el cuerpo multipart con
  // archivos: se cuentan las fotos del FormData que sale por fetch
  await page.evaluate(() => {
    const w = window as unknown as { sentPhotos: number };
    const original = window.fetch;
    window.fetch = (input, init) => {
      if (
        String(input).includes("/complete") &&
        init?.body instanceof FormData
      ) {
        w.sentPhotos = init.body.getAll("photos").length;
      }
      return original(input, init);
    };
  });
  await open(first);
  await expect(dialog.getByRole("img")).toHaveCount(2);
  await dialog.getByRole("button", { name: "Completar y avisar" }).click();
  await expect(dialog).toBeHidden();
  expect(
    await page.evaluate(
      () => (window as unknown as { sentPhotos?: number }).sentPhotos,
    ),
  ).toBe(2);
  await expect(card(first)).toContainText("Completada");
  await expect(card(first)).not.toContainText("guardada");
  expect(await storedDrafts(page)).toBe(0);

  // Otra reserva con una foto guardada: cerrar sesión la borra
  await open(second);
  await dialog.getByLabel("Elegir fotos").setInputFiles(photo("c.png"));
  await expect(dialog.getByRole("img")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Volver" }).click();
  await expect(card(second)).toContainText("1 foto guardada, sin enviar");
  expect(await storedDrafts(page)).toBe(1);
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(await storedDrafts(page)).toBe(0);

  await loginAsDemo(page);
  await page.goto(`/dashboard/agenda?date=${date}`);
  await expect(card(second)).toBeVisible();
  await expect(card(second)).not.toContainText("guardada");
  await open(second);
  await expect(dialog.getByRole("img")).toHaveCount(0);
});

// Una reserva nueva con una foto guardada sin enviar, en la agenda de su día
async function bookingWithDraft(page: Page, date: string, customer: string) {
  await bookFirstSlot(page, {
    category: "Barba",
    service: "Perfilado de barba",
    date,
    customer,
  });
  await loginAsDemo(page);
  await page.goto(`/dashboard/agenda?date=${date}`);
  const card = page.getByRole("listitem").filter({ hasText: customer });
  const dialog = page.getByRole("dialog", { name: "Avisar que está listo" });
  await card.getByRole("button", { name: "Completada" }).click();
  await dialog.getByLabel("Elegir fotos").setInputFiles(photo("a.png"));
  await expect(dialog.getByRole("img")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Volver" }).click();
  await expect(card).toContainText("1 foto guardada, sin enviar");
  return card;
}

// Pueden ser fotos de cosas de clientes en un equipo compartido: no se quedan
// para siempre. El reloj del navegador se adelanta con page.clock
test("las fotos guardadas se borran a los 7 días", async ({ page }) => {
  await page.clock.install();
  const date = workdayFrom(29);
  const card = await bookingWithDraft(
    page,
    date,
    `Vence E2E ${Date.now().toString(36)}`,
  );

  const later = async (days: number) => {
    await page.clock.setSystemTime(Date.now() + days * 86_400_000);
    await page.reload();
    await expect(card).toBeVisible();
  };
  // A los 6 días sigue ahí; a los 8, la agenda la borra al cargar
  await later(6);
  await expect(card).toContainText("1 foto guardada, sin enviar");
  await later(8);
  await expect(card).not.toContainText("guardada");
  expect(await storedDrafts(page)).toBe(0);
});

test("ver otro día no borra las fotos guardadas; cancelar la reserva desde otro lado sí", async ({
  page,
}) => {
  const date = workdayFrom(31);
  const customer = `Cancelada E2E ${Date.now().toString(36)}`;
  const card = await bookingWithDraft(page, date, customer);

  // Otro día de la agenda no trae esa reserva: su borrador se queda
  await page.goto(`/dashboard/agenda?date=${workdayFrom(33)}`);
  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(await storedDrafts(page)).toBe(1);
  await page.goto(`/dashboard/agenda?date=${date}`);
  await expect(card).toContainText("1 foto guardada, sin enviar");

  // Alguien la cancela desde otro equipo (aquí, directo por la API): al volver
  // a cargar la agenda, la foto ya no sirve y se borra
  const agenda = await page.request.get(`/api/agenda?from=${date}&to=${date}`);
  const booking = (
    (await agenda.json()) as { id: string; customer: { name: string } }[]
  ).find((b) => b.customer.name === customer);
  expect(booking, "la reserva está en la agenda").toBeTruthy();
  const cancel = await page.request.patch(`/api/agenda/${booking!.id}/status`, {
    data: { status: "CANCELLED" },
  });
  expect(cancel.ok()).toBeTruthy();
  await page.reload();
  await expect(card).toContainText("Cancelada");
  await expect(card).not.toContainText("guardada");
  expect(await storedDrafts(page)).toBe(0);
});
