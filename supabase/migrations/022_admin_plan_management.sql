-- ============================================================
-- Migration 022: Admin plan management RPCs
-- ============================================================
-- 2 RPC mới cho admin chỉnh plan của studio bất kỳ:
--   1. admin_set_studio_pro(studio_id, cycle) — activate Pro 30d/1 năm
--   2. admin_cancel_studio_pro(studio_id) — huỷ → fall back về Free
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. admin_set_studio_pro — kích hoạt Pro thủ công (test / sale offline)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS admin_set_studio_pro(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION admin_set_studio_pro(
  p_studio_id UUID,
  p_cycle TEXT,           -- 'monthly' | 'yearly'
  p_admin_email TEXT
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pro_id UUID;
  v_period_end TIMESTAMPTZ;
BEGIN
  IF p_cycle NOT IN ('monthly', 'yearly') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid cycle (monthly/yearly)');
  END IF;

  SELECT id INTO v_pro_id FROM plans WHERE name = 'pro' LIMIT 1;
  v_period_end := NOW() + (CASE p_cycle
    WHEN 'yearly' THEN INTERVAL '1 year'
    ELSE INTERVAL '1 month' END);

  -- Expire mọi subscription active hiện tại
  UPDATE subscriptions SET status = 'expired'
    WHERE studio_id = p_studio_id AND status IN ('active', 'trial');

  -- Insert Pro mới
  INSERT INTO subscriptions (studio_id, plan_id, status, billing_cycle,
    current_period_start, current_period_end, payment_provider)
  VALUES (p_studio_id, v_pro_id, 'active', p_cycle,
    NOW(), v_period_end, 'manual');

  UPDATE studios SET plan_id = v_pro_id WHERE id = p_studio_id;

  RETURN jsonb_build_object('success', true, 'cycle', p_cycle,
    'expires_at', v_period_end, 'admin', p_admin_email);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_set_studio_pro(UUID, TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 2. admin_cancel_studio_pro — huỷ Pro → studio rơi về Free ngay
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS admin_cancel_studio_pro(UUID, TEXT);

CREATE OR REPLACE FUNCTION admin_cancel_studio_pro(
  p_studio_id UUID,
  p_admin_email TEXT
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INT;
  v_free_id UUID;
BEGIN
  UPDATE subscriptions SET status = 'canceled', canceled_at = NOW()
    WHERE studio_id = p_studio_id AND status IN ('active', 'trial');
  GET DIAGNOSTICS v_count = ROW_COUNT;

  SELECT id INTO v_free_id FROM plans WHERE name = 'free' LIMIT 1;
  UPDATE studios SET plan_id = v_free_id WHERE id = p_studio_id;

  RETURN jsonb_build_object('success', true, 'canceled_count', v_count,
    'admin', p_admin_email);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_cancel_studio_pro(UUID, TEXT) TO authenticated;

COMMIT;

-- VERIFY:
-- SELECT admin_set_studio_pro('<studio-id>', 'monthly', 'admin@x.com');
-- SELECT admin_cancel_studio_pro('<studio-id>', 'admin@x.com');
