const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TELEGRAM_PACKAGES = [
  { name: '50 Stars', amount: 50, price: 0.81, category: 'Stars', badge: 'RESELLER' },
  { name: '75 Stars', amount: 75, price: 1.22, category: 'Stars', badge: 'RESELLER' },
  { name: '100 Stars', amount: 100, price: 1.60, category: 'Stars', badge: 'RESELLER' },
  { name: '150 Stars', amount: 150, price: 2.39, category: 'Stars', badge: 'RESELLER' },
  { name: '250 Stars', amount: 250, price: 3.97, category: 'Stars', badge: 'RESELLER' },
  { name: '350 Stars', amount: 350, price: 5.55, category: 'Stars', badge: 'RESELLER' },
  { name: '500 Stars', amount: 500, price: 7.94, category: 'Stars', badge: 'RESELLER' },
  { name: '750 Stars', amount: 750, price: 11.89, category: 'Stars', badge: 'RESELLER' },
  { name: 'Premium 3 Months', amount: 3, price: 12.67, category: 'Premium', badge: 'POPULAR' },
  { name: '1000 Stars', amount: 1000, price: 15.82, category: 'Stars', badge: 'RESELLER' },
  { name: 'Premium 6 Months', amount: 6, price: 16.87, category: 'Premium', badge: 'BEST VALUE' },
  { name: '1500 Stars', amount: 1500, price: 23.72, category: 'Stars', badge: 'RESELLER' },
  { name: 'Premium 12 Months', amount: 12, price: 30.53, category: 'Premium', badge: 'SUPER SAVE' },
  { name: '2500 Stars', amount: 2500, price: 39.45, category: 'Stars', badge: 'RESELLER' },
  { name: '5000 Stars', amount: 5000, price: 78.59, category: 'Stars', badge: 'RESELLER' },
  { name: '10000 Stars', amount: 10000, price: 156.55, category: 'Stars', badge: 'VIP' },
];

async function main() {
  console.log('🚀 Seeding Updated Telegram Premium & Stars Packages...');

  // 1. Upsert Product
  const product = await prisma.product.upsert({
    where: { slug: 'telegram-premium' },
    update: {
      name: 'Telegram Premium',
      image: '/images/games/telegram-premium.png',
      category: 'APP',
      isActive: true,
      hasZoneId: false,
      zoneIdLabel: null,
    },
    create: {
      name: 'Telegram Premium',
      slug: 'telegram-premium',
      image: '/images/games/telegram-premium.png',
      category: 'APP',
      isActive: true,
      hasZoneId: false,
      zoneIdLabel: null,
    },
  });

  console.log(`✅ Product: ${product.name} (ID: ${product.id})`);

  // 2. Clear old packages for telegram-premium
  const deleted = await prisma.package.deleteMany({
    where: { productId: product.id },
  });
  console.log(`🧹 Removed ${deleted.count} old packages.`);

  // 3. Create fresh packages matching user specification
  for (const pkg of TELEGRAM_PACKAGES) {
    const created = await prisma.package.create({
      data: {
        productId: product.id,
        name: pkg.name,
        amount: pkg.amount,
        price: pkg.price,
        category: pkg.category,
        badge: pkg.badge,
        isActive: true,
      },
    });
    console.log(`📦 [${pkg.category}] ${created.name} - $${created.price}`);
  }

  console.log(`🎉 Successfully seeded all ${TELEGRAM_PACKAGES.length} Telegram packages!`);
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
