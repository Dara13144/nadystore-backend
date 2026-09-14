const jwt = require('jsonwebtoken');

const BASE_URL = 'http://localhost:5001';
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-production-12345';

async function testExpressSecurity() {
  console.log('Testing Express Concrete Security Implementation...\n');
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

  // 1. Request ID and Framework Obfuscation (No X-Powered-By)
  try {
    const res = await fetch(`${BASE_URL}/api/products`);
    assert(res.status === 200, 'GET /api/products returns 200 OK');
    assert(res.headers.has('x-request-id'), 'X-Request-Id header is present on response');
    assert(!res.headers.has('x-powered-by'), 'X-Powered-By header is disabled and absent');
  } catch (e) {
    assert(false, 'Request ID / headers test failed: ' + e.message);
  }

  // 2. Safe 404 Handler (No route enumeration)
  try {
    const res = await fetch(`${BASE_URL}/api/nonexistent-route-xyz-${Date.now()}`);
    const data = await res.json();
    assert(res.status === 404, 'Unknown endpoint returns 404');
    assert(data.message === 'Resource not found', 'Safe 404 message returned');
    assert(!data.availableRoutes, 'No available routes or internal paths enumerated');
  } catch (e) {
    assert(false, '404 handler test failed: ' + e.message);
  }

  // 3. HTTP Method Protection (Method Not Allowed)
  try {
    const http = require('http');
    const status = await new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port: 5001,
        path: '/api/products',
        method: 'TRACE',
      }, (res) => resolve(res.statusCode));
      req.on('error', () => resolve(0));
      req.end();
    });
    assert(status === 405, 'Disallowed HTTP method (TRACE) rejected with 405 Method Not Allowed');
  } catch (e) {
    assert(false, 'Method protection test failed: ' + e.message);
  }

  // 4. Request Body Size Limit (1MB JSON Limit)
  try {
    const largePayload = 'A'.repeat(1.5 * 1024 * 1024); // 1.5MB
    const res = await fetch(`${BASE_URL}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ large: largePayload }),
    });
    assert(res.status === 413, 'Oversized payload (>1MB) rejected with 413 Payload Too Large');
  } catch (e) {
    assert(false, 'Body size limit test failed: ' + e.message);
  }

  // 5. Unauthenticated Admin Request Rejection
  try {
    const res = await fetch(`${BASE_URL}/api/admin/stats`);
    assert(res.status === 401, 'Unauthenticated GET /api/admin/stats rejected with 401');
  } catch (e) {
    assert(false, 'Unauthenticated admin test failed: ' + e.message);
  }

  // 6. Regular User Blocked from Admin (RBAC 403)
  try {
    const userToken = jwt.sign({ id: 'regular_user_test', email: 'user@example.com', role: 'USER' }, JWT_SECRET);
    const res = await fetch(`${BASE_URL}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    assert(res.status === 403, 'Regular user token rejected from /api/admin/stats with 403 Forbidden');
  } catch (e) {
    assert(false, 'RBAC authorization test failed: ' + e.message);
  }

  console.log(`\nResults: ${passed} of ${total} Express Security tests PASSED.`);
  if (passed === total) {
    console.log('🎉 ALL EXPRESS CONCRETE SECURITY IMPLEMENTATION TESTS PASSED!');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

testExpressSecurity();
