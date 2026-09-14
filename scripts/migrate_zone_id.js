const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runMigration() {
  console.log('[Migration] Adding hasZoneId and zoneIdLabel to Product table if not exists...');
  
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Product" 
      ADD COLUMN IF NOT EXISTS "hasZoneId" BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS "zoneIdLabel" TEXT;
    `);
    console.log('✓ Added columns "hasZoneId" and "zoneIdLabel" to "Product" table.');

    // Update Mobile Legends products
    const mlbbResult = await prisma.$executeRawUnsafe(`
      UPDATE "Product"
      SET "hasZoneId" = true, "zoneIdLabel" = 'Zone ID'
      WHERE LOWER(slug) LIKE '%mobile-legends%' 
         OR LOWER(slug) LIKE '%moonton%'
         OR LOWER(name) LIKE '%mobile legends%'
         OR LOWER(name) LIKE '%mlbb%';
    `);
    console.log(`✓ Updated Mobile Legends products with hasZoneId=true (rows affected: ${mlbbResult})`);

    // Update Genshin / Honkai / ZZZ / Wuthering / RPG games with Server ID
    const serverResult = await prisma.$executeRawUnsafe(`
      UPDATE "Product"
      SET "hasZoneId" = true, "zoneIdLabel" = 'Server ID'
      WHERE LOWER(slug) LIKE '%genshin%'
         OR LOWER(slug) LIKE '%honkai%'
         OR LOWER(slug) LIKE '%zenless%'
         OR LOWER(slug) LIKE '%wuthering%'
         OR LOWER(slug) LIKE '%ragnarok%'
         OR LOWER(name) LIKE '%genshin%'
         OR LOWER(name) LIKE '%star rail%';
    `);
    console.log(`✓ Updated Server-based RPG products with hasZoneId=true (rows affected: ${serverResult})`);

  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runMigration();
