// Simple helper to parse integers safely
const toInteger = (value) => {
  const num = Number.parseInt(value, 10);
  return Number.isNaN(num) ? null : num;
};

const allowedPaymentStatus = new Set(['unpaid', 'paid', 'cod', 'refunded']);
const allowedOrderStatus = new Set([
  'pending',
  'confirmed',
  'preparing',
  'out_for_delivery',
  'delivered',
  'cancelled',
]);
const allowedContactTypes = new Set(['phone', 'line', 'facebook']);
const allowedProductStatus = new Set(['active', 'inactive', 'promotion']);

const getCurrentPeriod = () => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
};

const generateOrderCode = (db) => {
  const period = getCurrentPeriod();
  const existing = db.prepare('SELECT last_number FROM order_sequences WHERE period = ?').get(period);
  let nextNumber = 1;

  if (!existing) {
    db.prepare('INSERT INTO order_sequences (period, last_number) VALUES (?, ?)').run(period, nextNumber);
  } else {
    nextNumber = existing.last_number + 1;
    db.prepare('UPDATE order_sequences SET last_number = ? WHERE period = ?').run(nextNumber, period);
  }

  return `N-${String(nextNumber).padStart(4, '0')}`;
};

const ensureCustomerExists = (db, customerId) => {
  const id = toInteger(customerId);
  if (!id) return null;
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
};

const ensureAddressExists = (db, addressId) => {
  const id = toInteger(addressId);
  if (!id) return null;
  return db.prepare('SELECT * FROM addresses WHERE id = ?').get(id);
};

const fetchOrderDetail = (db, orderId) => {
  const order = db
    .prepare(
      `SELECT o.*, c.name AS customer_name, c.main_contact_type, c.main_contact_value,
              a.full_address, a.extra_info, a.latitude, a.longitude
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN addresses a ON a.id = o.address_id
       WHERE o.id = ?`,
    )
    .get(orderId);

  if (!order) return null;

  const items = db
    .prepare(
      `SELECT oi.id, oi.product_id, p.name AS product_name, oi.quantity, oi.unit_price, oi.discount, oi.line_total
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?
       ORDER BY oi.id ASC`,
    )
    .all(orderId);

  return { order, items };
};

const buildSearchClause = (searchParams, clauses, params) => {
  const q = (searchParams.get('q') || '').trim();
  if (q) {
    clauses.push(
      `(c.name LIKE ? OR c.main_contact_value LIKE ? OR o.order_code LIKE ? OR a.full_address LIKE ?)`,
    );
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
};

const buildStatusFilter = (searchParams, key, clauses, params) => {
  const raw = (searchParams.get(key) || '').trim();
  if (!raw) return;
  const list = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!list.length) return;

  const placeholders = list.map(() => '?').join(',');
  clauses.push(`o.${key} IN (${placeholders})`);
  params.push(...list);
};

