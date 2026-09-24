const assert = require('assert');
const security = require('../services/security');
const storage = require('../services/storage');

async function runTests() {
  console.log('🧪 BẮT ĐẦU KIỂM THỬ BẢO MẬT & ANTI-BYPASS HMAC...\n');

  const testIp = '192.168.1.100';
  const testUserAgent = 'Mozilla/5.0 TestSuite/1.0';

  // TEST 1: Tạo token HMAC hợp lệ
  console.log('Test 1: Tạo Token ký số HMAC cho phiên...');
  const sessionToken = await security.generateSessionToken({
    type: 'KEY',
    ip: testIp,
    userAgent: testUserAgent
  });

  assert(sessionToken.token, 'Token không được rỗng');
  assert(sessionToken.sessionId, 'SessionId không được rỗng');
  console.log('✅ Test 1 PASS: Đã tạo token HMAC:', sessionToken.token.substring(0, 30) + '...');

  // TEST 2: Phát hiện và chặn Token bị chỉnh sửa (Tampered Token)
  console.log('\nTest 2: Kiểm tra phát hiện Token giả mạo...');
  // Giả mạo bằng cách đổi một vài ký tự cuối token
  const tamperedToken = sessionToken.token.slice(0, -4) + 'XXXX';
  const tamperResult = await security.verifySessionToken(tamperedToken, testIp, testUserAgent);
  assert.strictEqual(tamperResult.success, false, 'Token giả mạo phải bị từ chối');
  assert(
    ['TAMPERED_TOKEN', 'INVALID_TOKEN'].includes(tamperResult.status),
    'Trạng thái phải là TAMPERED_TOKEN hoặc INVALID_TOKEN'
  );
  console.log('✅ Test 2 PASS: Chặn thành công token giả mạo (Status:', tamperResult.status, ')');

  // TEST 3: Phát hiện và chặn Tool Bypass hoàn thành quá nhanh (Delta Time Check)
  console.log('\nTest 3: Kiểm tra cơ chế chống Tool Bypass tự động (Quá nhanh)...');
  // Token vừa tạo 10ms trước, chắc chắn < minWaitSeconds (10s)
  const bypassResult = await security.verifySessionToken(sessionToken.token, testIp, testUserAgent);
  assert.strictEqual(bypassResult.success, false, 'Vượt link quá nhanh phải bị chặn');
  assert.strictEqual(bypassResult.status, 'BYPASS_BLOCKED', 'Phải có cờ BYPASS_BLOCKED');
  console.log('✅ Test 3 PASS: Chặn thành công hành vi Bypass tự động trong', bypassResult.elapsedSeconds, 'giây!');

  // TEST 4: Vượt link thành công khi đủ thời gian
  console.log('\nTest 4: Mô phỏng người thật vượt link hợp lệ (Đủ thời gian)...');
  const validSession = await security.generateSessionToken({
    type: 'KEY',
    ip: testIp,
    userAgent: testUserAgent
  });
  // Giả lập lùi thời gian tạo session về trước 25 giây
  await storage.updateSession(validSession.sessionId, {
    createdAt: Date.now() - 25 * 1000
  });

  // Giải mã token, chỉnh lại trường c (createdAt) và tính lại HMAC để giả lập đúng
  const decoded = JSON.parse(Buffer.from(validSession.token, 'base64url').toString('utf-8'));
  const oldCreatedAt = decoded.c;
  const newCreatedAt = oldCreatedAt - 25 * 1000;
  const settings = await storage.getSettings();
  const secret = settings.hmacSecret;
  const newPayload = `${decoded.s}:${newCreatedAt}:${decoded.n}:${testIp}`;
  const newSig = security.createHmacSignature(newPayload, secret);
  const updatedToken = Buffer.from(
    JSON.stringify({ s: decoded.s, c: newCreatedAt, n: decoded.n, sig: newSig })
  ).toString('base64url');

  const validResult = await security.verifySessionToken(updatedToken, testIp, testUserAgent);
  assert.strictEqual(validResult.success, true, 'Xác thực phải thành công khi đủ điều kiện');
  assert(['SUCCESS', 'STEP1_COMPLETED'].includes(validResult.status), 'Trạng thái phải là SUCCESS hoặc STEP1_COMPLETED');
  console.log('✅ Test 4 PASS: Xác thực thành công cho người thật! (Status:', validResult.status, ', Thời gian:', validResult.elapsedSeconds, 's)');

  // TEST 5: Chống Replay Attack (Sử dụng lại token cũ)
  console.log('\nTest 5: Kiểm tra chống tấn công Replay (Dùng lại token đã nhận)...');
  const replayResult = await security.verifySessionToken(updatedToken, testIp, testUserAgent);
  assert.strictEqual(replayResult.success, false, 'Không được phép dùng lại token cũ');
  assert.strictEqual(replayResult.status, 'ALREADY_USED');
  console.log('✅ Test 5 PASS: Chặn thành công Replay Attack!');

  console.log('\n=========================================');
  console.log('🎉 TẤT CẢ 5 BÀI TEST BẢO MẬT ĐỀU ĐẠT CHUẨN 100%!');
  console.log('=========================================\n');
}

runTests().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
