const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function populateMissingPackages() {
  console.log('Ensuring all games have complete packages in Supabase...');

  // 1. Super Sus Packages
  const superSus = await prisma.product.findUnique({ where: { slug: 'super-sus' } });
  if (superSus) {
    const existingCount = await prisma.package.count({ where: { productId: superSus.id } });
    if (existingCount === 0) {
      await prisma.product.update({ where: { id: superSus.id }, data: { isActive: true } });
      await prisma.package.createMany({
        data: [
          { productId: superSus.id, name: '100 Goldstar', amount: 100, price: 0.99, category: 'BEST_SELLER', badge: 'ពេញនិយម' },
          { productId: superSus.id, name: '310 Goldstar', amount: 310, price: 2.99, category: 'BEST_SELLER', badge: 'Hot 🔥' },
          { productId: superSus.id, name: '520 Goldstar', amount: 520, price: 4.99, category: 'NORMAL', badge: 'Bonus 5%' },
          { productId: superSus.id, name: '1060 Goldstar', amount: 1060, price: 9.99, category: 'NORMAL', badge: 'Bonus 10%' },
          { productId: superSus.id, name: 'Super Pass', amount: 1, price: 4.50, category: 'BEST_SELLER', badge: 'VIP 👑' },
          { productId: superSus.id, name: '2180 Goldstar', amount: 2180, price: 19.99, category: 'NORMAL', badge: 'កញ្ចប់ពិសេស 💎' },
          { productId: superSus.id, name: '5600 Goldstar', amount: 5600, price: 49.99, category: 'NORMAL', badge: 'Mega Value' }
        ]
      });
      console.log('Added 7 packages for Super Sus.');
    }
  }

  // 2. Ensure Free Fire (slug: free-fire) and Mobile Legends (slug: mobile-legends) exist with full packages
  const defaultGames = [
    {
      name: 'Free Fire',
      slug: 'free-fire',
      category: 'MOBILE_GAME',
      image: '/images/games/freefire.png',
      packages: [
        { name: '100 Diamonds', amount: 100, price: 0.99, category: 'BEST_SELLER', badge: 'ពេញនិយម' },
        { name: '310 Diamonds', amount: 310, price: 2.99, category: 'BEST_SELLER', badge: 'Hot 🔥' },
        { name: '520 Diamonds', amount: 520, price: 4.99, category: 'NORMAL', badge: 'Bonus 5%' },
        { name: '1060 Diamonds', amount: 1060, price: 9.99, category: 'NORMAL', badge: 'Bonus 10%' },
        { name: '2180 Diamonds', amount: 2180, price: 19.99, category: 'NORMAL', badge: 'កញ្ចប់ពិសេស 💎' },
        { name: '5600 Diamonds', amount: 5600, price: 49.99, category: 'NORMAL', badge: 'VIP 👑' }
      ]
    },
    {
      name: 'Mobile Legends: Bang Bang',
      slug: 'mobile-legends',
      category: 'MOBILE_GAME',
      image: '/images/games/mlbb.png',
      packages: [
        { name: '86 Diamonds', amount: 86, price: 1.49, category: 'BEST_SELLER', badge: 'Hot 🔥' },
        { name: 'Weekly Diamond Pass', amount: 1, price: 1.99, category: 'BEST_SELLER', badge: 'Special 💎' },
        { name: '172 Diamonds', amount: 172, price: 2.99, category: 'BEST_SELLER', badge: 'ពេញនិយម' },
        { name: '257 Diamonds', amount: 257, price: 4.49, category: 'NORMAL', badge: 'Bonus 5%' },
        { name: '706 Diamonds', amount: 706, price: 11.99, category: 'NORMAL', badge: 'Bonus 10%' },
        { name: '2195 Diamonds', amount: 2195, price: 34.99, category: 'NORMAL', badge: 'VIP Pass' }
      ]
    }
  ];

  for (const g of defaultGames) {
    let p = await prisma.product.findUnique({ where: { slug: g.slug } });
    if (!p) {
      p = await prisma.product.create({
        data: {
          name: g.name,
          slug: g.slug,
          image: g.image,
          category: g.category,
          isActive: true
        }
      });
      console.log('Created core game:', g.name);
    }
    const pkgCount = await prisma.package.count({ where: { productId: p.id } });
    if (pkgCount === 0) {
      await prisma.package.createMany({
        data: g.packages.map(pkg => ({
          productId: p.id,
          name: pkg.name,
          amount: pkg.amount,
          price: pkg.price,
          category: pkg.category,
          badge: pkg.badge,
          isActive: true
        }))
      });
      console.log('Added ' + g.packages.length + ' packages for ' + g.name);
    }
  }

  console.log('=== All Game Packages Populated in Supabase Successfully ===');
}

populateMissingPackages()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
