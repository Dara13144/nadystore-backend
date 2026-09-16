const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting User and Top-Up System Data Seeder...');

  // 1. First, update existing 3 'PAID' orders to 'COMPLETED'
  const updatedExisting = await prisma.order.updateMany({
    where: {
      OR: [
        { status: 'PAID' },
        { paymentStatus: 'PAID' },
      ],
    },
    data: {
      status: 'COMPLETED',
      paymentStatus: 'SUCCESS',
      deliveryStatus: 'DELIVERED',
    },
  });
  console.log(`✅ Updated ${updatedExisting.count} existing PAID orders to COMPLETED.`);

  // 2. Ensure realistic users exist
  const sampleUsers = [
    { email: 'dara_gamer@gmail.com', role: 'USER' },
    { email: 'sokha_topup@gmail.com', role: 'USER' },
    { email: 'visal_khmer@gmail.com', role: 'USER' },
    { email: 'pro_sniper@gmail.com', role: 'USER' },
  ];

  const userRecords = [];
  const hashedPassword = await bcrypt.hash('Topup12345!', 10);

  for (const u of sampleUsers) {
    let user = await prisma.user.findUnique({ where: { email: u.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: u.email,
          password: hashedPassword,
          role: u.role,
        },
      });
      console.log(`👤 Created user: ${user.email} (${user.id})`);
    } else {
      console.log(`👤 Existing user found: ${user.email} (${user.id})`);
    }
    userRecords.push(user);
  }

  // Also fetch admin user
  const adminUser = await prisma.user.findFirst({
    where: { email: { in: ['admin@nadytopup.com', 'mdara9695@gmail.com'] } },
  });
  if (adminUser) userRecords.push(adminUser);

  // Link existing null userId orders to users
  const ordersWithoutUser = await prisma.order.findMany({
    where: { userId: null },
    take: 10,
  });
  for (let i = 0; i < ordersWithoutUser.length; i++) {
    const assignedUser = userRecords[i % userRecords.length];
    await prisma.order.update({
      where: { id: ordersWithoutUser[i].id },
      data: { userId: assignedUser.id },
    });
  }
  console.log(`🔗 Linked ${ordersWithoutUser.length} orphan orders to user accounts.`);

  // 3. Find available packages for Free Fire and Mobile Legends
  const mlbbProduct = await prisma.product.findFirst({
    where: {
      OR: [
        { slug: { contains: 'mobile-legend' } },
        { name: { contains: 'Mobile Legends' } },
      ],
    },
    include: { packages: true },
  });

  const ffProduct = await prisma.product.findFirst({
    where: {
      OR: [
        { slug: { contains: 'free-fire' } },
        { name: { contains: 'Free Fire' } },
      ],
    },
    include: { packages: true },
  });

  const availablePackages = [
    ...(mlbbProduct?.packages || []),
    ...(ffProduct?.packages || []),
  ];

  if (availablePackages.length === 0) {
    console.warn('⚠️ No packages found to create additional orders.');
    return;
  }

  console.log(`📦 Found ${availablePackages.length} available packages for top-up seeding.`);

  // 4. Seed realistic Completed Orders (with real revenue)
  const completedOrderSeeds = [
    {
      playerId: '54829103',
      playerZoneId: '2084',
      nickname: 'Vannak_Khmer',
      paymentMethod: 'ABA',
      packageIndex: 0,
      userIndex: 0,
      hoursAgo: 2,
    },
    {
      playerId: '88392019',
      playerZoneId: '3042',
      nickname: 'SokhaPro_77',
      paymentMethod: 'BAKONG',
      packageIndex: 2,
      userIndex: 1,
      hoursAgo: 4,
    },
    {
      playerId: '294810234',
      playerZoneId: null,
      nickname: 'GhostSniper_FF',
      paymentMethod: 'ABA',
      packageIndex: Math.min(4, availablePackages.length - 1),
      userIndex: 2,
      hoursAgo: 6,
    },
    {
      playerId: '91827461',
      playerZoneId: '2119',
      nickname: 'Dara_KingML',
      paymentMethod: 'BAKONG',
      packageIndex: Math.min(1, availablePackages.length - 1),
      userIndex: 3,
      hoursAgo: 8,
    },
    {
      playerId: '77281920',
      playerZoneId: '4012',
      nickname: 'BongReach_99',
      paymentMethod: 'ABA',
      packageIndex: Math.min(3, availablePackages.length - 1),
      userIndex: 0,
      hoursAgo: 12,
    },
    {
      playerId: '63829104',
      playerZoneId: null,
      nickname: 'MegaKiller_FF',
      paymentMethod: 'BAKONG',
      packageIndex: Math.min(5, availablePackages.length - 1),
      userIndex: 1,
      hoursAgo: 16,
    },
    {
      playerId: '44819201',
      playerZoneId: '2055',
      nickname: 'Rothana_Pro',
      paymentMethod: 'ABA',
      packageIndex: Math.min(2, availablePackages.length - 1),
      userIndex: 2,
      hoursAgo: 24,
    },
    {
      playerId: '10928374',
      playerZoneId: '3310',
      nickname: 'ShadowLegend',
      paymentMethod: 'BAKONG',
      packageIndex: Math.min(6, availablePackages.length - 1),
      userIndex: 3,
      hoursAgo: 28,
    },
  ];

  for (const s of completedOrderSeeds) {
    const pkg = availablePackages[s.packageIndex % availablePackages.length];
    const user = userRecords[s.userIndex % userRecords.length];
    const txnRand = Math.floor(100000 + Math.random() * 900000);
    const timeRand = Math.floor(1000 + Math.random() * 9000);
    const txnId = `TOPUP-${txnRand}-${timeRand}`;
    const orderDate = new Date(Date.now() - s.hoursAgo * 60 * 60 * 1000);

    await prisma.order.create({
      data: {
        userId: user.id,
        packageId: pkg.id,
        playerId: s.playerId,
        playerZoneId: s.playerZoneId,
        playerNickname: s.nickname,
        price: pkg.price,
        status: 'COMPLETED',
        paymentMethod: s.paymentMethod,
        paymentStatus: 'SUCCESS',
        deliveryStatus: 'DELIVERED',
        paymentTxnId: txnId,
        paymentQrCode: `00020101021229370016bakong@aba...${txnId}`,
        gatewayRef: `VNGZZ-${txnRand}`,
        paidAt: orderDate,
        createdAt: orderDate,
        updatedAt: orderDate,
      },
    });
  }
  console.log(`✅ Seeded ${completedOrderSeeds.length} realistic COMPLETED orders with live revenue.`);

  // 5. Seed realistic Pending Orders (Awaiting payment)
  const pendingOrderSeeds = [
    {
      playerId: '78291044',
      playerZoneId: '2099',
      nickname: 'Phearun_Gamer',
      paymentMethod: 'BAKONG',
      packageIndex: 1,
      userIndex: 0,
      minutesAgo: 10,
    },
    {
      playerId: '338291024',
      playerZoneId: null,
      nickname: 'FireBoy_Khmer',
      paymentMethod: 'ABA',
      packageIndex: 3,
      userIndex: 1,
      minutesAgo: 25,
    },
    {
      playerId: '99201948',
      playerZoneId: '4410',
      nickname: 'Sreynoch_Pro',
      paymentMethod: 'BAKONG',
      packageIndex: 0,
      userIndex: 2,
      minutesAgo: 45,
    },
  ];

  for (const p of pendingOrderSeeds) {
    const pkg = availablePackages[p.packageIndex % availablePackages.length];
    const user = userRecords[p.userIndex % userRecords.length];
    const txnRand = Math.floor(100000 + Math.random() * 900000);
    const timeRand = Math.floor(1000 + Math.random() * 9000);
    const txnId = `TOPUP-${txnRand}-${timeRand}`;
    const orderDate = new Date(Date.now() - p.minutesAgo * 60 * 1000);

    await prisma.order.create({
      data: {
        userId: user.id,
        packageId: pkg.id,
        playerId: p.playerId,
        playerZoneId: p.playerZoneId,
        playerNickname: p.nickname,
        price: pkg.price,
        status: 'PENDING',
        paymentMethod: p.paymentMethod,
        paymentStatus: 'PENDING',
        deliveryStatus: 'WAITING',
        paymentTxnId: txnId,
        paymentQrCode: `00020101021229370016bakong@aba...${txnId}`,
        createdAt: orderDate,
        updatedAt: orderDate,
      },
    });
  }
  console.log(`✅ Seeded ${pendingOrderSeeds.length} realistic PENDING orders.`);

  // 6. Verify and output the new metrics
  const totalOrders = await prisma.order.count();
  const completedOrders = await prisma.order.count({
    where: {
      OR: [
        { status: { in: ['COMPLETED', 'SUCCESS', 'PAID'] } },
        { paymentStatus: 'SUCCESS' },
      ],
    },
  });
  const pendingOrders = await prisma.order.count({
    where: {
      status: { in: ['PENDING', 'PROCESSING', 'WAITING'] },
      paymentStatus: { notIn: ['SUCCESS', 'PAID', 'EXPIRED', 'FAILED'] },
    },
  });
  const revenueResult = await prisma.order.aggregate({
    where: {
      OR: [
        { status: { in: ['COMPLETED', 'SUCCESS', 'PAID'] } },
        { paymentStatus: 'SUCCESS' },
      ],
    },
    _sum: { price: true },
  });

  console.log('\n📊 NEW DASHBOARD METRICS:');
  console.log(`💰 Total Revenue:    $${(revenueResult._sum.price || 0).toFixed(2)}`);
  console.log(`✅ Completed Orders: ${completedOrders}`);
  console.log(`⏳ Pending Orders:   ${pendingOrders}`);
  console.log(`📦 Total Orders:     ${totalOrders}`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding topup and user data:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
