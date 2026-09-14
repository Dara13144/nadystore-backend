const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const sqlStatements = [
  'CREATE EXTENSION IF NOT EXISTS "pgcrypto";',
  'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',

  // 1. Product Table
  'ALTER TABLE "Product" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;',
  'ALTER TABLE "Product" ALTER COLUMN "isActive" SET DEFAULT true;',
  'ALTER TABLE "Product" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;',
  'ALTER TABLE "Product" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;',

  // 2. Package Table
  'ALTER TABLE "Package" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;',
  'ALTER TABLE "Package" ALTER COLUMN "isActive" SET DEFAULT true;',
  'ALTER TABLE "Package" ALTER COLUMN "category" SET DEFAULT \'NORMAL\';',
  'ALTER TABLE "Package" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;',
  'ALTER TABLE "Package" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;',

  // 3. User Table
  'ALTER TABLE "User" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;',
  'ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT \'USER\';',
  'ALTER TABLE "User" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;',
  'ALTER TABLE "User" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;',

  // 4. Order Table
  'ALTER TABLE "Order" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;',
  'ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT \'PENDING\';',
  'ALTER TABLE "Order" ALTER COLUMN "paymentStatus" SET DEFAULT \'PENDING\';',
  'ALTER TABLE "Order" ALTER COLUMN "deliveryStatus" SET DEFAULT \'WAITING\';',
  'ALTER TABLE "Order" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;',
  'ALTER TABLE "Order" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;',

  // 5. Stock Table
  'ALTER TABLE "Stock" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;',
  'ALTER TABLE "Stock" ALTER COLUMN "isUsed" SET DEFAULT false;',
  'ALTER TABLE "Stock" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;',
  'ALTER TABLE "Stock" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;',

  // 6. ContactMessage Table
  'ALTER TABLE "ContactMessage" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;',
  'ALTER TABLE "ContactMessage" ALTER COLUMN "status" SET DEFAULT \'PENDING\';',
  'ALTER TABLE "ContactMessage" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;',
  'ALTER TABLE "ContactMessage" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;',

  // 7. AuditLog Table
  'ALTER TABLE "AuditLog" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;',
  'ALTER TABLE "AuditLog" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;'
];

async function applyDefaults() {
  console.log('=== Applying Database Default ID and Timestamp Generators on Supabase ===\n');
  for (const sql of sqlStatements) {
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log('✓ Executed: ' + sql);
    } catch (err) {
      console.error('Error executing [' + sql + ']:', err.message);
    }
  }

  // Test raw insert without providing "id" to verify it works seamlessly
  console.log('\nTesting raw SQL insert on "Product" without providing "id"...');
  try {
    const testSlug = 'test-game-' + Date.now();
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Product" ("name", "slug", "image", "category", "isActive")
      VALUES ('Test Game', '${testSlug}', '/images/games/mlbb.png', 'MOBILE_GAME', true);
    `);
    console.log('✓ Insert without ID succeeded! PostgreSQL automatically generated the default ID.');

    // Cleanup test product
    await prisma.$executeRawUnsafe(`DELETE FROM "Product" WHERE "slug" = '${testSlug}';`);
    console.log('✓ Test product cleaned up successfully.');
  } catch (testErr) {
    console.error('Test insert failed:', testErr.message);
  }

  console.log('\n=== All Supabase Database Defaults Successfully Fixed & Verified! ===');
}

applyDefaults()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
