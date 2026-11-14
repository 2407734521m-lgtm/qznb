import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Disabled until the owner verifies real confirmed QQ mailboxes and SMTP. No
// production account inspection or actual email send is part of these tests.
export async function sendRecovery(admin: SupabaseClient, auth: SupabaseClient, username: string) {
  const redirect = Deno.env.get('USERNAME_LOGIN_REDIRECT_URL') || '';
  if (Deno.env.get('USERNAME_EMAIL_RECOVERY_ENABLED') !== 'true') return;
  try {
    const target = new URL(redirect);
    if (target.protocol !== 'https:' || target.username || target.password || target.hash) return;
  } catch { return; }
  const { data: profiles, error: pe } = await admin.from('profiles').select('id').eq('username', username).limit(2);
  const id = !pe && profiles?.length === 1 ? profiles[0].id : '00000000-0000-0000-0000-000000000000';
  const { data: emails, error: ee } = await admin.from('profile_emails').select('email').eq('profile_id', id).limit(2);
  const { data, error: ue } = await admin.auth.admin.getUserById(id);
  const email = !ee && emails?.length === 1 ? emails[0].email : null;
  // Signup in this repo requires verified QQ email. Do not silently enable
  // synthetic/imported/unconfirmed addresses, or stale profile-email mappings.
  if (pe || ue || !email || !/^[1-9]\d{4,10}@qq\.com$/i.test(email)
    || !data.user?.email_confirmed_at || data.user.email?.toLowerCase() !== email.toLowerCase()) return;
  // Confirmed-at alone is NOT ownership proof: imported/autoconfirmed users can
  // have synthetic addresses. This server-owned attestation must be populated
  // only after a real mailbox ownership challenge, never from user_metadata.
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase()));
  const emailHash = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
  if (data.user.app_metadata?.username_recovery_email_sha256 !== emailHash) return;
  const { data: recipientAllowed, error: quotaError } = await admin.rpc('consume_username_login_recovery_recipient', { p_email_hash: emailHash });
  if (quotaError || recipientAllowed !== true) return;
  await auth.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirect } });
}
