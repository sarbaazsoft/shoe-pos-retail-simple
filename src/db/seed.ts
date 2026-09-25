import bcrypt from 'bcryptjs';
import { pgClient } from './index.ts';
import { generateEan13Barcode, sanitizePrefix } from '../utils/barcode.ts';
import { parseBrandPrefix, parseCategoryPrefix, generateSuggestedArticle, generateSku } from '../utils/sku.ts';

export async function initAndSeedDb() {
  console.log('Running PostgreSQL schema migrations and checks...');
  await pgClient.waitReady;

  // Create PostgreSQL tables using DDL with constraints and indexes
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
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS strn TEXT DEFAULT '';
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS tax_id TEXT DEFAULT '';
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS currency_name TEXT DEFAULT 'Pakistani Rupee';
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS is_installed BOOLEAN DEFAULT false;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS min_profit_margin NUMERIC(5, 2) DEFAULT 10.00;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS max_profit_margin NUMERIC(5, 2) DEFAULT 30.00;
    UPDATE company_settings SET tax_id = tax_number WHERE (tax_id IS NULL OR tax_id = '') AND (tax_number IS NOT NULL AND tax_number != '');
    UPDATE company_settings SET currency_name = 'Pakistani Rupee' WHERE currency_name IS NULL OR currency_name = '';
    UPDATE company_settings SET barcode_prefix = '0108923' WHERE LENGTH(barcode_prefix) != 7 OR barcode_prefix !~ '^[0-9]{7}$';

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
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      sku TEXT NOT NULL UNIQUE,
      barcode TEXT NOT NULL UNIQUE,
      primary_image_url TEXT DEFAULT '',
      description TEXT DEFAULT '',
      cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      total_stock INTEGER NOT NULL DEFAULT 0,
      low_stock_limit INTEGER NOT NULL DEFAULT 5,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS products_barcode_idx ON products(barcode);
    CREATE INDEX IF NOT EXISTS products_sku_idx ON products(sku);
    CREATE INDEX IF NOT EXISTS products_active_idx ON products(active);

    -- Clean up legacy variant tables (flat product model: 1 Product = 1 SKU = 1 Barcode)
    DROP TABLE IF EXISTS product_sizes CASCADE;
    DROP TABLE IF EXISTS product_colors CASCADE;

    -- Ensure schema columns exist on existing databases
    ALTER TABLE products ADD COLUMN IF NOT EXISTS article TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS primary_image_url TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12, 2) DEFAULT 0.00;
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='purchase_price') THEN
        UPDATE products SET cost_price = purchase_price WHERE (cost_price IS NULL OR cost_price = 0) AND purchase_price IS NOT NULL;
      END IF;
    END $$;
    ALTER TABLE products DROP COLUMN IF EXISTS min_sale_price;
    ALTER TABLE products DROP COLUMN IF EXISTS max_sale_price;

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
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id SERIAL PRIMARY KEY,
      purchase_number TEXT NOT NULL UNIQUE,
      supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      supplier_name TEXT NOT NULL,
      purchase_date TEXT NOT NULL,
      total_amount NUMERIC(12, 2) NOT NULL,
      notes TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL;

    CREATE TABLE IF NOT EXISTS purchase_items (
      id SERIAL PRIMARY KEY,
      purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      unit_purchase_price NUMERIC(12, 2) NOT NULL,
      subtotal NUMERIC(12, 2) NOT NULL
    );

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

  // 1. Seed Company Settings
  const settingsCount = await pgClient.query<{ count: string }>('SELECT COUNT(*) as count FROM company_settings');
  if (parseInt(settingsCount.rows[0].count) === 0) {
    await pgClient.query(`
      INSERT INTO company_settings (
        name, logo, address, phone, email, website, tax_number, 
        currency, currency_symbol, invoice_prefix, purchase_prefix, 
        barcode_prefix, invoice_footer, low_stock_limit, is_installed
      ) VALUES (
        'Shoe Shop & Footwear Co.',
        'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=160&auto=format&fit=crop&q=80',
        'Shop #14, Royal Commercial Plaza, Saddar',
        '+92-300-5551234',
        'sales@shoepos.com',
        'www.shoepos.com',
        'STRN-9876543-2',
        'PKR',
        'Rs.',
        'INV-',
        'PUR-',
        '0108923',
        'Exchanges accepted within 7 days with original receipt. Thank you for shopping with us!',
        5,
        true
      );
    `);
    console.log('Company settings initialized.');
  }

  // 2. Seed Users
  const userCount = await pgClient.query<{ count: string }>('SELECT COUNT(*) as count FROM users');
  if (parseInt(userCount.rows[0].count) === 0) {
    const adminPassHash = await bcrypt.hash('admin123', 10);
    const cashierPassHash = await bcrypt.hash('cashier123', 10);

    await pgClient.query(`
      INSERT INTO users (name, email, password_hash, role, status) VALUES
      ('Shoe Shop Owner', 'admin@shoepos.com', $1, 'ADMIN', 'APPROVED'),
      ('Counter Cashier Ali', 'cashier@shoepos.com', $2, 'CASHIER', 'APPROVED'),
      ('Trainee Bilal', 'trainee@shoepos.com', $2, 'CASHIER', 'PENDING');
    `, [adminPassHash, cashierPassHash]);
    console.log('Default users seeded: admin@shoepos.com / admin123 and cashier@shoepos.com / cashier123');
  }

  // 3. Seed Brands
  const brandCount = await pgClient.query<{ count: string }>('SELECT COUNT(*) as count FROM brands');
  if (parseInt(brandCount.rows[0].count) === 0) {
    await pgClient.query(`
      INSERT INTO brands (name) VALUES 
      ('Local'),
      ('Unbranded'),
      ('Nike'),
      ('Adidas'),
      ('Bata'),
      ('Service'),
      ('Clarks'),
      ('Hush Puppies'),
      ('Puma');
    `);
    console.log('Default brands seeded.');
  }

  // 3b. Seed Suppliers
  const supplierCount = await pgClient.query<{ count: string }>('SELECT COUNT(*) as count FROM suppliers');
  if (parseInt(supplierCount.rows[0].count) === 0) {
    await pgClient.query(`
      INSERT INTO suppliers (name, phone, email, address, url, notes) VALUES 
      ('Nike Wholesale Pakistan', '+92-300-1122334', 'wholesale@nike.pk', 'Warehouse 4B, SITE Industrial Area, Karachi', 'https://www.nike.com', 'Primary authorized distributor for Nike athletic and lifestyle shoes.'),
      ('Metro Footwear Importers', '+92-321-4455667', 'orders@metrofootwear.pk', 'Shop 12-14, Shoe Market, Saddar, Lahore', 'https://www.metroshoes.pk', 'General distributor for casual, dress shoes, loafers and sandals.'),
      ('Bata Pakistan Commercial Supply', '+92-333-7788990', 'commercial@bata.com.pk', 'Batapur Industrial Complex, Lahore', 'https://www.bata.com.pk', 'Formal, school, leather and daily work footwear supplier.'),
      ('Puma & Sports Footwear Hub', '+92-311-9988776', 'supply@pumasports.pk', 'Plot 89, Sector I-9, Islamabad', 'https://www.puma.com', 'Imported running sneakers, trainers and sports shoes supply partner.');
    `);
    console.log('Default suppliers seeded.');
  }

  // 4. Seed Categories
  const categoryCount = await pgClient.query<{ count: string }>('SELECT COUNT(*) as count FROM categories');
  if (parseInt(categoryCount.rows[0].count) === 0) {
    await pgClient.query(`
      INSERT INTO categories (name) VALUES 
      ('Misc'),
      ('Formal Dress Shoes'),
      ('Casual Shoes'),
      ('Sandals & Chappals'),
      ('Closed Flats'),
      ('Flat Sandals'),
      ('Heeled Sandals'),
      ('Closed Heels & Pumps'),
      ('Boys Footwear'),
      ('Girls Footwear');
    `);
    console.log('Default categories seeded.');
  }

  // 5. Seed Sample Customers
  const custCount = await pgClient.query<{ count: string }>('SELECT COUNT(*) as count FROM customers');
  if (parseInt(custCount.rows[0].count) === 0) {
    await pgClient.query(`
      INSERT INTO customers (name, phone, email, address, notes) VALUES
      ('Walk-in Customer', '03000000000', 'walkin@store.local', 'Counter Sale', 'Regular shop walk-in sales'),
      ('Muhammad Usman', '03214567890', 'usman@gmail.com', 'House 42, Street 7, Clifton', 'Prefers size 42 formal oxfords'),
      ('Fatima Zahra', '03339876543', 'fatima.z@hotmail.com', 'Flat 3B, Falcon Heights', 'VIP member discount eligible');
    `);
    console.log('Sample customers seeded.');
  }

  // 7. Seed Initial Products
  const prodCount = await pgClient.query<{ count: string }>('SELECT COUNT(*) as count FROM products');
  if (parseInt(prodCount.rows[0].count) === 0) {
    const adminUser = await pgClient.query<{ id: number }>('SELECT id FROM users WHERE role = $1 LIMIT 1', ['ADMIN']);
    const adminId = adminUser.rows[0]?.id || 1;

    // Get brand and category IDs
    const nikeBrand = await pgClient.query<{ id: number }>('SELECT id FROM brands WHERE name = $1', ['Nike']);
    const adidasBrand = await pgClient.query<{ id: number }>('SELECT id FROM brands WHERE name = $1', ['Adidas']);
    const clarksBrand = await pgClient.query<{ id: number }>('SELECT id FROM brands WHERE name = $1', ['Clarks']);
    const bataBrand = await pgClient.query<{ id: number }>('SELECT id FROM brands WHERE name = $1', ['Bata']);

    const sportsCat = await pgClient.query<{ id: number }>('SELECT id FROM categories WHERE name = $1', ['Sports']);
    const formalCat = await pgClient.query<{ id: number }>('SELECT id FROM categories WHERE name = $1', ['Formal']);
    const casualCat = await pgClient.query<{ id: number }>('SELECT id FROM categories WHERE name = $1', ['Casual']);

    const p1 = await pgClient.query<{ id: number }>(`
      INSERT INTO products (
        name, brand_id, category_id, article, sku, barcode, primary_image_url, 
        description, cost_price, total_stock, low_stock_limit, active
      ) VALUES (
        'Air Zoom Velocity Runner',
        $1, $2, 'SP-0001', 'NIK-SP-0001-1', '01089230001',
        'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&auto=format&fit=crop&q=80',
        'Breathable mesh running shoes with responsive Zoom air cushioning sole.',
        4200.00, 18, 5, true
      ) RETURNING id;
    `, [nikeBrand.rows[0]?.id, sportsCat.rows[0]?.id]);

    const p1Id = p1.rows[0].id;

    // Stock movement for p1
    await pgClient.query(`
      INSERT INTO stock_movements (product_id, qty_change, prev_stock, new_stock, movement_type, reference_id, user_id, notes)
      VALUES ($1, 18, 0, 18, 'PURCHASE', 'PUR-INITIAL', $2, 'Initial inventory opening balance');
    `, [p1Id, adminId]);

    // Product 2: Formal Oxford
    const p2 = await pgClient.query<{ id: number }>(`
      INSERT INTO products (
        name, brand_id, category_id, article, sku, barcode, primary_image_url, 
        description, cost_price, total_stock, low_stock_limit, active
      ) VALUES (
        'Classic Derby Leather Oxford',
        $1, $2, 'FO-0002', 'CLA-FO-0002-2', '01089230002',
        'Handcrafted genuine full-grain leather dress shoes with Goodyear welted leather sole.',
        5500.00, 12, 4, true
      ) RETURNING id;
    `, [clarksBrand.rows[0]?.id, formalCat.rows[0]?.id]);
    const p2Id = p2.rows[0].id;

    await pgClient.query(`
      INSERT INTO stock_movements (product_id, qty_change, prev_stock, new_stock, movement_type, reference_id, user_id, notes)
      VALUES ($1, 12, 0, 12, 'PURCHASE', 'PUR-INITIAL', $2, 'Initial inventory opening balance');
    `, [p2Id, adminId]);

    // Product 3: Casual White Sneaker
    const p3 = await pgClient.query<{ id: number }>(`
      INSERT INTO products (
        name, brand_id, category_id, article, sku, barcode, primary_image_url, 
        description, cost_price, total_stock, low_stock_limit, active
      ) VALUES (
        'Cloudfoam Lifestyle Retro Sneaker',
        $1, $2, 'CA-0003', 'ADI-CA-0003-3', '01089230003',
        'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600&auto=format&fit=crop&q=80',
        'Minimalist everyday sneakers with cushioned Cloudfoam sockliner for all-day comfort.',
        3100.00, 24, 6, true
      ) RETURNING id;
    `, [adidasBrand.rows[0]?.id, casualCat.rows[0]?.id]);
    const p3Id = p3.rows[0].id;

    await pgClient.query(`
      INSERT INTO stock_movements (product_id, qty_change, prev_stock, new_stock, movement_type, reference_id, user_id, notes)
      VALUES ($1, 24, 0, 24, 'PURCHASE', 'PUR-INITIAL', $2, 'Initial inventory opening balance');
    `, [p3Id, adminId]);

    // Product 4: Low stock product to showcase alerts
    const p4 = await pgClient.query<{ id: number }>(`
      INSERT INTO products (
        name, brand_id, category_id, article, sku, barcode, primary_image_url, 
        description, cost_price, total_stock, low_stock_limit, active
      ) VALUES (
        'Bata Power Pro Court Trainer',
        $1, $2, 'SP-0004', 'BAT-SP-0004-4', '01089230004',
        'https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=600&auto=format&fit=crop&q=80',
        'Durable court trainers with non-marking rubber outsole.',
        2200.00, 3, 5, true
      ) RETURNING id;
    `, [bataBrand.rows[0]?.id, sportsCat.rows[0]?.id]);
    const p4Id = p4.rows[0].id;

    await pgClient.query(`
      INSERT INTO stock_movements (product_id, qty_change, prev_stock, new_stock, movement_type, reference_id, user_id, notes)
      VALUES ($1, 3, 0, 3, 'PURCHASE', 'PUR-INITIAL', $2, 'Initial low-stock test inventory');
    `, [p4Id, adminId]);

    console.log('Sample shoe products seeded successfully.');
  }

  // 8. Migration: Enforce standard 13-digit EAN-13 Modulo-10 Barcodes across all products
  // Formula: [7-digit prefix from Settings] + [5-digit Product ID] + [1 Check Digit] = 13 digits
  try {
    const sRes = await pgClient.query<{ barcode_prefix: string }>('SELECT barcode_prefix FROM company_settings LIMIT 1');
    const rawPrefix = sRes.rows[0]?.barcode_prefix;
    const prefix = sanitizePrefix(rawPrefix, '0108923');

    const allProds = await pgClient.query<{ id: number; barcode: string }>('SELECT id, barcode FROM products ORDER BY id ASC');
    for (const prod of allProds.rows) {
      if (prod.id <= 99999) {
        const ean = generateEan13Barcode(prefix, prod.id);
        if (prod.barcode !== ean.barcode) {
          await pgClient.query('UPDATE products SET barcode = $1 WHERE id = $2', [ean.barcode, prod.id]);
        }
      }
    }
    console.log('13-digit standard EAN-13 barcodes synchronized for all products.');
  } catch (migErr) {
    console.warn('EAN-13 barcode migration note:', migErr);
  }

  // 9. Synchronize PostgreSQL sequence & SKUs with [Brand Prefix]-[Article]-[Product ID] formula
  try {
    await pgClient.query(`
      SELECT setval('products_id_seq', (SELECT GREATEST(COALESCE(MAX(id), 0), 1) FROM products));
    `);

    const prodsRes = await pgClient.query<{ id: number; name: string; brand_name: string | null; category_name: string | null; sku: string; article: string | null }>(`
      SELECT p.id, p.name, b.name as brand_name, c.name as category_name, p.sku, p.article
      FROM products p
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN categories c ON p.category_id = c.id
      ORDER BY p.id ASC
    `);

    for (const prod of prodsRes.rows) {
      const brandPrefix = parseBrandPrefix(prod.brand_name);
      const catPrefix = parseCategoryPrefix(prod.category_name);
      let article = prod.article && prod.article.trim()
        ? prod.article.trim().toUpperCase()
        : '';
      // If article is missing, or matches the previous 3-character unhyphenated category format, or lacks a hyphen:
      if (!article || /^[A-Z0-9]{3}\d{4,}$/.test(article) || !article.includes('-')) {
        article = generateSuggestedArticle(catPrefix, prod.id);
      }
      const expectedSku = generateSku(brandPrefix, article, prod.id);

      if (!prod.article || prod.article !== article || prod.sku !== expectedSku) {
        await pgClient.query('UPDATE products SET article = $1, sku = $2 WHERE id = $3', [
          article,
          expectedSku,
          prod.id,
        ]);
      }
    }
    console.log('Product SKUs and Articles synchronized with [Brand Prefix]-[Article]-[Product ID] formula.');
  } catch (skuMigErr) {
    console.warn('SKU synchronization note:', skuMigErr);
  }

  console.log('PostgreSQL database initialization and seeding completed.');
}
