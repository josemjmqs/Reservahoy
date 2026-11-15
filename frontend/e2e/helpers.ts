import { readFileSync } from "fs";
import { expect, type Locator, type Page } from "@playwright/test";

// Utilidades compartidas por las pruebas e2e (negocio demo del seed)

export const DEMO = {
  slug: "demo-peluqueria",
  email: "demo@reservahoy.local",
  password: "demo1234",
};

const TZ = "America/Santiago";
const isoDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
const weekday = (d: Date) =>
  d.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short" });

// El primer día que cumple `ok` desde dentro de `fromDays` días (YYYY-MM-DD)
function dayFrom(fromDays: number, ok: (d: Date) => boolean): string {
  const d = new Date(Date.now() + fromDays * 86_400_000);
  while (!ok(d)) d.setDate(d.getDate() + 1);
  return isoDate(d);
}

// Día hábil (lunes a sábado) lejos de las reservas del seed. Cada prueba usa
// su propio desfase para no pisarse con las demás
export const workdayFrom = (fromDays: number) =>
  dayFrom(fromDays, (d) => weekday(d) !== "Sun");
export const sundayFrom = (fromDays: number) =>
  dayFrom(fromDays, (d) => weekday(d) === "Sun");

// Instante de `date` (YYYY-MM-DD) a la hora `hhmm` en la zona del negocio, sin
// depender de la zona del equipo que corre la prueba (para page.clock)
export function zonedTime(date: string, hhmm: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(new Date(guess))
      .map((p) => [p.type, Number(p.value)]),
  );
  const shownAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
  return new Date(guess - (shownAsUtc - guess));
}

// Profesional (STAFF) del negocio demo, con la misma contraseña
export const STAFF = { email: "diego@reservahoy.local", name: "Diego" };

// Sesiones del dueño y del profesional demo, guardadas una sola vez por
// auth.setup.ts (el login tiene un límite de 5 intentos por minuto y varias
// pruebas las necesitan)
export const AUTH_FILE = "e2e/.auth/demo.json";
export const STAFF_AUTH_FILE = "e2e/.auth/staff.json";

async function loginWith(page: Page, file: string) {
  const { cookies } = JSON.parse(readFileSync(file, "utf8"));
  await page.context().addCookies(cookies);
  await page.goto("/dashboard/agenda");
  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
}

export const loginAsDemo = (page: Page) => loginWith(page, AUTH_FILE);
export const loginAsStaff = (page: Page) => loginWith(page, STAFF_AUTH_FILE);

const slotButtons = (page: Page) =>
  page.getByRole("button", { name: /^\d{1,2}:\d{2}/ });

// Abre la página pública, elige un servicio y un día, y devuelve las horas ofrecidas
export async function openSlots(
  page: Page,
  {
    category,
    service,
    date,
    member,
  }: { category: string; service: string; date: string; member?: string },
): Promise<string[]> {
  await page.goto(`/${DEMO.slug}`);
  // la primera categoría parte abierta: un clic más la cerraría
  const categoryButton = page.getByRole("button", {
    name: new RegExp(`^${category}`),
  });
  if ((await categoryButton.getAttribute("aria-expanded")) === "false")
    await categoryButton.click();
  await page.getByRole("button", { name: new RegExp(service) }).click();
  if (member)
    await page.getByRole("button", { name: member, exact: true }).click();
  // Espera la respuesta de ese día (y de ese profesional): las horas que haya
  // en pantalla antes pueden ser de otra búsqueda
  const loaded = page.waitForResponse(
    (r) =>
      r.url().includes("/availability") &&
      r.url().includes(`date=${date}`) &&
      (!member || r.url().includes("memberId=")),
  );
  await page.locator('input[type="date"]').fill(date);
  await loaded;
  await expect(
    slotButtons(page).first().or(page.getByText("No hay horas disponibles")),
  ).toBeVisible();
  return (await slotButtons(page).allTextContents()).map((t) => t.trim());
}

// Reserva la primera hora libre y devuelve esa hora (tal como se mostró)
export async function bookFirstSlot(
  page: Page,
  opts: {
    category: string;
    service: string;
    date: string;
    customer: string;
    member?: string;
  },
): Promise<string> {
  const [time] = await openSlots(page, opts);
  expect(time, "debería haber horas libres ese día").toBeTruthy();
  await slotButtons(page).first().click();
  await page.getByLabel("Nombre").fill(opts.customer);
  await page.getByLabel("Correo").fill(`e2e-${Date.now()}@ejemplo.cl`);
  await page.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(page.getByText("¡Reserva confirmada!")).toBeVisible();
  return time;
}

// Elige una hora (HH:MM, minutos de 5 en 5) con el panel de TimePicker: abre
// el panel desde `field`, toca la hora, los minutos y "Listo"
export async function pickTime(page: Page, field: Locator, hhmm: string) {
  await field.click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("button", { name: hhmm.slice(0, 2), exact: true }).click();
  await panel.getByRole("button", { name: `:${hhmm.slice(3)}`, exact: true }).click();
  await panel.getByRole("button", { name: "Listo" }).click();
  await expect(panel).toBeHidden();
  await expect(field).toHaveText(hhmm);
}
