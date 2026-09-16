const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const MLBB_PACKAGES = [
  // Row 1
  { name: '55 Diamonds', amount: 55, price: 0.78, category: 'Diamonds' },
  { name: '86 Diamonds', amount: 86, price: 1.21, category: 'Diamonds' },
  { name: '165 Diamonds', amount: 165, price: 2.30, category: 'Diamonds' },

  // Row 2
  { name: '172 Diamonds', amount: 172, price: 2.41, category: 'Diamonds' },
  { name: '257 Diamonds', amount: 257, price: 3.49, category: 'Diamonds' },
  { name: '275 Diamonds', amount: 275, price: 3.69, category: 'Diamonds' },

  // Row 3
  { name: '343 Diamonds', amount: 343, price: 4.71, category: 'Diamonds' },
  { name: '429 Diamonds', amount: 429, price: 5.90, category: 'Diamonds' },
  { name: '514 Diamonds', amount: 514, price: 6.99, category: 'Diamonds' },

  // Row 4
  { name: '516 Diamonds', amount: 516, price: 7.21, category: 'Diamonds' },
  { name: '565 Diamonds', amount: 565, price: 7.58, category: 'Diamonds' },
  { name: '600 Diamonds', amount: 600, price: 8.20, category: 'Diamonds' },

  // Row 5
  { name: '706 Diamonds', amount: 706, price: 9.45, category: 'Diamonds' },
  { name: '792 Diamonds', amount: 792, price: 10.67, category: 'Diamonds' },
  { name: '878 Diamonds', amount: 878, price: 11.86, category: 'Diamonds' },

  // Row 6
  { name: '963 Diamonds', amount: 963, price: 12.95, category: 'Diamonds' },
  { name: '1049 Diamonds', amount: 1049, price: 14.16, category: 'Diamonds' },
  { name: '1135 Diamonds', amount: 1135, price: 15.35, category: 'Diamonds' },

  // Row 7
  { name: '1220 Diamonds', amount: 1220, price: 16.44, category: 'Diamonds' },
  { name: '1412 Diamonds', amount: 1412, price: 18.90, category: 'Diamonds' },
  { name: '1584 Diamonds', amount: 1584, price: 21.30, category: 'Diamonds' },

  // Row 8
  { name: '1755 Diamonds', amount: 1755, price: 23.61, category: 'Diamonds' },
  { name: '2195 Diamonds', amount: 2195, price: 28.61, category: 'Diamonds' },
  { name: '2901 Diamonds', amount: 2901, price: 38.20, category: 'Diamonds' },

  // Row 9
  { name: '3688 Diamonds', amount: 3688, price: 47.74, category: 'Diamonds' },
  { name: '4390 Diamonds', amount: 4390, price: 57.23, category: 'Diamonds' },
  { name: '5532 Diamonds', amount: 5532, price: 72.07, category: 'Diamonds' },

  // Row 10
  { name: '9288 Diamonds', amount: 9288, price: 119.70, category: 'Diamonds' },
  { name: 'W.Pass', amount: 1, price: 1.49, category: 'Weekly Pass' },
  { name: '2x W.Pass', amount: 2, price: 2.98, category: 'Weekly Pass' },

  // Row 11
  { name: '3x W.Pass', amount: 3, price: 4.48, category: 'Weekly Pass' },
  { name: '4x W.Pass', amount: 4, price: 5.97, category: 'Weekly Pass' },
  { name: '5x W.Pass', amount: 5, price: 7.46, category: 'Weekly Pass' },

  // Row 12
  { name: '10x W.Pass', amount: 10, price: 14.92, category: 'Weekly Pass' },
  { name: 'W.Elite', amount: 1, price: 0.78, category: 'Weekly Pass' },
  { name: 'M.Epic', amount: 1, price: 3.87, category: 'Monthly Pass' },

  // Row 13
  { name: 'Twilight', amount: 1, price: 7.93, category: 'Special Pass' },
];

async function main() {
  const mlbb = await prisma.product.findFirst({
    where: {
      OR: [
        { slug: 'mobile-legends' },
        { slug: 'mlbb' },
        { name: { contains: 'Mobile Legends', mode: 'insensitive' } }
      ]
    },
    include: { packages: { include: { orders: true } } }
  });

  if (!mlbb) {
    console.error('Mobile Legends product not found!');
    return;
  }

  console.log(`Found Mobile Legends (ID: ${mlbb.id}, Slug: ${mlbb.slug})`);
  console.log(`Current packages count: ${mlbb.packages.length}`);

  // Deactivate or delete old packages
  for (const pkg of mlbb.packages) {
    const hasOrders = pkg.orders && pkg.orders.length > 0;
    if (hasOrders) {
      await prisma.package.update({
        where: { id: pkg.id },
        data: { active: false }
      });
      console.log(`Deactivated package with existing orders: ${pkg.name}`);
    } else {
      await prisma.package.delete({
        where: { id: pkg.id }
      });
      console.log(`Deleted unused old package: ${pkg.name}`);
    }
  }

  // Insert all 37 new packages
  console.log('Inserting 37 new MLBB packages...');
  for (const p of MLBB_PACKAGES) {
    const created = await prisma.package.create({
      data: {
        name: p.name,
        amount: p.amount,
        price: p.price,
        category: p.category,
        isActive: true,
        productId: mlbb.id
      }
    });
    console.log(`+ Created: ${created.name} ($${created.price}) [${created.category}]`);
  }

  console.log('Finished seeding all 37 Mobile Legends packages successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding MLBB packages:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
