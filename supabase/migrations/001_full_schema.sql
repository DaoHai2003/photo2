-- ============================================================
-- PHOTOSHARE - FULL DATABASE SCHEMA
-- Platform quản lý album ảnh cho studio chụp ảnh
-- Stack: Supabase PostgreSQL + Auth + Storage + Realtime
-- ============================================================
-- HƯỚNG DẪN: Copy toàn bộ file này → Supabase SQL Editor → Run
-- ============================================================

-- ============================================================
-- PART 1: EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- PART 2: HELPER FUNCTIONS
-- ============================================================

-- Function tự động cập nhật updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function tạo slug từ text (hỗ trợ tiếng Việt)
CREATE OR REPLACE FUNCTION generate_slug(input_text TEXT)
RETURNS TEXT AS $$
DECLARE
    slug TEXT;
BEGIN
    slug := LOWER(TRIM(input_text));
    -- Chuyển ký tự có dấu tiếng Việt sang không dấu
    slug := TRANSLATE(slug,
        'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ',
        'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyyd'
    );
    -- Thay khoảng trắng và ký tự đặc biệt bằng dấu gạch ngang
    slug := REGEXP_REPLACE(slug, '[^a-z0-9]+', '-', 'g');
    -- Bỏ dấu gạch ngang ở đầu và cuối
    slug := TRIM(BOTH '-' FROM slug);
    RETURN slug;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- PART 3: CORE TABLES
-- ============================================================

-- ----- PLANS (gói dịch vụ) -----
CREATE TABLE plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,              -- 'free', 'pro', 'lifetime'
    display_name TEXT NOT NULL,             -- 'Miễn phí', 'Pro', 'Trọn đời'
    description TEXT,
    price_monthly INTEGER DEFAULT 0,       -- VND
    price_yearly INTEGER DEFAULT 0,
    price_lifetime INTEGER,                -- NULL nếu không áp dụng
    max_albums INTEGER DEFAULT 3,          -- -1 = unlimited
    max_photos_per_album INTEGER DEFAULT 50,
    max_storage_mb INTEGER DEFAULT 500,
    has_website_builder BOOLEAN DEFAULT FALSE,
    has_smart_filter BOOLEAN DEFAULT TRUE,
    smart_filter_monthly_limit INTEGER DEFAULT 5,  -- -1 = unlimited
    has_custom_branding BOOLEAN DEFAULT FALSE,
    has_download BOOLEAN DEFAULT FALSE,
    has_zip_download BOOLEAN DEFAULT FALSE,
    has_password_protection BOOLEAN DEFAULT TRUE,
    has_comments BOOLEAN DEFAULT TRUE,
    has_realtime_sync BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----- STUDIOS -----
CREATE TABLE studios (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    email TEXT,
    phone TEXT,
    address TEXT,
    logo_path TEXT,                          -- path trong Storage
    bio TEXT,                                -- giới thiệu ngắn
    plan_id UUID REFERENCES plans(id),
    total_storage_used_bytes BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_studios_slug ON studios(slug);
CREATE INDEX idx_studios_plan_id ON studios(plan_id);

-- ----- STUDIO MEMBERS (Phase 2 - thiết kế sẵn) -----
CREATE TABLE studio_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'staff')),
    invited_email TEXT,
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_studio_member UNIQUE (studio_id, user_id)
);

CREATE INDEX idx_studio_members_studio ON studio_members(studio_id);
CREATE INDEX idx_studio_members_user ON studio_members(user_id);

-- ----- ALBUMS -----
CREATE TABLE albums (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    cover_photo_id UUID,                    -- FK thêm sau khi tạo photos table
    password_hash TEXT,                     -- NULL = không bảo vệ, bcrypt hash
    max_selections INTEGER,                 -- NULL = unlimited
    allow_download BOOLEAN DEFAULT FALSE,
    allow_comments BOOLEAN DEFAULT TRUE,
    is_published BOOLEAN DEFAULT FALSE,
    photo_count INTEGER DEFAULT 0,          -- denormalized counter
    total_selections INTEGER DEFAULT 0,     -- denormalized counter
    sort_order INTEGER DEFAULT 0,
    watermark_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,                 -- soft delete

    CONSTRAINT unique_album_slug UNIQUE (studio_id, slug)
);

