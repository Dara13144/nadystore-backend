import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import prisma from '../prisma';
import bcrypt from 'bcryptjs';

interface GameDef {
  name: string;
  slug: string;
  category: string;
  currency: string;
  image?: string;
}

function generateDefaultPackages(slug: string, currency: string) {
  if (slug === 'free-fire') {
    return [
      { name: '100 Diamonds', amount: 100, price: 0.99, category: 'BEST_SELLER', badge: 'ពេញនិយម' },
      { name: '310 Diamonds', amount: 310, price: 2.99, category: 'BEST_SELLER', badge: 'Hot 🔥' },
      { name: '520 Diamonds', amount: 520, price: 4.99, category: 'NORMAL', badge: 'Bonus 5%' },
      { name: '1060 Diamonds', amount: 1060, price: 9.99, category: 'NORMAL', badge: 'Bonus 10%' },
      { name: '2180 Diamonds', amount: 2180, price: 19.99, category: 'NORMAL', badge: 'កញ្ចប់ពិសេស 💎' },
      { name: '5600 Diamonds', amount: 5600, price: 49.99, category: 'NORMAL', badge: 'VIP 👑' },
    ];
  }

  return [
    { name: '86 Diamonds', amount: 86, price: 1.49, category: 'BEST_SELLER', badge: 'Hot 🔥' },
    { name: '172 Diamonds', amount: 172, price: 2.99, category: 'BEST_SELLER', badge: 'ពេញនិយម' },
    { name: '257 Diamonds', amount: 257, price: 4.49, category: 'NORMAL', badge: 'Bonus 5%' },
    { name: '706 Diamonds', amount: 706, price: 11.99, category: 'NORMAL', badge: 'Bonus 10%' },
    { name: '2195 Diamonds', amount: 2195, price: 34.99, category: 'NORMAL', badge: 'VIP Pass' },
    { name: 'Weekly Diamond Pass', amount: 1, price: 1.99, category: 'BEST_SELLER', badge: 'Special 💎' },
  ];
}

