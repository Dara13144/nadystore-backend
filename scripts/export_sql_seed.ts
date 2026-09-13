import prisma from '../src/prisma';
import fs from 'fs';
import path from 'path';

async function generateSqlSeed() {
  const products = await prisma.product.findMany({
    include: { packages: true },
    orderBy: { name: 'asc' },
  });

  let sql = `-- ==============================================================\n`;
  sql += `-- NADY / DARA TOPUP - COMPLETE SQL SEED FOR ALL 369 GAMES & PACKAGES\n`;
  sql += `-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/ueziueclbgymbynuxpby/sql\n`;
  sql += `-- ==============================================================\n\n`;
  sql += `BEGIN;\n\n`;

  for (const prod of products) {
    const safeName = prod.name.replace(/'/g, "''");
    const safeSlug = prod.slug.replace(/'/g, "''");
    const safeImage = (prod.image || '').replace(/'/g, "''");
    const safeCat = (prod.category || 'MOBILE_GAME').replace(/'/g, "''");
    const safeIsActive = prod.isActive ? 'true' : 'false';

    sql += `INSERT INTO "Product" ("id", "name", "slug", "image", "category", "isActive", "createdAt", "updatedAt")\n`;
    sql += `VALUES ('${prod.id}', '${safeName}', '${safeSlug}', '${safeImage}', '${safeCat}', ${safeIsActive}, NOW(), NOW())\n`;
    sql += `ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name", "image" = EXCLUDED."image", "category" = EXCLUDED."category", "isActive" = EXCLUDED."isActive";\n\n`;

    for (const pkg of prod.packages) {
      const safePkgName = pkg.name.replace(/'/g, "''");
      const safePkgBadge = pkg.badge ? `'${pkg.badge.replace(/'/g, "''")}'` : 'NULL';
      const safePkgImage = pkg.image ? `'${pkg.image.replace(/'/g, "''")}'` : 'NULL';
      const safePkgCat = (pkg.category || 'NORMAL').replace(/'/g, "''");
      const safePkgActive = pkg.isActive ? 'true' : 'false';

      sql += `INSERT INTO "Package" ("id", "productId", "name", "amount", "price", "category", "badge", "image", "isActive", "createdAt", "updatedAt")\n`;
      sql += `VALUES ('${pkg.id}', '${prod.id}', '${safePkgName}', ${pkg.amount}, ${pkg.price}, '${safePkgCat}', ${safePkgBadge}, ${safePkgImage}, ${safePkgActive}, NOW(), NOW())\n`;
      sql += `ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "amount" = EXCLUDED."amount", "price" = EXCLUDED."price", "category" = EXCLUDED."category", "badge" = EXCLUDED."badge", "image" = EXCLUDED."image", "isActive" = EXCLUDED."isActive";\n`;
    }
    sql += '\n';
  }

  sql += `COMMIT;\n`;

  const outputPath = path.join(__dirname, '..', 'seed_all_games.sql');
  fs.writeFileSync(outputPath, sql, 'utf8');
  console.log(`[SQL Generator] Successfully generated ${outputPath} with ${products.length} games.`);
}

generateSqlSeed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