CREATE INDEX idx_albums_studio ON albums(studio_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_albums_slug ON albums(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_albums_published ON albums(is_published) WHERE deleted_at IS NULL;
CREATE INDEX idx_albums_created ON albums(created_at DESC);

-- ----- PHOTOS -----
CREATE TABLE photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
    original_filename TEXT NOT NULL,         -- tên file gốc
    normalized_filename TEXT NOT NULL,       -- lowercase, trim - dùng cho matching
    storage_path TEXT NOT NULL,              -- path trong Supabase Storage
    thumbnail_path TEXT,                     -- path thumbnail
    width INTEGER,                          -- pixel
    height INTEGER,                         -- pixel
    file_size BIGINT,                       -- bytes
    mime_type TEXT,
    sort_order INTEGER DEFAULT 0,
    selection_count INTEGER DEFAULT 0,      -- denormalized counter
    comment_count INTEGER DEFAULT 0,        -- denormalized counter
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_mime CHECK (mime_type IN (
        'image/jpeg', 'image/png', 'image/webp',
        'image/tiff', 'image/gif', 'image/heic', 'image/heif'
    ))
);

CREATE INDEX idx_photos_album ON photos(album_id, sort_order);
CREATE INDEX idx_photos_studio ON photos(studio_id);
CREATE INDEX idx_photos_normalized_name ON photos(normalized_filename);

-- Thêm FK cover_photo cho albums
ALTER TABLE albums
    ADD CONSTRAINT fk_cover_photo
    FOREIGN KEY (cover_photo_id) REFERENCES photos(id) ON DELETE SET NULL;

-- ============================================================
-- PART 4: INTERACTION TABLES
-- ============================================================

-- ----- VISITORS (theo dõi khách không đăng nhập) -----
CREATE TABLE visitors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    visitor_token TEXT NOT NULL,             -- UUID v4 tạo ở client
    display_name TEXT,                       -- tên khách tự nhập
    email TEXT,                              -- email khách (tuỳ chọn)
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    user_agent TEXT,
    ip_address INET,

    CONSTRAINT unique_visitor_per_album UNIQUE (album_id, visitor_token)
);

CREATE INDEX idx_visitors_album ON visitors(album_id);
CREATE INDEX idx_visitors_token ON visitors(visitor_token);

-- ----- PHOTO SELECTIONS (khách chọn ảnh yêu thích) -----
CREATE TABLE photo_selections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    visitor_token TEXT NOT NULL,
    visitor_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_selection UNIQUE (photo_id, visitor_token)
);

CREATE INDEX idx_selections_album ON photo_selections(album_id);
CREATE INDEX idx_selections_album_visitor ON photo_selections(album_id, visitor_token);
CREATE INDEX idx_selections_photo ON photo_selections(photo_id);

-- ----- PHOTO COMMENTS (bình luận theo từng ảnh) -----
CREATE TABLE photo_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    author_type TEXT NOT NULL CHECK (author_type IN ('studio', 'visitor')),
    author_id UUID,                          -- studio_id nếu studio
    visitor_token TEXT,                      -- nếu visitor
    author_name TEXT NOT NULL DEFAULT 'Khách',
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,                  -- soft delete

    CONSTRAINT valid_author CHECK (
        (author_type = 'studio' AND author_id IS NOT NULL) OR
        (author_type = 'visitor' AND visitor_token IS NOT NULL)
    ),
    CONSTRAINT content_length CHECK (char_length(content) BETWEEN 1 AND 1000)
);