const registerRoutes = (addRoute) => {
  // Customers listing
  addRoute('GET', '/api/customers', (req, res, { url, sendJson, sendError, db }) => {
    const { searchParams } = url;
    const limitParam = toInteger(searchParams.get('limit'));
    const limit = Math.min(limitParam || 50, 200);
    const q = (searchParams.get('q') || '').trim();

    let sql =
      'SELECT id, name, main_contact_type, main_contact_value, other_contacts, notes, created_at, updated_at FROM customers';
    const params = [];

    if (q) {
      sql += ' WHERE name LIKE ? OR main_contact_value LIKE ?';
      params.push(`%${q}%`, `%${q}%`);
    }

    sql += ' ORDER BY id DESC LIMIT ?';
    params.push(limit);

    const customers = db.prepare(sql).all(...params);
    sendJson(res, 200, { customers });
  });

  // Customer detail with addresses
  addRoute('GET', '/api/customers/:id', (_req, res, { params, sendJson, sendError, db }) => {
    const id = toInteger(params.id);
    if (!id) {
      sendError(res, 400, 'Invalid customer id');
      return;
    }

    const customer = db
      .prepare(
        'SELECT id, name, main_contact_type, main_contact_value, other_contacts, notes, created_at, updated_at FROM customers WHERE id = ?',
      )
      .get(id);

    if (!customer) {
      sendError(res, 404, 'Customer not found');
      return;
    }

    const addresses = db
      .prepare(
        'SELECT id, customer_id, label, full_address, extra_info, latitude, longitude, created_at, updated_at FROM addresses WHERE customer_id = ? ORDER BY id DESC',
      )
      .all(id);

    sendJson(res, 200, { customer, addresses });
  });

  addRoute('POST', '/api/customers', async (req, res, { parseJsonBody, sendJson, sendError, db }) => {
    try {
      const body = await parseJsonBody(req);
      const { name, main_contact_type: contactType, main_contact_value: contactValue, other_contacts, notes } = body;

      if (!name || !contactType || !contactValue) {
        sendError(res, 400, 'name, main_contact_type, and main_contact_value are required');
        return;
      }

      if (!allowedContactTypes.has(contactType)) {
        sendError(res, 400, 'Invalid main_contact_type');
        return;
      }

      const stmt = db.prepare(
        'INSERT INTO customers (name, main_contact_type, main_contact_value, other_contacts, notes) VALUES (?, ?, ?, ?, ?)',
      );
      const result = stmt.run(name, contactType, contactValue, other_contacts || null, notes || null);
      const customer = db
        .prepare(
          'SELECT id, name, main_contact_type, main_contact_value, other_contacts, notes, created_at, updated_at FROM customers WHERE id = ?',
        )
        .get(result.lastInsertRowid);

      sendJson(res, 201, { customer });
    } catch (err) {
      console.error('[customers:create] failed', err);
      sendError(res, 400, 'Invalid JSON or request payload');
    }
  });

  addRoute('PATCH', '/api/customers/:id', async (req, res, { params, parseJsonBody, sendJson, sendError, db }) => {
    const id = toInteger(params.id);
    if (!id) {
      sendError(res, 400, 'Invalid customer id');
      return;
    }

    const existing = ensureCustomerExists(db, id);
    if (!existing) {
      sendError(res, 404, 'Customer not found');
      return;
    }

    try {
      const body = await parseJsonBody(req);
      const updates = [];
      const values = [];

      if (body.name) {
        updates.push('name = ?');
        values.push(body.name);
      }

      if (body.main_contact_type) {
        if (!allowedContactTypes.has(body.main_contact_type)) {
          sendError(res, 400, 'Invalid main_contact_type');
          return;
        }
        updates.push('main_contact_type = ?');
        values.push(body.main_contact_type);
      }

      if (body.main_contact_value) {
        updates.push('main_contact_value = ?');
        values.push(body.main_contact_value);
      }

      if (body.other_contacts !== undefined) {
        updates.push('other_contacts = ?');
        values.push(body.other_contacts || null);
      }

      if (body.notes !== undefined) {
        updates.push('notes = ?');
        values.push(body.notes || null);
      }

      if (!updates.length) {
        sendError(res, 400, 'No fields to update');
        return;
      }

      const sql = `UPDATE customers SET ${updates.join(', ')} WHERE id = ?`;
      values.push(id);
      db.prepare(sql).run(...values);

      const customer = db
        .prepare(
          'SELECT id, name, main_contact_type, main_contact_value, other_contacts, notes, created_at, updated_at FROM customers WHERE id = ?',
        )
        .get(id);

      sendJson(res, 200, { customer });
    } catch (err) {
      console.error('[customers:update] failed', err);
      sendError(res, 400, 'Invalid JSON or request payload');
    }
  });

  // Addresses
  addRoute('GET', '/api/customers/:id/addresses', (_req, res, { params, sendJson, sendError, db }) => {
    const customerId = toInteger(params.id);
    if (!customerId) {
      sendError(res, 400, 'Invalid customer id');
      return;
    }

    const customer = ensureCustomerExists(db, customerId);
    if (!customer) {
      sendError(res, 404, 'Customer not found');
      return;
    }

    const addresses = db
      .prepare(
        'SELECT id, customer_id, label, full_address, extra_info, latitude, longitude, created_at, updated_at FROM addresses WHERE customer_id = ? ORDER BY id DESC',
      )
      .all(customerId);

    sendJson(res, 200, { customer_id: customerId, addresses });
  });

  addRoute('POST', '/api/customers/:id/addresses', async (req, res, { params, parseJsonBody, sendJson, sendError, db }) => {
    const customerId = toInteger(params.id);
    if (!customerId) {
      sendError(res, 400, 'Invalid customer id');
      return;
    }

    const customer = ensureCustomerExists(db, customerId);
    if (!customer) {
      sendError(res, 404, 'Customer not found');
      return;
    }

    try {
      const body = await parseJsonBody(req);
      const { label, full_address, extra_info, latitude, longitude } = body;

      if (!full_address) {
        sendError(res, 400, 'full_address is required');
        return;
      }

      const stmt = db.prepare(
        'INSERT INTO addresses (customer_id, label, full_address, extra_info, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?)',
      );
      const result = stmt.run(
        customerId,
        label || null,
        full_address,
        extra_info || null,
        latitude || null,
        longitude || null,
      );

      const address = db
        .prepare(
          'SELECT id, customer_id, label, full_address, extra_info, latitude, longitude, created_at, updated_at FROM addresses WHERE id = ?',
        )
        .get(result.lastInsertRowid);

      sendJson(res, 201, { address });
    } catch (err) {
      console.error('[addresses:create] failed', err);
      sendError(res, 400, 'Invalid JSON or request payload');
    }
  });

  addRoute('PATCH', '/api/addresses/:id', async (req, res, { params, parseJsonBody, sendJson, sendError, db }) => {
    const addressId = toInteger(params.id);
    if (!addressId) {
      sendError(res, 400, 'Invalid address id');
      return;
    }

    const existing = ensureAddressExists(db, addressId);
    if (!existing) {
      sendError(res, 404, 'Address not found');
      return;
    }

    try {
      const body = await parseJsonBody(req);
      const updates = [];
      const values = [];

      ['label', 'full_address', 'extra_info', 'latitude', 'longitude'].forEach((key) => {
        if (body[key] !== undefined) {
          updates.push(`${key} = ?`);
          values.push(body[key] === '' ? null : body[key]);
        }
      });

      if (!updates.length) {
        sendError(res, 400, 'No fields to update');
        return;
      }

      const sql = `UPDATE addresses SET ${updates.join(', ')} WHERE id = ?`;
      values.push(addressId);
      db.prepare(sql).run(...values);

      const address = db
        .prepare(
          'SELECT id, customer_id, label, full_address, extra_info, latitude, longitude, created_at, updated_at FROM addresses WHERE id = ?',
        )
        .get(addressId);

      sendJson(res, 200, { address });
    } catch (err) {
      console.error('[addresses:update] failed', err);
      sendError(res, 400, 'Invalid JSON or request payload');
    }
  });

  addRoute('DELETE', '/api/addresses/:id', (_req, res, { params, sendJson, sendError, db }) => {
    const addressId = toInteger(params.id);
    if (!addressId) {
      sendError(res, 400, 'Invalid address id');
      return;
    }

    const existing = ensureAddressExists(db, addressId);
    if (!existing) {
      sendError(res, 404, 'Address not found');
      return;
    }

    db.prepare('DELETE FROM addresses WHERE id = ?').run(addressId);
    sendJson(res, 200, { deleted: true });
  });

  // Products
  addRoute('GET', '/api/products', (req, res, { url, sendJson, db }) => {
    const { searchParams } = url;
    const statusRaw = (searchParams.get('status') || '').trim();
    const search = (searchParams.get('q') || '').trim();

    const clauses = [];
    const params = [];

    if (statusRaw) {
      const statuses = statusRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (statuses.length) {
        const placeholders = statuses.map(() => '?').join(',');
        clauses.push(`status IN (${placeholders})`);
        params.push(...statuses);
      }
    }

    if (search) {
      clauses.push('name LIKE ?');
      params.push(`%${search}%`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const sql = `SELECT id, name, description, base_price, status, promo_price, created_at, updated_at FROM products ${where} ORDER BY id DESC`;
    const products = db.prepare(sql).all(...params);
    sendJson(res, 200, { products });
  });

  addRoute('POST', '/api/products', async (req, res, { parseJsonBody, sendJson, sendError, db }) => {
    try {
      const body = await parseJsonBody(req);
      const { name, description, base_price, status, promo_price } = body;

      if (!name) {
        sendError(res, 400, 'name is required');
        return;
      }

      const effectiveStatus = status || 'active';
      if (!allowedProductStatus.has(effectiveStatus)) {
        sendError(res, 400, 'Invalid status');
        return;
      }

      const stmt = db.prepare(
        'INSERT INTO products (name, description, base_price, status, promo_price) VALUES (?, ?, ?, ?, ?)',
      );
      const result = stmt.run(name, description || null, Number(base_price) || 0, effectiveStatus, promo_price || null);

      const product = db
        .prepare(
          'SELECT id, name, description, base_price, status, promo_price, created_at, updated_at FROM products WHERE id = ?',
        )
        .get(result.lastInsertRowid);

      sendJson(res, 201, { product });
    } catch (err) {
      console.error('[products:create] failed', err);
      sendError(res, 400, 'Invalid JSON or request payload');
    }
  });

  addRoute('PATCH', '/api/products/:id', async (req, res, { params, parseJsonBody, sendJson, sendError, db }) => {
    const productId = toInteger(params.id);
    if (!productId) {
      sendError(res, 400, 'Invalid product id');
      return;
    }

    const existing = db
      .prepare('SELECT id, name, description, base_price, status, promo_price FROM products WHERE id = ?')
      .get(productId);
    if (!existing) {
      sendError(res, 404, 'Product not found');
      return;
    }

    try {
      const body = await parseJsonBody(req);
      const updates = [];
      const values = [];

      if (body.name !== undefined) {
        updates.push('name = ?');
        values.push(body.name);
      }

      if (body.description !== undefined) {
        updates.push('description = ?');
        values.push(body.description || null);
      }

      if (body.base_price !== undefined) {
        updates.push('base_price = ?');
        values.push(Number(body.base_price) || 0);
      }

      if (body.status !== undefined) {
        if (!allowedProductStatus.has(body.status)) {
          sendError(res, 400, 'Invalid status');
          return;
        }
        updates.push('status = ?');
        values.push(body.status);
      }

      if (body.promo_price !== undefined) {
        updates.push('promo_price = ?');
        values.push(body.promo_price || null);
      }

      if (!updates.length) {
        sendError(res, 400, 'No fields to update');
        return;
      }

      const sql = `UPDATE products SET ${updates.join(', ')} WHERE id = ?`;
      values.push(productId);
      db.prepare(sql).run(...values);

      const product = db
        .prepare(
          'SELECT id, name, description, base_price, status, promo_price, created_at, updated_at FROM products WHERE id = ?',
        )
        .get(productId);

      sendJson(res, 200, { product });
    } catch (err) {
      console.error('[products:update] failed', err);
      sendError(res, 400, 'Invalid JSON or request payload');
    }
  });

  // Orders
  addRoute('GET', '/api/orders', (req, res, { url, sendJson, sendError, db }) => {
    const { searchParams } = url;
    const limitParam = toInteger(searchParams.get('limit'));
    const limit = Math.min(limitParam || 50, 200);

    const clauses = [];
    const params = [];

    buildSearchClause(searchParams, clauses, params);
    buildStatusFilter(searchParams, 'order_status', clauses, params);
    buildStatusFilter(searchParams, 'payment_status', clauses, params);

    const paymentMethod = (searchParams.get('payment_method') || '').trim();
    if (paymentMethod) {
      clauses.push('o.payment_method = ?');
      params.push(paymentMethod);
    }

    const createdFrom = searchParams.get('created_from');
    const createdTo = searchParams.get('created_to');
    if (createdFrom) {
      clauses.push('o.created_at >= ?');
      params.push(createdFrom);
    }
    if (createdTo) {
      clauses.push('o.created_at <= ?');
      params.push(createdTo);
    }

    const deliveryFrom = searchParams.get('delivery_from');
    const deliveryTo = searchParams.get('delivery_to');
    if (deliveryFrom) {
      clauses.push('o.delivery_date >= ?');
      params.push(deliveryFrom);
    }
    if (deliveryTo) {
      clauses.push('o.delivery_date <= ?');
      params.push(deliveryTo);
    }

    const includeAddress = searchParams.get('include_address') === '1';

    const selectFields = [
      'o.id',
      'o.order_code',
      'o.customer_id',
      'c.name AS customer_name',
      'c.main_contact_type',
      'c.main_contact_value',
      'o.created_at',
      'o.delivery_date',
      'o.delivery_time_slot',
      'o.delivery_order_index',
      'o.payment_method',
      'o.payment_status',
      'o.order_status',
    ];

    if (includeAddress) {
      selectFields.push('a.full_address', 'a.extra_info', 'a.latitude', 'a.longitude');
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const sort =
      searchParams.get('sort') === 'delivery'
        ? 'ORDER BY o.delivery_date ASC, CASE WHEN o.delivery_order_index IS NULL THEN 1 ELSE 0 END, o.delivery_order_index ASC, o.created_at ASC'
        : 'ORDER BY o.created_at DESC';

    const sql = `
      SELECT
        ${selectFields.join(', ')}
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      JOIN addresses a ON a.id = o.address_id
      ${where}
      ${sort}
      LIMIT ?
    `;

    params.push(limit);

    const orders = db.prepare(sql).all(...params);
    sendJson(res, 200, { orders });
  });

  addRoute('GET', '/api/orders/:id', (_req, res, { params, sendJson, sendError, db }) => {
    const orderId = toInteger(params.id);
    if (!orderId) {
      sendError(res, 400, 'Invalid order id');
      return;
    }

    const detail = fetchOrderDetail(db, orderId);
    if (!detail) {
      sendError(res, 404, 'Order not found');
      return;
    }

    sendJson(res, 200, detail);
  });

  addRoute('GET', '/api/order-status', (req, res, { url, sendJson, sendError, db }) => {
    const { searchParams } = url;
    const orderCode = (searchParams.get('order_code') || '').trim();
    const phone = (searchParams.get('phone') || '').trim();

    if (!orderCode || !phone) {
      sendError(res, 400, 'order_code and phone are required');
      return;
    }

    const order = db
      .prepare(
        `SELECT o.*, a.full_address
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         JOIN addresses a ON a.id = o.address_id
         WHERE o.order_code = ? AND c.main_contact_type = 'phone' AND c.main_contact_value = ?`,
      )
      .get(orderCode, phone);

    if (!order) {
      sendError(res, 404, 'Order not found');
      return;
    }

    const items = db
      .prepare(
        `SELECT oi.id, oi.product_id, p.name AS product_name, oi.quantity
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = ?
         ORDER BY oi.id ASC`,
      )
      .all(order.id);

    sendJson(res, 200, { order, items });
  });

  addRoute('PATCH', '/api/orders/:id', async (req, res, { params, parseJsonBody, sendJson, sendError, db }) => {
    const orderId = toInteger(params.id);
    if (!orderId) {
      sendError(res, 400, 'Invalid order id');
      return;
    }

    const existing = fetchOrderDetail(db, orderId);
    if (!existing) {
      sendError(res, 404, 'Order not found');
      return;
    }

    try {
      const body = await parseJsonBody(req);
      const updates = [];
      const values = [];

      if (body.order_status) {
        if (!allowedOrderStatus.has(body.order_status)) {
          sendError(res, 400, 'Invalid order_status');
          return;
        }
        updates.push('order_status = ?');
        values.push(body.order_status);

        if (body.order_status !== 'cancelled' && body.cancel_reason_code === undefined) {
          updates.push('cancel_reason_code = NULL');
          updates.push('cancel_reason_text = NULL');
        }
      }

      if (body.payment_status) {
        if (!allowedPaymentStatus.has(body.payment_status)) {
          sendError(res, 400, 'Invalid payment_status');
          return;
        }
        updates.push('payment_status = ?');
        values.push(body.payment_status);
      }

      if (body.payment_method) {
        updates.push('payment_method = ?');
        values.push(body.payment_method);
      }

      if (body.delivery_date !== undefined) {
        updates.push('delivery_date = ?');
        values.push(body.delivery_date || null);
      }

      if (body.delivery_time_slot !== undefined) {
        updates.push('delivery_time_slot = ?');
        values.push(body.delivery_time_slot || null);
      }

      if (body.delivery_order_index !== undefined) {
        const idx = toInteger(body.delivery_order_index);
        updates.push('delivery_order_index = ?');
        values.push(idx !== null ? idx : null);
      }

      if (body.admin_note !== undefined) {
        updates.push('admin_note = ?');
        values.push(body.admin_note || null);
      }

      if (body.cancel_reason_code !== undefined) {
        const code = toInteger(body.cancel_reason_code);
        if (code !== null && (code < 1 || code > 5)) {
          sendError(res, 400, 'cancel_reason_code must be between 1 and 5');
          return;
        }
        updates.push('cancel_reason_code = ?');
        values.push(code);
      }

      if (body.cancel_reason_text !== undefined) {
        updates.push('cancel_reason_text = ?');
        values.push(body.cancel_reason_text || null);
      }

      const requestingCancel = body.order_status === 'cancelled';
      if (requestingCancel) {
        const code = body.cancel_reason_code ?? existing.order.cancel_reason_code;
        if (!code) {
          sendError(res, 400, 'cancel_reason_code is required when cancelling');
          return;
        }
      }

      if (!updates.length) {
        sendError(res, 400, 'No valid fields to update');
        return;
      }

      updates.push('last_updated_at = ?');
      values.push(new Date().toISOString());

      const sql = `UPDATE orders SET ${updates.join(', ')} WHERE id = ?`;

      db.exec('BEGIN IMMEDIATE TRANSACTION;');
      try {
        db.prepare(sql).run(...values, orderId);
        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }

      const detail = fetchOrderDetail(db, orderId);
      sendJson(res, 200, detail);
    } catch (err) {
      console.error('[orders:update] failed', err);
      sendError(res, 400, 'Invalid JSON or request payload');
    }
  });

  addRoute('POST', '/api/orders', async (req, res, { parseJsonBody, sendJson, sendError, db }) => {
    try {
      const body = await parseJsonBody(req);
      const customerId = toInteger(body.customer_id);
      const addressId = toInteger(body.address_id);
      const deliveryDate = body.delivery_date || null;
      const deliveryTimeSlot = body.delivery_time_slot || null;
      const paymentMethod = body.payment_method || 'transfer';
      const paymentStatus = body.payment_status || 'unpaid';
      const orderStatus = body.order_status || 'pending';
      const adminNote = body.admin_note || null;
      const deliveryOrderIndex = body.delivery_order_index || null;
      const cancelReasonCode = body.cancel_reason_code || null;
      const cancelReasonText = body.cancel_reason_text || null;
      const items = Array.isArray(body.items) ? body.items : [];

      if (!customerId || !addressId) {
        sendError(res, 400, 'customer_id and address_id are required');
        return;
      }

      if (!allowedPaymentStatus.has(paymentStatus)) {
        sendError(res, 400, 'Invalid payment_status');
        return;
      }

      if (!allowedOrderStatus.has(orderStatus)) {
        sendError(res, 400, 'Invalid order_status');
        return;
      }

      if (!items.length) {
        sendError(res, 400, 'At least one order item is required');
        return;
      }

      const customer = ensureCustomerExists(db, customerId);
      if (!customer) {
        sendError(res, 404, 'Customer not found');
        return;
      }

      const address = ensureAddressExists(db, addressId);
      if (!address) {
        sendError(res, 404, 'Address not found');
        return;
      }

      if (address.customer_id !== customerId) {
        sendError(res, 400, 'address does not belong to the customer');
        return;
      }

      db.exec('BEGIN IMMEDIATE TRANSACTION;');
      try {
        const orderCode = generateOrderCode(db);
        const createdAt = new Date().toISOString();

        const insertOrder = db.prepare(
          `INSERT INTO orders (
            order_code,
            customer_id,
            address_id,
            created_at,
            delivery_date,
            delivery_time_slot,
            payment_method,
            payment_status,
            order_status,
            cancel_reason_code,
            cancel_reason_text,
            admin_note,
            delivery_order_index,
            last_updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );

        const result = insertOrder.run(
          orderCode,
          customerId,
          addressId,
          createdAt,
          deliveryDate,
          deliveryTimeSlot,
          paymentMethod,
          paymentStatus,
          orderStatus,
          cancelReasonCode,
          cancelReasonText,
          adminNote,
          deliveryOrderIndex,
          createdAt,
        );

        const orderId = result.lastInsertRowid;

        const insertItem = db.prepare(
          'INSERT INTO order_items (order_id, product_id, quantity, unit_price, discount, line_total) VALUES (?, ?, ?, ?, ?, ?)',
        );

        for (const item of items) {
          const productId = toInteger(item.product_id);
          const quantity = toInteger(item.quantity) || 1;
          if (!productId) {
            throw new Error('Invalid product_id in items');
          }

          const product = db
            .prepare('SELECT id, name, base_price, status, promo_price FROM products WHERE id = ?')
            .get(productId);

          if (!product) {
            throw new Error(`Product ${productId} not found`);
          }

          const unitPrice =
            item.unit_price !== undefined && item.unit_price !== null
              ? Number(item.unit_price)
              : product.status === 'promotion' && product.promo_price
                ? Number(product.promo_price)
                : Number(product.base_price);

          const discount = Number(item.discount) || 0;
          const lineTotal = (unitPrice - discount) * quantity;
          insertItem.run(orderId, productId, quantity, unitPrice, discount, lineTotal);
        }

        db.exec('COMMIT;');

        const order = db
          .prepare(
            'SELECT id, order_code, customer_id, address_id, created_at, delivery_date, delivery_time_slot, payment_method, payment_status, order_status, admin_note, delivery_order_index, last_updated_at FROM orders WHERE id = ?',
          )
          .get(orderId);

        sendJson(res, 201, { order });
      } catch (err) {
        db.exec('ROLLBACK;');
        console.error('[orders:create] failed', err);
        sendError(res, 400, err.message || 'Failed to create order');
      }
    } catch (err) {
      console.error('[orders:create] invalid payload', err);
      sendError(res, 400, 'Invalid JSON or request payload');
    }
  });
};

module.exports = registerRoutes;
