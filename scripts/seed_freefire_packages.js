const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const FF_PACKAGES = [
  // ពេជ្រ (Diamonds)
  { name: '20 Diamonds', amount: 20, price: 0.30, category: 'ពេជ្រ' },
  { name: '25', amount: 25, price: 0.34, category: 'ពេជ្រ' },
  { name: '40 Diamonds', amount: 40, price: 0.60, category: 'ពេជ្រ' },
  { name: '100 Diamonds', amount: 100, price: 0.99, category: 'ពេជ្រ' },
  { name: '310 Diamonds', amount: 310, price: 2.95, category: 'ពេជ្រ' },
  { name: '520 Diamonds', amount: 520, price: 4.99, category: 'ពេជ្រ' },
  { name: '1060 Diamonds', amount: 1060, price: 9.39, category: 'ពេជ្រ' },
  { name: '1100 Diamonds', amount: 1100, price: 10.99, category: 'ពេជ្រ' },
  { name: '2180 Diamonds', amount: 2180, price: 19.99, category: 'ពេជ្រ' },
  { name: '2250 Diamonds', amount: 2250, price: 21.69, category: 'ពេជ្រ' },
  { name: '5600 Diamonds', amount: 5600, price: 49.99, category: 'ពេជ្រ' },
  { name: '11500 Diamonds', amount: 11500, price: 96.14, category: 'ពេជ្រ' },

  // ប្រចាំសប្តាហ៍ (Weekly)
  { name: 'Weekly Membership', amount: 1, price: 1.69, category: 'ប្រចាំសប្តាហ៍' },
  { name: 'Weekly x2', amount: 2, price: 3.42, category: 'ប្រចាំសប្តាហ៍' },
  { name: 'Weekly x3', amount: 3, price: 5.13, category: 'ប្រចាំសប្តាហ៍' },
  { name: 'Weekly x4', amount: 4, price: 6.84, category: 'ប្រចាំសប្តាហ៍' },
  { name: 'Weekly x5', amount: 5, price: 8.55, category: 'ប្រចាំសប្តាហ៍' },

  // ប្រចាំសប្តាហ៍ (Lite)
  { name: 'Weekly Lite', amount: 1, price: 0.39, category: 'ប្រចាំសប្តាហ៍ (Lite)' },
  { name: 'Weekly Lite x2', amount: 2, price: 0.78, category: 'ប្រចាំសប្តាហ៍ (Lite)' },
  { name: 'Weekly Lite x3', amount: 3, price: 1.17, category: 'ប្រចាំសប្តាហ៍ (Lite)' },
  { name: 'Weekly Lite x4', amount: 4, price: 1.56, category: 'ប្រចាំសប្តាហ៍ (Lite)' },
  { name: 'Weekly Lite x5', amount: 5, price: 1.95, category: 'ប្រចាំសប្តាហ៍ (Lite)' },

  // ប្រចាំខែ (Monthly)
  { name: 'Monthly Membership', amount: 1, price: 7.89, category: 'ប្រចាំខែ' },
  { name: 'Monthly Membership x2', amount: 2, price: 15.78, category: 'ប្រចាំខែ' },
  { name: 'Monthly Membership x3', amount: 3, price: 23.67, category: 'ប្រចាំខែ' },
  { name: 'Monthly Membership x4', amount: 4, price: 31.56, category: 'ប្រចាំខែ' },
  { name: 'Monthly Membership x5', amount: 5, price: 39.45, category: 'ប្រចាំខែ' },
  { name: 'Monthly Membership x10', amount: 10, price: 78.90, category: 'ប្រចាំខែ' },
];

async function main() {
  const freeFire = await prisma.product.findFirst({
    where: {
      OR: [
        { slug: 'free-fire' },
        { name: { contains: 'FREE FIRE', mode: 'insensitive' } }
      ]
    },
    include: { packages: { include: { orders: true } } }
  });

  if (!freeFire) {
    console.error('Free Fire product not found!');
    return;
  }

  console.log(`Found Free Fire (ID: ${freeFire.id}, Slug: ${freeFire.slug})`);
  console.log(`Current packages count: ${freeFire.packages.length}`);

  // Retain packages that have orders attached, or update them
  const usedPackageIds = new Set();
  for (const p of freeFire.packages) {
    if (p.orders && p.orders.length > 0) {
      usedPackageIds.add(p.id);
    }
  }

  console.log(`Packages locked by orders: ${usedPackageIds.size}`);

  // Delete unused old packages
  for (const p of freeFire.packages) {
    if (!usedPackageIds.has(p.id)) {
      await prisma.package.delete({ where: { id: p.id } });
      console.log(`Deleted unused old package: ${p.name}`);
    }
  }

  // If one of the used packages exists (e.g. cmu102ioz0002126k9yayv4uk), let's repurpose it for the first matching package
  let usedPackageAssigned = false;
  for (const pkgDef of FF_PACKAGES) {
    if (!usedPackageAssigned && usedPackageIds.size > 0) {
      const firstUsedId = Array.from(usedPackageIds)[0];
      await prisma.package.update({
        where: { id: firstUsedId },
        data: {
          name: pkgDef.name,
          amount: pkgDef.amount,
          price: pkgDef.price,
          category: pkgDef.category,
          isActive: true
        }
      });
      console.log(`Updated existing referenced package [${firstUsedId}] to: ${pkgDef.name}`);
      usedPackageAssigned = true;
    } else {
      await prisma.package.create({
        data: {
          productId: freeFire.id,
          name: pkgDef.name,
          amount: pkgDef.amount,
          price: pkgDef.price,
          category: pkgDef.category,
          isActive: true
        }
      });
      console.log(`Created new package: ${pkgDef.name} ($${pkgDef.price}) [${pkgDef.category}]`);
    }
  }

  console.log('✅ All 28 Free Fire packages seeded successfully!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
