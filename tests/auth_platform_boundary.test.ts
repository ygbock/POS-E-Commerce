import assert from 'assert';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { AuthService } from '../server/services/authService';

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  const original = process.env.ABACHA_PLATFORM_ADMIN_PASSWORD;
  const originalSystemOwner = process.env.ABACHA_SYSTEM_OWNER_PASSWORD;
  process.env.ABACHA_PLATFORM_ADMIN_PASSWORD = 'PlatformAuthTest123!';
  process.env.ABACHA_SYSTEM_OWNER_PASSWORD = 'SystemOwnerAuthTest123!';

  const platformEmail = process.env.ABACHA_PLATFORM_ADMIN_EMAIL || 'platformadmin@abacha.internal';
  const systemOwnerEmail = process.env.ABACHA_SYSTEM_OWNER_EMAIL || 'systemowner@abacha.internal';

  try {
    await runMigrations(db);
    const auth = new AuthService(db);
    await auth.seedDefaultUsers();

    const platformMfaEnrollment = await assert.rejects(
      () => auth.loginPlatform({
        email: platformEmail,
        password: 'PlatformAuthTest123!',
      }),
      (error: any) => {
        assert.strictEqual(error?.code, 'MFA_ENROLLMENT_REQUIRED');
        assert.match(error?.challenge || '', /^[A-Za-z0-9_-]{40,}$/);
        assert.ok(error?.expiresAt);
        return true;
      },
    );
    assert.strictEqual(platformMfaEnrollment, undefined);

    const ownerMfaEnrollment = await assert.rejects(
      () => auth.loginPlatform({
        email: systemOwnerEmail,
        password: 'SystemOwnerAuthTest123!',
      }),
      (error: any) => {
        assert.strictEqual(error?.code, 'MFA_ENROLLMENT_REQUIRED');
        assert.match(error?.challenge || '', /^[A-Za-z0-9_-]{40,}$/);
        assert.ok(error?.expiresAt);
        return true;
      },
    );
    assert.strictEqual(ownerMfaEnrollment, undefined);

    await assert.rejects(
      () => auth.login({ email: platformEmail, password: 'PlatformAuthTest123!', organizationId: 'org_default' }),
      /PLATFORM_LOGIN_REQUIRED/,
    );

    await assert.rejects(
      () => auth.loginPlatform({
        email: 'superadmin@abacha.internal',
        password: 'SuperAdmin123!',
      }),
      /Invalid platform credentials/,
    );

    const staff = await auth.login({
      email: 'manager@abacha.internal',
      password: 'ManagerPass123!',
      organizationId: 'org_default',
    });
    assert.strictEqual(staff.user.identityType, 'staff');

    console.log('Platform authentication boundary tests PASSED');
  } finally {
    if (original === undefined) delete process.env.ABACHA_PLATFORM_ADMIN_PASSWORD;
    else process.env.ABACHA_PLATFORM_ADMIN_PASSWORD = original;
    if (originalSystemOwner === undefined) delete process.env.ABACHA_SYSTEM_OWNER_PASSWORD;
    else process.env.ABACHA_SYSTEM_OWNER_PASSWORD = originalSystemOwner;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
