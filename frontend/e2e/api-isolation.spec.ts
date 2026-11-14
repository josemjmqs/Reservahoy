import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import {
  expect,
  request,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";

// Aislamiento entre negocios en TODA la API, con peticiones HTTP reales:
// - sin sesión, cada ruta del panel responde 401
// - con la sesión de otro negocio, nunca se ve ni se cambia nada ajeno (404 / 400)
// - con la sesión de un profesional (STAFF) del negocio A, solo ve y cambia lo
//   suyo: lo de otro profesional responde 404 y lo que es solo del dueño, 403
// Negocio A = demo del seed (dueña Camila y profesional Diego, ambos con cuenta).
// Negocio B = uno nuevo registrado por la prueba.

const API = process.env.E2E_API_URL ?? "http://localhost:3000";
const run = Date.now().toString(36);

// Cada contexto usa su propia IP (X-Forwarded-For; el backend confía en un proxy)
// para no chocar con el límite de 60 peticiones por minuto por IP
const context = (ip: string) =>
  request.newContext({
    baseURL: API,
    extraHTTPHeaders: { "X-Forwarded-For": ip },
  });

const dateIn = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toLocaleDateString("en-CA", {
    timeZone: "America/Santiago",
  });
const range = `from=${dateIn(-7)}&to=${dateIn(14)}`;

const OWNER_EMAIL = "demo@reservahoy.local";
const STAFF_EMAIL = "diego@reservahoy.local";

interface Ids {
  member: string;
  service: string;
  booking: string;
  block: string; // bloqueo de todo el negocio
  ownerBlock: string; // bloqueo solo de la dueña
}
type Call = (ctx: APIRequestContext, a: Ids) => Promise<APIResponse>;
// Estado esperado (o varios aceptables) o una revisión propia de la respuesta
type Outcome =
  number | number[] | ((res: APIResponse, a: Ids) => Promise<void>);

async function expectOutcome(res: APIResponse, expected: Outcome, a: Ids) {
  if (typeof expected === "function") {
    expect(res.status()).toBe(200);
    await expected(res, a);
  } else {
    expect([expected].flat()).toContain(res.status());
  }
}

// Rutas que no requieren sesión (públicas o de autenticación)
const PUBLIC_ROUTES = [
  "GET /",
  "GET /health",
  "GET /health/live",
  "POST /auth/register",
  "POST /auth/login",
  "POST /auth/logout",
  "POST /auth/forgot-password",
  "POST /auth/reset-password",
  "POST /auth/verify-email",
  "GET /public/:slug",
  "GET /public/:slug/availability",
  "POST /public/:slug/bookings",
  "GET /public/bookings/:token",
  "POST /public/bookings/:token/cancel",
  "GET /invitations/:token",
  "POST /invitations/:token/accept",
];

// Rutas del panel: cómo llamarlas apuntando a recursos de la dueña del negocio A
// y qué debe responder cada sesión: `other` (dueño del negocio B) y `staff`
// (profesional del negocio A). Ambos son obligatorios en cada ruta nueva
const PANEL_ROUTES: Record<
  string,
  { call: Call; other: Outcome; staff: Outcome }
> = {
  "GET /auth/me": {
    call: (c) => c.get("/auth/me"),
    other: async (res) => {
      expect((await res.json()).email).not.toBe("demo@reservahoy.local");
    },
    staff: async (res) => {
      expect((await res.json()).email).toBe(STAFF_EMAIL);
    },
  },
  "POST /auth/resend-verification": {
    // B reenvía su propio correo: no toca nada de A
    call: (c) => c.post("/auth/resend-verification"),
    other: [200, 429],
    staff: [200, 429],
  },
  "GET /agenda": {
    call: (c, a) => c.get(`/agenda?${range}&memberId=${a.member}`),
    other: 404,
    staff: 404, // la agenda de otro profesional
  },
  "GET /agenda/next": {
    call: (c, a) => c.get(`/agenda/next?memberId=${a.member}`),
    other: 404,
    staff: 404,
  },
  "PATCH /agenda/:id/status": {
    call: (c, a) =>
      c.patch(`/agenda/${a.booking}/status`, { data: { status: "CANCELLED" } }),
    other: 404,
    staff: 404, // una reserva de la dueña
  },
  "GET /services": {
    call: (c) => c.get("/services"),
    other: async (res, a) => {
      const ids = (await res.json()).map((s: { id: string }) => s.id);
      expect(ids).not.toContain(a.service);
    },
    staff: async (res, a) => {
      const ids = (await res.json()).map((s: { id: string }) => s.id);
      expect(ids).toContain(a.service);
    },
  },
  "POST /services": {
    // crea un servicio en B; no hay id de A que apuntar
    call: (c) =>
      c.post("/services", { data: { name: "Servicio B", durationMin: 30 } }),
    other: 201,
    staff: 403,
  },
  "PATCH /services/:id": {
    call: (c, a) =>
      c.patch(`/services/${a.service}`, { data: { name: "Hackeado" } }),
    other: 404,
    staff: 403,
  },
  "POST /services/:id/image": {
    // sin R2 configurado responde 503 antes de mirar el dueño; nunca 2xx
    call: (c, a) => c.post(`/services/${a.service}/image`),
    other: [404, 503],
    staff: 403, // el rol se revisa antes que R2
  },
  "DELETE /services/:id/image": {
    call: (c, a) => c.delete(`/services/${a.service}/image`),
    other: 404,
    staff: 403,
  },
  "DELETE /services/:id": {
    call: (c, a) => c.delete(`/services/${a.service}`),
    other: 404,
    staff: 403,
  },
  "GET /members": {
    call: (c) => c.get("/members"),
    other: async (res, a) => {
      const ids = (await res.json()).map((m: { id: string }) => m.id);
      expect(ids).not.toContain(a.member);
    },
    staff: async (res, a) => {
      const ids = (await res.json()).map((m: { id: string }) => m.id);
      expect(ids).toContain(a.member);
    },
  },
  "POST /members": {
    // asignarle a un profesional de B un servicio de A
    call: (c, a) =>
      c.post("/members", {
        data: { displayName: "Intruso", serviceIds: [a.service] },
      }),
    other: 400,
    staff: 403,
  },
  "PATCH /members/:id": {
    call: (c, a) =>
      c.patch(`/members/${a.member}`, { data: { active: false } }),
    other: 404,
    staff: 403,
  },
  "POST /members/:id/invitation": {
    // invitar a un miembro de A: solo su dueño puede (no sale ningún correo)
    call: (c, a) =>
      c.post(`/members/${a.member}/invitation`, {
        data: { email: `e2e-invite-${run}@test.local` },
      }),
    other: 404,
    staff: 403,
  },
  "DELETE /members/:id/invitation": {
    call: (c, a) => c.delete(`/members/${a.member}/invitation`),
    other: 404,
    staff: 403,
  },
  "GET /working-hours": {
    call: (c, a) => c.get(`/working-hours?memberId=${a.member}`),
    other: 404,
    staff: 404, // el horario de otro profesional
  },
  "PUT /working-hours": {
    call: (c, a) =>
      c.put("/working-hours", {
        data: {
          memberId: a.member,
          days: [{ weekday: 1, opensAt: "10:00", closesAt: "11:00" }],
        },
      }),
    other: 404,
    staff: 403, // el horario lo cambia solo el dueño
  },
  "GET /time-blocks": {
    call: (c) => c.get("/time-blocks"),
    other: async (res, a) => {
      const ids = (await res.json()).blocks.map((b: { id: string }) => b.id);
      expect(ids).not.toContain(a.block);
      expect(ids).not.toContain(a.ownerBlock);
    },
    // ve los bloqueos de todo el negocio, no los de otro profesional
    staff: async (res, a) => {
      const ids = (await res.json()).blocks.map((b: { id: string }) => b.id);
      expect(ids).toContain(a.block);
      expect(ids).not.toContain(a.ownerBlock);
    },
  },
  "POST /time-blocks": {
    call: (c, a) =>
      c.post("/time-blocks", {
        data: {
          startDate: "2033-02-01",
          endDate: "2033-02-01",
          allDay: true,
          memberId: a.member,
        },
      }),
    other: 404,
    staff: 403, // solo bloquea su propio horario
  },
  "DELETE /time-blocks/:id": {
    call: (c, a) => c.delete(`/time-blocks/${a.block}`),
    other: 404,
    staff: 404, // un bloqueo de todo el negocio
  },
  "GET /business": {
    call: (c) => c.get("/business"),
    other: async (res) => {
      expect((await res.json()).name).not.toBe("Peluquería Demo");
    },
    staff: async (res) => {
      expect((await res.json()).name).toBe("Peluquería Demo");
    },
  },
  "PATCH /business": {
    // B cambia su propio negocio; al final se revisa que el de A siga igual
    call: (c) =>
      c.patch("/business", {
        data: { name: "Negocio B editado", phone: "22 222 2222" },
      }),
    other: 200,
    staff: 403,
  },
  "GET /settings": {
    call: (c) => c.get("/settings"),
    other: async (res) => {
      expect((await res.json()).email).not.toBe("demo@reservahoy.local");
    },
    staff: async (res) => {
      expect((await res.json()).email).toBe(STAFF_EMAIL);
    },
  },
  "PATCH /settings": {
    // B cambia sus propios ajustes; al final se revisa que los de A sigan igual
    call: (c) => c.patch("/settings", { data: { newBookingEmail: false } }),
    other: 200,
    staff: 200, // sus propios ajustes; afterAll los deja como estaban
  },
};

// Todas las rutas declaradas en los controladores del backend
function backendRoutes(): string[] {
  const root = join(process.cwd(), "../backend/src");
  const files = readdirSync(root, { recursive: true, encoding: "utf8" }).filter(
    (f) => f.endsWith(".controller.ts"),
  );
  return files.flatMap((f) => {
    const src = readFileSync(join(root, f), "utf8");
    const prefix = src.match(/@Controller\((?:'([^']*)')?\)/)?.[1] ?? "";
    return [
      ...src.matchAll(/@(Get|Post|Patch|Put|Delete)\((?:'([^']*)')?\)/g),
    ].map(
      ([, method, path]) =>
        `${method.toUpperCase()} /${[prefix, path].filter(Boolean).join("/")}`,
    );
  });
}

let anon: APIRequestContext;
let ownerA: APIRequestContext;
let ownerB: APIRequestContext;
let staffA: APIRequestContext;
const a = {} as Ids;

test.beforeAll(async () => {
  [anon, ownerA, ownerB, staffA] = await Promise.all([
    context("203.0.113.10"),
    context("203.0.113.11"),
    context("203.0.113.12"),
    context("203.0.113.13"),
  ]);

  for (const [ctx, email] of [
    [ownerA, OWNER_EMAIL],
    [staffA, STAFF_EMAIL],
  ] as const) {
    const login = await ctx.post("/auth/login", {
      data: { email, password: "demo1234" },
    });
    expect(
      login.ok(),
      `¿Corriste el seed? (npx prisma db seed) · ${email}`,
    ).toBeTruthy();
  }

  const register = await ownerB.post("/auth/register", {
    data: {
      name: "Dueño B",
      email: `e2e-${run}@test.local`,
      password: "password123",
      businessName: "Negocio B",
      slug: `e2e-${run}`,
    },
  });
  expect(register.ok()).toBeTruthy();

  // Recursos de la dueña: para el profesional son "de otro"
  const members = await (await ownerA.get("/members")).json();
  a.member = members.find((m: { role: string }) => m.role === "OWNER").id;
  a.service = (await (await ownerA.get("/services")).json())[0].id;
  const agenda = await (await ownerA.get(`/agenda?${range}`)).json();
  expect(
    agenda.length,
    "el seed debe dejar reservas en el negocio demo",
  ).toBeGreaterThan(0);
  a.booking = agenda.find(
    (b: { member: { id: string } }) => b.member.id === a.member,
  ).id;
  a.block = (
    await (
      await ownerA.post("/time-blocks", {
        data: {
          startDate: "2033-01-10",
          endDate: "2033-01-10",
          allDay: true,
          reason: "e2e",
        },
      })
    ).json()
  ).id;
  a.ownerBlock = (
    await (
      await ownerA.post("/time-blocks", {
        data: {
          startDate: "2033-01-11",
          endDate: "2033-01-11",
          allDay: true,
          memberId: a.member,
          reason: "e2e dueña",
        },
      })
    ).json()
  ).id;
});

test.afterAll(async () => {
  await ownerA?.delete(`/time-blocks/${a.block}`);
  await ownerA?.delete(`/time-blocks/${a.ownerBlock}`);
  // PATCH /settings del profesional cambió sus propios avisos: se restauran
  await staffA?.patch("/settings", { data: { newBookingEmail: true } });
  await Promise.all([anon, ownerA, ownerB, staffA].map((c) => c?.dispose()));
});

test("cada ruta del backend está clasificada como pública o del panel", () => {
  const known = new Set([...PUBLIC_ROUTES, ...Object.keys(PANEL_ROUTES)]);
  const missing = backendRoutes().filter((r) => !known.has(r));
  expect(
    missing,
    "Ruta nueva sin cubrir: agrégala a PANEL_ROUTES (con su prueba de aislamiento) o a PUBLIC_ROUTES",
  ).toEqual([]);
});

for (const [route, { call }] of Object.entries(PANEL_ROUTES)) {
  test(`sin sesión: ${route} responde 401`, async () => {
    const fake = {
      member: "x",
      service: "x",
      booking: "x",
      block: "x",
      ownerBlock: "x",
    };
    expect((await call(anon, fake)).status()).toBe(401);
  });
}

for (const [route, { call, other }] of Object.entries(PANEL_ROUTES)) {
  test(`otro negocio: ${route} no ve ni cambia nada ajeno`, async () => {
    await expectOutcome(await call(ownerB, a), other, a);
  });
}

for (const [route, { call, staff }] of Object.entries(PANEL_ROUTES)) {
  test(`profesional: ${route} solo ve y cambia lo suyo`, async () => {
    await expectOutcome(await call(staffA, a), staff, a);
  });
}

// Se revisa después de los intentos del otro negocio y del profesional
test("los datos del negocio A siguen intactos", async () => {
  const agenda = await (await ownerA.get(`/agenda?${range}`)).json();
  expect(
    agenda.find((b: { id: string }) => b.id === a.booking).status,
  ).not.toBe("CANCELLED");
  const services = await (await ownerA.get("/services")).json();
  const service = services.find((s: { id: string }) => s.id === a.service);
  expect(service.name).not.toBe("Hackeado");
  expect(service.active).toBe(true);
  const members = await (await ownerA.get("/members")).json();
  expect(members.find((m: { id: string }) => m.id === a.member).active).toBe(
    true,
  );
  expect((await (await ownerA.get("/settings")).json()).newBookingEmail).toBe(
    true,
  );
  expect(await (await ownerA.get("/business")).json()).toMatchObject({
    name: "Peluquería Demo",
    phone: "+56 9 1234 5678",
  });
  const blocks = (await (await ownerA.get("/time-blocks")).json()).blocks;
  expect(blocks.map((b: { id: string }) => b.id)).toContain(a.block);
});
