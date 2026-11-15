import { randomUUID } from "node:crypto";
import pg from "pg";

/** Local Supabase stack defaults (public demo values, not secrets). */
export const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
export const API_URL = process.env.SUPABASE_API_URL ?? "http://127.0.0.1:54321";
export const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export function client(): pg.Client {
  return new pg.Client({ connectionString: DB_URL });
}

/** Creates a fictitious auth user as the superuser; the signup trigger creates profile + preferences. */
export async function createUser(db: pg.Client, email = `test-${randomUUID()}@example.test`): Promise<string> {
  const id = randomUUID();
  await db.query(
    `insert into auth.users (id, instance_id, email, aud, role, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', $2, 'authenticated', 'authenticated', now(), now())`,
    [id, email],
  );
  return id;
}

export async function deleteUser(db: pg.Client, id: string): Promise<void> {
  await db.query("delete from auth.users where id = $1", [id]);
}

type Role = { kind: "anon" } | { kind: "user"; id: string } | { kind: "service" };

/**
 * Runs fn inside a transaction as the given role, exactly as PostgREST does
 * (set role + request.jwt.claims), and always rolls back.
 */
export async function as<T>(db: pg.Client, role: Role, fn: (q: pg.Client) => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    if (role.kind === "anon") {
      await db.query("set local role anon");
      await db.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    } else if (role.kind === "service") {
      await db.query("set local role service_role");
      await db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    } else {
      await db.query("set local role authenticated");
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: role.id, role: "authenticated" }),
      ]);
    }
    return await fn(db);
  } finally {
    await db.query("rollback");
  }
}

/** Expects the promise to fail with a Postgres error whose code matches. */
export async function pgError(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as { code?: string }).code ?? "unknown";
  }
  throw new Error("expected a database error, but the query succeeded");
}

export const PG = {
  insufficientPrivilege: "42501",
  checkViolation: "23514",
  foreignKeyViolation: "23503",
  uniqueViolation: "23505",
} as const;
