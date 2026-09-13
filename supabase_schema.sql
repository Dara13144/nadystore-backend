-- ==============================================================================
-- NADY / DARA TOPUP - COMPLETE SUPABASE POSTGRESQL PRODUCTION SCRIPT
-- Paste and run this script in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ueziueclbgymbynuxpby/editor/26009?schema=public
-- ==============================================================================

-- 1. Enable Required PostgreSQL Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. User Table (Authentication & Roles)
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "email" TEXT UNIQUE NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT DEFAULT 'USER' NOT NULL,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 3. Product / Games Table
CREATE TABLE IF NOT EXISTS "Product" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "name" TEXT NOT NULL,
    "slug" TEXT UNIQUE NOT NULL,
    "image" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "isActive" BOOLEAN DEFAULT true NOT NULL,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 4. Package Table (Diamond / Token / Voucher Tiers)
CREATE TABLE IF NOT EXISTS "Package" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "image" TEXT,
    "isActive" BOOLEAN DEFAULT true NOT NULL,
    "category" TEXT DEFAULT 'NORMAL' NOT NULL,
    "badge" TEXT,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "fk_package_product" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 5. Order Table (Transactions, Player IDs, KHQR & Status)
CREATE TABLE IF NOT EXISTS "Order" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId" TEXT,
    "packageId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "playerZoneId" TEXT,
    "playerNickname" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "status" TEXT DEFAULT 'PENDING' NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "paymentStatus" TEXT DEFAULT 'PENDING' NOT NULL,
    "paymentTxnId" TEXT UNIQUE NOT NULL,
    "gatewayRef" TEXT,
    "paymentQrCode" TEXT,
    "paymentMd5" TEXT,
    "paidAt" TIMESTAMP(3) WITH TIME ZONE,
    "deliveryStatus" TEXT DEFAULT 'WAITING' NOT NULL,
    "stockDeliveredCode" TEXT,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "fk_order_user" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "fk_order_package" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 6. Digital Voucher Stock Table
