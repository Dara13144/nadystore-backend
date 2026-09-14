const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    include: { packages: true }
  });
  for (const p of products) {
    console.log('PRODUCT:', p.id, p.name, p.slug);
    console.log('PACKAGES COUNT:', p.packages.length);
    for (const pkg of p.packages) {
      console.log(`  - [${pkg.id}] ${pkg.name} | $${pkg.price} | badge: ${pkg.badge || 'none'}`);
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
