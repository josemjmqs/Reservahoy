import { expect, test } from "@playwright/test";
import { bookFirstSlot, loginAsDemo, workdayFrom } from "./helpers";

// El dueño activa en Ajustes el aviso de "servicio listo": al marcar una
// reserva como Completada en la agenda, el panel confirma que se le escribió
// al cliente. El correo no se puede leer aquí; su contenido y que salga una
// sola vez lo prueban agenda.service.int-spec.ts y notifications.service.spec.ts
test("con el aviso de servicio listo, Completada le avisa al cliente", async ({
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
  // Parte desactivado aunque una corrida anterior lo haya dejado activo
  await page.request.patch("/api/business", {
    data: { notifyCompleted: false },
  });

  try {
    await page.goto("/dashboard/settings");
    const toggle = page.getByRole("checkbox", {
      name: /Avisar al cliente cuando su servicio está listo/,
    });
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await expect(page.getByText("Guardando...")).toHaveCount(0);
    await expect(toggle).toBeChecked();
    expect(
      (await (await page.request.get("/api/business")).json()).notifyCompleted,
    ).toBe(true);

    // Sigue activado al volver a la pantalla
    await page.reload();
    await expect(toggle).toBeChecked();

    await page.goto(`/dashboard/agenda?date=${date}`);
    const card = page.getByRole("listitem").filter({ hasText: customer });
    await card.getByRole("button", { name: "Completada" }).click();
    await expect(page.getByRole("status")).toHaveText(
      `Le avisamos a ${customer} por correo que su servicio está listo.`,
    );
    await expect(card).toContainText("Completada");
    await expect(card.getByRole("button", { name: "Cancelar" })).toHaveCount(0);

    // Desactivarlo desde Ajustes lo guarda
    await page.goto("/dashboard/settings");
    await toggle.uncheck();
    await expect(page.getByText("Guardando...")).toHaveCount(0);
    expect(
      (await (await page.request.get("/api/business")).json()).notifyCompleted,
    ).toBe(false);
  } finally {
    await page.request.patch("/api/business", {
      data: { notifyCompleted: false },
    });
  }
});