CREATE INDEX idx_comments_photo ON photo_comments(photo_id, created_at)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_comments_album ON photo_comments(album_id)
    WHERE deleted_at IS NULL;

-- ============================================================
-- PART 5: WEBSITE & PORTFOLIO
-- ============================================================

-- ----- WEBSITE PROFILES -----
CREATE TABLE website_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
    is_published BOOLEAN DEFAULT FALSE,
    theme TEXT DEFAULT 'minimal',           -- 'minimal', 'classic', 'modern'

    -- Hero section
    hero_title TEXT,
    hero_subtitle TEXT,
    cover_image_path TEXT,                  -- path trong Storage

    -- About
    about_text TEXT,

    -- Contact info
    contact_email TEXT,
    contact_phone TEXT,
    address TEXT,

    -- Social media
    social_facebook TEXT,
    social_instagram TEXT,
    social_tiktok TEXT,
    social_youtube TEXT,
    social_website TEXT,

    -- Branding
    show_powered_by BOOLEAN DEFAULT TRUE,   -- "Powered by PhotoShare"
    custom_css TEXT,                         -- Phase 2

    -- SEO
    meta_title TEXT,
    meta_description TEXT,
    og_image_path TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT one_website_per_studio UNIQUE (studio_id)
);

CREATE INDEX idx_website_studio ON website_profiles(studio_id);

-- ----- WEBSITE ALBUMS (album hiển thị trên portfolio) -----
CREATE TABLE website_albums (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    website_id UUID NOT NULL REFERENCES website_profiles(id) ON DELETE CASCADE,
    album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    sort_order INTEGER DEFAULT 0,
    custom_title TEXT,                       -- override title cho website
    custom_description TEXT,                 -- override description
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_website_album UNIQUE (website_id, album_id)
);

CREATE INDEX idx_website_albums_website ON website_albums(website_id, sort_order);

-- ============================================================
-- PART 6: BILLING & SUBSCRIPTIONS
-- ============================================================

-- ----- SUBSCRIPTIONS -----
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES plans(id),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'canceled', 'expired', 'trial', 'past_due')),
    billing_cycle TEXT DEFAULT 'monthly'
        CHECK (billing_cycle IN ('monthly', 'yearly', 'lifetime', 'free')),
    current_period_start TIMESTAMPTZ DEFAULT NOW(),
    current_period_end TIMESTAMPTZ,         -- NULL cho lifetime & free
    cancel_at_period_end BOOLEAN DEFAULT FALSE,

    -- Payment info (Phase 2+)
    payment_provider TEXT DEFAULT 'manual'
        CHECK (payment_provider IN ('manual', 'stripe', 'vnpay', 'momo')),
    payment_provider_subscription_id TEXT,
    payment_provider_customer_id TEXT,

    -- Metadata
    trial_ends_at TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_studio ON subscriptions(studio_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- ============================================================
-- PART 7: ACTIVITY LOGS & ANALYTICS
-- ============================================================

-- ----- ACTIVITY LOGS -----
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    studio_id UUID REFERENCES studios(id) ON DELETE SET NULL,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('studio', 'visitor', 'system')),
    actor_id TEXT,                            -- user_id hoặc visitor_token
    action TEXT NOT NULL,                     -- 'album.created', 'photo.uploaded', etc.
    resource_type TEXT,                       -- 'album', 'photo', 'comment'
    resource_id UUID,
    metadata JSONB DEFAULT '{}',             -- chi tiết tuỳ action
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_studio_time ON activity_logs(studio_id, created_at DESC);
CREATE INDEX idx_activity_action ON activity_logs(action);
CREATE INDEX idx_activity_resource ON activity_logs(resource_type, resource_id);

-- ----- ALBUM ACCESS LOGS (theo dõi lượt xem album) -----
CREATE TABLE album_access_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    visitor_token TEXT,
    ip_address INET,
    user_agent TEXT,
    accessed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_access_logs_album ON album_access_logs(album_id, accessed_at DESC);

