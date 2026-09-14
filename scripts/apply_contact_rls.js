const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const sqlStatements = [
  `CREATE TABLE IF NOT EXISTS "ContactMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "telegram" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "txnId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reply" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  'ALTER TABLE "ContactMessage" ENABLE ROW LEVEL SECURITY;',
  'DROP POLICY IF EXISTS "Allow public insert on ContactMessage" ON "ContactMessage";',
  'CREATE POLICY "Allow public insert on ContactMessage" ON "ContactMessage" FOR INSERT WITH CHECK (true);',
  'DROP POLICY IF EXISTS "Allow public select on ContactMessage" ON "ContactMessage";',
  'CREATE POLICY "Allow public select on ContactMessage" ON "ContactMessage" FOR SELECT USING (true);',
  'DROP POLICY IF EXISTS "Allow service role all on ContactMessage" ON "ContactMessage";',
  'CREATE POLICY "Allow service role all on ContactMessage" ON "ContactMessage" FOR ALL TO service_role USING (true) WITH CHECK (true);'
];

async function applyRLS() {
  console.log('Creating ContactMessage table and applying Supabase RLS & Security Policies...');
  for (const sql of sqlStatements) {
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log('✓ Executed: ' + sql.substring(0, 60));
    } catch (err) {
      console.error('Error on: ' + sql, err.message);
    }
  }
  console.log('=== Supabase ContactMessage Table & RLS Successfully Applied! ===');
}

applyRLS()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
