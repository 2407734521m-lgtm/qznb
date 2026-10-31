#!/usr/bin/env node
/**
 * Normalize generated Supabase types using schema facts verified in migrations.
 * Runs against the temporary output before gen-types.sh atomically replaces
 * the checked-in file. Any unexpected generated shape fails safely.
 */
import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/normalize-database-types.mjs <generated-types-file>");
  process.exit(2);
}

const IDENTITY_TABLES = [
  "album_photos", "albums", "backup_logs", "board_messages", "comments",
  "events", "greetings", "hot_snippets", "notifications", "posts", "reports",
  "time_capsules", "timelines", "wishes",
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
  admin_create_maintenance_code: "{ code: string; expires_at: string; max_uses: number }",
  admin_revoke_maintenance_codes: "{ ok: boolean; revoked_count: number }",
  maintenance_redeem_code: "{ ok: boolean; message?: string; token?: string; expires_at?: string }",
  member_video: "{ path: string; status: string }[]",
};

const RPC_ARGS = {
  admin_update_profile:
    "{ target: string; p_display_name: string | null; p_real_name?: string | null; p_signature: string | null; p_bio: string | null; p_personality: string | null; p_hobbies: string | null; p_age: number | null; p_video_status?: string | null }",
  create_invite_code: "{ new_code: string; nick: string | null }",
  submit_game_profile: "{ gname: string; guid: string | null; rnk: string | null }",
};

const lines = fs.readFileSync(file, "utf8").split("\n");

function sectionBounds(sectionName, nextSectionName) {
  const start = lines.findIndex((line) => line.trim() === sectionName + ": {");
  const end = lines.findIndex((line, index) => index > start && line.trim() === nextSectionName + ": {");
  if (start < 0 || end < 0) {
    throw new Error("Missing generated section: " + sectionName + "; headers=" + lines.filter((line) => /Tables|Views|Functions|Enums/.test(line)).map((line) => JSON.stringify(line)).join(" | ") + "; firstLines=" + lines.slice(0, 8).map((line) => JSON.stringify(line)).join(" | "));
  }
  return { start, end };
}

function directChildBounds(section, name) {
  const start = lines.findIndex((line, index) => index > section.start && index < section.end && line.trim() === name + ": {");
  if (start < 0 || start >= section.end) {
    throw new Error("Missing generated entry: " + name);
  }
  let end = section.end;
  for (let i = start + 1; i < section.end; i += 1) {
    if (/^      [a-z_][\w]*: \{$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
}

const tablesSection = sectionBounds("Tables", "Views");
for (const tableName of IDENTITY_TABLES) {
  const table = directChildBounds(tablesSection, tableName);
  const insertStart = lines.indexOf("        Insert: {", table.start + 1);
  const updateStart = lines.indexOf("        Update: {", table.start + 1);
  if (insertStart < 0 || updateStart < 0 || insertStart >= updateStart || updateStart >= table.end) {
    throw new Error("Missing Insert/Update block: " + tableName);
  }

  const idIndexes = [];
  for (let i = insertStart + 1; i < updateStart; i += 1) {
    if (/^          id\??: number$/.test(lines[i])) idIndexes.push(i);
  }
  if (idIndexes.length !== 1) {
    throw new Error("Expected exactly one numeric Insert.id in " + tableName);
  }
  lines[idIndexes[0]] = "          id?: number";
}

const functionsSection = sectionBounds("Functions", "Enums");
for (const [functionName, argsType] of Object.entries(RPC_ARGS)) {
  const fn = directChildBounds(functionsSection, functionName);
  const argsIndexes = [];
  for (let i = fn.start + 1; i < fn.end; i += 1) {
    if (/^        Args: /.test(lines[i])) argsIndexes.push(i);
  }
  if (argsIndexes.length !== 1) {
    throw new Error("Expected exactly one Args field in " + functionName);
  }
  lines[argsIndexes[0]] = "        Args: " + argsType;
}

for (const [functionName, returnType] of Object.entries(RPC_RETURNS)) {
  const fn = directChildBounds(functionsSection, functionName);
  const returnsIndexes = [];
  for (let i = fn.start + 1; i < fn.end; i += 1) {
    if (/^        Returns: /.test(lines[i])) returnsIndexes.push(i);
  }
  if (returnsIndexes.length !== 1) {
    throw new Error("Expected exactly one Returns field in " + functionName);
  }
  lines[returnsIndexes[0]] = "        Returns: " + returnType;
}

fs.writeFileSync(file, lines.join("\n"), "utf8");
console.log(
  "✓ Normalized " + IDENTITY_TABLES.length +
  " IDENTITY Insert IDs and " + Object.keys(RPC_RETURNS).length +
  " RPC return types.",
);
