import assert from 'node:assert/strict';
import { ResendEmailDelivery } from '../server/services/resendEmailDelivery';

async function main() {
  const expiresAt = new Date('2026-10-20T12:00:00.000Z');
  const verification = {
    userId: 'user-1',
    email: 'customer@example.test',
    verificationUrl: 'https://app.example.test/verify-email?token=verification-token',
    expiresAt,
  };
  const reset = {
    userId: 'user-1',
    email: 'customer@example.test',
    resetUrl: 'https://app.example.test/reset-password?token=reset-token',
    expiresAt,
  };

  await assert.rejects(
    new ResendEmailDelivery({ apiKey: '', from: 'AbaCha <no-reply@example.test>' }).sendVerificationEmail(verification),
    /RESEND_API_KEY_NOT_CONFIGURED/,
    'Delivery should fail clearly when the key has not been configured',
  );

  await assert.rejects(
    new ResendEmailDelivery({ apiKey: 're_test_key', from: '' }).sendPasswordResetEmail(reset),
    /RESEND_FROM_EMAIL_NOT_CONFIGURED/,
    'Delivery should require a configured sender',
  );

  const requests: Array<{ url: string; init: RequestInit }> = [];
  const delivery = new ResendEmailDelivery({
    apiKey: 're_test_key',
    from: 'AbaCha <no-reply@example.test>',
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init: init || {} });
      return new Response(JSON.stringify({ id: 'email-test-id' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  await delivery.sendVerificationEmail(verification);
  await delivery.sendPasswordResetEmail(reset);
  assert.equal(requests.length, 2, 'Both authentication email types should use Resend');
  for (const request of requests) {
    assert.equal(request.url, 'https://api.resend.com/emails');
    assert.equal(request.init.method, 'POST');
    const headers = request.init.headers as Record<string, string>;
    assert.equal(headers.Authorization, 'Bearer re_test_key');
    const body = JSON.parse(String(request.init.body));
    assert.deepEqual(body.to, ['customer@example.test']);
    assert.equal(body.from, 'AbaCha <no-reply@example.test>');
    assert.ok(body.text.length > 0);
    assert.ok(body.html.includes('<html>'));
  }
  assert.match(JSON.parse(String(requests[0].init.body)).subject, /Verify/);
  assert.match(JSON.parse(String(requests[1].init.body)).subject, /Reset/);

  const failedDelivery = new ResendEmailDelivery({
    apiKey: 're_test_secret',
    from: 'AbaCha <no-reply@example.test>',
    fetchImpl: async () => new Response('private provider response with token re_test_secret', { status: 401 }),
  });
  await assert.rejects(
    failedDelivery.sendVerificationEmail(verification),
    (error: Error) => {
      assert.match(error.message, /RESEND_DELIVERY_FAILED/);
      assert.doesNotMatch(error.message, /re_test_secret|private provider response/);
      return true;
    },
    'Provider failures must be sanitized and must not leak response bodies or credentials',
  );

  const unreachable = new ResendEmailDelivery({
    apiKey: 're_test_key',
    from: 'AbaCha <no-reply@example.test>',
    fetchImpl: async () => { throw new Error('network details'); },
  });
  await assert.rejects(
    unreachable.sendPasswordResetEmail(reset),
    (error: Error) => {
      assert.match(error.message, /RESEND_DELIVERY_FAILED/);
      assert.doesNotMatch(error.message, /network details/);
      return true;
    },
  );

  console.log('Resend email delivery tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