-- ============================================================
-- PART 8: TRIGGERS
-- ============================================================

-- Auto update updated_at cho các bảng cần thiết
CREATE TRIGGER tr_studios_updated
    BEFORE UPDATE ON studios
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER tr_albums_updated
    BEFORE UPDATE ON albums
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER tr_comments_updated
    BEFORE UPDATE ON photo_comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER tr_website_updated
    BEFORE UPDATE ON website_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER tr_subscriptions_updated
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER tr_plans_updated
    BEFORE UPDATE ON plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----- Trigger: cập nhật photo_count khi thêm/xoá ảnh -----
CREATE OR REPLACE FUNCTION update_album_photo_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE albums SET photo_count = photo_count + 1 WHERE id = NEW.album_id;
        -- Cập nhật storage used
        IF NEW.file_size IS NOT NULL THEN
            UPDATE studios SET total_storage_used_bytes = total_storage_used_bytes + NEW.file_size
            WHERE id = NEW.studio_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE albums SET photo_count = photo_count - 1 WHERE id = OLD.album_id;
        IF OLD.file_size IS NOT NULL THEN
            UPDATE studios SET total_storage_used_bytes = total_storage_used_bytes - OLD.file_size
            WHERE id = OLD.studio_id;
        END IF;
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_photo_count
    AFTER INSERT OR DELETE ON photos
    FOR EACH ROW EXECUTE FUNCTION update_album_photo_count();

-- ----- Trigger: cập nhật selection_count trên photos và albums -----
CREATE OR REPLACE FUNCTION update_selection_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE photos SET selection_count = selection_count + 1 WHERE id = NEW.photo_id;
        UPDATE albums SET total_selections = total_selections + 1 WHERE id = NEW.album_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE photos SET selection_count = selection_count - 1 WHERE id = OLD.photo_id;
        UPDATE albums SET total_selections = total_selections - 1 WHERE id = OLD.album_id;
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_selection_count
    AFTER INSERT OR DELETE ON photo_selections
    FOR EACH ROW EXECUTE FUNCTION update_selection_counts();

-- ----- Trigger: cập nhật comment_count trên photos -----
CREATE OR REPLACE FUNCTION update_comment_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE photos SET comment_count = comment_count + 1 WHERE id = NEW.photo_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE photos SET comment_count = comment_count - 1 WHERE id = OLD.photo_id;
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_comment_count
    AFTER INSERT OR DELETE ON photo_comments
    FOR EACH ROW EXECUTE FUNCTION update_comment_count();

-- ----- Trigger: tự tạo studio khi user đăng ký -----
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    base_slug TEXT;
    final_slug TEXT;
    counter INTEGER := 0;
    user_name TEXT;
BEGIN
    -- Lấy tên từ metadata hoặc email
    user_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        SPLIT_PART(NEW.email, '@', 1)
    );

    base_slug := generate_slug(user_name);
    final_slug := base_slug;

    -- Đảm bảo slug unique
    WHILE EXISTS (SELECT 1 FROM studios WHERE slug = final_slug) LOOP
        counter := counter + 1;
        final_slug := base_slug || '-' || counter;
    END LOOP;

    -- Tạo studio
    INSERT INTO studios (id, name, slug, email)
    VALUES (NEW.id, user_name, final_slug, NEW.email);

    -- Tạo member record (owner)
    INSERT INTO studio_members (studio_id, user_id, role, accepted_at)
    VALUES (NEW.id, NEW.id, 'owner', NOW());

    -- Gán plan Free
    INSERT INTO subscriptions (studio_id, plan_id, status, billing_cycle)
    SELECT NEW.id, p.id, 'active', 'free'
    FROM plans p WHERE p.name = 'free'
    LIMIT 1;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- PART 9: UTILITY FUNCTIONS
-- ============================================================

