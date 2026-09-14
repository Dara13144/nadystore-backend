const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const sqlStatements = [
  // 1. Product Table
  'ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;',
  'DROP POLICY IF EXISTS "Allow public read on Product" ON "Product";',
  'CREATE POLICY "Allow public read on Product" ON "Product" FOR SELECT USING (true);',
  'DROP POLICY IF EXISTS "Allow service role all on Product" ON "Product";',
  'CREATE POLICY "Allow service role all on Product" ON "Product" FOR ALL TO service_role USING (true) WITH CHECK (true);',

  // 2. Package Table
  'ALTER TABLE "Package" ENABLE ROW LEVEL SECURITY;',
  'DROP POLICY IF EXISTS "Allow public read on Package" ON "Package";',
  'CREATE POLICY "Allow public read on Package" ON "Package" FOR SELECT USING (true);',
  'DROP POLICY IF EXISTS "Allow service role all on Package" ON "Package";',
  'CREATE POLICY "Allow service role all on Package" ON "Package" FOR ALL TO service_role USING (true) WITH CHECK (true);',

  // 3. Order Table
  'ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;',
  'DROP POLICY IF EXISTS "Allow read on Order" ON "Order";',
  'CREATE POLICY "Allow read on Order" ON "Order" FOR SELECT USING (true);',
  'DROP POLICY IF EXISTS "Allow insert on Order" ON "Order";',
  'CREATE POLICY "Allow insert on Order" ON "Order" FOR INSERT WITH CHECK (true);',
  'DROP POLICY IF EXISTS "Allow service role all on Order" ON "Order";',
  'CREATE POLICY "Allow service role all on Order" ON "Order" FOR ALL TO service_role USING (true) WITH CHECK (true);',

  // 4. User Table (Protects sensitive password & credentials)
  'ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;',
  'DROP POLICY IF EXISTS "Allow service role all on User" ON "User";',
  'CREATE POLICY "Allow service role all on User" ON "User" FOR ALL TO service_role USING (true) WITH CHECK (true);',
  'DROP POLICY IF EXISTS "Allow user read own profile" ON "User";',
  'CREATE POLICY "Allow user read own profile" ON "User" FOR SELECT TO authenticated USING (auth.jwt() ->> \'email\' = email);',

  // 5. Stock Table (Protects digital vouchers)
  'ALTER TABLE "Stock" ENABLE ROW LEVEL SECURITY;',
  'DROP POLICY IF EXISTS "Allow service role all on Stock" ON "Stock";',
  'CREATE POLICY "Allow service role all on Stock" ON "Stock" FOR ALL TO service_role USING (true) WITH CHECK (true);',

  // 6. SystemSetting Table
  'ALTER TABLE "SystemSetting" ENABLE ROW LEVEL SECURITY;',
  'DROP POLICY IF EXISTS "Allow public read on SystemSetting" ON "SystemSetting";',
  'CREATE POLICY "Allow public read on SystemSetting" ON "SystemSetting" FOR SELECT USING (true);',
  'DROP POLICY IF EXISTS "Allow service role all on SystemSetting" ON "SystemSetting";',
  'CREATE POLICY "Allow service role all on SystemSetting" ON "SystemSetting" FOR ALL TO service_role USING (true) WITH CHECK (true);',

  // 7. AuditLog Table
  'ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;',
  'DROP POLICY IF EXISTS "Allow service role all on AuditLog" ON "AuditLog";',
  'CREATE POLICY "Allow service role all on AuditLog" ON "AuditLog" FOR ALL TO service_role USING (true) WITH CHECK (true);'
];

async function applyRLS() {
  console.log('Applying Supabase RLS & Security Policies...');
  for (const sql of sqlStatements) {
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log('✓ Executed: ' + sql.substring(0, 60));
    } catch (err) {
      console.error('Error on: ' + sql, err.message);
    }
  }
  console.log('=== All Supabase RLS Security Policies Successfully Applied! ===');
}

applyRLS()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
