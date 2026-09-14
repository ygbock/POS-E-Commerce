import assert from 'assert';
import { createIsolatedTestClient, DatabaseClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { SubscriptionRepository } from '../server/repositories/subscriptionRepository';
import { SubscriptionService, SubscriptionLimitError } from '../server/services/subscriptionService';
import { buildApiErrorResponse } from '../server/utils/errorSanitizer';

let passed = 0;
let failed = 0;

async function run(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log('  [PASS] ' + name);
    passed++;
  } catch (error: any) {
    console.error('  [FAIL] ' + name + ': ' + (error?.message || error));
    failed++;
  }
}

async function main() {
  const db = createIsolatedTestClient();
  try {
    await runMigrations(db);

    const repo = new SubscriptionRepository(db);
    const service = new SubscriptionService(repo);

    // Setup test tenants and subscriptions
    await db.query(`
      INSERT INTO organizations (id, name, code, is_active, plan_tier) VALUES
      ('org_starter', 'Starter Corp', 'STRT', true, 'starter'),
      ('org_pro', 'Pro Industries', 'PRO', true, 'professional'),
      ('org_enterprise', 'Enterprise Global', 'ENT', true, 'enterprise'),
      ('org_suspended', 'Suspended LLC', 'SUSP', true, 'starter'),
      ('org_no_sub', 'Orphan Store', 'ORPH', true, 'starter'),
      ('org_isolation_b', 'Isolation Corp B', 'ISOB', true, 'starter')
    `);

    await db.query(`
      INSERT INTO organization_subscriptions
      (id, organization_id, plan_id, status, current_period_start, current_period_end) VALUES
      ('sub_starter', 'org_starter', 'plan_starter', 'active', CURRENT_TIMESTAMP - INTERVAL '5 days', CURRENT_TIMESTAMP + INTERVAL '25 days'),
      ('sub_pro', 'org_pro', 'plan_professional', 'active', CURRENT_TIMESTAMP - INTERVAL '5 days', CURRENT_TIMESTAMP + INTERVAL '25 days'),
      ('sub_enterprise', 'org_enterprise', 'plan_enterprise', 'active', CURRENT_TIMESTAMP - INTERVAL '5 days', CURRENT_TIMESTAMP + INTERVAL '25 days'),
      ('sub_suspended', 'org_suspended', 'plan_starter', 'cancelled', CURRENT_TIMESTAMP - INTERVAL '5 days', CURRENT_TIMESTAMP + INTERVAL '25 days'),
      ('sub_isolation_b', 'org_isolation_b', 'plan_starter', 'active', CURRENT_TIMESTAMP - INTERVAL '5 days', CURRENT_TIMESTAMP + INTERVAL '25 days')
    `);

    // Insert baseline location for Starter
    await db.query(`
      INSERT INTO locations (id, organization_id, code, name, type, is_active) VALUES
      ('loc_starter_1', 'org_starter', 'LOC-STRT-1', 'Main Store', 'Retail Store', true),
      ('loc_pro_1', 'org_pro', 'LOC-PRO-1', 'Pro HQ', 'Retail Store', true),
      ('loc_isob_1', 'org_isolation_b', 'LOC-ISOB-1', 'Branch B', 'Retail Store', true)
    `);

    // Scenario 1: Starter user limit enforcement (5 max)
    await run('Scenario 1: Starter user limit enforcement (5 max, 6th fails)', async () => {
      for (let i = 1; i <= 5; i++) {
        await db.query(`
          INSERT INTO users (id, organization_id, email, name, password_hash, password_salt, role, is_active) VALUES
          ('usr_strt_${i}', 'org_starter', 'user${i}@starter.com', 'User ${i}', 'hash', 'salt', 'cashier', true)
        `);
      }

      await assert.rejects(
        async () => {
          await service.assertCanCreateUser('org_starter');
        },
        (err: any) => {
          assert.strictEqual(err.code, 'SUBSCRIPTION_LIMIT_REACHED');
          assert.strictEqual(err.metric, 'users');
          assert.strictEqual(err.limit, 5);
          assert.strictEqual(err.current, 5);
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });

    // Scenario 2: Professional user limit enforcement (25 max)
    await run('Scenario 2: Professional user limit enforcement (allows up to 25, 26th fails)', async () => {
      for (let i = 1; i <= 24; i++) {
        await db.query(`
          INSERT INTO users (id, organization_id, email, name, password_hash, password_salt, role, is_active) VALUES
          ('usr_pro_${i}', 'org_pro', 'user${i}@pro.com', 'User ${i}', 'hash', 'salt', 'cashier', true)
        `);
      }

      // 24 users existing -> can create 25th
      await service.assertCanCreateUser('org_pro');

      // Add 25th user
      await db.query(`
        INSERT INTO users (id, organization_id, email, name, password_hash, password_salt, role, is_active) VALUES
        ('usr_pro_25', 'org_pro', 'user25@pro.com', 'User 25', 'hash', 'salt', 'cashier', true)
      `);

      // 25 users existing -> 26th rejected
      await assert.rejects(
        async () => {
          await service.assertCanCreateUser('org_pro');
        },
        (err: any) => {
          assert.strictEqual(err.code, 'SUBSCRIPTION_LIMIT_REACHED');
          assert.strictEqual(err.metric, 'users');
          assert.strictEqual(err.limit, 25);
          assert.strictEqual(err.current, 25);
          return true;
        }
      );
    });

    // Scenario 3: Enterprise user limit enforcement (100 max)
    await run('Scenario 3: Enterprise user limit enforcement (allows up to 100, 101st fails)', async () => {
      // Fast insert 100 users using generate_series
      await db.query(`
        INSERT INTO users (id, organization_id, email, name, password_hash, password_salt, role, is_active)
        SELECT 'usr_ent_' || i, 'org_enterprise', 'user' || i || '@ent.com', 'Ent User ' || i, 'hash', 'salt', 'cashier', true
        FROM generate_series(1, 100) i
      `);

      await assert.rejects(
        async () => {
          await service.assertCanCreateUser('org_enterprise');
        },
        (err: any) => {
          assert.strictEqual(err.code, 'SUBSCRIPTION_LIMIT_REACHED');
          assert.strictEqual(err.metric, 'users');
          assert.strictEqual(err.limit, 100);
          assert.strictEqual(err.current, 100);
          return true;
        }
      );
    });

    // Scenario 4: Product limit enforcement (Starter 500 max)
    await run('Scenario 4: Product limit enforcement (Starter 500 max, 501st fails)', async () => {
      // Insert 500 products for starter
      await db.query(`
        INSERT INTO products (id, organization_id, name, slug, unit_code, status)
        SELECT 'prd_strt_' || i, 'org_starter', 'Starter Product ' || i, 'prd-strt-' || i, 'each', 'active'
        FROM generate_series(1, 500) i
      `);

      await assert.rejects(
        async () => {
          await service.assertCanCreateProduct('org_starter');
        },
        (err: any) => {
          assert.strictEqual(err.code, 'SUBSCRIPTION_LIMIT_REACHED');
          assert.strictEqual(err.metric, 'products');
          assert.strictEqual(err.limit, 500);
          assert.strictEqual(err.current, 500);
          return true;
        }
      );
    });

    // Scenario 5: Location limit enforcement (Starter 1 max, Pro 5 max)
    await run('Scenario 5: Location limit enforcement (Starter 1 max, Pro 5 max)', async () => {
      // Starter already has 1 location (loc_starter_1)
      await assert.rejects(
        async () => {
          await service.assertCanCreateLocation('org_starter');
        },
        (err: any) => {
          assert.strictEqual(err.code, 'SUBSCRIPTION_LIMIT_REACHED');
          assert.strictEqual(err.metric, 'locations');
          assert.strictEqual(err.limit, 1);
          assert.strictEqual(err.current, 1);
          return true;
        }
      );

      // Pro has 1 location (loc_pro_1), can add up to 5
      await service.assertCanCreateLocation('org_pro');

      // Add 4 more locations for Pro
      await db.query(`
        INSERT INTO locations (id, organization_id, code, name, type, is_active) VALUES
        ('loc_pro_2', 'org_pro', 'LOC-PRO-2', 'Pro Branch 2', 'Retail Store', true),
        ('loc_pro_3', 'org_pro', 'LOC-PRO-3', 'Pro Branch 3', 'Retail Store', true),
        ('loc_pro_4', 'org_pro', 'LOC-PRO-4', 'Pro Branch 4', 'Retail Store', true),
        ('loc_pro_5', 'org_pro', 'LOC-PRO-5', 'Pro Branch 5', 'Retail Store', true)
      `);

      // Now at 5 locations -> 6th rejected
      await assert.rejects(
        async () => {
          await service.assertCanCreateLocation('org_pro');
        },
        (err: any) => {
          assert.strictEqual(err.code, 'SUBSCRIPTION_LIMIT_REACHED');
          assert.strictEqual(err.metric, 'locations');
          assert.strictEqual(err.limit, 5);
          assert.strictEqual(err.current, 5);
          return true;
        }
      );
    });

    // Scenario 6: Monthly order limit enforcement (Starter 1000 max)
    await run('Scenario 6: Monthly order limit enforcement (Starter 1,000 max, 1,001st fails)', async () => {
      // Insert 1000 orders in current billing period
      await db.query(`
        INSERT INTO orders (id, organization_id, location_id, order_number, source, channel, fulfillment_method, created_at)
        SELECT 'ord_strt_' || i, 'org_starter', 'loc_starter_1', 'ORD-STRT-' || i, 'POS', 'POS-1', 'POS Walk-in', CURRENT_TIMESTAMP
        FROM generate_series(1, 1000) i
      `);

      await assert.rejects(
        async () => {
          await service.assertCanCreateOrder('org_starter', db);
        },
        (err: any) => {
          assert.strictEqual(err.code, 'SUBSCRIPTION_LIMIT_REACHED');
          assert.strictEqual(err.metric, 'monthly_orders');
          assert.strictEqual(err.limit, 1000);
          assert.strictEqual(err.current, 1000);
          return true;
        }
      );
    });

    // Scenario 7: Feature gating - Allowed features on Starter
    await run('Scenario 7: Feature gating - Allowed features on Starter', async () => {
      assert.strictEqual(await service.hasFeature('org_starter', 'pos'), true);
      assert.strictEqual(await service.hasFeature('org_starter', 'inventory'), true);
      assert.strictEqual(await service.hasFeature('org_starter', 'storefront'), true);
      assert.strictEqual(await service.hasFeature('org_starter', 'ecommerce'), true); // Alias for storefront
      assert.strictEqual(await service.hasFeature('org_starter', 'reports_basic'), true);

      // assertFeatureEnabled does not throw
      await service.assertFeatureEnabled('org_starter', 'pos');
      await service.assertFeatureEnabled('org_starter', 'inventory');
      await service.assertFeatureEnabled('org_starter', 'storefront');
    });

    // Scenario 8: Feature gating - Disallowed features on Starter
    await run('Scenario 8: Feature gating - Disallowed features on Starter', async () => {
      assert.strictEqual(await service.hasFeature('org_starter', 'reports_advanced'), false);
      assert.strictEqual(await service.hasFeature('org_starter', 'advanced_reports'), false);
      assert.strictEqual(await service.hasFeature('org_starter', 'multi_location'), false);
      assert.strictEqual(await service.hasFeature('org_starter', 'api_access'), false);

      await assert.rejects(
        async () => {
          await service.assertFeatureEnabled('org_starter', 'reports_advanced');
        },
        (err: any) => {
          assert.strictEqual(err.code, 'FEATURE_NOT_AVAILABLE');
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );

      await assert.rejects(
        async () => {
          await service.assertFeatureEnabled('org_starter', 'multi_location');
        },
        (err: any) => {
          assert.strictEqual(err.code, 'FEATURE_NOT_AVAILABLE');
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });

    // Scenario 9: Feature gating - Enterprise features enabled
    await run('Scenario 9: Feature gating - Enterprise features all enabled', async () => {
      assert.strictEqual(await service.hasFeature('org_enterprise', 'api_access'), true);
      assert.strictEqual(await service.hasFeature('org_enterprise', 'multi_location'), true);
      assert.strictEqual(await service.hasFeature('org_enterprise', 'reports_advanced'), true);
      assert.strictEqual(await service.hasFeature('org_enterprise', 'advanced_reports'), true);

      await service.assertFeatureEnabled('org_enterprise', 'api_access');
      await service.assertFeatureEnabled('org_enterprise', 'multi_location');
    });

    // Scenario 10: Missing subscription fails closed
    await run('Scenario 10: Missing subscription fails closed (SUBSCRIPTION_NOT_FOUND)', async () => {
      await assert.rejects(
        async () => {
          await service.assertWithinLimit('org_no_sub', 'users');
        },
        (err: any) => {
          assert.strictEqual(err.code, 'SUBSCRIPTION_NOT_FOUND');
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );

      await assert.rejects(
        async () => {
          await service.assertFeatureEnabled('org_no_sub', 'pos');
        },
        (err: any) => {
          assert.strictEqual(err.code, 'SUBSCRIPTION_NOT_FOUND');
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });

    // Scenario 11: Inactive subscription fails closed
    await run('Scenario 11: Inactive subscription fails closed (SUBSCRIPTION_INACTIVE)', async () => {
      await assert.rejects(
        async () => {
          await service.assertWithinLimit('org_suspended', 'users');
        },
        (err: any) => {
          assert.strictEqual(err.code, 'SUBSCRIPTION_INACTIVE');
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );

      await assert.rejects(
        async () => {
          await service.assertFeatureEnabled('org_suspended', 'pos');
        },
        (err: any) => {
          assert.strictEqual(err.code, 'SUBSCRIPTION_INACTIVE');
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });

    // Scenario 12: Concurrency safety with row locks
    await run('Scenario 12: Concurrency safety with row locks (assertWithinLimit forUpdate)', async () => {
      await db.withTransaction(async (tx) => {
        // Must succeed within transaction with row locking
        const sub = await service.assertWithinLimit('org_starter', 'users', 0, tx, true);
        assert.ok(sub);
        assert.strictEqual(sub.organization_id, 'org_starter');
      });
    });

    // Scenario 13: Cross-tenant subscription isolation
    await run('Scenario 13: Cross-tenant subscription isolation', async () => {
      // Starter org is maxed out at 5 users
      await assert.rejects(async () => {
        await service.assertCanCreateUser('org_starter');
      });

      // Org B is also Starter plan, but has only 1 user
      await db.query(`
        INSERT INTO users (id, organization_id, email, name, password_hash, password_salt, role, is_active) VALUES
        ('usr_isob_1', 'org_isolation_b', 'user1@isob.com', 'Iso User 1', 'hash', 'salt', 'cashier', true)
      `);

      // Org B can create a user despite Starter Org being maxed out
      await service.assertCanCreateUser('org_isolation_b');

      // Check counts are isolated
      const countA = await repo.countUsers('org_starter');
      const countB = await repo.countUsers('org_isolation_b');
      assert.strictEqual(countA, 5);
      assert.strictEqual(countB, 1);
    });

    // Scenario 14: Platform role / admin respects tenant plan limits
    await run('Scenario 14: Platform role / super admin respects tenant plan limits', async () => {
      // Even if a super admin triggers user creation on org_starter, assertCanCreateUser('org_starter')
      // must enforce org_starter's limits and throw SUBSCRIPTION_LIMIT_REACHED
      let platformActorBlocked = false;
      try {
        await service.assertCanCreateUser('org_starter');
      } catch (err: any) {
        if (err.code === 'SUBSCRIPTION_LIMIT_REACHED') {
          platformActorBlocked = true;
        }
      }
      assert.strictEqual(platformActorBlocked, true, 'Tenant plan limits must apply to business ops regardless of caller role');
    });

    // Scenario 15: Error Sanitization and HTTP Status Mapping
    await run('Scenario 15: Error Sanitization maps SUBSCRIPTION_LIMIT_REACHED and FEATURE_NOT_AVAILABLE to 403', async () => {
      const limitErr = new SubscriptionLimitError('SUBSCRIPTION_LIMIT_REACHED', 'Organization reached limit of users', 403, { metric: 'users', limit: 5, current: 5 });
      const resLimit = buildApiErrorResponse(limitErr);
      assert.strictEqual(resLimit.status, 403);
      assert.strictEqual(resLimit.body.error.code, 'SUBSCRIPTION_LIMIT_REACHED');

      const featureErr = new Error('FEATURE_NOT_AVAILABLE: Feature multi_location is not included in current plan.');
      const resFeature = buildApiErrorResponse(featureErr);
      assert.strictEqual(resFeature.status, 403);
      assert.strictEqual(resFeature.body.error.code, 'FEATURE_NOT_AVAILABLE');
    });

    console.log(`\nTASK-5.6.2 subscription limits: ${passed} passed, ${failed} failed`);
  } finally {
    await db.close();
  }
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
