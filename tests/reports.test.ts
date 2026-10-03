import assert from 'assert';
import { createIsolatedTestClient } from '../server/db/client';
import { runMigrations } from '../server/db/migrator';
import { ReportingService } from '../server/services/reportingService';

async function main() {
  const db = createIsolatedTestClient();
  try {
    await runMigrations(db);

    await db.query(`INSERT INTO organizations (id,name,code,is_active,plan_tier)
      VALUES ('org_report_a','Report A','REPORT-A',true,'starter'),
             ('org_report_b','Report B','REPORT-B',true,'starter')`);

    await db.query(`INSERT INTO locations (id,organization_id,code,name,type,is_pos_enabled)
      VALUES ('loc_report_a','org_report_a','MAIN','Main','Retail Store',true),
             ('loc_report_b','org_report_b','MAIN','Main','Retail Store',true)`);

    await db.query(`INSERT INTO products (id,organization_id,name,slug,unit_code)
      VALUES ('prod_report_a','org_report_a','Widget','widget','EA'),
             ('prod_report_b','org_report_b','Widget','widget','EA')`);

    await db.query(`INSERT INTO product_variants (id,organization_id,product_id,sku,barcode,name,cost_price,retail_price)
      VALUES ('var_report_a','org_report_a','prod_report_a','SKU-A','BAR-A','Widget',10,20),
             ('var_report_b','org_report_b','prod_report_b','SKU-B','BAR-B','Widget',100,200)`);

    await db.query(`INSERT INTO inventory_balances (id,organization_id,location_id,variant_id,on_hand,reserved)
      VALUES ('bal_report_a','org_report_a','loc_report_a','var_report_a',10,2),
             ('bal_report_b','org_report_b','loc_report_b','var_report_b',100,0)`);

    await db.query(`INSERT INTO orders
      (id,organization_id,location_id,order_number,source,channel,fulfillment_method,subtotal,total_amount,total_cost_amount,payment_status,status)
      VALUES ('ord_report_a','org_report_a','loc_report_a','ORD-A','POS','POS','POS Walk-in',100,100,40,'Paid','Completed'),
             ('ord_report_b','org_report_b','loc_report_b','ORD-B','POS','POS','POS Walk-in',10000,10000,9000,'Paid','Completed')`);

    await db.query(`INSERT INTO pos_sessions
      (id,organization_id,location_id,terminal_id,cashier_name,status,opening_cash,expected_cash,counted_cash,variance)
      VALUES ('shift_report_a','org_report_a','loc_report_a','TERM-A','Cashier A','CLOSED',100,200,198,-2)`);

    const service = new ReportingService(db);
    const sales = await service.getSalesSummary('org_report_a');
    assert.strictEqual(sales.orderCount, 1);
    assert.strictEqual(sales.grossSales, '100.00');
    assert.strictEqual(sales.cogs, '40.00');
    assert.strictEqual(sales.grossProfit, '60.00');
    assert.strictEqual(sales.grossMarginPercent, 60);

    const inventory = await service.getInventoryValuation('org_report_a');
    assert.strictEqual(inventory.variantCount, 1);
    assert.strictEqual(inventory.availableUnits, '8.0000');
    assert.strictEqual(inventory.costValue, '80.00');
    assert.strictEqual(inventory.retailValue, '160.00');

    const shifts = await service.getShiftReconciliation('org_report_a');
    assert.strictEqual(shifts.shiftCount, 1);
    assert.strictEqual(shifts.totals.variance, -2);
    assert.strictEqual(shifts.shifts[0].expectedCash, '200.00');

    const isolated = await service.getSalesSummary('org_report_a');
    assert.strictEqual(isolated.grossSales, '100.00');

    console.log('TASK-5.7.1 reports: PASS');
  } finally {
    await db.close();
  }
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
