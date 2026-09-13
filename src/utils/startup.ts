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
  { name: 'Free Fire', slug: 'free-fire', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/freefire.png' },
  { name: 'Mobile Legends: Bang Bang', slug: 'mobile-legends', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/mlbb.png' },
  { name: 'Moonton Mobile Legends', slug: 'moonton-mlbb', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/mlbb.png' },
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

export async function runDatabaseStartup(): Promise<void> {
  console.log('[Startup] Initializing database...');

  const schemaPath = path.join(__dirname, '..', '..', 'prisma', 'schema.prisma');
  const prodSchemaPath = path.join(__dirname, '..', '..', 'prisma', 'schema.prod.prisma');
  const backendRoot = path.join(__dirname, '..', '..');
  const dbUrl = process.env.DATABASE_URL || '';
  const isPostgres = dbUrl.startsWith('postgresql:') || dbUrl.startsWith('postgres:');
  const isProd = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true' || Boolean(process.env.RENDER_SERVICE_ID) || isPostgres;

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

    if (productCount === 0) {
      console.log('[Startup] Empty database detected — running initial seed for catalog...');
      await seedDatabase();
    } else {
      console.log(`[Startup] Database catalog active with ${productCount} products — ready.`);
    }
  } catch (err: any) {
    console.error('[Startup] Database connection/seed error:', err.message);
  }
}
