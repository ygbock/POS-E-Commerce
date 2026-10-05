import assert from 'assert';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { AuthService } from '../server/services/authService';

async function main() {
  const db: DatabaseClient = createIsolatedTestClient();
  const original = process.env.ABACHA_PLATFORM_ADMIN_PASSWORD;
  process.env.ABACHA_PLATFORM_ADMIN_PASSWORD = 'PlatformAuthTest123!';

  try {
    await runMigrations(db);
    const auth = new AuthService(db);
    await auth.seedDefaultUsers();

    const platform = await auth.loginPlatform({
      email: process.env.ABACHA_PLATFORM_ADMIN_EMAIL || 'platformadmin@abacha.internal',
      password: 'PlatformAuthTest123!',
    });

    assert.strictEqual(platform.user.role, 'platform_admin');
    assert.strictEqual(platform.user.identityType, 'platform');
    assert.ok(platform.token);

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
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
