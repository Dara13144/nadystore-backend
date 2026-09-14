const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { lookupPlayerNickname } = require('../dist/utils/gameProviderMock');

async function testZoneIdFlow() {
  console.log('=== STARTING ZONE ID / SERVER ID SYSTEM VERIFICATION ===\n');

  // 1. Test Nickname Lookup for Mobile Legends with Zone ID
  console.log('1. Testing Mobile Legends Nickname Lookup...');
  const validLookup = await lookupPlayerNickname('mobile-legends', '998877', '1234');
  console.log('Lookup result with Zone ID:', validLookup);
  if (!validLookup.success || !validLookup.nickname) {
    throw new Error('Mobile Legends lookup with Zone ID failed!');
  }
  console.log('✓ Valid MLBB lookup passed.\n');

  // 2. Test Mobile Legends Lookup without Zone ID (should fail or require Zone ID)
  console.log('2. Testing Mobile Legends without Zone ID...');
  const invalidLookup = await lookupPlayerNickname('mobile-legends', '998877', '');
  console.log('Lookup result without Zone ID:', invalidLookup);
  if (invalidLookup.success) {
    throw new Error('MLBB lookup should require Zone ID!');
  }
  console.log('✓ Missing Zone ID rejection passed.\n');

  // 3. Test Database Product hasZoneId flag
  console.log('3. Checking Mobile Legends Product in DB...');
  const mlbbProd = await prisma.product.findFirst({
    where: {
      OR: [
        { slug: { contains: 'mobile-legend' } },
        { name: { contains: 'Mobile legend', mode: 'insensitive' } }
      ]
    },
    include: { packages: true }
  });

  if (!mlbbProd) {
    throw new Error('Mobile Legends product not found in database!');
  }
  console.log(`Product found: "${mlbbProd.name}" (slug: ${mlbbProd.slug}), hasZoneId=${mlbbProd.hasZoneId}, zoneIdLabel="${mlbbProd.zoneIdLabel}"`);
  if (!mlbbProd.hasZoneId) {
    throw new Error('hasZoneId should be true for Mobile Legends in DB!');
  }
  console.log('✓ Product hasZoneId check passed.\n');

  // 4. Test Order Creation with Zone ID
  console.log('4. Testing Order Creation with Player ID and Zone ID in DB...');
  const pkg = mlbbProd.packages[0];
  if (!pkg) {
    throw new Error('No packages found for MLBB');
  }

  const testTxnId = `TEST-ZONE-${Date.now().toString().slice(-6)}`;
  const testOrder = await prisma.order.create({
    data: {
      packageId: pkg.id,
      playerId: '12345678',
      playerZoneId: '4321',
      playerNickname: 'Pro_MLBB_Tester',
      price: pkg.price,
      status: 'PENDING',
      paymentMethod: 'BAKONG',
      paymentStatus: 'PENDING',
      paymentTxnId: testTxnId,
    },
    include: {
      package: { include: { product: true } }
    }
  });

  console.log(`Created test order: id=${testOrder.id}, txnId=${testOrder.paymentTxnId}, playerId=${testOrder.playerId}, playerZoneId=${testOrder.playerZoneId}`);
  if (testOrder.playerZoneId !== '4321') {
    throw new Error('playerZoneId was not saved properly in Order!');
  }
  console.log('✓ Order record with playerZoneId passed.\n');

  // 5. Test Search by Zone ID
  console.log('5. Testing Order Search by Zone ID in DB...');
  const searchedOrders = await prisma.order.findMany({
    where: {
      OR: [
        { playerId: { contains: '4321' } },
        { playerZoneId: { contains: '4321' } },
      ]
    }
  });

  console.log(`Found ${searchedOrders.length} order(s) searching for Zone "4321"`);
  if (searchedOrders.length === 0) {
    throw new Error('Failed to search order by playerZoneId!');
  }
  console.log('✓ Search by playerZoneId passed.\n');

  // Clean up test order
  await prisma.order.delete({ where: { id: testOrder.id } });
  console.log('✓ Cleaned up test order.\n');

  console.log('=== ALL ZONE ID / SERVER ID CHECKS PASSED SUCCESSFULLY! ===');
}

testZoneIdFlow()
  .catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
