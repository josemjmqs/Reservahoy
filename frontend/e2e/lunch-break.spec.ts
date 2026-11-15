import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  AUTH_FILE,
  loginAsDemo,
  loginAsStaff,
  openSlots,
  STAFF,
} from "./helpers";

// Almuerzo en el horario: el dueño corta el día y la página pública no ofrece
// esa franja. Cada prueba deja el horario demo como estaba

const TZ = "America/Santiago";
const LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// Día de lunes a viernes (el sábado del seed cierra a las 14:00) desde dentro
// de `fromDays` días, lejos de las reservas del seed y de las otras pruebas
function weekdayFrom(fromDays: number) {
  const d = new Date(Date.now() + fromDays * 86_400_000);
  const dow = () =>
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      d.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short" }),
    );
  while (dow() === 0 || dow() === 6) d.setDate(d.getDate() + 1);
  return {
    date: d.toLocaleDateString("en-CA", { timeZone: TZ }),
    label: LABELS[dow()],
    weekday: dow(),
  };
}

interface Hours {
  weekday: number;
  opensAt: string;
  closesAt: string;
  breakStartsAt: string | null;
  breakEndsAt: string | null;
}

// Horario guardado de un profesional (sin memberId, el de quien entró)
async function getHours(request: APIRequestContext, memberId?: string) {
  const res = await request.get(
    `/api/working-hours${memberId ? `?memberId=${memberId}` : ""}`,
  );
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as Hours[]).map(
    ({ weekday, opensAt, closesAt, breakStartsAt, breakEndsAt }) => ({
      weekday,
      opensAt,
      closesAt,
      breakStartsAt,
      breakEndsAt,
    }),
  );
}

async function putHours(
  request: APIRequestContext,
  days: Hours[],
  memberId?: string,
) {
  const res = await request.put("/api/working-hours", {
    data: { ...(memberId && { memberId }), days },
  });
  expect(res.ok()).toBeTruthy();
}

// Abre el horario y espera a que llegue el guardado: antes de eso la página
// muestra todos los días cerrados
async function openHours(page: Page) {
  const loaded = page.waitForResponse(
    (r) =>
      r.url().includes("/api/working-hours") && r.request().method() === "GET",
  );
  await page.goto("/dashboard/hours");
  await loaded;
}

test("el dueño marca el almuerzo y la página pública no ofrece esas horas", async ({
  page,
}) => {
  const { date, label } = weekdayFrom(19);
  await loginAsDemo(page);
  const original = await getHours(page.request);

  try {
    await openHours(page);
    const day = page.getByRole("listitem").filter({ hasText: label });
    await day
      .getByRole("button", { name: `Agregar almuerzo al ${label.toLowerCase()}` })
      .click();

    // Un almuerzo que se sale del horario (cierra a las 19:00) no se guarda
    await day.getByLabel(`${label}: inicio del almuerzo`).fill("18:30");
    await day.getByLabel(`${label}: término del almuerzo`).fill("19:30");
    await page.getByRole("button", { name: "Guardar horario" }).click();
    await expect(
      page.getByText(`${label}: el almuerzo debe quedar dentro del horario`),
    ).toBeVisible();

    await day.getByLabel(`${label}: inicio del almuerzo`).fill("13:00");
    await day.getByLabel(`${label}: término del almuerzo`).fill("14:00");
    await page.getByRole("button", { name: "Guardar horario" }).click();
    await expect(page.getByText("Horario guardado.")).toBeVisible();

    // Al volver a la pantalla el almuerzo sigue ahí
    await openHours(page);
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: label })
        .getByLabel(`${label}: inicio del almuerzo`),
    ).toHaveValue("13:00");

    // Lavado y peinado (30 min) solo lo hace la dueña: 12:30 termina justo al
    // empezar el almuerzo y la tarde parte a las 14:00
    const slots = (
      await openSlots(page, {
        category: "Pelo",
        service: "Lavado y peinado",
        date,
      })
    ).map((s) => s.slice(0, 5));
    expect(slots).toContain("12:30");
    expect(slots).not.toContain("13:00");
    expect(slots).not.toContain("13:30");
    expect(slots).toContain("14:00");
  } finally {
    await putHours(page.request, original);
  }

  // Quitar el almuerzo vuelve a ofrecer el día completo
  const slots = (
    await openSlots(page, { category: "Pelo", service: "Lavado y peinado", date })
  ).map((s) => s.slice(0, 5));
  expect(slots).toContain("13:00");
});

test("quitar el almuerzo desde la pantalla lo borra al guardar", async ({
  page,
}) => {
  const { label, weekday } = weekdayFrom(19);
  await loginAsDemo(page);
  const original = await getHours(page.request);

  try {
    await putHours(
      page.request,
      original.map((d) =>
        d.weekday === weekday
          ? { ...d, breakStartsAt: "13:00", breakEndsAt: "14:00" }
          : d,
      ),
    );
    await openHours(page);
    await page
      .getByRole("listitem")
      .filter({ hasText: label })
      .getByRole("button", { name: `Quitar almuerzo del ${label.toLowerCase()}` })
      .click();
    await page.getByRole("button", { name: "Guardar horario" }).click();
    await expect(page.getByText("Horario guardado.")).toBeVisible();

    const saved = (await getHours(page.request)).find(
      (d) => d.weekday === weekday,
    );
    expect(saved).toMatchObject({ breakStartsAt: null, breakEndsAt: null });
  } finally {
    await putHours(page.request, original);
  }
});

test("en el celular los botones del almuerzo miden al menos 40 px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await loginAsDemo(page);
  await openHours(page);
  const lunes = page.getByRole("listitem").filter({ hasText: "Lunes" });

  const add = lunes.getByRole("button", { name: "Agregar almuerzo al lunes" });
  expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  // Sin guardar: el horario demo no cambia
  await add.click();
  const remove = lunes.getByRole("button", { name: "Quitar almuerzo del lunes" });
  expect((await remove.boundingBox())!.height).toBeGreaterThanOrEqual(40);
});

test("el profesional ve su almuerzo en solo lectura", async ({
  page,
  playwright,
}, testInfo) => {
  const { label, weekday } = weekdayFrom(19);

  // El dueño le marca el almuerzo a Diego (con su propia sesión)
  const owner = await playwright.request.newContext({
    baseURL: testInfo.project.use.baseURL,
    storageState: AUTH_FILE,
  });
  const members: { id: string; displayName: string }[] = await (
    await owner.get("/api/members")
  ).json();
  const diego = members.find((m) => m.displayName.startsWith(STAFF.name))!.id;
  const original = await getHours(owner, diego);

  try {
    await putHours(
      owner,
      original.map((d) =>
        d.weekday === weekday
          ? { ...d, breakStartsAt: "13:00", breakEndsAt: "14:00" }
          : d,
      ),
      diego,
    );

    await loginAsStaff(page);
    await openHours(page);
    const day = page.getByRole("listitem").filter({ hasText: label });
    const start = day.getByLabel(`${label}: inicio del almuerzo`);
    await expect(start).toHaveValue("13:00");
    await expect(start).toBeDisabled();
    await expect(day.getByLabel(`${label}: término del almuerzo`)).toBeDisabled();
    await expect(page.getByRole("button", { name: /almuerzo/i })).toHaveCount(0);
  } finally {
    await putHours(owner, original, diego);
    await owner.dispose();
  }
});
