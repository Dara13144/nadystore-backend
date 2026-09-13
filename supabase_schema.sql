-- ==============================================================================
-- NADY / DARA TOPUP - COMPLETE SUPABASE POSTGRESQL SCHEMA & REALTIME SETUP
-- Paste and run this script in the Supabase SQL Editor (https://supabase.com/dashboard)
-- ==============================================================================

-- 1. Enable Required PostgreSQL Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. User Table
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

-- 4. Package Table (Diamond / Token / Coin Tiers)
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
-- 11. SUPABASE STORAGE BUCKETS (Games Artwork & Package Icons)
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public) 
VALUES ('games', 'games', true), ('packages', 'packages', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public Storage Access Policies
DO $$ 
BEGIN
    CREATE POLICY "Public Read Games" ON storage.objects 
    FOR SELECT USING (bucket_id IN ('games', 'packages'));
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ 
BEGIN
    CREATE POLICY "Allow All Uploads" ON storage.objects 
    FOR INSERT WITH CHECK (bucket_id IN ('games', 'packages'));
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ==============================================================================
-- 12. INITIAL SYSTEM SETTINGS SEED DATA
-- ==============================================================================
INSERT INTO "SystemSetting" ("key", "value", "description") VALUES
('SITE_NAME', 'NA-DY TOPUP', 'Website brand name'),
('TELEGRAM_CHANNEL', 'https://t.me/nadytopup', 'Official Telegram channel'),
('BANNER_ANNOUNCEMENT', '🎉 Instant Auto-Topup 24/7 with KHQR & Bakong!', 'Top banner marquee message'),
('MAINTENANCE_MODE', 'false', 'Global maintenance mode switch')
ON CONFLICT ("key") DO NOTHING;
