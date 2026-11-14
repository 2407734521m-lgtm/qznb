import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes('--apply');
const PAGE_SIZE = 500;
const BUCKET = 'media';
const LEGACY_PATH = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/love\/([^/]+)$/i;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment. Do not put the service key in source files.');
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function loadLegacyMedia() {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from('love_wall_media')
      .select('id,post_id,path')
      .like('path', '%/love/%')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not list attachment rows: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const candidates = rows.filter(row => typeof row.path === 'string' && LEGACY_PATH.test(row.path));
  const posts = new Map();
  const postIds = [...new Set(candidates.map(row => row.post_id))];
  for (let i = 0; i < postIds.length; i += 100) {
    const batch = postIds.slice(i, i + 100);
    if (!batch.length) continue;
    const { data, error } = await supabase.from('love_wall_posts')
      .select('id,author_id,is_anonymous').in('id', batch);
    if (error) throw new Error(`Could not inspect post privacy settings: ${error.message}`);
    for (const post of data ?? []) posts.set(post.id, post);
  }

  return candidates.filter(row => {
    const match = row.path.match(LEGACY_PATH);
    const post = posts.get(row.post_id);
    return post?.is_anonymous === true && post.author_id?.toLowerCase() === match?.[1].toLowerCase();
  });
}

const rows = await loadLegacyMedia();
console.log(`${APPLY ? 'APPLY MODE' : 'DRY RUN'}: ${rows.length} legacy anonymous attachment(s) match the migration rules.`);
if (!APPLY) {
  console.log('No data was changed. Review the count, deploy migration 20261114101500_priority_reliability_privacy_fixes.sql, then rerun with --apply to copy and relink objects.');
  process.exit(0);
}

let migrated = 0;
let failed = 0;
for (const row of rows) {
  const match = row.path.match(LEGACY_PATH);
  if (!match) continue;
  const extension = match[2].match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase() ?? 'bin';
  const newPath = `love/${crypto.randomUUID()}.${extension}`;
  let copied = false;
  try {
    const { data: file, error: downloadError } = await supabase.storage.from(BUCKET).download(row.path);
    if (downloadError || !file) throw new Error(downloadError?.message || 'download returned no object');

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(newPath, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
    if (uploadError) throw new Error(uploadError.message);
    copied = true;

    const { error: relinkError } = await supabase.rpc('migrate_legacy_love_wall_media_path', {
      p_media_id: row.id,
      p_old_path: row.path,
      p_new_path: newPath,
    });
    if (relinkError) throw new Error(relinkError.message);

    const { error: removeError } = await supabase.storage.from(BUCKET).remove([row.path]);
    if (removeError) {
      failed++;
      console.error(`Relinked ${row.id}, but old object cleanup failed: ${removeError.message}`);
      continue;
    }
    migrated++;
    console.log(`Migrated attachment ${row.id}`);
  } catch (error) {
    failed++;
    if (copied) await supabase.storage.from(BUCKET).remove([newPath]);
    console.error(`Skipped attachment ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`Finished. Migrated: ${migrated}; failed: ${failed}.`);
if (failed > 0) process.exitCode = 1;
