const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

const ALL_GAMES = [
  { name: 'FREE FIRE | KHMER', slug: 'free-fire-khmer', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/freefire.png' },
  { name: 'MOBILE LEGENDS | KHMER', slug: 'mobile-legends-khmer', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/mlbb.png' },
  { name: 'MOBILE LEGENDS | PHILIPPINES', slug: 'mobile-legends-philippines', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/mlbb.png' },
  { name: 'MOBILE LEGENDS | INDONESIA', slug: 'mobile-legends-indonesia', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/mlbb.png' },
  { name: 'FREE FIRE | INDONESIA', slug: 'free-fire-indonesia', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/freefire.png' },
  { name: 'FREE FIRE | VIETNAM', slug: 'free-fire-vietnam', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/freefire.png' },
  { name: 'FREE FIRE | TAIWAN', slug: 'free-fire-taiwan', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/freefire.png' },
  { name: 'MAGIC CHESS GOGO', slug: 'magic-chess-gogo', category: 'MOBILE_GAME', currency: 'Gold Coins', image: '/images/games/magicchess.png' },
  { name: 'HONOR OF KINGS', slug: 'honor-of-kings', category: 'MOBILE_GAME', currency: 'Tokens', image: '/images/games/hok.png' },
  { name: 'PUBG MOBILE', slug: 'pubg-mobile', category: 'MOBILE_GAME', currency: 'UC', image: '/images/games/pubgm.png' },
  { name: 'BLOOD STRIKE', slug: 'blood-strike', category: 'MOBILE_GAME', currency: 'Gold', image: '/images/games/bloodstrike.png' },
  { name: 'VALORANT', slug: 'valorant', category: 'PC_GAME', currency: 'VP', image: '/images/games/valorant.png' },
  { name: 'FARLIGHT 84', slug: 'farlight-84', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/farlight.png' },
  { name: 'DELTA FORCE', slug: 'delta-force', category: 'PC_GAME', currency: 'Delta Coins', image: '/images/games/deltaforce.png' },
  { name: 'SUPER SUS', slug: 'super-sus', category: 'MOBILE_GAME', currency: 'Goldstar', image: '/images/games/roblox.png' },
  { name: 'Free Fire', slug: 'free-fire', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/freefire.png' },
  { name: 'Mobile Legends: Bang Bang', slug: 'mobile-legends', category: 'MOBILE_GAME', currency: 'Diamonds', image: '/images/games/mlbb.png' },
];

function generateDefaultPackages(slug) {
  if (slug.includes('free-fire')) {
    return [
      { name: '100 Diamonds', amount: 100, price: 0.99, category: 'BEST_SELLER', badge: 'ពេញនិយម' },
      { name: '310 Diamonds', amount: 310, price: 2.99, category: 'BEST_SELLER', badge: 'Hot 🔥' },
      { name: '520 Diamonds', amount: 520, price: 4.99, category: 'NORMAL', badge: 'Bonus 5%' },
      { name: '1060 Diamonds', amount: 1060, price: 9.99, category: 'NORMAL', badge: 'Bonus 10%' },
      { name: '2180 Diamonds', amount: 2180, price: 19.99, category: 'NORMAL', badge: 'កញ្ចប់ពិសេស 💎' },
      { name: '5600 Diamonds', amount: 5600, price: 49.99, category: 'NORMAL', badge: 'VIP 👑' },
    ];
  }
  return [
    { name: '86 Diamonds', amount: 86, price: 1.49, category: 'BEST_SELLER', badge: 'Hot 🔥' },
    { name: '172 Diamonds', amount: 172, price: 2.99, category: 'BEST_SELLER', badge: 'ពេញនិយម' },
    { name: '257 Diamonds', amount: 257, price: 4.49, category: 'NORMAL', badge: 'Bonus 5%' },
    { name: '706 Diamonds', amount: 706, price: 11.99, category: 'NORMAL', badge: 'Bonus 10%' },
    { name: '2195 Diamonds', amount: 2195, price: 34.99, category: 'NORMAL', badge: 'VIP Pass' },
    { name: 'Weekly Diamond Pass', amount: 1, price: 1.99, category: 'BEST_SELLER', badge: 'Special 💎' },
  ];
}

async function seed() {
  console.log('Seeding Supabase DB with 17 core games & packages...');

  // Create admin if not exists
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) {
    const password = bcrypt.hashSync('admin123', 10);
    await prisma.user.create({
      data: { email: 'mdara9695@gmail.com', password, role: 'ADMIN' }
    });
    console.log('✓ Created default admin: mdara9695@gmail.com');
  }

  for (const game of ALL_GAMES) {
    const packages = generateDefaultPackages(game.slug);
    const existing = await prisma.product.findUnique({ where: { slug: game.slug } });
    if (!existing) {
      await prisma.product.create({
        data: {
          name: game.name,
          slug: game.slug,
          image: game.image,
          category: game.category,
          isActive: true,
          packages: {
            create: packages.map(pkg => ({
              name: pkg.name,
              amount: pkg.amount,
              price: pkg.price,
              category: pkg.category,
              badge: pkg.badge,
              isActive: true
            }))
          }
        }
      });
      console.log(`✓ Created: ${game.name}`);
    } else {
      console.log(`✓ Already exists: ${game.name}`);
    }
  }

  const finalCount = await prisma.product.count();
  console.log(`=== Seeding Complete! Total Games in Database: ${finalCount} ===`);
}

seed()
  .catch(console.error)
  .then(() => process.exit(0));
