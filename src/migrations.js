const migrations = [
  {
    id: '001_init_core_tables',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          main_contact_type TEXT NOT NULL CHECK (main_contact_type IN ('phone', 'line', 'facebook')),
          main_contact_value TEXT NOT NULL,
          other_contacts TEXT,
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS addresses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_id INTEGER NOT NULL,
          label TEXT,
          full_address TEXT NOT NULL,
          extra_info TEXT,
          latitude REAL,
          longitude REAL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          base_price REAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'promotion')),
          promo_price REAL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_code TEXT NOT NULL UNIQUE,
          customer_id INTEGER NOT NULL,
          address_id INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          delivery_date TEXT,
          delivery_time_slot TEXT,
          payment_method TEXT DEFAULT 'transfer',
          payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'cod', 'refunded')),
          order_status TEXT NOT NULL DEFAULT 'pending' CHECK (order_status IN ('pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled')),
          cancel_reason_code INTEGER,
          cancel_reason_text TEXT,
          admin_note TEXT,
          delivery_order_index INTEGER,
          last_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
          FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE RESTRICT
        );

        CREATE TABLE IF NOT EXISTS order_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL,
          product_id INTEGER NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 1,
          unit_price REAL NOT NULL,
          discount REAL NOT NULL DEFAULT 0,
          line_total REAL NOT NULL,
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
        );

        CREATE TABLE IF NOT EXISTS order_sequences (
          period TEXT PRIMARY KEY,
          last_number INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS schema_migrations (
          id TEXT PRIMARY KEY,
          applied_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_addresses_customer ON addresses(customer_id);
        CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status);
        CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
        CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(delivery_date);
        CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

        CREATE TRIGGER IF NOT EXISTS trg_customers_updated_at
        AFTER UPDATE ON customers
        FOR EACH ROW
        WHEN OLD.updated_at = NEW.updated_at
        BEGIN
          UPDATE customers
          SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = NEW.id AND updated_at = OLD.updated_at;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_addresses_updated_at
        AFTER UPDATE ON addresses
        FOR EACH ROW
        WHEN OLD.updated_at = NEW.updated_at
        BEGIN
          UPDATE addresses
          SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = NEW.id AND updated_at = OLD.updated_at;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_products_updated_at
        AFTER UPDATE ON products
        FOR EACH ROW
        WHEN OLD.updated_at = NEW.updated_at
        BEGIN
          UPDATE products
          SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = NEW.id AND updated_at = OLD.updated_at;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_orders_last_updated_at
        AFTER UPDATE ON orders
        FOR EACH ROW
        WHEN OLD.last_updated_at = NEW.last_updated_at
        BEGIN
          UPDATE orders
          SET last_updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = NEW.id AND last_updated_at = OLD.last_updated_at;
        END;
      `);
    },
  },
];

const ensureMigrationsTable = (db) => {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);`,
  );
};

const getAppliedMigrations = (db) => {
  ensureMigrationsTable(db);
  const rows = db.prepare('SELECT id FROM schema_migrations').all();
  return new Set(rows.map((row) => row.id));
};

const getMigrationState = (db) => {
  const appliedSet = getAppliedMigrations(db);
  const applied = Array.from(appliedSet).sort();
  const pending = migrations.filter((migration) => !appliedSet.has(migration.id)).map((m) => m.id);
  return { applied, pending };
};

const applyMigration = (db, migration) => {
  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    migration.up(db);
    const stmt = db.prepare(
      'INSERT INTO schema_migrations (id, applied_at) VALUES (?, datetime(\'now\'))',
    );
    stmt.run(migration.id);
    db.exec('COMMIT;');
    // eslint-disable-next-line no-console
    console.log(`[migration] applied ${migration.id}`);
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
};

const runMigrations = (db) => {
  ensureMigrationsTable(db);
  const appliedSet = getAppliedMigrations(db);

  migrations.forEach((migration) => {
    if (appliedSet.has(migration.id)) {
      return;
    }

    applyMigration(db, migration);
  });
};

module.exports = {
  migrations,
  runMigrations,
  getMigrationState,
};
