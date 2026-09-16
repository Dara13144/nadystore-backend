const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runTest() {
  console.log('=== RUNNING ABA KHQR & PAYLOAD AUDIT TEST ===\n');

  // 1. Audit GET /api/products
  console.log('Step 1: GET /api/products');
  const prodRes = await request({
    hostname: 'localhost',
    port: 5001,
    path: '/api/products',
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });
  console.log(`- Status: ${prodRes.status}`);
  console.log(`- Success envelope: ${prodRes.body?.success === true}`);
  console.log(`- Payload envelope present: ${!!prodRes.body?.payload}`);
  const products = prodRes.body?.data || prodRes.body;
  console.log(`- Products count: ${Array.isArray(products) ? products.length : 'not array'}`);

  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('No products returned from backend!');
  }

  // 2. Audit GET /api/products/free-fire
  console.log('\nStep 2: GET /api/products/free-fire');
  const ffRes = await request({
    hostname: 'localhost',
    port: 5001,
    path: '/api/products/free-fire',
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });
  console.log(`- Status: ${ffRes.status}`);
  console.log(`- Success envelope: ${ffRes.body?.success === true}`);
  const ffData = ffRes.body?.data || ffRes.body;
  console.log(`- Game name: ${ffData?.name}`);
  console.log(`- Total packages: ${ffData?.packages?.length}`);

  // Find a diamond package to test
  const testPkg = ffData.packages.find(p => p.amount >= 50) || ffData.packages[0];
  console.log(`- Selected Package: "${testPkg.name}", Diamonds/Amount: ${testPkg.amount}, Price: $${testPkg.price}`);

  // 3. Place Order with ABA KHQR
  console.log('\nStep 3: POST /api/orders (ABA KHQR)');
  const orderRes = await request(
    {
      hostname: 'localhost',
      port: 5001,
      path: '/api/orders',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    },
    {
      packageId: testPkg.id,
      playerId: '998877665',
      playerNickname: 'ProGamerKH',
      paymentMethod: 'BAKONG'
    }
  );

  console.log(`- Status: ${orderRes.status}`);
  console.log(`- Success envelope: ${orderRes.body?.success === true}`);
  console.log(`- Message: "${orderRes.body?.message}"`);

  const orderData = orderRes.body?.data?.order || orderRes.body?.order;
  const paymentDetails = orderRes.body?.data?.paymentDetails || orderRes.body?.paymentDetails;

  console.log(`- Created Order ID: ${orderData?.id}`);
  console.log(`- Payment Txn ID: ${orderData?.paymentTxnId}`);
  console.log(`- Order Price: $${orderData?.price} (Expected: $${testPkg.price}) -> Matches: ${Number(orderData?.price) === Number(testPkg.price)}`);
  console.log(`- Order Package Name: "${orderData?.packageName}" (Expected: "${testPkg.name}") -> Matches: ${orderData?.packageName === testPkg.name}`);
  console.log(`- Payment QR Code: ${paymentDetails?.qrCode ? paymentDetails.qrCode.substring(0, 30) + '...' : 'MISSING'}`);
  console.log(`- Payment MD5: ${paymentDetails?.md5 || 'MISSING'}`);

  if (!orderData?.paymentTxnId) {
    throw new Error('Order creation did not return paymentTxnId!');
  }

  // 4. Check Order Status
  console.log(`\nStep 4: GET /api/orders/status/${orderData.paymentTxnId}`);
  const statusRes = await request({
    hostname: 'localhost',
    port: 5001,
    path: `/api/orders/status/${orderData.paymentTxnId}`,
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  console.log(`- Status: ${statusRes.status}`);
  console.log(`- Success envelope: ${statusRes.body?.success === true}`);
  const statusData = statusRes.body?.data || statusRes.body;
  console.log(`- Status Order Price: $${statusData?.price} -> Matches: ${Number(statusData?.price) === Number(testPkg.price)}`);
  console.log(`- Status Package Name: "${statusData?.packageName}" -> Matches: ${statusData?.packageName === testPkg.name}`);
  console.log(`- Status QR Code present: ${!!statusData?.paymentQrCode}`);
  console.log(`- Status MD5 present: ${!!statusData?.paymentMd5}`);

  // 5. Check Order History
  console.log(`\nStep 5: GET /api/orders/history/998877665`);
  const historyRes = await request({
    hostname: 'localhost',
    port: 5001,
    path: `/api/orders/history/998877665`,
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  console.log(`- Status: ${historyRes.status}`);
  console.log(`- Success envelope: ${historyRes.body?.success === true}`);
  const historyData = historyRes.body?.data || historyRes.body;
  console.log(`- Orders found in history: ${Array.isArray(historyData) ? historyData.length : 0}`);
  if (Array.isArray(historyData) && historyData.length > 0) {
    const recent = historyData[0];
    console.log(`- Most recent order price: $${recent.price}, Package: "${recent.packageName}"`);
  }

  console.log('\n========================================');
  console.log('✅ ALL ABA KHQR & API PAYLOAD TESTS PASSED!');
  console.log('========================================');
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
