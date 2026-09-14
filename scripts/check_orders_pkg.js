const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.order.findMany({
    select: { id: true, packageId: true, paymentTxnId: true }
  });
  console.log('Total orders:', orders.length);
  for (const o of orders) {
    console.log('Order:', o.id, 'packageId:', o.packageId);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
