-- ============================================================
-- FIX: Trigger tạo studio khi user đăng ký
-- Chạy file này trong Supabase SQL Editor
-- ============================================================

-- Xóa trigger và function cũ
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- Tạo function mới đơn giản hơn
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    user_name TEXT;
    base_slug TEXT;
    final_slug TEXT;
    counter INTEGER := 0;
    free_plan_id UUID;
BEGIN
    -- Lấy tên từ metadata hoặc email
    user_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        SPLIT_PART(NEW.email, '@', 1),
        'Studio'
    );

    -- Tạo slug đơn giản (chỉ giữ ký tự ASCII)
    base_slug := LOWER(TRIM(REGEXP_REPLACE(user_name, '[^a-zA-Z0-9 ]', '', 'g')));
    base_slug := REGEXP_REPLACE(base_slug, '\s+', '-', 'g');

    -- Fallback nếu slug rỗng
    IF base_slug = '' OR base_slug IS NULL THEN
        base_slug := 'studio';
    END IF;

    final_slug := base_slug;

    -- Đảm bảo slug unique
    WHILE EXISTS (SELECT 1 FROM public.studios WHERE slug = final_slug) LOOP
        counter := counter + 1;
        final_slug := base_slug || '-' || counter;
    END LOOP;

    -- Tạo studio
    INSERT INTO public.studios (id, name, slug, email)
    VALUES (NEW.id, user_name, final_slug, NEW.email);

    -- Tạo member record (owner)
    INSERT INTO public.studio_members (studio_id, user_id, role, accepted_at)
    VALUES (NEW.id, NEW.id, 'owner', NOW());

    -- Gán plan Free
    SELECT id INTO free_plan_id FROM public.plans WHERE name = 'free' LIMIT 1;

    IF free_plan_id IS NOT NULL THEN
        INSERT INTO public.subscriptions (studio_id, plan_id, status, billing_cycle)
        VALUES (NEW.id, free_plan_id, 'active', 'free');
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log lỗi nhưng không chặn user creation
        RAISE WARNING 'handle_new_user error: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Tạo trigger mới
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
