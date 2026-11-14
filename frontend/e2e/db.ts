import { createHash, randomBytes, randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { parseEnv } from "util";
import { Pool } from "pg";

// Acceso directo a la base para lo que la API no permite en una prueba: crear
// una invitación con un token conocido (en la base se guarda solo su hash) y
// borrar lo que la prueba creó. Igual que el seed, solo contra bases locales.

// En CI viene en el entorno; en local se toma de backend/.env (solo esa
// variable, sin mostrar ni cargar el resto del archivo)
function databaseUrl(): string {
  const fromEnv = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
  if (fromEnv) return fromEnv;
  const file = join(__dirname, "..", "..", "backend", ".env");
  if (existsSync(file)) {
    const url = parseEnv(readFileSync(file, "utf8")).DATABASE_URL;
    if (url) return url;
  }
  throw new Error(
    "Falta E2E_DATABASE_URL o DATABASE_URL (o backend/.env con DATABASE_URL)",
  );
}

let pool: Pool | undefined;

function db(): Pool {
  if (pool) return pool;
  const url = new URL(databaseUrl());
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error(
      `e2e/db.ts cancelado: la base apunta a "${url.hostname || "(vacío)"}". Solo se permite una base local.`,
    );
  }
  url.searchParams.delete("schema"); // parámetro de Prisma, no de pg
  pool = new Pool({ connectionString: url.toString(), max: 2 });
  return pool;
}

// Crea una invitación vigente (7 días) y devuelve el token del enlace
export async function createInvitation(
  memberId: string,
  email: string,
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await db().query(
    `INSERT INTO "MemberInvitation" (id, email, "tokenHash", "expiresAt", "memberId")
     VALUES ($1, $2, $3, now() + interval '7 days', $4)`,
    [randomUUID(), email.trim().toLowerCase(), tokenHash, memberId],
  );
  return token;
}

// Activa o desactiva un miembro directo en la base, sin pasar por la API (que
// además cierra sus sesiones): simula una sesión que quedó abierta sin acceso
export async function setMemberActive(memberId: string, active: boolean) {
  await db().query(`UPDATE "Member" SET active = $2 WHERE id = $1`, [
    memberId,
    active,
  ]);
}

// Borra un profesional de prueba sin reservas (las invitaciones y sus
// servicios se van en cascada; el horario y los bloqueos no)
export async function deleteMember(memberId: string) {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM "WorkingHours" WHERE "memberId" = $1`, [
      memberId,
    ]);
    await client.query(`DELETE FROM "TimeBlock" WHERE "memberId" = $1`, [
      memberId,
    ]);
    await client.query(`DELETE FROM "Member" WHERE id = $1`, [memberId]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Borra una cuenta de prueba (sus tokens se van en cascada). Antes hay que
// borrar o desenlazar sus membresías
export async function deleteUserByEmail(email: string) {
  await db().query(`DELETE FROM "User" WHERE email = $1`, [
    email.trim().toLowerCase(),
  ]);
}

export async function closeDb() {
  await pool?.end();
  pool = undefined;
}
