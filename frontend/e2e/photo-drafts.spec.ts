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
  await page.request.patch("/api/business", {
    data: { notifyCompleted: true },
  });

  try {
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
        if (String(input).includes("/complete") && init?.body instanceof FormData) {
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
  } finally {
    await page.request.patch("/api/business", {
      data: { notifyCompleted: false },
    });
  }
});