CREATE TABLE IF NOT EXISTS "Stock" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "packageId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isUsed" BOOLEAN DEFAULT false NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "fk_stock_package" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 7. System Settings Table
CREATE TABLE IF NOT EXISTS "SystemSetting" (
    "key" TEXT PRIMARY KEY,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 8. Audit Log Table
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "action" TEXT NOT NULL,
    "performedBy" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ==============================================================================
-- 9. PERFORMANCE INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS "idx_user_email" ON "User"("email");
CREATE INDEX IF NOT EXISTS "idx_product_slug" ON "Product"("slug");
CREATE INDEX IF NOT EXISTS "idx_product_isactive" ON "Product"("isActive");
CREATE INDEX IF NOT EXISTS "idx_package_productid" ON "Package"("productId");
CREATE INDEX IF NOT EXISTS "idx_order_paymenttxnid" ON "Order"("paymentTxnId");
CREATE INDEX IF NOT EXISTS "idx_order_status" ON "Order"("status");
CREATE INDEX IF NOT EXISTS "idx_order_paymentstatus" ON "Order"("paymentStatus");
CREATE INDEX IF NOT EXISTS "idx_order_userid" ON "Order"("userId");

-- ==============================================================================
-- 10. SUPABASE REALTIME REPLICATION (Instant Order & Game Updates)
-- ==============================================================================
ALTER TABLE "Order" REPLICA IDENTITY FULL;
ALTER TABLE "Product" REPLICA IDENTITY FULL;
ALTER TABLE "Package" REPLICA IDENTITY FULL;
ALTER TABLE "SystemSetting" REPLICA IDENTITY FULL;

DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE "Order", "Product", "Package", "SystemSetting";
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ==============================================================================
-- 11. SUPABASE STORAGE BUCKETS (Games Artwork, Package Icons & Uploads)
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public) 
VALUES ('games', 'games', true), ('packages', 'packages', true), ('uploads', 'uploads', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage Access Policies
DO $$ 
BEGIN
    CREATE POLICY "Public Read All Buckets" ON storage.objects 
    FOR SELECT USING (bucket_id IN ('games', 'packages', 'uploads'));
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ 
BEGIN
    CREATE POLICY "Allow Uploads To All Buckets" ON storage.objects 
    FOR INSERT WITH CHECK (bucket_id IN ('games', 'packages', 'uploads'));
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ==============================================================================
-- 12. SEED ADMIN ACCOUNTS (Password: admin123)
-- ==============================================================================
INSERT INTO "User" ("id", "email", "password", "role", "createdAt", "updatedAt")
VALUES
    ('admin-topup-01', 'admin@topup.com', '$2b$10$tDqB4m438e8uD3v9KxU9I.h6kI24N7Cg.wN6LgqgTsqdUkzK90z8C', 'ADMIN', NOW(), NOW()),
    ('admin-dara-02', 'mdara9695@gmail.com', '$2b$10$tDqB4m438e8uD3v9KxU9I.h6kI24N7Cg.wN6LgqgTsqdUkzK90z8C', 'ADMIN', NOW(), NOW())
ON CONFLICT ("email") DO UPDATE 
SET "role" = 'ADMIN', "password" = EXCLUDED."password", "updatedAt" = NOW();

-- ==============================================================================
-- 13. SEED CORE PRODUCTS & PACKAGES
-- ==============================================================================
-- Product 1: Free Fire
INSERT INTO "Product" ("id", "name", "slug", "image", "category", "isActive", "createdAt", "updatedAt")
VALUES ('ff-prod-01', 'Free Fire', 'free-fire', '/images/games/freefire.png', 'MOBILE_GAME', true, NOW(), NOW())
ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name", "image" = EXCLUDED."image", "isActive" = true;

-- Product 2: Mobile Legends: Bang Bang
INSERT INTO "Product" ("id", "name", "slug", "image", "category", "isActive", "createdAt", "updatedAt")
VALUES ('ml-prod-02', 'Mobile Legends: Bang Bang', 'mobile-legends', '/images/games/mlbb.png', 'MOBILE_GAME', true, NOW(), NOW())
ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name", "image" = EXCLUDED."image", "isActive" = true;

-- Product 3: Moonton Mobile Legends
INSERT INTO "Product" ("id", "name", "slug", "image", "category", "isActive", "createdAt", "updatedAt")
VALUES ('moonton-prod-03', 'Moonton Mobile Legends', 'moonton-mlbb', '/images/games/moonton-mlbb.png', 'MOBILE_GAME', true, NOW(), NOW())
ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name", "image" = EXCLUDED."image", "isActive" = true;

-- Seed Packages for Free Fire
INSERT INTO "Package" ("id", "productId", "name", "amount", "price", "category", "badge", "isActive", "createdAt", "updatedAt")
VALUES
    ('ff-pkg-1', 'ff-prod-01', '50 Diamonds', 50, 0.49, 'NORMAL', NULL, true, NOW(), NOW()),
    ('ff-pkg-2', 'ff-prod-01', '100+15 Diamonds', 115, 0.99, 'NORMAL', 'Popular', true, NOW(), NOW()),
    ('ff-pkg-3', 'ff-prod-01', '310+40 Diamonds', 350, 2.99, 'NORMAL', 'Hot', true, NOW(), NOW()),
    ('ff-pkg-4', 'ff-prod-01', '520+65 Diamonds', 585, 4.99, 'BEST_SELLER', '🔥 Best Value', true, NOW(), NOW()),
    ('ff-pkg-5', 'ff-prod-01', '1060+160 Diamonds', 1220, 9.99, 'BEST_SELLER', 'VIP Choice', true, NOW(), NOW()),
    ('ff-pkg-6', 'ff-prod-01', '2180+350 Diamonds', 2530, 19.99, 'BEST_SELLER', 'Mega Saver', true, NOW(), NOW())
ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "price" = EXCLUDED."price", "amount" = EXCLUDED."amount", "isActive" = true;

-- Seed Packages for Mobile Legends
INSERT INTO "Package" ("id", "productId", "name", "amount", "price", "category", "badge", "isActive", "createdAt", "updatedAt")
VALUES
    ('ml-pkg-1', 'ml-prod-02', '50+5 Diamonds', 55, 0.99, 'NORMAL', NULL, true, NOW(), NOW()),
    ('ml-pkg-2', 'ml-prod-02', '100+10 Diamonds', 110, 1.99, 'NORMAL', 'Popular', true, NOW(), NOW()),
    ('ml-pkg-3', 'ml-prod-02', '250+25 Diamonds', 275, 4.99, 'NORMAL', 'Hot', true, NOW(), NOW()),
    ('ml-pkg-4', 'ml-prod-02', '500+65 Diamonds', 565, 9.99, 'BEST_SELLER', '🔥 Best Value', true, NOW(), NOW()),
    ('ml-pkg-5', 'ml-prod-02', '1000+150 Diamonds', 1150, 19.99, 'BEST_SELLER', 'VIP Choice', true, NOW(), NOW()),
    ('ml-pkg-6', 'ml-prod-02', 'Weekly Diamond Pass', 1, 1.85, 'BEST_SELLER', '👑 Best Seller', true, NOW(), NOW())
ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "price" = EXCLUDED."price", "amount" = EXCLUDED."amount", "isActive" = true;

-- Seed Packages for Moonton Mobile Legends
INSERT INTO "Package" ("id", "productId", "name", "amount", "price", "category", "badge", "isActive", "createdAt", "updatedAt")
VALUES
    ('moonton-pkg-1', 'moonton-prod-03', '50+5 Diamonds', 55, 0.99, 'NORMAL', NULL, true, NOW(), NOW()),
    ('moonton-pkg-2', 'moonton-prod-03', '100+10 Diamonds', 110, 1.99, 'NORMAL', 'Popular', true, NOW(), NOW()),
    ('moonton-pkg-3', 'moonton-prod-03', '250+25 Diamonds', 275, 4.99, 'NORMAL', 'Hot', true, NOW(), NOW()),
    ('moonton-pkg-4', 'moonton-prod-03', '500+65 Diamonds', 565, 9.99, 'BEST_SELLER', '🔥 Best Value', true, NOW(), NOW()),
    ('moonton-pkg-5', 'moonton-prod-03', '1000+150 Diamonds', 1150, 19.99, 'BEST_SELLER', 'VIP Choice', true, NOW(), NOW()),
    ('moonton-pkg-6', 'moonton-prod-03', 'Weekly Diamond Pass', 1, 1.85, 'BEST_SELLER', '👑 Best Seller', true, NOW(), NOW())
ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "price" = EXCLUDED."price", "amount" = EXCLUDED."amount", "isActive" = true;

-- ==============================================================================
-- 14. INITIAL SYSTEM SETTINGS SEED DATA
-- ==============================================================================
INSERT INTO "SystemSetting" ("key", "value", "description") VALUES
('SITE_NAME', 'NA-DY TOPUP', 'Website brand name'),
('TELEGRAM_CHANNEL', 'https://t.me/nadytopup', 'Official Telegram channel'),
('BANNER_ANNOUNCEMENT', '🎉 Instant Auto-Topup 24/7 with KHQR & Bakong!', 'Top banner marquee message'),
('MAINTENANCE_MODE', 'false', 'Global maintenance mode switch')
ON CONFLICT ("key") DO NOTHING;

