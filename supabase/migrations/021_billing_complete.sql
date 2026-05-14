-- ============================================================
-- Migration 021: Billing — COMPLETE standalone (gộp 019 + 020 fix)
-- ============================================================
-- Lý do: 019 bị rollback whole-transaction vì UNION column mismatch.
-- 020 chỉ fix 1 function nhưng table + các function khác chưa được tạo.
-- 021 này = comprehensive idempotent migration. An toàn chạy nhiều lần.
--
-- Bao gồm:
--   1. Seed plans (free + pro) — ON CONFLICT DO UPDATE
--   2. albums lifecycle columns (IF NOT EXISTS)
--   3. payment_requests table (IF NOT EXISTS)
--   4. RLS policies
--   5. Backfill trial Pro 30 ngày cho user cũ chưa có subscription
--   6. RPC: get_studio_plan (FIXED column-aligned UNION)
--   7. RPC: can_create_album
--   8. RPC: admin_approve_payment
--   9. RPC: expire_old_albums
--   10. RPC: list_pending_payments
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. SEED plans
-- ------------------------------------------------------------
INSERT INTO plans (name, display_name, description, price_monthly, price_yearly,
  max_albums, max_photos_per_album, max_storage_mb,
  has_website_builder, has_smart_filter, smart_filter_monthly_limit,
  has_custom_branding, has_download, has_zip_download,
  has_password_protection, has_comments, has_realtime_sync,
  is_active, sort_order)
VALUES
  ('free', 'Miễn phí', 'Tối đa 5 album, lưu trữ 30 ngày', 0, 0,
    5, 500, 5000,
    FALSE, TRUE, 5,
    FALSE, FALSE, FALSE,
    TRUE, TRUE, FALSE,
    TRUE, 1),
  ('pro', 'Pro', 'Album không giới hạn, lưu trữ vĩnh viễn', 49000, 490000,
    -1, -1, -1,
    TRUE, TRUE, -1,
    TRUE, TRUE, TRUE,
    TRUE, TRUE, TRUE,
    TRUE, 2)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  max_albums = EXCLUDED.max_albums,
  max_storage_mb = EXCLUDED.max_storage_mb,
  has_website_builder = EXCLUDED.has_website_builder,
  has_download = EXCLUDED.has_download,
  has_zip_download = EXCLUDED.has_zip_download,
  has_custom_branding = EXCLUDED.has_custom_branding,
  is_active = EXCLUDED.is_active;

