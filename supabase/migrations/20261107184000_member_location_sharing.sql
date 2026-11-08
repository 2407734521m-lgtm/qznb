-- Explicit opt-in sharing of city/region-level location.
-- Raw GPS coordinates are never stored in the database.
ALTER TABLE public.member_presence
  ADD COLUMN IF NOT EXISTS location_share_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS location_consented_at timestamptz;

CREATE TABLE IF NOT EXISTS public.location_geocode_rate_limit (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  last_request_at timestamptz NOT NULL DEFAULT 'epoch'::timestamptz
);
ALTER TABLE public.location_geocode_rate_limit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.location_geocode_rate_limit FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.location_geocode_cache (
  location_key text PRIMARY KEY CHECK (location_key ~ '^[a-f0-9]{64}$'),
  location_label text NOT NULL CHECK (char_length(location_label) BETWEEN 2 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.location_geocode_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.location_geocode_cache FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.location_geocode_cache TO service_role;

CREATE OR REPLACE FUNCTION public.claim_location_geocode_slot()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_last timestamptz;
  v_now timestamptz := clock_timestamp();
BEGIN
  INSERT INTO public.location_geocode_rate_limit(singleton, last_request_at)
  VALUES (true, 'epoch'::timestamptz)
  ON CONFLICT (singleton) DO NOTHING;

  SELECT last_request_at
    INTO v_last
    FROM public.location_geocode_rate_limit
   WHERE singleton = true
   FOR UPDATE;

  IF v_last > v_now - interval '1 second' THEN
    RETURN false;
  END IF;

  UPDATE public.location_geocode_rate_limit
     SET last_request_at = v_now
   WHERE singleton = true;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_location_geocode_slot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_location_geocode_slot() TO service_role;

-- Keep location out of ordinary member reads. This RPC is already reserved for super-admins;
-- only an explicitly shared location is returned.
CREATE OR REPLACE FUNCTION public.admin_member_accounts()
RETURNS TABLE(
  id uuid,
  username text,
  display_name text,
  real_name text,
  role text,
  joined boolean,
  created_at timestamptz,
  email text,
  last_sign_in_at timestamptz,
  location text,
  device text,
  presence_updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_role := public.my_role();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.username::text,
    p.display_name,
    p.real_name,
    p.role,
    p.joined,
    p.created_at,
    pe.email,
    u.last_sign_in_at,
    CASE WHEN mp.location_share_enabled IS TRUE THEN mp.location ELSE NULL END,
    mp.device,
    mp.updated_at
  FROM public.profiles p
  LEFT JOIN public.profile_emails pe ON pe.profile_id = p.id
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.member_presence mp ON mp.profile_id = p.id
  ORDER BY p.created_at DESC
  LIMIT 1000;
END;
$function$;


-- Authenticated members may read and change only their own opt-in location.
-- Keep direct table access revoked; all writes pass through these owner-scoped RPCs.
CREATE OR REPLACE FUNCTION public.get_my_shared_region()
RETURNS TABLE(
  location text,
  location_share_enabled boolean,
  location_consented_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    CASE WHEN mp.location_share_enabled IS TRUE THEN mp.location ELSE NULL END,
    COALESCE(mp.location_share_enabled, false),
    mp.location_consented_at
  FROM (SELECT v_uid AS profile_id) AS own
  LEFT JOIN public.member_presence mp ON mp.profile_id = own.profile_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_my_shared_region(p_location text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_location text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_location := regexp_replace(trim(coalesce(p_location, '')), '[[:space:]]+', ' ', 'g');
  IF char_length(v_location) < 2 OR char_length(v_location) > 80 THEN
    RAISE EXCEPTION '请填写 2～80 个字符的城市或地区名称。';
  END IF;
  IF v_location ~ '(\d{1,5}[[:space:]]*(号|栋|幢|单元|室)|街道|小区|巷|弄|楼[0-9]*)' THEN
    RAISE EXCEPTION '这里只保存城市或地区，请不要填写街道、门牌号或楼栋信息。';
  END IF;

  INSERT INTO public.member_presence(
    profile_id, location, location_share_enabled, location_consented_at, updated_at
  )
  VALUES (v_uid, v_location, true, clock_timestamp(), clock_timestamp())
  ON CONFLICT (profile_id) DO UPDATE
    SET location = EXCLUDED.location,
        location_share_enabled = true,
        location_consented_at = EXCLUDED.location_consented_at,
        updated_at = EXCLUDED.updated_at;

  RETURN v_location;
END;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_my_shared_region()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE public.member_presence
     SET location = NULL,
         location_share_enabled = false,
         location_consented_at = NULL,
         updated_at = clock_timestamp()
   WHERE profile_id = v_uid;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_shared_region() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_my_shared_region(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_my_shared_region() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_shared_region() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_shared_region(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_my_shared_region() TO authenticated;
