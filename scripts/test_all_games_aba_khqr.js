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

async function testAllGames() {
  console.log('===============================================================');
  console.log('🚀 AUDITING ABA KHQR SYSTEM ACROSS ALL GAMES & RESELLER DEPOSIT');
  console.log('===============================================================\n');

  // 1. Fetch all products
  const prodsRes = await request({
    hostname: 'localhost',
    port: 5001,
    path: '/api/products',
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  const products = prodsRes.body?.data || prodsRes.body;
  console.log(`Found ${products.length} catalog products to test.\n`);

  let totalSuccess = 0;

  for (const prod of products) {
    console.log(`---------------------------------------------------------------`);
    console.log(`🎮 TESTING GAME: ${prod.name} (slug: ${prod.slug})`);
    
    // Fetch product details
    const detailRes = await request({
      hostname: 'localhost',
      port: 5001,
      path: `/api/products/${prod.slug}`,
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    const fullProd = detailRes.body?.data || detailRes.body;
    const packages = fullProd.packages || [];
    if (packages.length === 0) {
      console.log(`⚠️ No packages for ${prod.name}, skipping`);
      continue;
    }

    // Test with the 1st or 2nd package
    const selectedPkg = packages.length > 1 ? packages[1] : packages[0];
    console.log(`   Selected Package: "${selectedPkg.name}" (${selectedPkg.amount} Diamonds/Units) @ $${selectedPkg.price}`);

    // Create Order with ABA KHQR
    const orderPayload = {
      packageId: selectedPkg.id,
      playerId: '887766554',
      playerZoneId: prod.slug.includes('mobile-legends') ? '1234' : undefined,
      paymentMethod: 'BAKONG',
      productSlug: prod.slug,
      packageName: selectedPkg.name,
      price: selectedPkg.price,
      amount: selectedPkg.amount
    };

    const orderRes = await request({
      hostname: 'localhost',
      port: 5001,
      path: '/api/orders',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    }, orderPayload);

    if (orderRes.status !== 201) {
      console.error(`❌ Order creation failed for ${prod.name}: HTTP ${orderRes.status}`, orderRes.body);
      continue;
    }

    const order = orderRes.body?.data?.order || orderRes.body?.order;
    const payment = orderRes.body?.data?.paymentDetails || orderRes.body?.paymentDetails;

    const priceMatches = Number(order.price) === Number(selectedPkg.price);
    const nameMatches = order.packageName === selectedPkg.name;
    const hasQr = Boolean(payment?.qrCode && payment.qrCode.startsWith('000201'));
    const hasMd5 = Boolean(payment?.md5);

    console.log(`   ✅ Order Created: ${order.paymentTxnId}`);
    console.log(`      - Price Matches: ${priceMatches} ($${order.price} == $${selectedPkg.price})`);
    console.log(`      - Package Name Matches: ${nameMatches} ("${order.packageName}")`);
    console.log(`      - KHQR Generated: ${hasQr} (EMVCo standard)`);
    console.log(`      - MD5 Generated: ${hasMd5} (${payment?.md5})`);

    // Status check
    const statusRes = await request({
      hostname: 'localhost',
      port: 5001,
      path: `/api/orders/status/${order.paymentTxnId}`,
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    const statusData = statusRes.body?.data || statusRes.body;
    const statusPriceMatches = Number(statusData.price) === Number(selectedPkg.price);
    console.log(`      - Status Polling Matches: ${statusPriceMatches} ($${statusData.price})`);

    if (priceMatches && hasQr) {
      totalSuccess++;
    }
  }

  // 2. Test Reseller Instant ABA KHQR Deposit (/api/v1/game2/deposit)
  console.log(`\n---------------------------------------------------------------`);
  console.log(`🏦 TESTING RESELLER INSTANT ABA KHQR DEPOSIT (/api/v1/game2/deposit)`);
  const depositRes = await request({
    hostname: 'localhost',
    port: 5001,
    path: '/api/v1/game2/deposit',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  }, {
    amount: '10.00',
    currency: 'USD'
  });

  console.log(`- Status: ${depositRes.status}`);
  const depositData = depositRes.body?.data || depositRes.body;
  const depHasQr = Boolean(depositData?.qr_string || depositData?.qrCode);
  const depHasMd5 = Boolean(depositData?.md5);
  console.log(`- Reseller Deposit KHQR Generated: ${depHasQr}`);
  console.log(`- Reseller Deposit Amount: $${depositData?.amount || '10.00'}`);
  console.log(`- Reseller Deposit MD5: ${depHasMd5} (${depositData?.md5})`);

  console.log('\n===============================================================');
  console.log(`🎉 ALL TESTS FINISHED!`);
  console.log(`   Games Passed: ${totalSuccess} / ${products.length}`);
  console.log(`   Reseller Deposit Passed: ${depHasQr}`);
  console.log('===============================================================');
}

testAllGames().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
