import { expect, request, test, type Page } from "@playwright/test";
import { closeDb, createAccountToken } from "./db";

// Los enlaces que llegan por correo: restablecer la contraseña y confirmar el
// correo. El token del correo no se puede leer, así que la prueba crea uno
// conocido en la base (e2e/db.ts). Cada prueba registra su propia cuenta: con
// la del dueño demo, cambiar la contraseña cerraría la sesión que usan las demás

const OLD_PASSWORD = "password123";
const NEW_PASSWORD = "clave-nueva-e2e";

// Registra un negocio directo en la API, con su propia IP: registrarse tiene un
// límite de 5 por minuto. El contexto queda con la sesión del registro
async function register(ip: string) {
  const run = `${Date.now().toString(36)}${ip.split(".").pop()}`;
  const api = await request.newContext({
    baseURL: process.env.E2E_API_URL ?? "http://localhost:3000",
    extraHTTPHeaders: { "X-Forwarded-For": ip },
  });
  const account = {
    api,
    email: `cuenta-${run}@test.local`,
    slug: `cuenta-${run}`,
    business: `Taller ${run}`,
  };
  const res = await api.post("/auth/register", {
    data: {
      name: "Dueña E2E",
      email: account.email,
      password: OLD_PASSWORD,
      businessName: account.business,
      slug: account.slug,
    },
  });
  expect(res.status()).toBe(201);
  return account;
}

// El login tiene un límite de 5 por minuto por IP y una corrida completa ya
// hace 4 en menos de un minuto (auth.setup.ts y revoke-access.spec.ts). Las
// peticiones de login de esta página van directo al backend con otra IP: la
// pantalla y la respuesta (con su cookie) son las de siempre
async function loginWithOwnIp(page: Page, ip: string) {
  await page.route("**/api/auth/login", async (route) => {
    const response = await route.fetch({
      url: `${process.env.E2E_API_URL ?? "http://localhost:3000"}/auth/login`,
      headers: { ...route.request().headers(), "x-forwarded-for": ip },
    });
    await route.fulfill({ response });
  });
}

// Inicio de sesión desde la pantalla de login
async function login(page: Page, email: string, password: string) {
  await page.getByPlaceholder("Correo").fill(email);
  await page.getByPlaceholder("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test.afterAll(async () => {
  await closeDb();
});

test("olvidé mi contraseña: con el enlace elige una nueva y entra con ella", async ({
  page,
}) => {
  const account = await register("203.0.113.30");
  await loginWithOwnIp(page, "203.0.113.32");

  // Pide el enlace desde el login
  await page.goto("/login");
  await page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).click();
  await page.getByPlaceholder("Correo").fill(account.email);
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByText("Si el correo está registrado")).toBeVisible();

  // Abre el enlace del correo y elige la contraseña nueva (primero se equivoca
  // al repetirla)
  const token = await createAccountToken("reset-password", account.email);
  await page.goto(`/reset-password?token=${token}`);
  const password = page.getByPlaceholder("Contraseña nueva");
  const confirm = page.getByPlaceholder("Repite la contraseña");
  const save = page.getByRole("button", { name: "Cambiar contraseña" });
  await password.fill(NEW_PASSWORD);
  await confirm.fill("otra-clave-e2e");
  await save.click();
  await expect(page.getByText("Las contraseñas no coinciden")).toBeVisible();
  await confirm.fill(NEW_PASSWORD);
  await save.click();
  await expect(page).toHaveURL(/\/login\?reset=1$/);
  await expect(
    page.getByText("Contraseña actualizada, ya puedes entrar."),
  ).toBeVisible();

  // La sesión que tenía abierta (la del registro) se cerró
  expect((await account.api.get("/auth/me")).status()).toBe(401);
  await account.api.dispose();

  // La contraseña anterior ya no sirve: el login lo dice y no se va a otra
  // pantalla. Con la nueva entra a su panel
  await login(page, account.email, OLD_PASSWORD);
  await expect(page.getByText("Credenciales inválidas")).toBeVisible();
  await expect(page).toHaveURL(/\/login\?reset=1$/);
  await login(page, account.email, NEW_PASSWORD);
  await page.waitForURL("**/dashboard/**");
  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
  await expect(page.getByText(account.business)).toBeVisible();

  // El enlace sirve una sola vez
  await page.goto(`/reset-password?token=${token}`);
  await password.fill("otra-clave-mas");
  await confirm.fill("otra-clave-mas");
  await save.click();
  await expect(page.getByText("El enlace no es válido o expiró")).toBeVisible();
});

test("confirmar el correo con el enlace quita el aviso del panel y habilita las reservas", async ({
  page,
}) => {
  const account = await register("203.0.113.31");
  // El navegador entra con la sesión del registro (la cookie no depende del
  // puerto: vale para el frontend en localhost)
  await page.context().addCookies((await account.api.storageState()).cookies);
  await account.api.dispose();
  await page.goto("/dashboard/agenda");
  await expect(page.getByText("Confirma tu correo")).toBeVisible();

  // Un enlace que no existe
  await page.goto(`/verify-email?token=${"0".repeat(64)}`);
  await expect(
    page.getByText(/^El enlace no es válido o expiró.* Puedes pedir uno nuevo/),
  ).toBeVisible();

  const token = await createAccountToken("verify-email", account.email);
  await page.goto(`/verify-email?token=${token}`);
  await expect(page.getByText("Listo, tu correo quedó confirmado")).toBeVisible();
  await page.getByRole("link", { name: "Ir a mi panel" }).click();
  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
  await expect(page.getByText(account.business)).toBeVisible();
  await expect(page.getByText("Confirma tu correo")).toHaveCount(0);

  // Abrir el enlace otra vez no es un error
  await page.goto(`/verify-email?token=${token}`);
  await expect(page.getByText("Listo, tu correo quedó confirmado")).toBeVisible();

  // Su página pública ya no dice que todavía no recibe reservas
  await page.goto(`/${account.slug}`);
  await expect(
    page.getByRole("heading", { name: account.business }),
  ).toBeVisible();
  await expect(page.getByText("todavía no recibe reservas")).toHaveCount(0);
});