-- Function kiểm tra quota album
CREATE OR REPLACE FUNCTION check_album_quota(p_studio_id UUID)
RETURNS JSONB AS $$
DECLARE
    current_count INTEGER;
    max_allowed INTEGER;
    plan_name TEXT;
BEGIN
    SELECT COUNT(*) INTO current_count
    FROM albums
    WHERE studio_id = p_studio_id AND deleted_at IS NULL;

    SELECT p.max_albums, p.name INTO max_allowed, plan_name
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.studio_id = p_studio_id AND s.status = 'active'
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF max_allowed = -1 THEN
        RETURN jsonb_build_object(
            'allowed', TRUE,
            'current', current_count,
            'max', -1,
            'plan', plan_name
        );
    END IF;

    RETURN jsonb_build_object(
        'allowed', current_count < max_allowed,
        'current', current_count,
        'max', max_allowed,
        'plan', plan_name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function kiểm tra quota photos per album
CREATE OR REPLACE FUNCTION check_photo_quota(p_studio_id UUID, p_album_id UUID)
RETURNS JSONB AS $$
DECLARE
    current_count INTEGER;
    max_allowed INTEGER;
    storage_used BIGINT;
    max_storage BIGINT;
BEGIN
    SELECT photo_count INTO current_count
    FROM albums WHERE id = p_album_id;

    SELECT p.max_photos_per_album, (p.max_storage_mb::BIGINT * 1024 * 1024)
    INTO max_allowed, max_storage
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.studio_id = p_studio_id AND s.status = 'active'
    ORDER BY s.created_at DESC
    LIMIT 1;

    SELECT total_storage_used_bytes INTO storage_used
    FROM studios WHERE id = p_studio_id;

    RETURN jsonb_build_object(
        'photo_allowed', (max_allowed = -1 OR current_count < max_allowed),
        'photo_current', current_count,
        'photo_max', max_allowed,
        'storage_allowed', (storage_used < max_storage),
        'storage_used_mb', ROUND(storage_used::NUMERIC / 1024 / 1024, 2),
        'storage_max_mb', ROUND(max_storage::NUMERIC / 1024 / 1024, 0)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function kiểm tra selection limit
CREATE OR REPLACE FUNCTION check_selection_limit(
    p_album_id UUID,
    p_visitor_token TEXT
)
RETURNS JSONB AS $$
DECLARE
    current_count INTEGER;
    max_allowed INTEGER;
BEGIN
    SELECT max_selections INTO max_allowed
    FROM albums WHERE id = p_album_id;

    SELECT COUNT(*) INTO current_count
    FROM photo_selections
    WHERE album_id = p_album_id AND visitor_token = p_visitor_token;

    IF max_allowed IS NULL THEN
        RETURN jsonb_build_object(
            'allowed', TRUE,
            'current', current_count,
            'max', NULL
        );
    END IF;

    RETURN jsonb_build_object(
        'allowed', current_count < max_allowed,
        'current', current_count,
        'max', max_allowed
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- PART 10: ROW LEVEL SECURITY
-- ============================================================

-- Bật RLS cho tất cả bảng
ALTER TABLE studios ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE album_access_logs ENABLE ROW LEVEL SECURITY;

-- ===== PLANS (ai cũng đọc được) =====
CREATE POLICY "plans_select_all" ON plans
    FOR SELECT USING (true);

-- ===== STUDIOS =====
CREATE POLICY "studios_select_own" ON studios
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "studios_select_public" ON studios
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM website_profiles wp
            WHERE wp.studio_id = id AND wp.is_published = TRUE
        )
    );

CREATE POLICY "studios_update_own" ON studios
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ===== STUDIO MEMBERS =====
CREATE POLICY "members_select" ON studio_members
    FOR SELECT USING (
        auth.uid() = user_id
        OR auth.uid() = studio_id
    );

CREATE POLICY "members_insert_owner" ON studio_members
    FOR INSERT WITH CHECK (auth.uid() = studio_id);

CREATE POLICY "members_delete_owner" ON studio_members
    FOR DELETE USING (auth.uid() = studio_id);

-- ===== ALBUMS =====
-- Owner xem tất cả album của mình (kể cả unpublished)
CREATE POLICY "albums_select_own" ON albums
    FOR SELECT USING (
        auth.uid() = studio_id AND deleted_at IS NULL
    );

-- Public xem album đã published
CREATE POLICY "albums_select_public" ON albums
    FOR SELECT USING (
        is_published = TRUE AND deleted_at IS NULL
    );

CREATE POLICY "albums_insert_own" ON albums
    FOR INSERT WITH CHECK (auth.uid() = studio_id);

CREATE POLICY "albums_update_own" ON albums
    FOR UPDATE USING (auth.uid() = studio_id)
    WITH CHECK (auth.uid() = studio_id);

CREATE POLICY "albums_delete_own" ON albums
    FOR DELETE USING (auth.uid() = studio_id);

-- ===== PHOTOS =====
-- Owner xem ảnh của mình
CREATE POLICY "photos_select_own" ON photos
    FOR SELECT USING (auth.uid() = studio_id);

-- Public xem ảnh trong album published
CREATE POLICY "photos_select_public" ON photos
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM albums a
            WHERE a.id = album_id
            AND a.is_published = TRUE
            AND a.deleted_at IS NULL
        )
    );

