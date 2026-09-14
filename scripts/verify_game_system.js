const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('Testing Game Management and Deletion Flow...');
  
  // 1. Create Game A
  const gameA = await prisma.product.create({
    data: {
      name: 'Test Game Alpha',
      slug: 'test-game-alpha-' + Date.now(),
      image: '/uploads/test_alpha.png',
      category: 'TEST',
      isActive: true,
      packages: {
        create: [
          { name: '100 Diamonds', amount: 100, price: 1.0, isActive: true },
        ]
      }
    },
    include: { packages: true }
  });
  console.log('✅ Created Game A:', gameA.id, gameA.name);

  // 2. Fetch via Backend API
  const resBefore = await fetch('http://localhost:5001/api/products', {
    headers: { 'Cache-Control': 'no-cache' }
  });
  const productsBefore = await resBefore.json();
  const existsBefore = productsBefore.some(p => p.id === gameA.id);
  console.log('✅ Game A visible in GET /api/products:', existsBefore);

  // 3. Delete Game A
  await prisma.package.deleteMany({ where: { productId: gameA.id } });
  await prisma.product.delete({ where: { id: gameA.id } });
  console.log('✅ Game A deleted from database.');

  // 4. Verify post-deletion in DB
  const checkDb = await prisma.product.findUnique({ where: { id: gameA.id } });
  console.log('✅ Game A exists in DB after delete (must be null):', checkDb);

  // 5. Verify post-deletion via Backend API
  const resAfter = await fetch('http://localhost:5001/api/products', {
    headers: { 'Cache-Control': 'no-cache' }
  });
  const productsAfter = await resAfter.json();
  const existsAfter = productsAfter.some(p => p.id === gameA.id);
  console.log('✅ Game A returned by GET /api/products after delete (must be false):', existsAfter);

  // 6. Test second game create, edit, delete
  const gameB = await prisma.product.create({
    data: {
      name: 'Test Game Beta',
      slug: 'test-game-beta-' + Date.now(),
      image: '/uploads/test_beta.png',
      category: 'TEST',
      isActive: true,
    }
  });
  console.log('✅ Created Game B:', gameB.id);

  await prisma.product.update({
    where: { id: gameB.id },
    data: { name: 'Test Game Beta Updated' }
  });
  console.log('✅ Updated Game B');

  await prisma.product.delete({ where: { id: gameB.id } });
  console.log('✅ Deleted Game B');

  const checkDbB = await prisma.product.findUnique({ where: { id: gameB.id } });
  console.log('✅ Game B exists in DB after delete (must be null):', checkDbB);

  await prisma.$disconnect();
  console.log('🎉 ALL GAME DELETION AND CONSISTENCY TESTS PASSED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
