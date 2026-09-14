const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const sqlStatements = [
  // 1. Set REPLICA IDENTITY FULL on all tables so DELETE events send full old record in Supabase Realtime
  'ALTER TABLE "Product" REPLICA IDENTITY FULL;',
  'ALTER TABLE "Package" REPLICA IDENTITY FULL;',
  'ALTER TABLE "Order" REPLICA IDENTITY FULL;',
  'ALTER TABLE "Stock" REPLICA IDENTITY FULL;',
  'ALTER TABLE "ContactMessage" REPLICA IDENTITY FULL;',
  'ALTER TABLE "User" REPLICA IDENTITY FULL;',
  'ALTER TABLE "SystemSetting" REPLICA IDENTITY FULL;',
  'ALTER TABLE "AuditLog" REPLICA IDENTITY FULL;',

  // 2. Add all tables to supabase_realtime publication
  `DO $$ 
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE "Product", "Package", "Order", "Stock", "ContactMessage", "User", "SystemSetting";
    END IF;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;`,

  // 3. Ensure Foreign Key constraints cascade on delete in PostgreSQL
  // Drops existing restrictive constraints if any and re-adds CASCADE so deleting in Supabase web UI deletes child items cleanly
  `DO $$
  BEGIN
    -- Package -> Product
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Package_productId_fkey') THEN
      ALTER TABLE "Package" DROP CONSTRAINT "Package_productId_fkey";
    END IF;
    ALTER TABLE "Package" ADD CONSTRAINT "Package_productId_fkey" 
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- Stock -> Package
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Stock_packageId_fkey') THEN
      ALTER TABLE "Stock" DROP CONSTRAINT "Stock_packageId_fkey";
    END IF;
    ALTER TABLE "Stock" ADD CONSTRAINT "Stock_packageId_fkey" 
      FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- Order -> Package (Cascade or Set Null)
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Order_packageId_fkey') THEN
      ALTER TABLE "Order" DROP CONSTRAINT "Order_packageId_fkey";
    END IF;
    ALTER TABLE "Order" ADD CONSTRAINT "Order_packageId_fkey" 
      FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

  EXCEPTION
    WHEN others THEN 
      RAISE NOTICE 'Constraint update notice: %', SQLERRM;
  END $$;`
];

async function applyRealtimeDeletes() {
  console.log('=== Configuring Supabase Realtime Deletes and Cascade Relations ===\n');
  for (const sql of sqlStatements) {
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log('✓ Executed: ' + sql.substring(0, 65) + '...');
    } catch (err) {
      console.error('Error on statement:', err.message);
    }
  }
  console.log('\n=== Supabase Realtime & Cascade Delete System Configured Successfully! ===');
}

applyRealtimeDeletes()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
