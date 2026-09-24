import { Router } from 'express';
import type { Response } from 'express';
import { pgClient } from '../../db/index.ts';
import { requireAuth, requireAdmin } from '../auth.ts';

const router = Router();

// List Brands
router.get('/brands', requireAuth, async (_req, res: Response) => {
  try {
    const result = await pgClient.query(`
      SELECT b.id, b.name, COALESCE(b.logo, '') as logo, b.created_at,
             COUNT(p.id)::int as product_count,
             COALESCE(SUM(p.total_stock), 0)::int as total_units
      FROM brands b
      LEFT JOIN products p ON p.brand_id = b.id AND p.active = true
      GROUP BY b.id, b.name, b.logo, b.created_at
      ORDER BY b.name ASC
    `);
    res.json({ brands: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch brands: ' + err.message });
  }
});

// Create Brand (Admin Only)
router.post('/brands', requireAuth, requireAdmin, async (req, res: Response) => {
  try {
    const { name, logo } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Brand name is required.' });
    }

    const check = await pgClient.query('SELECT id FROM brands WHERE LOWER(name) = LOWER($1)', [name.trim()]);
    if (check.rows.length > 0) {
      return res.status(400).json({ error: 'Brand with this name already exists.' });
    }

    const logoValue = typeof logo === 'string' ? logo.trim() : '';

    const result = await pgClient.query(
      'INSERT INTO brands (name, logo) VALUES ($1, $2) RETURNING *',
      [name.trim(), logoValue]
    );
    res.status(201).json({ brand: result.rows[0], message: 'Brand added successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create brand: ' + err.message });
  }
});

// Update Brand (Admin Only)
router.put('/brands/:id', requireAuth, requireAdmin, async (req, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, logo } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Brand name is required.' });
    }

    const check = await pgClient.query('SELECT id FROM brands WHERE LOWER(name) = LOWER($1) AND id != $2', [name.trim(), id]);
    if (check.rows.length > 0) {
      return res.status(400).json({ error: 'Another brand with this name already exists.' });
    }

    let result;
    if (logo !== undefined) {
      const logoValue = typeof logo === 'string' ? logo.trim() : '';
      result = await pgClient.query(
        'UPDATE brands SET name = $1, logo = $2 WHERE id = $3 RETURNING *',
        [name.trim(), logoValue, id]
      );
    } else {
      result = await pgClient.query(
        'UPDATE brands SET name = $1 WHERE id = $2 RETURNING *',
        [name.trim(), id]
      );
    }
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Brand not found.' });
    }
    res.json({ brand: result.rows[0], message: 'Brand updated.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update brand: ' + err.message });
  }
});

// Delete Brand (Admin Only)
router.delete('/brands/:id', requireAuth, requireAdmin, async (req, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const brand = await pgClient.query('SELECT name FROM brands WHERE id = $1', [id]);
    if (brand.rows.length > 0) {
      const bName = (brand.rows[0] as any).name.toLowerCase();
      if (bName === 'unbranded' || bName === 'local') {
        return res.status(400).json({ error: `The default system brand "${(brand.rows[0] as any).name}" cannot be deleted.` });
      }
    }

    await pgClient.query('UPDATE products SET brand_id = NULL WHERE brand_id = $1', [id]);
    await pgClient.query('DELETE FROM brands WHERE id = $1', [id]);
    res.json({ message: 'Brand deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete brand: ' + err.message });
  }
});

// List Categories
router.get('/categories', requireAuth, async (_req, res: Response) => {
  try {
    const result = await pgClient.query(`
      SELECT c.id, c.name, c.low_stock_limit, c.created_at,
             COUNT(p.id)::int as product_count,
             COALESCE(SUM(p.total_stock), 0)::int as total_units
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id AND p.active = true
      GROUP BY c.id, c.name, c.low_stock_limit, c.created_at
      ORDER BY c.name ASC
    `);
    res.json({ categories: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch categories: ' + err.message });
  }
});

// Create Category (Admin Only)
router.post('/categories', requireAuth, requireAdmin, async (req, res: Response) => {
  try {
    const { name, lowStockLimit, low_stock_limit } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Category name is required.' });
    }

    const check = await pgClient.query('SELECT id FROM categories WHERE LOWER(name) = LOWER($1)', [name.trim()]);
    if (check.rows.length > 0) {
      return res.status(400).json({ error: 'Category with this name already exists.' });
    }

    let thresholdVal: number | null = null;
    const rawLimit = low_stock_limit !== undefined ? low_stock_limit : lowStockLimit;
    if (rawLimit !== undefined && rawLimit !== null && rawLimit !== '') {
      const parsed = parseInt(String(rawLimit), 10);
      if (!isNaN(parsed) && parsed > 0) {
        thresholdVal = parsed;
      }
    }

    const result = await pgClient.query(
      'INSERT INTO categories (name, low_stock_limit) VALUES ($1, $2) RETURNING *',
      [name.trim(), thresholdVal]
    );
    res.status(201).json({ category: result.rows[0], message: 'Category added successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create category: ' + err.message });
  }
});

// Update Category (Admin Only)
router.put('/categories/:id', requireAuth, requireAdmin, async (req, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, lowStockLimit, low_stock_limit } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Category name is required.' });
    }

    let thresholdVal: number | null = null;
    const rawLimit = low_stock_limit !== undefined ? low_stock_limit : lowStockLimit;
    if (rawLimit !== undefined && rawLimit !== null && rawLimit !== '') {
      const parsed = parseInt(String(rawLimit), 10);
      if (!isNaN(parsed) && parsed > 0) {
        thresholdVal = parsed;
      }
    }

    const result = await pgClient.query(
      'UPDATE categories SET name = $1, low_stock_limit = $2 WHERE id = $3 RETURNING *',
      [name.trim(), thresholdVal, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found.' });
    }
    res.json({ category: result.rows[0], message: 'Category updated.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update category: ' + err.message });
  }
});

// Delete Category (Admin Only)
router.delete('/categories/:id', requireAuth, requireAdmin, async (req, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const category = await pgClient.query('SELECT name FROM categories WHERE id = $1', [id]);
    if (category.rows.length > 0) {
      const cName = (category.rows[0] as any).name.toLowerCase();
      if (cName === 'misc') {
        return res.status(400).json({ error: 'The default system category "Misc" cannot be deleted.' });
      }
    }

    await pgClient.query('UPDATE products SET category_id = NULL WHERE category_id = $1', [id]);
    await pgClient.query('DELETE FROM categories WHERE id = $1', [id]);
    res.json({ message: 'Category deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete category: ' + err.message });
  }
});

export default router;