const ALL_GAMES: GameDef[] = [
  { name: 'FREE FIRE | KHMER', slug: 'free-fire-khmer', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/freefire.png' },
  { name: 'MOBILE LEGENDS | KHMER', slug: 'mobile-legends-khmer', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/mlbb.png' },
  { name: 'MOBILE LEGENDS | PHILIPPINES', slug: 'mobile-legends-philippines', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/mlbb.png' },
  { name: 'MOBILE LEGENDS | INDONESIA', slug: 'mobile-legends-indonesia', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/mlbb.png' },
  { name: 'FREE FIRE | INDONESIA', slug: 'free-fire-indonesia', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/freefire.png' },
  { name: 'FREE FIRE | VIETNAM', slug: 'free-fire-vietnam', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/freefire.png' },
  { name: 'FREE FIRE | TAIWAN', slug: 'free-fire-taiwan', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/freefire.png' },
  { name: 'MAGIC CHESS GOGO', slug: 'magic-chess-gogo', category: 'MOBILE_GAME', currency: 'Gold Coins', image: '/images/games/magicchess.png' },
  { name: 'HONOR OF KINGS', slug: 'honor-of-kings', category: 'MOBILE_GAME', currency: 'Tokens', image: '/images/games/hok.png' },
  { name: 'PUBG MOBILE', slug: 'pubg-mobile', category: 'MOBILE_GAME', currency: 'UC', image: '/images/games/pubgm.png' },
  { name: 'BLOOD STRIKE', slug: 'blood-strike', category: 'MOBILE_GAME', currency: 'Gold', image: '/images/games/bloodstrike.png' },
  { name: 'VALORANT', slug: 'valorant', category: 'PC_GAME', currency: 'VP', image: '/images/games/valorant.png' },
  { name: 'FARLIGHT 84', slug: 'farlight-84', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/farlight.png' },
  { name: 'DELTA FORCE', slug: 'delta-force', category: 'PC_GAME', currency: 'Delta Coins', image: '/images/games/deltaforce.png' },
  { name: 'SUPER SUS', slug: 'super-sus', category: 'MOBILE_GAME', currency: 'Goldstar', image: '/images/games/roblox.png' },
  { name: 'Free Fire', slug: 'free-fire', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/freefire.png' },
  { name: 'Mobile Legends: Bang Bang', slug: 'mobile-legends', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/mlbb.png' },
];

export async function seedDatabase(): Promise<void> {
  console.log('[Startup] Seeding database with Free Fire & Mobile Legends catalog...');

  const existingAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!existingAdmin) {
    const adminPassword = bcrypt.hashSync('admin123', 10);
    await prisma.user.create({
      data: { email: 'mdara9695@gmail.com', password: adminPassword, role: 'ADMIN' },
    });
    console.log('[Startup] Created default admin: mdara9695@gmail.com / admin123');
  }

  let count = 0;
  for (const game of ALL_GAMES) {
    const packages = generateDefaultPackages(game.slug, game.currency);
    try {
      await prisma.product.upsert({
        where: { slug: game.slug },
        update: {
          name: game.name,
          category: game.category,
          isActive: true,
          image: game.image || `/images/games/${game.slug}.png`,
        },
        create: {
          name: game.name,
          slug: game.slug,
          image: game.image || `/images/games/${game.slug}.png`,
          category: game.category,
          isActive: true,
          packages: {
            create: packages.map((pkg) => ({
              name: pkg.name,
              amount: pkg.amount,
              price: pkg.price,
              category: pkg.category,
              badge: pkg.badge ?? null,
              isActive: true,
            })),
          },
        },
      });
      count++;
    } catch (err: any) {
      console.error(`[Startup] Failed to seed ${game.slug}:`, err.message);
    }
  }

  console.log(`[Startup] ✅ Synced and verified ${count} game products successfully.`);
}

async function initSupabasePostgres(): Promise<void> {
  const sqlStatements = [
    'CREATE EXTENSION IF NOT EXISTS "pgcrypto";',
    'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',

    // Default UUID & Timestamp generators
    'ALTER TABLE "Product" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;',
    'ALTER TABLE "Product" ALTER COLUMN "isActive" SET DEFAULT true;',
    'ALTER TABLE "Package" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;',
    'ALTER TABLE "Package" ALTER COLUMN "isActive" SET DEFAULT true;',
    'ALTER TABLE "Package" ALTER COLUMN "category" SET DEFAULT \'NORMAL\';',
    'ALTER TABLE "User" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;',
    'ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT \'USER\';',
    'ALTER TABLE "Order" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;',
    'ALTER TABLE "Stock" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;',
    'ALTER TABLE "Stock" ALTER COLUMN "isUsed" SET DEFAULT false;',
    'ALTER TABLE "ContactMessage" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;',
    'ALTER TABLE "ContactMessage" ALTER COLUMN "status" SET DEFAULT \'PENDING\';',
    'ALTER TABLE "AuditLog" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;',

    // Realtime Replica Identity Full for live deletes & updates
    'ALTER TABLE "Product" REPLICA IDENTITY FULL;',
    'ALTER TABLE "Package" REPLICA IDENTITY FULL;',
    'ALTER TABLE "Order" REPLICA IDENTITY FULL;',
    'ALTER TABLE "Stock" REPLICA IDENTITY FULL;',
    'ALTER TABLE "ContactMessage" REPLICA IDENTITY FULL;',
    'ALTER TABLE "User" REPLICA IDENTITY FULL;',

    // Realtime Publication
    `DO $$ 
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE "Product", "Package", "Order", "Stock", "ContactMessage", "User";
      END IF;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;`,

    // Cascade foreign keys for clean deletions
    `DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Package_productId_fkey') THEN
        ALTER TABLE "Package" DROP CONSTRAINT "Package_productId_fkey";
      END IF;
      ALTER TABLE "Package" ADD CONSTRAINT "Package_productId_fkey" 
        FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

      IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Stock_packageId_fkey') THEN
        ALTER TABLE "Stock" DROP CONSTRAINT "Stock_packageId_fkey";
      END IF;
      ALTER TABLE "Stock" ADD CONSTRAINT "Stock_packageId_fkey" 
        FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

      IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Order_packageId_fkey') THEN
        ALTER TABLE "Order" DROP CONSTRAINT "Order_packageId_fkey";
      END IF;
      ALTER TABLE "Order" ADD CONSTRAINT "Order_packageId_fkey" 
        FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
      WHEN others THEN null;
    END $$;`,

    // RLS Policies & Grants for public and authenticated roles
    'ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;',
    'DROP POLICY IF EXISTS "Public Read Products" ON "Product";',
    'CREATE POLICY "Public Read Products" ON "Product" FOR SELECT TO public USING (true);',
    'ALTER TABLE "Package" ENABLE ROW LEVEL SECURITY;',
    'DROP POLICY IF EXISTS "Public Read Packages" ON "Package";',
    'CREATE POLICY "Public Read Packages" ON "Package" FOR SELECT TO public USING (true);',
    'ALTER TABLE "ContactMessage" ENABLE ROW LEVEL SECURITY;',
    'DROP POLICY IF EXISTS "Public Insert ContactMessage" ON "ContactMessage";',
    'CREATE POLICY "Public Insert ContactMessage" ON "ContactMessage" FOR INSERT TO public WITH CHECK (true);',
    'DROP POLICY IF EXISTS "Public Select ContactMessage" ON "ContactMessage";',
    'CREATE POLICY "Public Select ContactMessage" ON "ContactMessage" FOR SELECT TO public USING (true);',
    'ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;',
    'ALTER TABLE "Stock" ENABLE ROW LEVEL SECURITY;',
    'ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;',
    'ALTER TABLE "SystemSetting" ENABLE ROW LEVEL SECURITY;',
    'ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;',
    'DROP POLICY IF EXISTS "Allow delete on Product" ON "Product";',
    'CREATE POLICY "Allow delete on Product" ON "Product" FOR DELETE TO anon, authenticated, service_role USING (true);',
    'DROP POLICY IF EXISTS "Allow delete on Package" ON "Package";',
    'CREATE POLICY "Allow delete on Package" ON "Package" FOR DELETE TO anon, authenticated, service_role USING (true);',
    'DROP POLICY IF EXISTS "Allow service role all on AuditLog" ON "AuditLog";',
    'CREATE POLICY "Allow service role all on AuditLog" ON "AuditLog" FOR ALL TO service_role USING (true) WITH CHECK (true);',
    `CREATE OR REPLACE VIEW "games" AS SELECT id, name, slug, image, category, "isActive", "createdAt", "updatedAt" FROM "Product";`,
    `CREATE OR REPLACE RULE games_delete AS ON DELETE TO "games" DO INSTEAD (DELETE FROM "Product" WHERE id = OLD.id);`,
    'GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;',
    'GRANT ALL ON "Product", "Package", "games" TO anon, authenticated, service_role;',
    'GRANT SELECT ON TABLE "SystemSetting", "ContactMessage" TO anon, authenticated, public;',
    'GRANT INSERT ON TABLE "Order", "ContactMessage" TO anon, authenticated, public;',
  ];

  for (const sql of sqlStatements) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch {
      // Ignore if not supported in local sqlite mode or already existing
    }
  }
}

export async function runDatabaseStartup(): Promise<void> {
  console.log('[Startup] Initializing database...');

  const schemaPath = path.join(__dirname, '..', '..', 'prisma', 'schema.prisma');
  const prodSchemaPath = path.join(__dirname, '..', '..', 'prisma', 'schema.prod.prisma');
  const backendRoot = path.join(__dirname, '..', '..');
  const dbUrl = process.env.DATABASE_URL || '';
  const isPostgres = dbUrl.startsWith('postgresql:') || dbUrl.startsWith('postgres:');

  // Auto-heal schema mismatch: if PostgreSQL is configured, ensure postgresql schema is active
  if (isPostgres) {
    try {
      if (fs.existsSync(schemaPath) && fs.existsSync(prodSchemaPath)) {
        const currentSchema = fs.readFileSync(schemaPath, 'utf8');
        if (currentSchema.includes('provider = "sqlite"') || currentSchema.includes("provider = 'sqlite'")) {
          console.log('[Startup] Detected PostgreSQL DATABASE_URL with SQLite schema. Synchronizing schema.prod.prisma...');
          fs.copyFileSync(prodSchemaPath, schemaPath);
          execSync(`npx prisma generate --schema="${schemaPath}"`, {
            cwd: backendRoot,
            stdio: 'pipe',
            env: { ...process.env },
          });
          console.log('[Startup] ✅ Prisma Client synchronized for PostgreSQL.');
        }
      }
    } catch (healErr: any) {
      console.warn('[Startup] Auto-heal warning:', healErr.message);
    }
  }

  try {
    console.log('[Startup] Synchronizing database schema (prisma db push)...');
    execSync(`npx prisma db push --schema="${schemaPath}" --skip-generate --accept-data-loss`, {
      cwd: backendRoot,
      stdio: 'pipe',
      env: { ...process.env },
      timeout: 60_000,
    });
    console.log('[Startup] ✅ Database schema synchronized successfully.');
  } catch (err: any) {
    const msg = (err.stderr?.toString() || err.stdout?.toString() || err.message || '').trim();
    console.warn('[Startup] Database sync note:', msg.substring(0, 300));
  }

  try {
    await prisma.$connect();
    
    // Auto-apply Supabase PostgreSQL constraints, default UUIDs, RLS, and Realtime publications
    if (isPostgres) {
      console.log('[Startup] Applying Supabase PostgreSQL defaults, RLS & Realtime configuration...');
      await initSupabasePostgres();
      console.log('[Startup] ✅ Supabase PostgreSQL defaults and RLS active.');
    }

    const productCount = await prisma.product.count();
    console.log(`[Startup] Found ${productCount} products in database.`);

    // Ensure default administrator accounts exist
    const adminPassword = await bcrypt.hash('admin123', 10);
    const ADMIN_ACCOUNTS = ['admin@topup.com', 'mdara9695@gmail.com', 'admin@nadytopup.com', 'admin@gmail.com'];
    for (const email of ADMIN_ACCOUNTS) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (!existing) {
        await prisma.user.create({
          data: { email, password: adminPassword, role: 'ADMIN' },
        });
        console.log(`[Startup] Created administrator account: ${email}`);
      } else {
        await prisma.user.update({
          where: { email },
          data: { role: 'ADMIN', password: adminPassword },
        });
        console.log(`[Startup] Updated/Confirmed ADMIN account: ${email}`);
      }
    }

    // Games are managed exclusively by Admin via dashboard (NO auto-seed)
    console.log(`[Startup] Database catalog active with ${productCount} products. Games are added and managed exclusively via Admin Dashboard.`);
  } catch (err: any) {
    console.error('[Startup] Database connection/seed error:', err.message);
  }
}