-- ------------------------------------------------------------
-- 2. albums lifecycle columns
-- ------------------------------------------------------------
ALTER TABLE albums ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS soft_deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_albums_expires_at ON albums(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_albums_soft_deleted_at ON albums(soft_deleted_at) WHERE soft_deleted_at IS NOT NULL;

-- ------------------------------------------------------------
-- 3. payment_requests table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL CHECK (plan_code IN ('pro')),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  amount INTEGER NOT NULL,
  reference_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  user_note TEXT,
  admin_note TEXT,
  approved_by_email TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_studio ON payment_requests(studio_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_payment_requests_created ON payment_requests(created_at DESC);

ALTER TABLE payment_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_requests_owner_read" ON payment_requests;
CREATE POLICY "payment_requests_owner_read" ON payment_requests
  FOR SELECT USING (studio_id = auth.uid());

DROP POLICY IF EXISTS "payment_requests_owner_insert" ON payment_requests;
CREATE POLICY "payment_requests_owner_insert" ON payment_requests
  FOR INSERT WITH CHECK (studio_id = auth.uid());

-- ------------------------------------------------------------
-- 4. Backfill: trial Pro 30 ngày cho user cũ chưa có subscription
-- ------------------------------------------------------------
DO $$
DECLARE
  v_pro_id UUID;
  v_studio RECORD;
  v_trial_end TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_pro_id FROM plans WHERE name = 'pro' LIMIT 1;
  v_trial_end := NOW() + INTERVAL '30 days';

  FOR v_studio IN SELECT s.id FROM studios s
    LEFT JOIN subscriptions sub ON sub.studio_id = s.id AND sub.status IN ('active', 'trial')
    WHERE sub.id IS NULL
  LOOP
    INSERT INTO subscriptions (studio_id, plan_id, status, billing_cycle,
      current_period_start, current_period_end, trial_ends_at, payment_provider)
    VALUES (v_studio.id, v_pro_id, 'trial', 'monthly', NOW(), v_trial_end, v_trial_end, 'manual');
    UPDATE studios SET plan_id = v_pro_id WHERE id = v_studio.id;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 5. RPC: get_studio_plan — FIXED column-aligned UNION
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS get_studio_plan(UUID);

CREATE OR REPLACE FUNCTION get_studio_plan(p_studio_id UUID)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH active_sub AS (
    SELECT
      p.name::text AS plan_name,
      p.display_name::text AS display_name,
      p.max_albums,
      p.max_storage_mb,
      p.has_zip_download,
      p.has_custom_branding,
      p.has_website_builder,
      (sub.status = 'trial') AS is_trial,
      sub.current_period_end AS expires_at
    FROM subscriptions sub
    JOIN plans p ON p.id = sub.plan_id
    WHERE sub.studio_id = p_studio_id
      AND sub.status IN ('active', 'trial')
      AND (sub.current_period_end IS NULL OR sub.current_period_end > NOW())
    ORDER BY sub.current_period_end DESC NULLS FIRST
    LIMIT 1
  ),
  fallback_free AS (
    SELECT
      'free'::text, 'Miễn phí'::text, 5, 5000,
      FALSE, FALSE, FALSE, FALSE, NULL::timestamptz
    WHERE NOT EXISTS (SELECT 1 FROM active_sub)
  ),
  combined AS (
    SELECT * FROM active_sub
    UNION ALL
    SELECT * FROM fallback_free
  )
  SELECT jsonb_build_object(
    'plan_name', plan_name,
    'display_name', display_name,
    'max_albums', max_albums,
    'max_storage_mb', max_storage_mb,
    'has_zip_download', has_zip_download,
    'has_custom_branding', has_custom_branding,
    'has_website_builder', has_website_builder,
    'is_trial', is_trial,
    'expires_at', expires_at
  )
  FROM combined LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_studio_plan(UUID) TO authenticated, anon;

-- ------------------------------------------------------------
-- 6. RPC: can_create_album
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS can_create_album(UUID);

CREATE OR REPLACE FUNCTION can_create_album(p_studio_id UUID)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan jsonb;
  v_max INT;
  v_current INT;
BEGIN
  v_plan := get_studio_plan(p_studio_id);
  v_max := (v_plan->>'max_albums')::INT;

  IF v_max = -1 THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'unlimited',
      'current', 0, 'max', -1);
  END IF;

  SELECT COUNT(*) INTO v_current FROM albums
    WHERE studio_id = p_studio_id
      AND deleted_at IS NULL
      AND soft_deleted_at IS NULL;

  RETURN jsonb_build_object(
    'allowed', v_current < v_max,
    'reason', CASE WHEN v_current < v_max THEN 'ok' ELSE 'limit_reached' END,
    'current', v_current,
    'max', v_max,
    'plan_name', v_plan->>'plan_name'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION can_create_album(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 7. RPC: admin_approve_payment
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS admin_approve_payment(UUID, TEXT);

CREATE OR REPLACE FUNCTION admin_approve_payment(
  p_request_id UUID,
  p_admin_email TEXT
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req RECORD;
  v_pro_id UUID;
  v_period_end TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_req FROM payment_requests
    WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found or already processed');
  END IF;

  SELECT id INTO v_pro_id FROM plans WHERE name = v_req.plan_code LIMIT 1;
  v_period_end := NOW() + (CASE v_req.billing_cycle
    WHEN 'yearly' THEN INTERVAL '1 year'
    ELSE INTERVAL '1 month' END);

  UPDATE subscriptions SET status = 'expired'
    WHERE studio_id = v_req.studio_id AND status IN ('active', 'trial');
  INSERT INTO subscriptions (studio_id, plan_id, status, billing_cycle,
    current_period_start, current_period_end, payment_provider)
  VALUES (v_req.studio_id, v_pro_id, 'active', v_req.billing_cycle,
    NOW(), v_period_end, 'manual');

  UPDATE studios SET plan_id = v_pro_id WHERE id = v_req.studio_id;

  UPDATE payment_requests SET status = 'approved',
    approved_by_email = p_admin_email, approved_at = NOW()
    WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true, 'expires_at', v_period_end);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_approve_payment(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 8. RPC: expire_old_albums
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS expire_old_albums();

CREATE OR REPLACE FUNCTION expire_old_albums()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_soft_count INT := 0;
  v_hard_count INT := 0;
BEGIN
  WITH freem AS (
    SELECT a.id FROM albums a
    JOIN studios s ON s.id = a.studio_id
    WHERE a.deleted_at IS NULL
      AND a.soft_deleted_at IS NULL
      AND a.created_at < NOW() - INTERVAL '30 days'
      AND COALESCE((get_studio_plan(s.id)->>'plan_name'), 'free') = 'free'
  )
  UPDATE albums SET soft_deleted_at = NOW()
  WHERE id IN (SELECT id FROM freem);
  GET DIAGNOSTICS v_soft_count = ROW_COUNT;

  UPDATE albums SET deleted_at = NOW()
    WHERE soft_deleted_at IS NOT NULL
      AND soft_deleted_at < NOW() - INTERVAL '30 days'
      AND deleted_at IS NULL;
  GET DIAGNOSTICS v_hard_count = ROW_COUNT;

  RETURN jsonb_build_object('soft_deleted', v_soft_count, 'hard_deleted', v_hard_count);
END;
$$;

GRANT EXECUTE ON FUNCTION expire_old_albums() TO authenticated;

-- ------------------------------------------------------------
-- 9. RPC: list_pending_payments
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS list_pending_payments();

CREATE OR REPLACE FUNCTION list_pending_payments()
RETURNS TABLE (
  id UUID, studio_id UUID, studio_name TEXT, user_email TEXT,
  plan_code TEXT, billing_cycle TEXT, amount INTEGER,
  reference_code TEXT, user_note TEXT, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pr.id, pr.studio_id,
    s.name::text AS studio_name,
    u.email::text AS user_email,
    pr.plan_code, pr.billing_cycle, pr.amount,
    pr.reference_code, pr.user_note, pr.created_at
  FROM payment_requests pr
  LEFT JOIN studios s ON s.id = pr.studio_id
  LEFT JOIN auth.users u ON u.id = pr.studio_id
  WHERE pr.status = 'pending'
  ORDER BY pr.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION list_pending_payments() TO authenticated;

COMMIT;

-- ============================================================
-- VERIFY (chạy sau commit):
-- SELECT * FROM plans;
-- SELECT * FROM payment_requests LIMIT 1;
-- SELECT get_studio_plan('00000000-0000-0000-0000-000000000000'::uuid);
-- SELECT * FROM list_pending_payments();
-- ============================================================