CREATE POLICY "photos_insert_own" ON photos
    FOR INSERT WITH CHECK (auth.uid() = studio_id);

CREATE POLICY "photos_delete_own" ON photos
    FOR DELETE USING (auth.uid() = studio_id);

CREATE POLICY "photos_update_own" ON photos
    FOR UPDATE USING (auth.uid() = studio_id);

-- ===== VISITORS =====
-- Visitor tự đọc record mình (anon access)
CREATE POLICY "visitors_select" ON visitors
    FOR SELECT USING (true);

CREATE POLICY "visitors_insert" ON visitors
    FOR INSERT WITH CHECK (true);

CREATE POLICY "visitors_update" ON visitors
    FOR UPDATE USING (true);

-- ===== PHOTO SELECTIONS =====
-- Ai cũng insert/delete (dùng visitor_token để phân biệt)
CREATE POLICY "selections_select_own_studio" ON photo_selections
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM albums a
            WHERE a.id = album_id AND a.studio_id = auth.uid()
        )
    );

-- Visitor xem selections của mình (anon)
CREATE POLICY "selections_select_visitor" ON photo_selections
    FOR SELECT USING (true);

CREATE POLICY "selections_insert" ON photo_selections
    FOR INSERT WITH CHECK (true);

CREATE POLICY "selections_delete" ON photo_selections
    FOR DELETE USING (true);

-- ===== PHOTO COMMENTS =====
-- Public đọc comments của album published
CREATE POLICY "comments_select" ON photo_comments
    FOR SELECT USING (
        deleted_at IS NULL AND (
            -- Owner album
            EXISTS (
                SELECT 1 FROM albums a
                WHERE a.id = album_id AND a.studio_id = auth.uid()
            )
            OR
            -- Public album
            EXISTS (
                SELECT 1 FROM albums a
                WHERE a.id = album_id
                AND a.is_published = TRUE
                AND a.allow_comments = TRUE
            )
        )
    );

CREATE POLICY "comments_insert" ON photo_comments
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM albums a
            WHERE a.id = album_id
            AND a.allow_comments = TRUE
            AND (a.is_published = TRUE OR a.studio_id = auth.uid())
        )
    );

-- Studio xoá comments trong album mình
CREATE POLICY "comments_delete_studio" ON photo_comments
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM albums a
            WHERE a.id = album_id AND a.studio_id = auth.uid()
        )
    );

