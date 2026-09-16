const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    include: { packages: true },
    orderBy: { name: 'asc' }
  });
  console.log('Total Products in DB:', products.length);
  for (const p of products) {
    console.log(`\n🎮 ${p.name} (slug: "${p.slug}") - Total Packages: ${p.packages.length}`);
    p.packages.slice(0, 5).forEach((pkg) => {
      console.log(`   💎 Package: "${pkg.name}", Amount: ${pkg.amount}, Price: $${pkg.price}`);
    });
    if (p.packages.length > 5) {
      console.log(`   ... and ${p.packages.length - 5} more packages`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
