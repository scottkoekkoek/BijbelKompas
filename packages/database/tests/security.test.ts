// BK-006, BK-057: guards that also protect every FUTURE migration.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { client } from "./helpers";

let db: pg.Client;
beforeAll(async () => {
  db = client();
  await db.connect();
});
afterAll(async () => db.end());

describe("database-wide security rules", () => {
  it("every public table has row level security enabled", async () => {
    const { rows } = await db.query("select tablename from pg_tables where schemaname = 'public' and not rowsecurity");
    expect(rows).toEqual([]);
  });

  it("anonymous visitors have no table privileges at all", async () => {
    const { rows } = await db.query(
      "select table_name, privilege_type from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'",
    );
    expect(rows).toEqual([]);
  });

  it("signed-in users can never delete rows directly", async () => {
    const { rows } = await db.query(
      "select table_name from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public' and privilege_type in ('DELETE', 'TRUNCATE')",
    );
    expect(rows).toEqual([]);
  });

  it("security-definer functions pin their search_path", async () => {
    const { rows } = await db.query(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private') and p.prosecdef
         and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`,
    );
    expect(rows).toEqual([]);
  });

  it("the private schema is not reachable for app roles", async () => {
    const { rows } = await db.query(
      "select r from unnest(array['anon', 'authenticated']) r where has_schema_privilege(r, 'private', 'USAGE')",
    );
    expect(rows).toEqual([]);
  });
});