-- Visitor xoá comment mình trong 15 phút
CREATE POLICY "comments_delete_visitor" ON photo_comments
    FOR DELETE USING (
        author_type = 'visitor'
        AND created_at > NOW() - INTERVAL '15 minutes'
    );

-- Visitor sửa comment mình trong 15 phút
CREATE POLICY "comments_update_visitor" ON photo_comments
    FOR UPDATE USING (
        author_type = 'visitor'
        AND created_at > NOW() - INTERVAL '15 minutes'
    );

-- Studio sửa comment mình
CREATE POLICY "comments_update_studio" ON photo_comments
    FOR UPDATE USING (
        author_type = 'studio'
        AND author_id = auth.uid()
    );

-- ===== WEBSITE PROFILES =====
CREATE POLICY "website_select_own" ON website_profiles
    FOR SELECT USING (auth.uid() = studio_id);

CREATE POLICY "website_select_public" ON website_profiles
    FOR SELECT USING (is_published = TRUE);

CREATE POLICY "website_insert_own" ON website_profiles
    FOR INSERT WITH CHECK (auth.uid() = studio_id);

CREATE POLICY "website_update_own" ON website_profiles
    FOR UPDATE USING (auth.uid() = studio_id)
    WITH CHECK (auth.uid() = studio_id);

CREATE POLICY "website_delete_own" ON website_profiles
    FOR DELETE USING (auth.uid() = studio_id);

-- ===== WEBSITE ALBUMS =====
CREATE POLICY "website_albums_select" ON website_albums
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM website_profiles wp
            WHERE wp.id = website_id
            AND (wp.studio_id = auth.uid() OR wp.is_published = TRUE)
        )
    );

CREATE POLICY "website_albums_insert" ON website_albums
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM website_profiles wp
            WHERE wp.id = website_id AND wp.studio_id = auth.uid()
        )
    );

CREATE POLICY "website_albums_update" ON website_albums
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM website_profiles wp
            WHERE wp.id = website_id AND wp.studio_id = auth.uid()
        )
    );

CREATE POLICY "website_albums_delete" ON website_albums
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM website_profiles wp
            WHERE wp.id = website_id AND wp.studio_id = auth.uid()
        )
    );

-- ===== SUBSCRIPTIONS =====
CREATE POLICY "subscriptions_select_own" ON subscriptions
    FOR SELECT USING (auth.uid() = studio_id);

-- ===== ACTIVITY LOGS =====
CREATE POLICY "activity_select_own" ON activity_logs
    FOR SELECT USING (auth.uid() = studio_id);

CREATE POLICY "activity_insert" ON activity_logs
    FOR INSERT WITH CHECK (true);

-- ===== ALBUM ACCESS LOGS =====
CREATE POLICY "access_logs_select_studio" ON album_access_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM albums a
            WHERE a.id = album_id AND a.studio_id = auth.uid()
        )
    );

CREATE POLICY "access_logs_insert" ON album_access_logs
    FOR INSERT WITH CHECK (true);

-- ============================================================
-- PART 11: SEED DATA - PLANS
-- ============================================================

INSERT INTO plans (name, display_name, description, price_monthly, price_yearly, price_lifetime,
    max_albums, max_photos_per_album, max_storage_mb,
    has_website_builder, has_smart_filter, smart_filter_monthly_limit,
    has_custom_branding, has_download, has_zip_download,
    has_password_protection, has_comments, has_realtime_sync,
    sort_order)
VALUES
    -- Free
    ('free', 'Miễn phí', 'Bắt đầu miễn phí, dùng thử các tính năng cơ bản',
     0, 0, NULL,
     3, 50, 500,
     FALSE, TRUE, 5,
     FALSE, FALSE, FALSE,
     TRUE, TRUE, FALSE,
     1),

    -- Pro
    ('pro', 'Pro', 'Dành cho studio chuyên nghiệp, không giới hạn album',
     199000, 1990000, NULL,
     -1, 500, 51200,
     TRUE, TRUE, -1,
     TRUE, TRUE, TRUE,
     TRUE, TRUE, TRUE,
     2),

    -- Lifetime
    ('lifetime', 'Trọn đời', 'Thanh toán một lần, sử dụng mãi mãi',
     0, 0, 4990000,
     -1, 500, 102400,
     TRUE, TRUE, -1,
     TRUE, TRUE, TRUE,
     TRUE, TRUE, TRUE,
     3);

