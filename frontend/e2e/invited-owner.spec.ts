import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
} from "@playwright/test";
import { closeDb, createInvitation, deleteMember, deleteUserByEmail } from "./db";
import { AUTH_FILE, DEMO, STAFF } from "./helpers";

// El panel de quien entró aceptando una invitación: por ahora es un segundo
// dueño, con el mismo panel que la dueña demo. Acepta la invitación una sola
// vez (e2e/db.ts crea el enlace) y todas las pruebas usan esa sesión: no pasa
// por el login, que tiene límite por minuto

const run = Date.now().toString(36);
const socia = {
  name: `E2E Socia ${run}`,
  id: "",
  email: `e2e-socia-${run}@test.local`,
};
const guest = { name: `E2E Por invitar ${run}`, id: "" }; // lo invita la socia

let owner: APIRequestContext;
let sociaContext: BrowserContext; // con la sesión de la socia

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ playwright, browser }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  owner = await playwright.request.newContext({
    baseURL,
    storageState: AUTH_FILE,
  });
  for (const m of [socia, guest]) {
    const res = await owner.post("/api/members", {
      data: { displayName: m.name },
    });
    expect(res.status()).toBe(201);
    m.id = (await res.json()).id;
  }

  sociaContext = await browser.newContext({ baseURL });
  const token = await createInvitation(socia.id, socia.email);
  const res = await sociaContext.request.post(
    `/api/invitations/${token}/accept`,
    { data: { name: socia.name, password: "clave-e2e-1" } },
  );
  expect(res.status()).toBe(201);
});

// Deja el negocio demo como estaba: sin los miembros ni la cuenta de prueba
test.afterAll(async () => {
  await sociaContext?.close();
  for (const m of [socia, guest]) if (m.id) await deleteMember(m.id);
  await deleteUserByEmail(socia.email);
  await closeDb();
  await owner?.dispose();
});

test("entra como dueño, con todas las pestañas y el filtro de la agenda", async () => {
  const page = await sociaContext.newPage();
  const me = await (await page.request.get("/api/auth/me")).json();
  expect(me.emailVerifiedAt).toBeTruthy();
  expect(me.membership).toMatchObject({
    memberId: socia.id,
    role: "OWNER",
    business: { slug: DEMO.slug },
  });

  await page.goto("/dashboard/agenda");
  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
  const tabs = (
    await page.getByRole("navigation").getByRole("link").allTextContents()
  ).map((t) => t.trim());
  expect(tabs).toEqual([
    "Agenda",
    "Servicios",
    "Equipo",
    "Horario",
    "Bloqueos",
    "Ajustes",
  ]);
  await expect(
    page.getByRole("link", { name: "Ver mi página pública ↗" }),
  ).toBeVisible();
  // El filtro por profesional, con Diego entre las opciones
  await expect(
    page.getByRole("combobox").getByRole("option", { name: STAFF.name }),
  ).toBeAttached();
  // Entró verificado por la invitación: sin el aviso de confirmar el correo
  await expect(page.getByText("Confirma tu correo")).toHaveCount(0);
});

test("en Equipo ve a la dueña y a Diego, invita a alguien y no se desactiva a sí misma", async () => {
  const page = await sociaContext.newPage();
  await page.goto("/dashboard/team");

  const own = page.getByRole("listitem").filter({ hasText: socia.name });
  await expect(own.getByText("(tú)")).toBeVisible();
  await expect(own.getByText("Dueño")).toBeVisible();
  await expect(own.getByRole("button", { name: "Desactivar" })).toHaveCount(0);

  const camila = page.getByRole("listitem").filter({ hasText: "Camila" });
  await expect(camila.getByText("Dueño")).toBeVisible();
  await expect(camila.getByText("Con acceso")).toBeVisible();
  const diego = page.getByRole("listitem").filter({ hasText: STAFF.name });
  await expect(diego.getByRole("button", { name: "Desactivar" })).toBeVisible();

  // Invita y anula, igual que la dueña
  const row = page.getByRole("listitem").filter({ hasText: guest.name });
  const email = `e2e-guest-${run}@test.local`;
  await row.getByRole("button", { name: "Invitar" }).click();
  await row.getByPlaceholder(`Correo de ${guest.name}`).fill(email);
  await row.getByRole("button", { name: "Enviar invitación" }).click();
  await expect(page.getByRole("status")).toHaveText(
    `Invitación enviada a ${email}`,
  );
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Anular" }).click();
  await expect(row.getByText("Sin cuenta")).toBeVisible();
});

test("cambia el horario de otros y ve los datos del negocio en Ajustes", async () => {
  const page = await sociaContext.newPage();
  const members = await (await page.request.get("/api/members")).json();
  const diego = members.find(
    (m: { displayName: string }) => m.displayName === STAFF.name,
  );
  await page.goto(`/dashboard/hours?memberId=${diego.id}`);
  await expect(
    page.getByRole("heading", { name: `Horario de atención · ${STAFF.name}` }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Guardar horario" }),
  ).toBeVisible();
  const days = page.getByRole("checkbox");
  await expect(days).toHaveCount(7);
  for (const day of await days.all()) await expect(day).toBeEnabled();

  await page.getByRole("link", { name: "Ajustes" }).click();
  await expect(page.getByText("Datos del negocio")).toBeVisible();
  await expect(page.getByLabel("Nombre del negocio")).toBeEditable();
});

test("la API le permite lo que es solo del dueño", async () => {
  const { request } = sociaContext;
  // Ve el correo invitado de los demás (solo el dueño lo recibe)
  const members = await (await request.get("/api/members")).json();
  const guestRow = members.find((m: { id: string }) => m.id === guest.id);
  expect(guestRow).toHaveProperty("invitation", null);

  // Guarda los datos del negocio sin cambiarlos (la prueba no deja rastro)
  const current = await (await request.get("/api/business")).json();
  const res = await request.patch("/api/business", {
    data: { name: current.name, phone: current.phone ?? "" },
  });
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ name: current.name });
});
