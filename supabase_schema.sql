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
    CONSTRAINT "Package_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    CONSTRAINT "Stock_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 7. Contact Message Table (Live Inquiries & Support)
CREATE TABLE IF NOT EXISTS "ContactMessage" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "topic" TEXT DEFAULT 'General',
    "message" TEXT NOT NULL,
    "status" TEXT DEFAULT 'PENDING' NOT NULL,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 8. System Settings Table
CREATE TABLE IF NOT EXISTS "SystemSetting" (
    "key" TEXT PRIMARY KEY,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 9. Audit Log Table
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "action" TEXT NOT NULL,
    "performedBy" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ==============================================================================
-- 10. PERFORMANCE INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS "idx_user_email" ON "User"("email");
CREATE INDEX IF NOT EXISTS "idx_product_slug" ON "Product"("slug");
CREATE INDEX IF NOT EXISTS "idx_product_isactive" ON "Product"("isActive");
CREATE INDEX IF NOT EXISTS "idx_package_productid" ON "Package"("productId");
CREATE INDEX IF NOT EXISTS "idx_order_paymenttxnid" ON "Order"("paymentTxnId");
CREATE INDEX IF NOT EXISTS "idx_order_status" ON "Order"("status");
CREATE INDEX IF NOT EXISTS "idx_order_paymentstatus" ON "Order"("paymentStatus");
CREATE INDEX IF NOT EXISTS "idx_order_userid" ON "Order"("userId");
CREATE INDEX IF NOT EXISTS "idx_contact_status" ON "ContactMessage"("status");
CREATE INDEX IF NOT EXISTS "idx_contact_created" ON "ContactMessage"("createdAt" DESC);

-- ==============================================================================
-- 11. SUPABASE REALTIME REPLICATION (Instant Order, Catalog & Support Sync)
-- ==============================================================================
ALTER TABLE "Order" REPLICA IDENTITY FULL;
ALTER TABLE "Product" REPLICA IDENTITY FULL;
ALTER TABLE "Package" REPLICA IDENTITY FULL;
ALTER TABLE "Stock" REPLICA IDENTITY FULL;
ALTER TABLE "ContactMessage" REPLICA IDENTITY FULL;
ALTER TABLE "User" REPLICA IDENTITY FULL;
ALTER TABLE "SystemSetting" REPLICA IDENTITY FULL;

DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE "Order", "Product", "Package", "Stock", "ContactMessage", "User", "SystemSetting";
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ==============================================================================
-- 12. ROW LEVEL SECURITY (RLS) POLICIES & GRANTS
-- ==============================================================================
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Package" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContactMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Stock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SystemSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, service_role;

GRANT SELECT ON "Product", "Package", "SystemSetting" TO anon, authenticated;
GRANT SELECT, INSERT ON "Order" TO anon, authenticated;
GRANT SELECT, INSERT ON "ContactMessage" TO anon, authenticated;

-- RLS Policies
DROP POLICY IF EXISTS "Public can view active products" ON "Product";
CREATE POLICY "Public can view active products" ON "Product" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow delete on Product" ON "Product";
CREATE POLICY "Allow delete on Product" ON "Product" FOR DELETE TO anon, authenticated, service_role USING (true);

DROP POLICY IF EXISTS "Public can view active packages" ON "Package";
CREATE POLICY "Public can view active packages" ON "Package" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow delete on Package" ON "Package";
CREATE POLICY "Allow delete on Package" ON "Package" FOR DELETE TO anon, authenticated, service_role USING (true);

CREATE OR REPLACE VIEW "games" AS 
SELECT id, name, slug, image, category, "isActive", "createdAt", "updatedAt" 
FROM "Product";

CREATE OR REPLACE RULE games_delete AS ON DELETE TO "games" DO INSTEAD (
  DELETE FROM "Product" WHERE id = OLD.id
);
GRANT ALL ON "games" TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Public can create orders" ON "Order";
CREATE POLICY "Public can create orders" ON "Order" FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Public can view orders" ON "Order";
CREATE POLICY "Public can view orders" ON "Order" FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public can submit contact messages" ON "ContactMessage";
CREATE POLICY "Public can submit contact messages" ON "ContactMessage" FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Public can view contact messages" ON "ContactMessage";
CREATE POLICY "Public can view contact messages" ON "ContactMessage" FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public can view system settings" ON "SystemSetting";
CREATE POLICY "Public can view system settings" ON "SystemSetting" FOR SELECT TO anon, authenticated USING (true);

-- ==============================================================================
-- 13. SUPABASE STORAGE BUCKETS (Games Artwork, Package Icons & Uploads)
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public) 
VALUES ('games', 'games', true), ('packages', 'packages', true), ('uploads', 'uploads', true)
ON CONFLICT (id) DO UPDATE SET public = true;

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
-- 14. SEED ADMIN ACCOUNTS (Password: admin123)
-- ==============================================================================
INSERT INTO "User" ("id", "email", "password", "role", "createdAt", "updatedAt")
VALUES
    ('admin-topup-01', 'admin@topup.com', '$2b$10$tDqB4m438e8uD3v9KxU9I.h6kI24N7Cg.wN6LgqgTsqdUkzK90z8C', 'ADMIN', NOW(), NOW()),
    ('admin-dara-02', 'mdara9695@gmail.com', '$2b$10$tDqB4m438e8uD3v9KxU9I.h6kI24N7Cg.wN6LgqgTsqdUkzK90z8C', 'ADMIN', NOW(), NOW())
ON CONFLICT ("email") DO UPDATE 
SET "role" = 'ADMIN', "password" = EXCLUDED."password", "updatedAt" = NOW();

-- ==============================================================================
-- 15. SEED INITIAL SYSTEM SETTINGS
-- ==============================================================================
INSERT INTO "SystemSetting" ("key", "value", "description") VALUES
('SITE_NAME', 'NA-DY TOPUP', 'Website brand name'),
('TELEGRAM_CHANNEL', 'https://t.me/nadytopup', 'Official Telegram channel'),
('BANNER_ANNOUNCEMENT', '🎉 Instant Auto-Topup 24/7 with KHQR & Bakong!', 'Top banner marquee message'),
('MAINTENANCE_MODE', 'false', 'Global maintenance mode switch')
ON CONFLICT ("key") DO NOTHING;
