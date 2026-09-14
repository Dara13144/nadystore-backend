const jwt = require('jsonwebtoken');

const BASE_URL = 'http://localhost:5001';
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-production-12345';

async function runSecurityTests() {
  console.log('Running Production Security Hardening Verification Tests...\n');
  let passed = 0;
  let total = 0;

  function assert(condition, name) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${name}`);
    }
  }

  // 1. Verify Security Headers on Public Endpoint
  try {
    const res = await fetch(`${BASE_URL}/api/products`);
    const headers = res.headers;
    assert(res.status === 200, 'Public GET /api/products returns 200');
    assert(headers.get('x-content-type-options') === 'nosniff', 'Header X-Content-Type-Options: nosniff present');
    assert(headers.get('x-frame-options') === 'SAMEORIGIN', 'Header X-Frame-Options: SAMEORIGIN present');
    assert(headers.get('x-xss-protection') === '0' || headers.get('x-xss-protection') === '1; mode=block', 'XSS Protection header configured');
  } catch (e) {
    assert(false, 'Security headers test failed: ' + e.message);
  }

  // 2. Unauthenticated Admin Request Rejection
  try {
    const res = await fetch(`${BASE_URL}/api/admin/stats`);
    assert(res.status === 401, 'Unauthenticated GET /api/admin/stats rejected with 401');
  } catch (e) {
    assert(false, 'Admin unauthenticated check failed: ' + e.message);
  }

  // 3. Unauthorized (Non-Admin User) Admin Request Rejection
  try {
    const userToken = jwt.sign({ id: 'test_user_1', email: 'regular_user@example.com', role: 'USER' }, JWT_SECRET);
    const res = await fetch(`${BASE_URL}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    assert(res.status === 403, 'Regular user token rejected from /api/admin/stats with 403 Forbidden');
  } catch (e) {
    assert(false, 'Admin role RBAC check failed: ' + e.message);
  }

  // 4. Generic Authentication Error on Invalid Password
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonexistent_account_xyz@example.com', password: 'wrongpassword' }),
    });
    const body = await res.json();
    assert(res.status === 401, 'Invalid login rejected with 401');
    assert(body.error === 'Invalid email or password', 'Generic error message returned (no user enumeration)');
  } catch (e) {
    assert(false, 'Generic error test failed: ' + e.message);
  }

  // 5. Order Creation for Nonexistent Game Returns 404 (No Catalog Auto-Provisioning)
  try {
    const res = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        packageId: 'nonexistent-pkg-' + Date.now(),
        gameSlug: 'nonexistent-game-' + Date.now(),
        playerId: '12345678',
        paymentMethod: 'BAKONG'
      }),
    });
    assert(res.status === 404, 'Nonexistent game/package rejected with 404 (no auto-provisioning)');
  } catch (e) {
    assert(false, 'Order nonexistent check failed: ' + e.message);
  }

  // 6. Invalid Webhook Signature Rejection
  try {
    const res = await fetch(`${BASE_URL}/api/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cutluy-signature': 't=123456,v1=bad_invalid_signature_hash_value',
      },
      body: JSON.stringify({ event: 'payment.completed' }),
    });
    assert(res.status === 401 || res.status === 400, 'Invalid webhook signature rejected with 401/400');
  } catch (e) {
    assert(false, 'Webhook signature check failed: ' + e.message);
  }

  console.log(`\nResults: ${passed} of ${total} tests PASSED.`);
  if (passed === total) {
    console.log('🎉 ALL DEFENSIVE SECURITY HARDENING TESTS PASSED!');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runSecurityTests();
