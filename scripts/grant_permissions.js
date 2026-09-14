const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const grantSql = [
  'GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;',
  'GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;',
  'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;',
  'GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;',
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;',
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;',
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;'
];

async function grantAll() {
  for (const sql of grantSql) {
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log('✓ Granted:', sql.substring(0, 50));
    } catch (e) {
      console.error('Error:', e.message);
    }
  }
}

grantAll()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
