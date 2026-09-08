import { DatabaseClient, getDatabaseClient } from '../db/client';
import { parseExactMoney } from '../inventory/inventoryPolicies';

export interface CustomerRecord {
  id: string;
  organization_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  tier?: 'Bronze' | 'Silver' | 'Gold' | 'VIP';
  loyalty_points?: number;
  store_credit_balance?: string;
  credit_limit?: string;
  customer_group?: 'Retail' | 'Wholesale' | 'Corporate' | 'VIP Member';
  notes?: string | null;
  registered_at?: string;
  created_at?: string;
  updated_at?: string;
}

function mapCustomerRow(row: any): CustomerRecord {
  return {
    ...row,
    store_credit_balance: row.store_credit_balance != null
      ? parseExactMoney(row.store_credit_balance.toString(), 'store_credit_balance')
      : '0.00',
    credit_limit: row.credit_limit != null
      ? parseExactMoney(row.credit_limit.toString(), 'credit_limit')
      : '0.00',
  };
}

export class CustomerRepository {
  private defaultClient: DatabaseClient;

  constructor(client?: DatabaseClient) {
    this.defaultClient = client || getDatabaseClient();
  }

  private getClient(client?: DatabaseClient): DatabaseClient {
    return client || this.defaultClient;
  }

  async listCustomers(organizationId: string, client?: DatabaseClient): Promise<CustomerRecord[]> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: organization_id is required to list customers.');
    }
    const db = this.getClient(client);
    const res = await db.query<any>(
      `SELECT id, organization_id, name, email, phone, tier,
              loyalty_points, store_credit_balance, credit_limit,
              customer_group, notes, registered_at, created_at, updated_at
       FROM customers
       WHERE organization_id = $1
       ORDER BY name ASC`,
      [organizationId]
    );
    return res.rows.map(mapCustomerRow);
  }

  async findCustomerById(
    id: string,
    organizationId: string,
    client?: DatabaseClient
  ): Promise<CustomerRecord | null> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('TENANT_REQUIRED: organization_id is required to find customer.');
    }
    const db = this.getClient(client);
    const res = await db.query<any>(
      `SELECT id, organization_id, name, email, phone, tier,
              loyalty_points, store_credit_balance, credit_limit,
              customer_group, notes, registered_at, created_at, updated_at
       FROM customers WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );
    return res.rows[0] ? mapCustomerRow(res.rows[0]) : null;
  }

  async createCustomer(customer: CustomerRecord, client?: DatabaseClient): Promise<CustomerRecord> {
    if (!customer.organization_id || typeof customer.organization_id !== 'string' || customer.organization_id.trim() === '') {
      throw new Error('TENANT_REQUIRED: organization_id is required to create customer.');
    }
    const storeCredit = customer.store_credit_balance != null
      ? parseExactMoney(customer.store_credit_balance.toString(), 'store_credit_balance')
      : '0.00';
    const creditLimit = customer.credit_limit != null
      ? parseExactMoney(customer.credit_limit.toString(), 'credit_limit')
      : '0.00';

    const db = this.getClient(client);
    const res = await db.query<any>(
      `INSERT INTO customers (
        id, organization_id, name, email, phone, tier, loyalty_points,
        store_credit_balance, credit_limit, customer_group, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, organization_id, name, email, phone, tier,
                loyalty_points, store_credit_balance, credit_limit,
                customer_group, notes, registered_at, created_at, updated_at`,
      [
        customer.id,
        customer.organization_id,
        customer.name,
        customer.email || null,
        customer.phone || null,
        customer.tier || 'Bronze',
        customer.loyalty_points ?? 0,
        storeCredit,
        creditLimit,
        customer.customer_group || 'Retail',
        customer.notes || null,
      ]
    );
    return mapCustomerRow(res.rows[0]);
  }
}
