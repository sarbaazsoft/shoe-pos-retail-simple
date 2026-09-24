import { pgClient } from './index.ts';

/**
 * Ensures that all database tables, columns, constraints, and indexes exist.
 * This is 100% idempotent and DOES NOT seed any dummy users or fake demo products.
 */
export async function ensureDatabaseSchema(): Promise<void> {
  await pgClient.waitReady;

  await pgClient.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'CASHIER',
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '';

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS company_settings (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'Your Shoe Store',
      logo TEXT DEFAULT '',
      address TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      website TEXT DEFAULT '',
      strn TEXT DEFAULT '',
      tax_id TEXT DEFAULT '',
      tax_number TEXT DEFAULT '',
      currency TEXT NOT NULL DEFAULT 'PKR',
      currency_name TEXT NOT NULL DEFAULT 'Pakistani Rupee',
      currency_symbol TEXT NOT NULL DEFAULT 'Rs.',
      invoice_prefix TEXT NOT NULL DEFAULT 'INV-',
      purchase_prefix TEXT NOT NULL DEFAULT 'PUR-',
      barcode_prefix TEXT NOT NULL DEFAULT '0108923',
      invoice_footer TEXT NOT NULL DEFAULT 'Thank you for shopping with us!',
      low_stock_limit INTEGER NOT NULL DEFAULT 5,
      min_profit_margin NUMERIC(5, 2) DEFAULT 10.00,
      max_profit_margin NUMERIC(5, 2) DEFAULT 30.00,
      is_installed BOOLEAN DEFAULT false,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS strn TEXT DEFAULT '';
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS tax_id TEXT DEFAULT '';
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS currency_name TEXT DEFAULT 'Pakistani Rupee';
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS is_installed BOOLEAN DEFAULT false;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS min_profit_margin NUMERIC(5, 2) DEFAULT 10.00;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS max_profit_margin NUMERIC(5, 2) DEFAULT 30.00;

    CREATE TABLE IF NOT EXISTS brands (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      logo TEXT DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    ALTER TABLE brands ADD COLUMN IF NOT EXISTS logo TEXT DEFAULT '';

    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      low_stock_limit INTEGER DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    ALTER TABLE categories ADD COLUMN IF NOT EXISTS low_stock_limit INTEGER DEFAULT NULL;

    -- Ensure default 'Local' brand exists (category table starts completely empty with zero categories)
    INSERT INTO brands (name) VALUES ('Local') ON CONFLICT (name) DO NOTHING;

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      sku TEXT NOT NULL UNIQUE,
      barcode TEXT NOT NULL UNIQUE,
      article TEXT DEFAULT '',
      primary_image_url TEXT DEFAULT '',
      description TEXT DEFAULT '',
      purchase_price NUMERIC(12, 2) NOT NULL,
      min_sale_price NUMERIC(12, 2) NOT NULL,
      total_stock INTEGER NOT NULL DEFAULT 0,
      low_stock_limit INTEGER NOT NULL DEFAULT 5,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    ALTER TABLE products ADD COLUMN IF NOT EXISTS article TEXT DEFAULT '';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS primary_image_url TEXT DEFAULT '';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS max_sale_price NUMERIC(12, 2);
    UPDATE products SET max_sale_price = min_sale_price WHERE max_sale_price IS NULL;

    CREATE INDEX IF NOT EXISTS products_barcode_idx ON products(barcode);
    CREATE INDEX IF NOT EXISTS products_sku_idx ON products(sku);
    CREATE INDEX IF NOT EXISTS products_active_idx ON products(active);

    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      address TEXT,
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS customers_phone_idx ON customers(phone);

    CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      url TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      balance NUMERIC(12, 2) DEFAULT 0.00,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS balance NUMERIC(12, 2) DEFAULT 0.00;

    CREATE TABLE IF NOT EXISTS purchases (
      id SERIAL PRIMARY KEY,
      purchase_number TEXT NOT NULL UNIQUE,
      supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      supplier_name TEXT NOT NULL,
      purchase_date TEXT NOT NULL,
      total_amount NUMERIC(12, 2) NOT NULL,
      paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      payment_status TEXT NOT NULL DEFAULT 'UNPAID',
      payment_method TEXT DEFAULT 'CASH',
      notes TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'UNPAID';
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'CASH';

    CREATE TABLE IF NOT EXISTS supplier_payments (
      id SERIAL PRIMARY KEY,
      payment_number TEXT NOT NULL UNIQUE,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      supplier_name TEXT NOT NULL,
      purchase_id INTEGER REFERENCES purchases(id) ON DELETE SET NULL,
      amount NUMERIC(12, 2) NOT NULL,
      payment_date TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'CASH',
      reference_number TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS supplier_payments_supplier_idx ON supplier_payments(supplier_id);
    CREATE INDEX IF NOT EXISTS supplier_payments_date_idx ON supplier_payments(payment_date);
    CREATE INDEX IF NOT EXISTS supplier_payments_number_idx ON supplier_payments(payment_number);

    CREATE TABLE IF NOT EXISTS purchase_items (
      id SERIAL PRIMARY KEY,
      purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      unit_purchase_price NUMERIC(12, 2) NOT NULL,
      subtotal NUMERIC(12, 2) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchase_returns (
      id SERIAL PRIMARY KEY,
      return_number TEXT NOT NULL UNIQUE,
      purchase_id INTEGER REFERENCES purchases(id) ON DELETE SET NULL,
      supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      supplier_name TEXT NOT NULL,
      return_date TEXT NOT NULL,
      total_debit_amount NUMERIC(12, 2) NOT NULL,
      reason TEXT NOT NULL,
      notes TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS purchase_returns_number_idx ON purchase_returns(return_number);
    CREATE INDEX IF NOT EXISTS purchase_returns_supplier_idx ON purchase_returns(supplier_id);

    CREATE TABLE IF NOT EXISTS purchase_return_items (
      id SERIAL PRIMARY KEY,
      purchase_return_id INTEGER NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      carton_quantity INTEGER NOT NULL DEFAULT 1,
      pairs_per_carton INTEGER NOT NULL DEFAULT 1,
      quantity INTEGER NOT NULL,
      unit_purchase_price NUMERIC(12, 2) NOT NULL,
      subtotal NUMERIC(12, 2) NOT NULL,
      defect_type TEXT DEFAULT 'DEFECTIVE_CARTON'
    );
    CREATE INDEX IF NOT EXISTS purchase_return_items_return_idx ON purchase_return_items(purchase_return_id);
    CREATE INDEX IF NOT EXISTS purchase_return_items_product_idx ON purchase_return_items(product_id);

    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      invoice_number TEXT NOT NULL UNIQUE,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      sale_date TEXT NOT NULL,
      subtotal NUMERIC(12, 2) NOT NULL,
      discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      total_amount NUMERIC(12, 2) NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'CASH',
      cash_received NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      change_given NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      created_by INTEGER NOT NULL REFERENCES users(id),
      is_min_price_overridden BOOLEAN NOT NULL DEFAULT false,
      overridden_by INTEGER REFERENCES users(id),
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS sales_invoice_idx ON sales(invoice_number);

    CREATE TABLE IF NOT EXISTS sale_items (
      id SERIAL PRIMARY KEY,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price NUMERIC(12, 2) NOT NULL,
      discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      subtotal NUMERIC(12, 2) NOT NULL,
      purchase_price NUMERIC(12, 2) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS returns (
      id SERIAL PRIMARY KEY,
      return_number TEXT NOT NULL UNIQUE,
      original_sale_id INTEGER NOT NULL REFERENCES sales(id),
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      return_date TEXT NOT NULL,
      total_refund_amount NUMERIC(12, 2) NOT NULL,
      reason TEXT NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS return_items (
      id SERIAL PRIMARY KEY,
      return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
      sale_item_id INTEGER NOT NULL REFERENCES sale_items(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      unit_refund_price NUMERIC(12, 2) NOT NULL,
      subtotal NUMERIC(12, 2) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id),
      qty_change INTEGER NOT NULL,
      prev_stock INTEGER NOT NULL,
      new_stock INTEGER NOT NULL,
      movement_type TEXT NOT NULL,
      reference_id TEXT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON stock_movements(product_id);
    CREATE INDEX IF NOT EXISTS stock_movements_created_at_idx ON stock_movements(created_at);
  `);
}

/**
 * Drops all tables and relations in the public database schema with CASCADE.
 * Guarantees that reinstallation performs a complete DROP TABLE instead of merely
 * deleting row entries, giving a 100% fresh, clean database state.
 */
export async function dropAllTables(): Promise<void> {
  await pgClient.waitReady;

  // 1. Explicitly drop all known application tables with CASCADE
  await pgClient.exec(`
    DROP TABLE IF EXISTS 
      password_reset_tokens,
      stock_movements,
      return_items,
      returns,
      sale_items,
      sales,
      purchase_return_items,
      purchase_returns,
      supplier_payments,
      purchase_items,
      purchases,
      products,
      product_sizes,
      product_colors,
      customers,
      suppliers,
      categories,
      brands,
      api_tokens,
      company_settings,
      users
    CASCADE;
  `);

  // 2. Query for any remaining base tables in the public schema and drop them dynamically
  try {
    const remainingTables = await pgClient.query<{ tablename: string }>(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
    `);

    for (const row of remainingTables.rows) {
      await pgClient.exec(`DROP TABLE IF EXISTS "${row.tablename}" CASCADE;`);
    }
  } catch (err: any) {
    console.warn('Notice during dynamic table drop:', err.message);
  }

  console.log('🗑️ All database tables successfully dropped with CASCADE.');
}