-- ============================================================
-- PART 12: STORAGE BUCKETS (chạy riêng nếu SQL Editor không hỗ trợ)
-- ============================================================
-- Lưu ý: Supabase SQL Editor CÓ THỂ tạo buckets bằng SQL.
-- Nếu không chạy được phần này, tạo thủ công trong Storage UI.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    ('album-photos', 'album-photos', FALSE, 20971520,
     ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/heic', 'image/heif']),

    ('album-thumbnails', 'album-thumbnails', FALSE, 5242880,
     ARRAY['image/jpeg', 'image/png', 'image/webp']),

    ('studio-assets', 'studio-assets', FALSE, 5242880,
     ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),

    ('website-assets', 'website-assets', TRUE, 10485760,
     ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- ===== Storage Policies =====

-- album-photos: studio upload/read ảnh của mình
CREATE POLICY "studio_upload_photos" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'album-photos'
        AND auth.uid()::TEXT = (string_to_array(name, '/'))[1]
    );

CREATE POLICY "studio_read_own_photos" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'album-photos'
        AND auth.uid()::TEXT = (string_to_array(name, '/'))[1]
    );

CREATE POLICY "studio_delete_own_photos" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'album-photos'
        AND auth.uid()::TEXT = (string_to_array(name, '/'))[1]
    );

-- album-photos: public đọc ảnh từ album published
CREATE POLICY "public_read_album_photos" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'album-photos'
        AND EXISTS (
            SELECT 1 FROM albums a
            WHERE a.id::TEXT = (string_to_array(name, '/'))[2]
            AND a.is_published = TRUE
            AND a.deleted_at IS NULL
        )
    );

-- album-thumbnails: tương tự album-photos
CREATE POLICY "studio_upload_thumbnails" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'album-thumbnails'
        AND auth.uid()::TEXT = (string_to_array(name, '/'))[1]
    );

CREATE POLICY "studio_read_own_thumbnails" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'album-thumbnails'
        AND auth.uid()::TEXT = (string_to_array(name, '/'))[1]
    );

CREATE POLICY "public_read_album_thumbnails" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'album-thumbnails'
        AND EXISTS (
            SELECT 1 FROM albums a
            WHERE a.id::TEXT = (string_to_array(name, '/'))[2]
            AND a.is_published = TRUE
            AND a.deleted_at IS NULL
        )
    );

-- studio-assets: studio quản lý assets mình
CREATE POLICY "studio_manage_assets" ON storage.objects
    FOR ALL USING (
        bucket_id = 'studio-assets'
        AND auth.uid()::TEXT = (string_to_array(name, '/'))[1]
    )
    WITH CHECK (
        bucket_id = 'studio-assets'
        AND auth.uid()::TEXT = (string_to_array(name, '/'))[1]
    );

-- website-assets: public bucket, studio upload
CREATE POLICY "studio_upload_website_assets" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'website-assets'
        AND auth.uid()::TEXT = (string_to_array(name, '/'))[1]
    );

CREATE POLICY "studio_delete_website_assets" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'website-assets'
        AND auth.uid()::TEXT = (string_to_array(name, '/'))[1]
    );

-- website-assets public read (bucket đã public, policy cho phép)
CREATE POLICY "public_read_website_assets" ON storage.objects
    FOR SELECT USING (bucket_id = 'website-assets');

-- ============================================================
-- DONE! Schema đã sẵn sàng.
-- ============================================================
