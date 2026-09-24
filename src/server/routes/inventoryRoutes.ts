import { Router } from 'express';
import type { Response } from 'express';
import { pgClient } from '../../db/index.ts';
import { requireAuth, requireAdmin } from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';

const router = Router();

// GET /api/inventory/ledger - Stock Movements Audit Trail
router.get('/ledger', requireAuth, async (req, res: Response) => {
  try {
    const { productId, movementType, limit = 100 } = req.query;

    let query = `
      SELECT sm.*, COALESCE(p.article, p.name) as article, COALESCE(p.article, p.name) as product_name, p.sku, p.barcode, u.name as user_name
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      JOIN users u ON sm.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (productId && !isNaN(Number(productId))) {
      params.push(Number(productId));
      query += ` AND sm.product_id = $${params.length}`;
    }

    if (movementType && typeof movementType === 'string') {
      params.push(movementType);
      query += ` AND sm.movement_type = $${params.length}`;
    }

    query += ` ORDER BY sm.id DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(String(limit), 10) || 100);

    const result = await pgClient.query(query, params);
    res.json({ movements: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch stock movements: ' + err.message });
  }
});

// POST /api/inventory/adjust - Manual Stock Adjustment (Admin Only)
router.post('/adjust', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { productId, newStock, notes } = req.body;

  if (!productId) {
    return res.status(400).json({ error: 'Product ID is required.' });
  }
  if (newStock === undefined || isNaN(Number(newStock)) || Number(newStock) < 0) {
    return res.status(400).json({ error: 'Valid non-negative new stock count is required.' });
  }
  if (!notes || !notes.trim()) {
    return res.status(400).json({ error: 'Audit reason/notes is required for manual stock adjustment.' });
  }

  const targetStock = parseInt(newStock, 10);

  await pgClient.query('BEGIN');

  try {
    const prodRes = await pgClient.query<{ id: number; name: string; article: string; total_stock: number }>(
      'SELECT id, name, article, total_stock FROM products WHERE id = $1 FOR UPDATE',
      [productId]
    );

    if (prodRes.rows.length === 0) {
      throw new Error('Product not found.');
    }

    const prod = prodRes.rows[0];
    const prevStock = prod.total_stock;
    const qtyChange = targetStock - prevStock;

    if (qtyChange === 0) {
      throw new Error('New stock count is identical to existing stock count.');
    }

    // Update product stock
    await pgClient.query(
      'UPDATE products SET total_stock = $1, updated_at = NOW() WHERE id = $2',
      [targetStock, prod.id]
    );

    // Record in Stock Movement Ledger
    await pgClient.query(
      `INSERT INTO stock_movements (
        product_id, qty_change, prev_stock, new_stock, movement_type, reference_id, user_id, notes
      ) VALUES ($1, $2, $3, $4, 'ADJUSTMENT', 'MANUAL-ADJUST', $5, $6)`,
      [
        prod.id,
        qtyChange,
        prevStock,
        targetStock,
        req.user!.id,
        notes.trim(),
      ]
    );

    await pgClient.query('COMMIT');

    const prodIdentifier = prod.article || prod.name;
    res.json({
      message: `Stock for "${prodIdentifier}" successfully adjusted from ${prevStock} to ${targetStock}.`,
      prevStock,
      newStock: targetStock,
      qtyChange,
    });
  } catch (err: any) {
    await pgClient.query('ROLLBACK');
    res.status(400).json({ error: err.message || 'Failed to adjust stock.' });
  }
});

export default router;
