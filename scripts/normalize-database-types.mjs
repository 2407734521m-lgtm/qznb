#!/usr/bin/env node
/**
 * Normalize the generated Supabase types without changing runtime schema.
 *
 * Supabase's schema export has historically emitted IDENTITY primary keys as
 * required Insert fields in this repository's generated snapshot. Keep the
 * known identity columns optional, and restore precise return types for the
 * RPCs whose SQL definitions are tracked in supabase/migrations.
 *
 * This runs against the temporary output before gen-types.sh atomically swaps
 * the checked-in file, so any mismatch fails safely.
 */
import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/normalize-database-types.mjs <generated-types-file>");
  process.exit(2);
}

const IDENTITY_TABLES = [
  "album_photos",
  "albums",
  "backup_logs",
  "board_messages",
  "comments",
  "events",
  "greetings",
  "hot_snippets",
  "notifications",
  "posts",
  "reports",
  "time_capsules",
  "timelines",
  "wishes",
];

const RPC_RETURNS = {
  admin_presence_summary:
    "{ online_count: number; active_count: number; sampled_at: string }",
  public_guest_landing:
    "{ site_title: string; site_subtitle: string; home_banner_text: string; home_banner_url: string; close_login_entry: string; skip_login_screen: string; maintenance: string; maintenance_title: string; maintenance_msg: string; notices: { id: number; title: string | null; content: string; created_at: string }[] }",
  member_directory:
    "{ id: string; username: string; display_name: string | null; personality: string | null; signature: string | null; avatar_path: string | null }[]",
  member_detail:
    "{ id: string; username: string; display_name: string | null; age: number | null; personality: string | null; signature: string | null; bio: string | null; hobbies: string | null; avatar_path: string | null; theme: Json; contact: string | null; social: string | null }[]",
  my_role: "string | null",
};

function tableBlockPattern(name) {
  return new RegExp(
    "^      " + name + ": \\{[\\s\\S]*?(?=^      [a-z_][\\w]*: \\{|^    Views: \\{)",
    "m",
  );
}

function functionBlockPattern(name) {
  return new RegExp(
    "^      " + name + ": \\{[\\s\\S]*?(?=^      [a-z_][\\w]*: \\{|^    Enums: \\{)",
    "m",
  );
}

let source = fs.readFileSync(file, "utf8");

for (const tableName of IDENTITY_TABLES) {
  const match = tableBlockPattern(tableName).exec(source);
  if (!match) throw new Error("Missing expected table: " + tableName);

  const block = match[0];
  const insertStart = block.indexOf("        Insert: {");
  const updateStart = block.indexOf("        Update: {");
  if (insertStart < 0 || updateStart <= insertStart) {
    throw new Error("Missing Insert/Update block: " + tableName);
  }

  const before = block.slice(0, insertStart);
  const insert = block.slice(insertStart, updateStart);
  const after = block.slice(updateStart);
  const idLines = insert.match(/^          id\??: number$/gm) ?? [];
  if (idLines.length !== 1) {
    throw new Error("Expected exactly one numeric Insert.id in " + tableName);
  }

  const normalizedInsert = insert.replace(
    /^          id: number$/m,
    "          id?: number",
  );
  source =
    source.slice(0, match.index) +
    before +
    normalizedInsert +
    after +
    source.slice(match.index + block.length);
}

for (const [functionName, returnType] of Object.entries(RPC_RETURNS)) {
  const match = functionBlockPattern(functionName).exec(source);
  if (!match) throw new Error("Missing expected RPC: " + functionName);

  const block = match[0];
  const returns = block.match(/^        Returns: .*$/gm) ?? [];
  if (returns.length !== 1) {
    throw new Error("Expected exactly one Returns field in " + functionName);
  }

  const normalizedBlock = block.replace(
    /^        Returns: .*$/m,
    "        Returns: " + returnType,
  );
  source =
    source.slice(0, match.index) +
    normalizedBlock +
    source.slice(match.index + block.length);
}

fs.writeFileSync(file, source, "utf8");
console.log(
  "✓ Normalized " +
    IDENTITY_TABLES.length +
    " IDENTITY Insert IDs and " +
    Object.keys(RPC_RETURNS).length +
    " RPC return types.",
);
