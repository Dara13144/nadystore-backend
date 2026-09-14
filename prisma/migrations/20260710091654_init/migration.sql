-- ====================================================================
-- SUPABASE FULL DATABASE SYSTEM SCHEMA FOR NA-DY TOPUP
-- Compatible with PostgreSQL 14+, Prisma ORM, and Supabase Studio
-- Project Reference: ueziueclbgymbynuxpby
-- ====================================================================

-- 1. Enable Required PostgreSQL Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ====================================================================
-- 2. CREATE DATABASE TABLES
-- ====================================================================

-- 2.1 User Table
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT PRIMARY KEY DEFAULT ('c' || substr(md5(random()::text || clock_timestamp()::text), 1, 24)),
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2.2 Product Table (Games, Vouchers, Digital Services)
CREATE TABLE IF NOT EXISTS "Product" (
    "id" TEXT PRIMARY KEY DEFAULT ('c' || substr(md5(random()::text || clock_timestamp()::text), 1, 24)),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2.3 Package Table (Game Recharge Tiers / Item Bundles)
CREATE TABLE IF NOT EXISTS "Package" (
    "id" TEXT PRIMARY KEY DEFAULT ('c' || substr(md5(random()::text || clock_timestamp()::text), 1, 24)),
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "category" TEXT NOT NULL DEFAULT 'NORMAL',
    "badge" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Package_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 2.4 Order Table (Top-Up Transactions & KHQR Invoices)
CREATE TABLE IF NOT EXISTS "Order" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId" TEXT,
    "packageId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "playerZoneId" TEXT,
    "playerNickname" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentTxnId" TEXT NOT NULL,
    "gatewayRef" TEXT,
    "paymentQrCode" TEXT,
    "paymentMd5" TEXT,
    "paidAt" TIMESTAMP(3),
    "deliveryStatus" TEXT NOT NULL DEFAULT 'WAITING',
    "stockDeliveredCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 2.5 Stock Table (Digital Voucher Gift Codes / Serial Keys)
CREATE TABLE IF NOT EXISTS "Stock" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "packageId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Stock_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 2.6 Contact Message Table (Live Inquiries & Support)
CREATE TABLE IF NOT EXISTS "ContactMessage" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "topic" TEXT DEFAULT 'General',
    "message" TEXT NOT NULL,
    "status" TEXT DEFAULT 'PENDING' NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2.7 System Settings Table
CREATE TABLE IF NOT EXISTS "SystemSetting" (
    "key" TEXT PRIMARY KEY,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2.8 Audit Log Table
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "action" TEXT NOT NULL,
    "performedBy" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ====================================================================
-- 3. UNIQUE CONSTRAINTS & PERFORMANCE INDEXES
-- ====================================================================

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "Product_slug_key" ON "Product"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Order_paymentTxnId_key" ON "Order"("paymentTxnId");

CREATE INDEX IF NOT EXISTS "idx_product_category" ON "Product"("category");
CREATE INDEX IF NOT EXISTS "idx_product_active" ON "Product"("isActive");
CREATE INDEX IF NOT EXISTS "idx_package_productId" ON "Package"("productId");
CREATE INDEX IF NOT EXISTS "idx_order_userId" ON "Order"("userId");
CREATE INDEX IF NOT EXISTS "idx_order_status" ON "Order"("status");
CREATE INDEX IF NOT EXISTS "idx_order_paymentStatus" ON "Order"("paymentStatus");
CREATE INDEX IF NOT EXISTS "idx_order_createdAt" ON "Order"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_stock_packageId" ON "Stock"("packageId");
CREATE INDEX IF NOT EXISTS "idx_stock_isUsed" ON "Stock"("isUsed");

-- ====================================================================
-- 4. AUTOMATIC TIMESTAMP TRIGGERS & DEFAULTS
-- ====================================================================

ALTER TABLE "User" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "User" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Product" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Product" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Package" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Package" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Order" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Order" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Stock" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Stock" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
    UPDATE "User" SET "createdAt" = CURRENT_TIMESTAMP WHERE "createdAt" IS NULL;
    UPDATE "User" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;
    UPDATE "Product" SET "createdAt" = CURRENT_TIMESTAMP WHERE "createdAt" IS NULL;
    UPDATE "Product" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;
    UPDATE "Package" SET "createdAt" = CURRENT_TIMESTAMP WHERE "createdAt" IS NULL;
    UPDATE "Package" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;
    UPDATE "Order" SET "createdAt" = CURRENT_TIMESTAMP WHERE "createdAt" IS NULL;
    UPDATE "Order" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;
    UPDATE "Stock" SET "createdAt" = CURRENT_TIMESTAMP WHERE "createdAt" IS NULL;
    UPDATE "Stock" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

CREATE OR REPLACE FUNCTION set_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW."createdAt" IS NULL THEN
            NEW."createdAt" = CURRENT_TIMESTAMP;
        END IF;
        IF NEW."updatedAt" IS NULL THEN
            NEW."updatedAt" = CURRENT_TIMESTAMP;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        NEW."updatedAt" = CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS set_user_timestamps ON "User";
CREATE TRIGGER set_user_timestamps BEFORE INSERT OR UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION set_timestamps();

DROP TRIGGER IF EXISTS set_product_timestamps ON "Product";
CREATE TRIGGER set_product_timestamps BEFORE INSERT OR UPDATE ON "Product" FOR EACH ROW EXECUTE FUNCTION set_timestamps();

DROP TRIGGER IF EXISTS set_package_timestamps ON "Package";
CREATE TRIGGER set_package_timestamps BEFORE INSERT OR UPDATE ON "Package" FOR EACH ROW EXECUTE FUNCTION set_timestamps();

DROP TRIGGER IF EXISTS set_order_timestamps ON "Order";
CREATE TRIGGER set_order_timestamps BEFORE INSERT OR UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION set_timestamps();

DROP TRIGGER IF EXISTS set_stock_timestamps ON "Stock";
CREATE TRIGGER set_stock_timestamps BEFORE INSERT OR UPDATE ON "Stock" FOR EACH ROW EXECUTE FUNCTION set_timestamps();

-- ====================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES & SCHEMA GRANTS
-- ====================================================================

ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Package" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Stock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContactMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SystemSetting" ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, service_role;
GRANT SELECT ON "Product", "Package", "SystemSetting" TO anon, authenticated;
GRANT SELECT, INSERT ON "Order" TO anon, authenticated;
GRANT SELECT, INSERT ON "ContactMessage" TO anon, authenticated;

DROP POLICY IF EXISTS "Public can view active products" ON "Product";
CREATE POLICY "Public can view active products" ON "Product" FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public can view active packages" ON "Package";
CREATE POLICY "Public can view active packages" ON "Package" FOR SELECT TO anon, authenticated USING (true);

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

DROP POLICY IF EXISTS "Users can view own profile" ON "User";
CREATE POLICY "Users can view own profile" ON "User" FOR SELECT TO authenticated USING (auth.uid()::text = id OR email = (auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "Service role bypass User" ON "User";
CREATE POLICY "Service role bypass User" ON "User" FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass Product" ON "Product";
CREATE POLICY "Service role bypass Product" ON "Product" FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass Package" ON "Package";
CREATE POLICY "Service role bypass Package" ON "Package" FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass Order" ON "Order";
CREATE POLICY "Service role bypass Order" ON "Order" FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass Stock" ON "Stock";
CREATE POLICY "Service role bypass Stock" ON "Stock" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ====================================================================
-- 6. DEFAULT ADMINISTRATOR SEED
-- Passwords encrypted with bcrypt for 'admin123'
-- ====================================================================

DELETE FROM "User" WHERE "email" IN ('admin@topup.com', 'admin@gmail.com');

INSERT INTO "User" ("id", "email", "password", "role", "createdAt", "updatedAt")
VALUES 
  ('usr_admin_nady_01', 'admin@nadytopup.com', '$2a$10$6MJi2ySmEqnKRa4Avtad1en6loFyWVZTvt7hOp5BFC7PR8g.C08Qm', 'ADMIN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('usr_admin_dara_01', 'mdara9695@gmail.com', '$2a$10$6MJi2ySmEqnKRa4Avtad1en6loFyWVZTvt7hOp5BFC7PR8g.C08Qm', 'ADMIN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("email") DO UPDATE SET "role" = 'ADMIN', "updatedAt" = CURRENT_TIMESTAMP;

-- ====================================================================
-- 7. ALL GAMES & DIGITAL PRODUCTS CATALOG SEED (100% Comprehensive)
-- ====================================================================

INSERT INTO "Product" ("name", "slug", "image", "category", "isActive")
VALUES
  ('Mobile Legends: Bang Bang', 'mobile-legends', '/images/games/mlbb.png', 'MOBILE_GAME', true),
  ('MOBILE LEGENDS | KHMER', 'mobile-legends-khmer', '/images/games/mlbb.png', 'MOBILE_GAME', true),
  ('MOBILE LEGENDS | PHILIPPINES', 'mobile-legends-philippines', '/images/games/mlbb.png', 'MOBILE_GAME', true),
  ('MOBILE LEGENDS | KHMER (VIP)', 'mobile-legends-indonesia', '/images/games/mlbb.png', 'MOBILE_GAME', true),
  ('Free Fire', 'free-fire', '/images/games/freefire.png', 'MOBILE_GAME', true),
  ('FREE FIRE | KHMER', 'free-fire-khmer', '/images/games/freefire.png', 'MOBILE_GAME', true),
  ('FREE FIRE | KHMER (VIP)', 'free-fire-indonesia', '/images/games/freefire.png', 'MOBILE_GAME', true),
  ('FREE FIRE | VIETNAM', 'free-fire-vietnam', '/images/games/freefire.png', 'MOBILE_GAME', true),
  ('FREE FIRE | TAIWAN', 'free-fire-taiwan', '/images/games/freefire.png', 'MOBILE_GAME', true),
  ('Free Fire MAX', 'free-fire-max', '/images/games/freefire.png', 'MOBILE_GAME', true),
  ('PUBG Mobile', 'pubg-mobile', '/images/games/pubgm.png', 'MOBILE_GAME', true),
  ('Honor of Kings', 'honor-of-kings', '/images/games/hok.png', 'MOBILE_GAME', true),
  ('Blood Strike', 'blood-strike', '/images/games/bloodstrike.png', 'MOBILE_GAME', true),
  ('Magic Chess: Go Go', 'magic-chess-gogo', '/images/games/magicchess.png', 'MOBILE_GAME', true),
  ('Roblox', 'roblox', '/images/games/roblox.png', 'MOBILE_GAME', true),
  ('Genshin Impact', 'genshin-impact', '/images/games/genshin-impact.png', 'MOBILE_GAME', true),
  ('Honkai: Star Rail', 'honkai-star-rail', '/images/games/genshin-impact.png', 'MOBILE_GAME', true),
  ('Zenless Zone Zero', 'zenless-zone-zero', '/images/games/genshin-impact.png', 'MOBILE_GAME', true),
  ('Wuthering Waves', 'wuthering-waves', '/images/games/genshin-impact.png', 'MOBILE_GAME', true),
  ('Solo Leveling: ARISE', 'solo-leveling-arise', '/images/games/genshin-impact.png', 'MOBILE_GAME', true),
  ('Farlight 84', 'farlight-84', '/images/games/farlight.png', 'MOBILE_GAME', true),
  ('Bullet Echo', 'bullet-echo', '/images/games/bullet-echo.png', 'MOBILE_GAME', true),
  ('Delta Force', 'delta-force', '/images/games/deltaforce.png', 'PC_GAME', true),
  ('Valorant', 'valorant', '/images/games/valorant.png', 'PC_GAME', true),
  ('Call of Duty: Mobile', 'call-of-duty-mobile', '/images/games/pubgm.png', 'MOBILE_GAME', true),
  ('Arena of Valor', 'arena-of-valor', '/images/games/hok.png', 'MOBILE_GAME', true),
  ('League of Legends: Wild Rift', 'wild-rift', '/images/games/hok.png', 'MOBILE_GAME', true),
  ('Brawl Stars', 'brawl-stars', '/images/games/magicchess.png', 'MOBILE_GAME', true),
  ('Clash of Clans', 'clash-of-clans', '/images/games/magicchess.png', 'MOBILE_GAME', true),
  ('Clash Royale', 'clash-royale', '/images/games/magicchess.png', 'MOBILE_GAME', true),
  ('League of Legends', 'league-of-legends', '/images/games/valorant.png', 'PC_GAME', true),
  ('Dota 2', 'dota-2', '/images/games/valorant.png', 'PC_GAME', true),
  ('Steam Wallet Code', 'steam-wallet', '/images/games/valorant.png', 'VOUCHER', true),
  ('Razer Gold PIN', 'razer-gold', '/images/games/valorant.png', 'VOUCHER', true),
  ('Google Play Gift Card', 'google-play-gift-card', '/images/games/magicchess.png', 'VOUCHER', true),
  ('Apple iTunes Gift Card', 'apple-itunes-gift-card', '/images/games/magicchess.png', 'VOUCHER', true)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "image" = EXCLUDED."image",
  "category" = EXCLUDED."category",
  "isActive" = true;

-- ====================================================================
-- 8. PACKAGES SEED (Dynamic Foreign-Key Safe Matching)
-- ====================================================================

-- 8.1 Mobile Legends: Bang Bang Packages
INSERT INTO "Package" ("productId", "name", "amount", "price", "category", "badge", "isActive")
SELECT p.id, 'Weekly Diamond Pass', 1, 1.99, 'BEST_SELLER', 'VIP Pass 🔥', true FROM "Product" p WHERE p.slug = 'mobile-legends'
UNION ALL
SELECT p.id, '86 Diamonds (78 + 8 Bonus)', 86, 1.45, 'BEST_SELLER', 'Hot 🔥', true FROM "Product" p WHERE p.slug = 'mobile-legends'
UNION ALL
SELECT p.id, '172 Diamonds (156 + 16 Bonus)', 172, 2.85, 'BEST_SELLER', 'ពេញនិយម', true FROM "Product" p WHERE p.slug = 'mobile-legends'
UNION ALL
SELECT p.id, '257 Diamonds (234 + 23 Bonus)', 257, 4.25, 'NORMAL', 'ពេញនិយម', true FROM "Product" p WHERE p.slug = 'mobile-legends'
UNION ALL
SELECT p.id, '706 Diamonds (625 + 81 Bonus)', 706, 11.50, 'NORMAL', 'Bonus 12%', true FROM "Product" p WHERE p.slug = 'mobile-legends'
UNION ALL
SELECT p.id, '2195 Diamonds (1860 + 335 Bonus)', 2195, 34.90, 'NORMAL', 'កញ្ចប់ធំ 💎', true FROM "Product" p WHERE p.slug = 'mobile-legends';

-- 8.2 MOBILE LEGENDS | KHMER Regional Packages
INSERT INTO "Package" ("productId", "name", "amount", "price", "category", "badge", "isActive")
SELECT p.id, 'Weekly Diamond Pass', 1, 1.99, 'BEST_SELLER', 'VIP Pass 🔥', true FROM "Product" p WHERE p.slug = 'mobile-legends-khmer'
UNION ALL
SELECT p.id, '86 Diamonds (78 + 8 Bonus)', 86, 1.45, 'BEST_SELLER', 'Hot 🔥', true FROM "Product" p WHERE p.slug = 'mobile-legends-khmer'
UNION ALL
SELECT p.id, '172 Diamonds (156 + 16 Bonus)', 172, 2.85, 'BEST_SELLER', 'ពេញនិយម', true FROM "Product" p WHERE p.slug = 'mobile-legends-khmer'
UNION ALL
SELECT p.id, '257 Diamonds (234 + 23 Bonus)', 257, 4.25, 'NORMAL', 'ពេញនិយម', true FROM "Product" p WHERE p.slug = 'mobile-legends-khmer'
UNION ALL
SELECT p.id, '706 Diamonds (625 + 81 Bonus)', 706, 11.50, 'NORMAL', 'Bonus 12%', true FROM "Product" p WHERE p.slug = 'mobile-legends-khmer'
UNION ALL
SELECT p.id, '2195 Diamonds (1860 + 335 Bonus)', 2195, 34.90, 'NORMAL', 'កញ្ចប់ធំ 💎', true FROM "Product" p WHERE p.slug = 'mobile-legends-khmer';

-- 8.3 Free Fire Packages
INSERT INTO "Package" ("productId", "name", "amount", "price", "category", "badge", "isActive")
SELECT p.id, 'Weekly Membership', 1, 1.99, 'BEST_SELLER', 'Hot Deal 🔥', true FROM "Product" p WHERE p.slug = 'free-fire'
UNION ALL
SELECT p.id, '100 Diamonds + 10 Bonus', 110, 0.99, 'BEST_SELLER', 'ពេញនិយម', true FROM "Product" p WHERE p.slug = 'free-fire'
UNION ALL
SELECT p.id, '310 Diamonds + 31 Bonus', 341, 2.99, 'BEST_SELLER', 'Hot 🔥', true FROM "Product" p WHERE p.slug = 'free-fire'
UNION ALL
SELECT p.id, '520 Diamonds + 52 Bonus', 572, 4.90, 'NORMAL', 'ពេញនិយម', true FROM "Product" p WHERE p.slug = 'free-fire'
UNION ALL
SELECT p.id, '1060 Diamonds + 106 Bonus', 1166, 9.75, 'NORMAL', 'Bonus 10%', true FROM "Product" p WHERE p.slug = 'free-fire'
UNION ALL
SELECT p.id, '2180 Diamonds + 218 Bonus', 2398, 19.50, 'NORMAL', 'កញ្ចប់ពិសេស 💎', true FROM "Product" p WHERE p.slug = 'free-fire';

-- 8.4 FREE FIRE | KHMER Regional Packages
INSERT INTO "Package" ("productId", "name", "amount", "price", "category", "badge", "isActive")
SELECT p.id, 'Weekly Membership', 1, 1.99, 'BEST_SELLER', 'Hot Deal 🔥', true FROM "Product" p WHERE p.slug = 'free-fire-khmer'
UNION ALL
SELECT p.id, '100 Diamonds + 10 Bonus', 110, 0.99, 'BEST_SELLER', 'ពេញនិយម', true FROM "Product" p WHERE p.slug = 'free-fire-khmer'
UNION ALL
SELECT p.id, '310 Diamonds + 31 Bonus', 341, 2.99, 'BEST_SELLER', 'Hot 🔥', true FROM "Product" p WHERE p.slug = 'free-fire-khmer'
UNION ALL
SELECT p.id, '520 Diamonds + 52 Bonus', 572, 4.90, 'NORMAL', 'ពេញនិយម', true FROM "Product" p WHERE p.slug = 'free-fire-khmer'
UNION ALL
SELECT p.id, '1060 Diamonds + 106 Bonus', 1166, 9.75, 'NORMAL', 'Bonus 10%', true FROM "Product" p WHERE p.slug = 'free-fire-khmer'
UNION ALL
SELECT p.id, '2180 Diamonds + 218 Bonus', 2398, 19.50, 'NORMAL', 'កញ្ចប់ពិសេស 💎', true FROM "Product" p WHERE p.slug = 'free-fire-khmer';

-- 8.5 PUBG Mobile Packages
INSERT INTO "Package" ("productId", "name", "amount", "price", "category", "badge", "isActive")
SELECT p.id, '60 UC', 60, 0.99, 'BEST_SELLER', 'Hot 🔥', true FROM "Product" p WHERE p.slug = 'pubg-mobile'
UNION ALL
SELECT p.id, '325 UC (300 + 25 Bonus)', 325, 4.85, 'BEST_SELLER', 'ពេញនិយម', true FROM "Product" p WHERE p.slug = 'pubg-mobile'
UNION ALL
SELECT p.id, '660 UC (600 + 60 Bonus)', 660, 9.60, 'NORMAL', 'Royale Pass', true FROM "Product" p WHERE p.slug = 'pubg-mobile'
UNION ALL
SELECT p.id, '1800 UC (1500 + 300 Bonus)', 1800, 23.90, 'NORMAL', 'Bonus 20%', true FROM "Product" p WHERE p.slug = 'pubg-mobile'
UNION ALL
SELECT p.id, '3850 UC (3000 + 850 Bonus)', 3850, 47.90, 'NORMAL', 'កញ្ចប់ធំ 💎', true FROM "Product" p WHERE p.slug = 'pubg-mobile';

-- 8.6 Honor of Kings Packages
INSERT INTO "Package" ("productId", "name", "amount", "price", "category", "badge", "isActive")
SELECT p.id, '80 Tokens (+8 Bonus)', 88, 0.99, 'BEST_SELLER', 'Hot 🔥', true FROM "Product" p WHERE p.slug = 'honor-of-kings'
UNION ALL
SELECT p.id, '240 Tokens (+24 Bonus)', 264, 2.99, 'BEST_SELLER', 'ពេញនិយម', true FROM "Product" p WHERE p.slug = 'honor-of-kings'
UNION ALL
SELECT p.id, '400 Tokens (+40 Bonus)', 440, 4.85, 'NORMAL', 'ពេញនិយម', true FROM "Product" p WHERE p.slug = 'honor-of-kings'
UNION ALL
SELECT p.id, '800 Tokens (+95 Bonus)', 895, 9.70, 'NORMAL', 'Bonus 12%', true FROM "Product" p WHERE p.slug = 'honor-of-kings'
UNION ALL
SELECT p.id, '2400 Tokens (+300 Bonus)', 2700, 28.90, 'NORMAL', 'កញ្ចប់ពិសេស 💎', true FROM "Product" p WHERE p.slug = 'honor-of-kings';

-- 8.7 Genshin Impact Packages
INSERT INTO "Package" ("productId", "name", "amount", "price", "category", "badge", "isActive")
SELECT p.id, 'Blessing of the Welkin Moon', 1, 4.99, 'BEST_SELLER', 'Best Value 🌙', true FROM "Product" p WHERE p.slug = 'genshin-impact'
UNION ALL
SELECT p.id, '300 + 30 Genesis Crystals', 330, 4.90, 'BEST_SELLER', 'Hot 🔥', true FROM "Product" p WHERE p.slug = 'genshin-impact'
UNION ALL
SELECT p.id, '980 + 110 Genesis Crystals', 1090, 14.80, 'NORMAL', 'Bonus 11%', true FROM "Product" p WHERE p.slug = 'genshin-impact'
UNION ALL
SELECT p.id, '1980 + 260 Genesis Crystals', 2240, 29.50, 'NORMAL', 'ពេញនិយម', true FROM "Product" p WHERE p.slug = 'genshin-impact'
UNION ALL
SELECT p.id, '3280 + 600 Genesis Crystals', 3880, 48.90, 'NORMAL', 'កញ្ចប់ធំ 💎', true FROM "Product" p WHERE p.slug = 'genshin-impact';

-- 8.8 Roblox Packages
INSERT INTO "Package" ("productId", "name", "amount", "price", "category", "badge", "isActive")
SELECT p.id, '80 Robux', 80, 0.99, 'BEST_SELLER', 'Fast ⚡', true FROM "Product" p WHERE p.slug = 'roblox'
UNION ALL
SELECT p.id, '400 Robux', 400, 4.85, 'BEST_SELLER', 'Hot 🔥', true FROM "Product" p WHERE p.slug = 'roblox'
UNION ALL
SELECT p.id, '800 Robux', 800, 9.60, 'NORMAL', 'ពេញនិយម', true FROM "Product" p WHERE p.slug = 'roblox'
UNION ALL
SELECT p.id, '1700 Robux', 1700, 19.80, 'NORMAL', 'Bonus 15%', true FROM "Product" p WHERE p.slug = 'roblox'
UNION ALL
SELECT p.id, '4500 Robux', 4500, 49.00, 'NORMAL', 'កញ្ចប់ធំ 💎', true FROM "Product" p WHERE p.slug = 'roblox';

-- 8.9 Valorant Packages
INSERT INTO "Package" ("productId", "name", "amount", "price", "category", "badge", "isActive")
SELECT p.id, '475 Valorant Points (VP)', 475, 4.99, 'BEST_SELLER', 'Hot 🔥', true FROM "Product" p WHERE p.slug = 'valorant'
UNION ALL
SELECT p.id, '1000 Valorant Points (VP)', 1000, 9.99, 'BEST_SELLER', 'ពេញនិយម', true FROM "Product" p WHERE p.slug = 'valorant'
UNION ALL
SELECT p.id, '2050 Valorant Points (VP)', 2050, 19.80, 'NORMAL', 'ពេញនិយម', true FROM "Product" p WHERE p.slug = 'valorant'
UNION ALL
SELECT p.id, '3650 Valorant Points (VP)', 3650, 34.50, 'NORMAL', 'Bonus 10%', true FROM "Product" p WHERE p.slug = 'valorant'
UNION ALL
SELECT p.id, '5350 Valorant Points (VP)', 5350, 49.00, 'NORMAL', 'កញ្ចប់ពិសេស 💎', true FROM "Product" p WHERE p.slug = 'valorant';

-- 8.10 Blood Strike Packages
INSERT INTO "Package" ("productId", "name", "amount", "price", "category", "badge", "isActive")
SELECT p.id, '100 Gold', 100, 0.99, 'BEST_SELLER', 'Hot 🔥', true FROM "Product" p WHERE p.slug = 'blood-strike'
UNION ALL
SELECT p.id, '500 Gold', 500, 4.99, 'BEST_SELLER', 'ពេញនិយម', true FROM "Product" p WHERE p.slug = 'blood-strike'
UNION ALL
SELECT p.id, '1000 Gold', 1000, 9.99, 'NORMAL', 'ពេញនិយម', true FROM "Product" p WHERE p.slug = 'blood-strike'
UNION ALL
SELECT p.id, '2500 Gold', 2500, 24.99, 'NORMAL', 'Bonus 10%', true FROM "Product" p WHERE p.slug = 'blood-strike'
UNION ALL
SELECT p.id, '5000 Gold', 5000, 49.99, 'NORMAL', 'កញ្ចប់ធំ 💎', true FROM "Product" p WHERE p.slug = 'blood-strike';

-- 8.11 Magic Chess: Go Go Packages
INSERT INTO "Package" ("productId", "name", "amount", "price", "category", "badge", "isActive")
SELECT p.id, '50 Diamonds', 50, 0.85, 'BEST_SELLER', 'Hot 🔥', true FROM "Product" p WHERE p.slug = 'magic-chess-gogo'
UNION ALL
SELECT p.id, '100 Diamonds', 100, 1.65, 'BEST_SELLER', 'ពេញនិយម', true FROM "Product" p WHERE p.slug = 'magic-chess-gogo'
UNION ALL
SELECT p.id, '500 Diamonds', 500, 7.90, 'NORMAL', 'Bonus 10%', true FROM "Product" p WHERE p.slug = 'magic-chess-gogo'
UNION ALL
SELECT p.id, '1000 Diamonds', 1000, 15.50, 'NORMAL', 'កញ្ចប់ពិសេស 💎', true FROM "Product" p WHERE p.slug = 'magic-chess-gogo';

-- 8.12 Dynamic Default Packages for Any Other Games
INSERT INTO "Package" ("productId", "name", "amount", "price", "category", "badge", "isActive")
SELECT p.id, 'Standard Tier (Small)', 100, 0.99, 'BEST_SELLER', 'Hot 🔥', true
FROM "Product" p
WHERE NOT EXISTS (SELECT 1 FROM "Package" pkg WHERE pkg."productId" = p.id)
UNION ALL
SELECT p.id, 'Popular Tier (Medium)', 500, 4.99, 'BEST_SELLER', 'ពេញនិយម', true
FROM "Product" p
WHERE NOT EXISTS (SELECT 1 FROM "Package" pkg WHERE pkg."productId" = p.id)
UNION ALL
SELECT p.id, 'Mega Tier (Large)', 1200, 9.99, 'NORMAL', 'Bonus 15%', true
FROM "Product" p
WHERE NOT EXISTS (SELECT 1 FROM "Package" pkg WHERE pkg."productId" = p.id)
UNION ALL
SELECT p.id, 'VIP Exclusive Tier', 3500, 29.99, 'NORMAL', 'កញ្ចប់ពិសេស 💎', true
FROM "Product" p
WHERE NOT EXISTS (SELECT 1 FROM "Package" pkg WHERE pkg."productId" = p.id);

-- ====================================================================
-- 9. SUPABASE REALTIME CONFIGURATION
-- ====================================================================
ALTER TABLE "Order" REPLICA IDENTITY FULL;
ALTER TABLE "Product" REPLICA IDENTITY FULL;
ALTER TABLE "Package" REPLICA IDENTITY FULL;
ALTER TABLE "Stock" REPLICA IDENTITY FULL;
ALTER TABLE "ContactMessage" REPLICA IDENTITY FULL;
ALTER TABLE "User" REPLICA IDENTITY FULL;
ALTER TABLE "SystemSetting" REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE "Order", "Product", "Package", "Stock", "ContactMessage", "User", "SystemSetting";
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;
