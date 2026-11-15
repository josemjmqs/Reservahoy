import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  closeDb,
  createInvitation,
  deleteMember,
  deleteUserByEmail,
  setMemberActive,
} from "./db";
import { AUTH_FILE } from "./helpers";

// Quitar acceso: cuando el dueño desactiva a un profesional con cuenta, su
// sesión se cierra y no puede volver a entrar hasta que lo reactiven. Cada
// profesional de prueba crea su cuenta aceptando una invitación (e2e/db.ts)

const run = Date.now().toString(36);
const PASSWORD = "clave-e2e-1";
const team = {
  revoked: { name: `E2E Desactivado ${run}`, id: "", email: `e2e-revoked-${run}@test.local` },
  stale: { name: `E2E Sesión vieja ${run}`, id: "", email: `e2e-stale-${run}@test.local` },
};

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

// Deja el negocio demo como estaba: sin los profesionales ni sus cuentas
test.afterAll(async () => {
  for (const m of Object.values(team)) {
    if (m.id) await deleteMember(m.id);
    await deleteUserByEmail(m.email);
  }
  await closeDb();
  await owner?.dispose();
});

// El profesional crea su cuenta con la invitación y queda con sesión en `page`
async function joinAs(page: Page, m: (typeof team)[keyof typeof team]) {
  const token = await createInvitation(m.id, m.email);
  const res = await page.request.post(`/api/invitations/${token}/accept`, {
    data: { name: m.name, password: PASSWORD },
  });
  expect(res.status()).toBe(201);
}

async function login(page: Page, email: string) {
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("al desactivarlo pierde la sesión y no entra hasta que lo reactivan", async ({
  page,
  browser,
}) => {
  const m = team.revoked;
  await joinAs(page, m);
  await page.goto("/dashboard/agenda");
  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();

  // La dueña lo desactiva desde Equipo, en su propio navegador
  const ownerContext = await browser.newContext({ storageState: AUTH_FILE });
  try {
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto("/dashboard/team");
    const row = ownerPage.getByRole("listitem").filter({ hasText: m.name });
    // Quien acepta una invitación queda como dueño, y aun así se le quita el acceso
    await expect(row.getByText("Dueño")).toBeVisible();
    await expect(row.getByText("Con acceso")).toBeVisible();
    // Desactivar pide confirmación y dice qué pasa con su sesión
    ownerPage.once("dialog", async (d) => {
      expect(d.message()).toContain("se cerrará su sesión en el panel");
      await d.accept();
    });
    await row.getByRole("button", { name: "Desactivar" }).click();
    await expect(row.getByText("Inactivo")).toBeVisible();

    // Lo siguiente que hace el profesional lo lleva al login
    // (toHaveURL y no waitForURL: la carga de Bloqueos se corta al irse al login)
    await page.getByRole("link", { name: "Bloqueos" }).click();
    await expect(page).toHaveURL(/\/login\?expired=1$/);
    await login(page, m.email);
    await expect(
      page.getByText("Tu acceso a este negocio está desactivado"),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    // Reactivado, entra de nuevo con la misma contraseña
    await row.getByRole("button", { name: "Activar" }).click();
    await expect(row.getByText("Con acceso")).toBeVisible();
    await login(page, m.email);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
  } finally {
    await ownerContext.close();
  }
});

test("con una sesión abierta sin acceso, el panel la cierra y lo explica", async ({
  page,
}) => {
  const m = team.stale;
  await joinAs(page, m);
  // Desactivado sin pasar por la API: su sesión sigue valiendo, pero ya no
  // tiene membresía activa (/auth/me responde 403)
  await setMemberActive(m.id, false);

  await page.goto("/dashboard/agenda");
  await expect(page).toHaveURL(/\/login\?revoked=1$/);
  await expect(page.getByRole("status")).toHaveText(
    "Ya no tienes acceso al panel de este negocio. Si crees que es un error, habla con el dueño.",
  );
  // La sesión quedó cerrada
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
});
