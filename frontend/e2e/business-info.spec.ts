import { expect, test } from "@playwright/test";
import { DEMO, loginAsDemo } from "./helpers";

// Como lo deja el seed
const ORIGINAL = {
  name: "Peluquería Demo",
  phone: "+56 9 1234 5678",
  address: "Av. Providencia 1234, Providencia",
};

// El dueño cambia el nombre, el teléfono y la dirección de su negocio en
// Ajustes: el encabezado del panel se actualiza y el teléfono y la dirección
// (con su enlace a Google Maps) aparecen en su página pública
test("el dueño edita nombre, teléfono y dirección y se ven en el panel y en su página", async ({
  page,
}) => {
  await loginAsDemo(page);
  // Parte de los datos del seed aunque una corrida anterior los haya dejado
  // distintos (la base local no se reinicia entre corridas)
  await page.request.patch("/api/business", { data: ORIGINAL });
  await page.goto("/dashboard/settings");
  const name = page.getByLabel("Nombre del negocio");
  const phone = page.getByLabel("Teléfono");
  const address = page.getByLabel("Dirección");
  await expect(name).toHaveValue(ORIGINAL.name);
  await expect(address).toHaveValue(ORIGINAL.address);

  try {
    await name.fill("Peluquería Demo Centro");
    await phone.fill("+56 9 5555 0000");
    await address.fill("Av. Irarrázaval 2401, local 3, Ñuñoa");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Guardado." }),
    ).toBeVisible();
    await expect(
      page.getByText("Peluquería Demo Centro").first(),
    ).toBeVisible();

    // Un teléfono con letras se rechaza con un mensaje claro
    await phone.fill("llámame");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(
      page.getByText("El teléfono solo puede tener números"),
    ).toBeVisible();

    await page.goto(`/${DEMO.slug}`);
    await expect(
      page.getByRole("heading", { name: "Peluquería Demo Centro" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "+56 9 5555 0000" }),
    ).toHaveAttribute("href", "tel:+56955550000");
    const maps = page.getByRole("link", {
      name: "Av. Irarrázaval 2401, local 3, Ñuñoa",
    });
    await expect(maps).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=Av.%20Irarr%C3%A1zaval%202401%2C%20local%203%2C%20%C3%91u%C3%B1oa",
    );
    await expect(maps).toHaveAttribute("target", "_blank");

    // Sin dirección, la página no muestra el enlace
    await page.request.patch("/api/business", { data: { address: "" } });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Peluquería Demo Centro" }),
    ).toBeVisible();
    await expect(page.locator('a[href*="google.com/maps"]')).toHaveCount(0);
  } finally {
    // Deja el negocio demo como estaba
    await page.request.patch("/api/business", { data: ORIGINAL });
  }
});
