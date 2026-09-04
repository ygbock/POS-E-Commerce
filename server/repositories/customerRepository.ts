import { DatabaseClient, getDatabaseClient } from '../db/client';

export interface CustomerRecord {
  id: string;
  organization_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  tier?: 'Bronze' | 'Silver' | 'Gold' | 'VIP';
  loyalty_points?: number;
  store_credit_balance?: number;
  credit_limit?: number;
  customer_group?: 'Retail' | 'Wholesale' | 'Corporate' | 'VIP Member';
  notes?: string | null;
  registered_at?: string;
  created_at?: string;
  updated_at?: string;
}

export class CustomerRepository {
  private defaultClient: DatabaseClient;

  constructor(client?: DatabaseClient) {
    this.defaultClient = client || getDatabaseClient();
  }

  private getClient(client?: DatabaseClient): DatabaseClient {
    return client || this.defaultClient;
  }

  async listCustomers(orgId = 'org_default', client?: DatabaseClient): Promise<CustomerRecord[]> {
    const db = this.getClient(client);
    const res = await db.query<CustomerRecord>(
      `SELECT id, organization_id, name, email, phone, tier,
              loyalty_points, store_credit_balance::float, credit_limit::float,
              customer_group, notes, registered_at, created_at, updated_at
       FROM customers
       WHERE organization_id = $1
       ORDER BY name ASC`,
      [orgId]
    );
    return res.rows;
  }

  async findCustomerById(id: string, client?: DatabaseClient): Promise<CustomerRecord | null> {
    const db = this.getClient(client);
    const res = await db.query<CustomerRecord>(
      `SELECT id, organization_id, name, email, phone, tier,
              loyalty_points, store_credit_balance::float, credit_limit::float,
              customer_group, notes, registered_at, created_at, updated_at
       FROM customers WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  }

  async createCustomer(customer: CustomerRecord, client?: DatabaseClient): Promise<CustomerRecord> {
    const db = this.getClient(client);
    const res = await db.query<CustomerRecord>(
      `INSERT INTO customers (
        id, organization_id, name, email, phone, tier, loyalty_points,
        store_credit_balance, credit_limit, customer_group, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, organization_id, name, email, phone, tier,
                loyalty_points, store_credit_balance::float, credit_limit::float,
                customer_group, notes, registered_at, created_at, updated_at`,
      [
        customer.id,
        customer.organization_id || 'org_default',
        customer.name,
        customer.email || null,
        customer.phone || null,
        customer.tier || 'Bronze',
        customer.loyalty_points ?? 0,
        customer.store_credit_balance ?? 0,
        customer.credit_limit ?? 0,
        customer.customer_group || 'Retail',
        customer.notes || null,
      ]
    );
    return res.rows[0];
  }
}
