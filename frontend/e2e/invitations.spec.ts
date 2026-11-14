import { expect, test, type APIRequestContext } from "@playwright/test";
import { closeDb, createInvitation, deleteMember, deleteUserByEmail } from "./db";
import { AUTH_FILE, DEMO, loginAsDemo } from "./helpers";

// Invitar a un profesional por correo y que él cree su cuenta desde el enlace.
// El correo no se puede leer en la prueba y en la base solo queda el hash del
// token, así que el enlace se arma con una invitación creada en la base (e2e/db.ts)

const run = Date.now().toString(36);
const team = {
  inviter: { name: `E2E Invitado ${run}`, id: "" }, // invitar y anular desde Equipo
  joiner: { name: `E2E Nuevo ${run}`, id: "" }, // acepta la invitación
};
const inviteEmail = `e2e-invite-${run}@test.local`;
const joinEmail = `e2e-join-${run}@test.local`;

let owner: APIRequestContext;

test.beforeAll(async ({ playwright }, testInfo) => {
  owner = await playwright.request.newContext({
    baseURL: testInfo.project.use.baseURL,
    storageState: AUTH_FILE,
  });
  for (const m of Object.values(team)) {
    const res = await owner.post("/api/members", {
      data: { displayName: m.name },
    });
    expect(res.status()).toBe(201);
    m.id = (await res.json()).id;
  }
});

// Deja el negocio demo como estaba: sin los profesionales ni la cuenta de prueba
test.afterAll(async () => {
  for (const m of Object.values(team)) if (m.id) await deleteMember(m.id);
  await deleteUserByEmail(joinEmail);
  await closeDb();
  await owner?.dispose();
});

test("el dueño invita a un profesional desde Equipo y anula la invitación", async ({
  page,
}) => {
  const { name } = team.inviter;
  await loginAsDemo(page);
  await page.goto("/dashboard/team");
  const row = page.getByRole("listitem").filter({ hasText: name });
  await expect(row.getByText("Sin cuenta")).toBeVisible();

  await row.getByRole("button", { name: "Invitar" }).click();
  await row.getByPlaceholder(`Correo de ${name}`).fill(inviteEmail);
  await row.getByRole("button", { name: "Enviar invitación" }).click();
  await expect(page.getByRole("status")).toHaveText(
    `Invitación enviada a ${inviteEmail}`,
  );
  await expect(
    row.getByText(`Invitación enviada a ${inviteEmail} · vence el`),
  ).toBeVisible();
  await expect(row.getByRole("button", { name: "Reenviar" })).toBeVisible();

  // Anular pide confirmación con un diálogo del navegador
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Anular" }).click();
  await expect(row.getByText("Sin cuenta")).toBeVisible();
  await expect(row.getByRole("button", { name: "Invitar" })).toBeVisible();
});

test("si las contraseñas no coinciden, no crea la cuenta", async ({ page }) => {
  const token = await createInvitation(team.inviter.id, inviteEmail);
  await page.goto(`/invitacion/${token}`);
  await expect(
    page.getByRole("heading", { name: "Únete a Peluquería Demo" }),
  ).toBeVisible();
  await page.getByPlaceholder("Contraseña (mínimo 8 caracteres)").fill("clave-e2e-1");
  await page.getByPlaceholder("Repite la contraseña").fill("clave-e2e-2");
  await page.getByRole("button", { name: "Crear mi cuenta" }).click();
  await expect(page.getByText("Las contraseñas no coinciden")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/invitacion/${token}$`));
});

test("el profesional acepta la invitación, crea su cuenta y entra a su agenda", async ({
  page,
}) => {
  // Contexto sin sesión: es otra persona, en su propio celular
  const token = await createInvitation(team.joiner.id, joinEmail);
  await page.goto(`/invitacion/${token}`);
  await expect(
    page.getByRole("heading", { name: "Únete a Peluquería Demo" }),
  ).toBeVisible();
  await expect(page.getByText(`Hola ${team.joiner.name}`)).toBeVisible();
  await expect(page.getByLabel("Correo")).toHaveValue(joinEmail);

  const nameInput = page.getByLabel("Tu nombre");
  await expect(nameInput).toHaveValue(team.joiner.name);
  await nameInput.fill("Nombre Cuenta E2E");
  await page.getByPlaceholder("Contraseña (mínimo 8 caracteres)").fill("clave-e2e-1");
  await page.getByPlaceholder("Repite la contraseña").fill("clave-e2e-1");
  await page.getByRole("button", { name: "Crear mi cuenta" }).click();

  await page.waitForURL("**/dashboard/agenda");
  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();

  // Quedó con sesión: cuenta verificada, profesional (STAFF) del negocio demo
  const me = await page.request.get("/api/auth/me");
  expect(me.status()).toBe(200);
  const user = await me.json();
  expect(user.email).toBe(joinEmail);
  expect(user.name).toBe("Nombre Cuenta E2E");
  expect(user.emailVerifiedAt).toBeTruthy();
  expect(user.membership).toMatchObject({
    memberId: team.joiner.id,
    role: "STAFF",
    business: { slug: DEMO.slug },
  });

  // El enlace es de un solo uso
  await page.goto(`/invitacion/${token}`);
  await expect(
    page.getByRole("heading", { name: "Este enlace no es válido o expiró" }),
  ).toBeVisible();

  // Y en Equipo, el dueño lo ve con acceso
  const res = await owner.get("/api/members");
  const joined = (await res.json()).find(
    (m: { id: string }) => m.id === team.joiner.id,
  );
  expect(joined.account).toBe("active");
});
