import { expect, test } from "@playwright/test";
import { bookFirstSlot, loginAsDemo, workdayFrom } from "./helpers";

// PNG de 1x1 válido: el navegador lo reduce antes de subirlo
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const photo = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });

// El aviso de "servicio listo" está siempre activado: Ajustes ya no tiene la
// casilla, y al marcar una reserva como Completada se abre un diálogo que
// avisa que se le escribirá al cliente y deja sumar fotos, y el panel confirma
// el envío. El correo no se puede leer aquí; su contenido, las fotos y que
// salga una sola vez lo prueban agenda.service.int-spec.ts y
// notifications.service.spec.ts
test("Completada abre un diálogo con fotos y le avisa al cliente", async ({
  page,
}) => {
  const date = workdayFrom(21);
  const customer = `Listo E2E ${Date.now().toString(36)}`;
  await bookFirstSlot(page, {
    category: "Barba",
    service: "Perfilado de barba",
    date,
    customer,
  });
  await loginAsDemo(page);

  // Ya no es un ajuste: ni la casilla en Ajustes ni el campo en la API
  await page.goto("/dashboard/settings");
  await expect(
    page.getByRole("radio", { name: /Todas las reservas del negocio/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Avisar al cliente cuando su servicio está listo"),
  ).toHaveCount(0);
  const patch = await page.request.patch("/api/business", {
    data: { notifyCompleted: false },
  });
  expect(patch.status()).toBe(400);

  await page.goto(`/dashboard/agenda?date=${date}`);
  const card = page.getByRole("listitem").filter({ hasText: customer });
  const dialog = page.getByRole("dialog", { name: "Avisar que está listo" });

  // "Volver" cierra sin tocar la reserva
  await card.getByRole("button", { name: "Completada" }).click();
  await expect(dialog).toContainText(
    `Le estás avisando a ${customer} que su servicio está terminado`,
  );
  await dialog.getByRole("button", { name: "Volver" }).click();
  await expect(dialog).toBeHidden();
  await expect(card.getByRole("button", { name: "Cancelar" })).toBeVisible();

  // Dos fotos, se quita una y se envía la otra
  await card.getByRole("button", { name: "Completada" }).click();
  await dialog
    .getByLabel("Elegir fotos")
    .setInputFiles([photo("a.png"), photo("b.png")]);
  await expect(dialog.getByRole("img")).toHaveCount(2);
  await dialog.getByRole("button", { name: "Quitar foto 2" }).click();
  await expect(dialog.getByRole("img")).toHaveCount(1);

  // Chromium no expone el cuerpo multipart con archivos: se cuentan las
  // fotos del FormData que sale por fetch
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
  await dialog.getByRole("button", { name: "Completar y avisar" }).click();

  await expect(dialog).toBeHidden();
  expect(
    await page.evaluate(
      () => (window as unknown as { sentPhotos?: number }).sentPhotos,
    ),
  ).toBe(1);
  await expect(page.getByRole("status")).toHaveText(
    `Le avisamos a ${customer} por correo que su servicio está listo.`,
  );
  await expect(card).toContainText("Completada");
  await expect(card.getByRole("button", { name: "Cancelar" })).toHaveCount(0);
});

// "No se presentó" marcado por error: la tarjeta deja solo Completada, que
// sigue avisándole al cliente (que salga un solo correo lo prueba
// agenda.service.int-spec.ts)
test("una reserva marcada No se presentó por error todavía se completa avisando al cliente", async ({
  page,
}) => {
  const date = workdayFrom(22);
  const customer = `No vino E2E ${Date.now().toString(36)}`;
  await bookFirstSlot(page, {
    category: "Barba",
    service: "Perfilado de barba",
    date,
    customer,
  });
  await loginAsDemo(page);

  await page.goto(`/dashboard/agenda?date=${date}`);
  const card = page.getByRole("listitem").filter({ hasText: customer });

  await card.getByRole("button", { name: "No se presentó" }).click();
  await expect(card.getByRole("button", { name: "No se presentó" })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Cancelar" })).toHaveCount(0);
  await expect(card).toContainText("No se presentó");

  await card.getByRole("button", { name: "Completada" }).click();
  const dialog = page.getByRole("dialog", { name: "Avisar que está listo" });
  await dialog.getByRole("button", { name: "Completar y avisar" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status")).toHaveText(
    `Le avisamos a ${customer} por correo que su servicio está listo.`,
  );
  await expect(card).toContainText("Completada");
  await expect(card.getByRole("button")).toHaveCount(0);
});
