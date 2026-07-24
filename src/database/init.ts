import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import { ensureCategoriesTable } from './categories';
import { seedSampleData } from './seed';

interface TableColumnInfo {
  name: string;
}

/** 当前数据库结构版本号，备份/恢复时会用来校验兼容性。 */
export const SCHEMA_VERSION = 16;

async function getTableColumnNames(
  db: SQLiteDatabase,
  tableName: string,
): Promise<Set<string>> {
  const rows = await db.getAllAsync<TableColumnInfo>(`PRAGMA table_info(${tableName})`);
  return new Set(rows.map((row) => row.name));
}

async function ensureColumn(
  db: SQLiteDatabase,
  tableName: string,
  columnName: string,
  definition: string,
): Promise<void> {
  const columns = await getTableColumnNames(db, tableName);
  if (columns.has(columnName)) {
    return;
  }

  await db.execAsync(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
}

async function rebuildOneTimeItemsTable(current: SQLiteDatabase): Promise<void> {
  await current.execAsync(`
    CREATE TABLE IF NOT EXISTS OneTimeItems_new (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      name               TEXT    NOT NULL,
      category           TEXT,
      icon               TEXT,
      image_uri          TEXT,
      total_price        REAL    NOT NULL CHECK(total_price > 0),
      buy_date           TEXT    NOT NULL,
      status             TEXT    NOT NULL CHECK(status IN ('unredeemed', 'active', 'archived')),
      salvage_value      REAL    DEFAULT 0 CHECK(salvage_value >= 0),
      active_days        INTEGER NOT NULL DEFAULT 0 CHECK(active_days >= 0),
      active_start_date  TEXT,
      archived_reason    TEXT,
      is_installment     INTEGER DEFAULT 0 CHECK(is_installment IN (0, 1)),
      installment_months INTEGER,
      monthly_payment    REAL,
      down_payment       REAL    DEFAULT 0,
      end_date           TEXT,
      CHECK(is_installment = 1 OR (installment_months IS NULL AND monthly_payment IS NULL)),
      CHECK(is_installment = 0 OR (
        installment_months IS NOT NULL
        AND installment_months > 0
        AND monthly_payment IS NOT NULL
        AND monthly_payment > 0
      )),
      CHECK(status != 'unredeemed' OR is_installment = 1),
      CHECK(status = 'archived' OR end_date IS NULL),
      CHECK(status != 'archived' OR end_date IS NOT NULL)
    );

    INSERT INTO OneTimeItems_new (
      id,
      name,
      category,
      icon,
      image_uri,
      total_price,
      buy_date,
      status,
      salvage_value,
      active_days,
      active_start_date,
      archived_reason,
      is_installment,
      installment_months,
      monthly_payment,
      down_payment,
      end_date
    )
    SELECT
      id,
      name,
      category,
      icon,
      image_uri,
      total_price,
      buy_date,
      status,
      salvage_value,
      active_days,
      active_start_date,
      archived_reason,
      is_installment,
      installment_months,
      monthly_payment,
      down_payment,
      end_date
    FROM OneTimeItems;

    DROP TABLE OneTimeItems;
    ALTER TABLE OneTimeItems_new RENAME TO OneTimeItems;

    CREATE INDEX IF NOT EXISTS idx_one_time_items_status ON OneTimeItems(status);
    CREATE INDEX IF NOT EXISTS idx_one_time_items_buy_date ON OneTimeItems(buy_date);
  `);
}

/**
 * 初始化数据库结构并应用受支持的迁移。
 * 用于 SQLiteProvider.onInit。
 */
export async function initDB(db: SQLiteDatabase): Promise<void> {
  async function migrate(current: SQLiteDatabase) {
    const versionRow = await current.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    const userVersion = versionRow?.user_version ?? 0;

    if (__DEV__ && userVersion !== SCHEMA_VERSION) {
      // 开发模式下版本不一致时直接重置所有业务表，
      // 避免旧 schema 残留导致后续 CREATE TABLE IF NOT EXISTS 不生效、
      // 进而让 SELECT 缺列、迁移跳过等问题。
      await current.execAsync(`
        DROP TABLE IF EXISTS OneTimeItems;
        DROP TABLE IF EXISTS Subscriptions;
        DROP TABLE IF EXISTS StoredCards;
        DROP TABLE IF EXISTS Categories;
        DROP TABLE IF EXISTS AppPreferences;
        DROP TABLE IF EXISTS Accessories;
        DROP TABLE IF EXISTS MaintenanceLogs;
        DROP TABLE IF EXISTS MaintenancePlans;
        DROP TABLE IF EXISTS NetWorthSnapshots;
        DROP TABLE IF EXISTS one_time_items;
        DROP TABLE IF EXISTS subscriptions;
        DROP TABLE IF EXISTS stored_cards;
        DROP TABLE IF EXISTS _meta;
      `);
    } else if (
      !__DEV__
      && userVersion !== 0
      && userVersion !== SCHEMA_VERSION
      && userVersion !== 4
      && userVersion !== 5
      && userVersion !== 6
      && userVersion !== 7
      && userVersion !== 8
      && userVersion !== 9
      && userVersion !== 10
      && userVersion !== 11
      && userVersion !== 12
      && userVersion !== 13
      && userVersion !== 14
      && userVersion !== 15
    ) {
      throw new Error(
        `数据库版本不匹配（当前 ${userVersion}，期望 ${SCHEMA_VERSION}）。请实现迁移后再发布。`,
      );
    }

    let workingVersion = __DEV__ && userVersion !== SCHEMA_VERSION ? 0 : userVersion;

    if (workingVersion === 4) {
      await current.execAsync(`
        CREATE TABLE IF NOT EXISTS Categories_new (
          id   TEXT NOT NULL,
          name TEXT NOT NULL,
          icon TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('item', 'subscription', 'stored_card')),
          PRIMARY KEY (id, type)
        );

        INSERT INTO Categories_new (id, name, icon, type)
        SELECT id, name, icon, type FROM Categories;

        DROP TABLE Categories;
        ALTER TABLE Categories_new RENAME TO Categories;
        CREATE INDEX IF NOT EXISTS idx_categories_type ON Categories(type);
      `);
      workingVersion = 5;
    }

    if (workingVersion === 5) {
      await current.execAsync(`
        ALTER TABLE OneTimeItems ADD COLUMN active_days INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE OneTimeItems ADD COLUMN active_start_date TEXT;
        ALTER TABLE OneTimeItems ADD COLUMN archived_reason TEXT;

        UPDATE OneTimeItems
        SET active_start_date = buy_date
        WHERE status IN ('active', 'unredeemed') AND (active_start_date IS NULL OR active_start_date = '');

        UPDATE OneTimeItems
        SET
          active_days = CASE
            WHEN end_date IS NOT NULL
              THEN MAX(CAST(julianday(end_date) - julianday(buy_date) + 1 AS INTEGER), 1)
            ELSE 0
          END,
          active_start_date = NULL,
          archived_reason = CASE
            WHEN salvage_value > 0 THEN 'sold'
            ELSE 'paused'
          END
        WHERE status = 'archived';
      `);
      workingVersion = 6;
    }

    if (workingVersion === 6) {
      await current.execAsync(`
        ALTER TABLE OneTimeItems ADD COLUMN image_uri TEXT;
        ALTER TABLE Subscriptions ADD COLUMN image_uri TEXT;
        ALTER TABLE StoredCards ADD COLUMN image_uri TEXT;
      `);
      workingVersion = 7;
    }

    if (workingVersion === 7) {
      await rebuildOneTimeItemsTable(current);
      workingVersion = 8;
    }

    if (workingVersion === 8) {
      await current.execAsync(`
        ALTER TABLE OneTimeItems
          ADD COLUMN expected_life_days INTEGER
          CHECK(expected_life_days IS NULL OR expected_life_days > 0);
      `);
      workingVersion = 9;
    }

    if (workingVersion === 9) {
      await current.execAsync(`
        ALTER TABLE OneTimeItems
          ADD COLUMN warranty_expiry_date TEXT;
      `);
      workingVersion = 10;
    }

    if (workingVersion === 10) {
      await current.execAsync(`
        ALTER TABLE OneTimeItems ADD COLUMN notes TEXT;
        ALTER TABLE OneTimeItems ADD COLUMN purchase_channel TEXT;
        ALTER TABLE OneTimeItems ADD COLUMN serial_number TEXT;
      `);
      workingVersion = 11;
    }

    if (workingVersion === 11) {
      await current.execAsync(`
        CREATE TABLE IF NOT EXISTS MaintenanceLogs (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id      INTEGER NOT NULL,
          log_date     TEXT    NOT NULL,
          cost         REAL    NOT NULL DEFAULT 0 CHECK(cost >= 0),
          title        TEXT    NOT NULL,
          description  TEXT,
          created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (item_id) REFERENCES OneTimeItems(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_maintenance_logs_item_id ON MaintenanceLogs(item_id);
        CREATE INDEX IF NOT EXISTS idx_maintenance_logs_date ON MaintenanceLogs(log_date);
      `);
      workingVersion = 12;
    }

    if (workingVersion === 12) {
      await current.execAsync(`
        CREATE TABLE IF NOT EXISTS NetWorthSnapshots (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          snapshot_date  TEXT    NOT NULL UNIQUE,
          asset_value    REAL    NOT NULL DEFAULT 0,
          card_principal REAL    NOT NULL DEFAULT 0,
          installment_debt REAL  NOT NULL DEFAULT 0,
          net_value      REAL    NOT NULL DEFAULT 0,
          created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_net_worth_snapshots_date ON NetWorthSnapshots(snapshot_date);
      `);
      workingVersion = 13;
    }

    if (workingVersion === 13) {
      await current.execAsync(`
        CREATE TABLE IF NOT EXISTS MaintenancePlans (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id         INTEGER NOT NULL,
          title           TEXT    NOT NULL,
          interval_days   INTEGER NOT NULL CHECK(interval_days > 0),
          last_done_date  TEXT,
          next_due_date   TEXT,
          enabled         INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
          created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (item_id) REFERENCES OneTimeItems(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_maintenance_plans_item_id ON MaintenancePlans(item_id);
        CREATE INDEX IF NOT EXISTS idx_maintenance_plans_next_due ON MaintenancePlans(next_due_date);
      `);
      workingVersion = 14;
    }

    if (workingVersion === 14) {
      await current.execAsync(`
        CREATE TABLE IF NOT EXISTS Accessories (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id     INTEGER NOT NULL,
          name        TEXT    NOT NULL,
          quantity    INTEGER NOT NULL DEFAULT 1 CHECK(quantity >= 1),
          unit_price  REAL    NOT NULL DEFAULT 0 CHECK(unit_price >= 0),
          buy_date    TEXT,
          status      TEXT    NOT NULL DEFAULT 'in_use' CHECK(status IN ('in_use', 'lost', 'damaged')),
          notes       TEXT,
          created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (item_id) REFERENCES OneTimeItems(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_accessories_item_id ON Accessories(item_id);
      `);
      workingVersion = 15;
    }

    if (workingVersion === 15) {
      // 为配件扩展实体类型，使其也能挂在订阅、储值卡上。
      // item_id 列复用为通用实体 ID（SQLite 默认不强制外键，可安全跨表引用）。
      await ensureColumn(
        current,
        'Accessories',
        'entity_type',
        `TEXT NOT NULL DEFAULT 'item' CHECK(entity_type IN ('item', 'subscription', 'stored_card'))`,
      );
      await current.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_accessories_entity ON Accessories(entity_type, item_id);
      `);
      workingVersion = 16;
    }

    await current.execAsync(`
      CREATE TABLE IF NOT EXISTS OneTimeItems (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        name               TEXT    NOT NULL,
        category           TEXT,
        icon               TEXT,
        image_uri          TEXT,
        total_price        REAL    NOT NULL CHECK(total_price > 0),
        buy_date           TEXT    NOT NULL,
        status             TEXT    NOT NULL CHECK(status IN ('unredeemed', 'active', 'archived')),
        salvage_value      REAL    DEFAULT 0 CHECK(salvage_value >= 0),
        active_days        INTEGER NOT NULL DEFAULT 0 CHECK(active_days >= 0),
        active_start_date  TEXT,
        archived_reason    TEXT,
        is_installment     INTEGER DEFAULT 0 CHECK(is_installment IN (0, 1)),
        installment_months INTEGER,
        monthly_payment    REAL,
        down_payment       REAL    DEFAULT 0,
        end_date           TEXT,
        expected_life_days INTEGER CHECK(expected_life_days IS NULL OR expected_life_days > 0),
        warranty_expiry_date TEXT,
        notes              TEXT,
        purchase_channel   TEXT,
        serial_number      TEXT,
        CHECK(is_installment = 1 OR (installment_months IS NULL AND monthly_payment IS NULL)),
        CHECK(is_installment = 0 OR (
          installment_months IS NOT NULL
          AND installment_months > 0
          AND monthly_payment IS NOT NULL
          AND monthly_payment > 0
        )),
        CHECK(status != 'unredeemed' OR is_installment = 1),
        CHECK(status = 'archived' OR end_date IS NULL),
        CHECK(status != 'archived' OR end_date IS NOT NULL)
      );

      CREATE INDEX IF NOT EXISTS idx_one_time_items_status ON OneTimeItems(status);
      CREATE INDEX IF NOT EXISTS idx_one_time_items_buy_date ON OneTimeItems(buy_date);
    `);

    await current.execAsync(`
      CREATE TABLE IF NOT EXISTS Subscriptions (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT    NOT NULL,
        category      TEXT,
        icon          TEXT,
        image_uri     TEXT,
        cycle_price   REAL    NOT NULL CHECK(cycle_price > 0),
        billing_cycle TEXT    NOT NULL CHECK(billing_cycle IN ('monthly', 'quarterly', 'yearly')),
        start_date    TEXT    NOT NULL,
        status        TEXT    NOT NULL CHECK(status IN ('active', 'archived'))
      );

      CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON Subscriptions(status);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_start_date ON Subscriptions(start_date);
    `);

    await current.execAsync(`
      CREATE TABLE IF NOT EXISTS MaintenanceLogs (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id      INTEGER NOT NULL,
        log_date     TEXT    NOT NULL,
        cost         REAL    NOT NULL DEFAULT 0 CHECK(cost >= 0),
        title        TEXT    NOT NULL,
        description  TEXT,
        created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (item_id) REFERENCES OneTimeItems(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_maintenance_logs_item_id ON MaintenanceLogs(item_id);
      CREATE INDEX IF NOT EXISTS idx_maintenance_logs_date ON MaintenanceLogs(log_date);
    `);

    await current.execAsync(`
      CREATE TABLE IF NOT EXISTS NetWorthSnapshots (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_date  TEXT    NOT NULL UNIQUE,
        asset_value    REAL    NOT NULL DEFAULT 0,
        card_principal REAL    NOT NULL DEFAULT 0,
        installment_debt REAL  NOT NULL DEFAULT 0,
        net_value      REAL    NOT NULL DEFAULT 0,
        created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_net_worth_snapshots_date ON NetWorthSnapshots(snapshot_date);
    `);

    await current.execAsync(`
      CREATE TABLE IF NOT EXISTS MaintenancePlans (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id         INTEGER NOT NULL,
        title           TEXT    NOT NULL,
        interval_days   INTEGER NOT NULL CHECK(interval_days > 0),
        last_done_date  TEXT,
        next_due_date   TEXT,
        enabled         INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
        created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (item_id) REFERENCES OneTimeItems(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_maintenance_plans_item_id ON MaintenancePlans(item_id);
      CREATE INDEX IF NOT EXISTS idx_maintenance_plans_next_due ON MaintenancePlans(next_due_date);
    `);

    await current.execAsync(`
      CREATE TABLE IF NOT EXISTS Accessories (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id     INTEGER NOT NULL,
        name        TEXT    NOT NULL,
        quantity    INTEGER NOT NULL DEFAULT 1 CHECK(quantity >= 1),
        unit_price  REAL    NOT NULL DEFAULT 0 CHECK(unit_price >= 0),
        buy_date    TEXT,
        status      TEXT    NOT NULL DEFAULT 'in_use' CHECK(status IN ('in_use', 'lost', 'damaged')),
        notes       TEXT,
        entity_type TEXT    NOT NULL DEFAULT 'item' CHECK(entity_type IN ('item', 'subscription', 'stored_card')),
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (item_id) REFERENCES OneTimeItems(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_accessories_item_id ON Accessories(item_id);
      CREATE INDEX IF NOT EXISTS idx_accessories_entity ON Accessories(entity_type, item_id);
    `);

    await current.execAsync(`
      CREATE TABLE IF NOT EXISTS StoredCards (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        name              TEXT    NOT NULL,
        category          TEXT,
        icon              TEXT,
        image_uri         TEXT,
        card_type         TEXT    NOT NULL CHECK(card_type IN ('amount', 'count')),
        actual_paid       REAL    NOT NULL CHECK(actual_paid > 0),
        face_value        REAL    NOT NULL CHECK(face_value > 0),
        current_balance   REAL    NOT NULL CHECK(current_balance >= 0 AND current_balance <= face_value),
        last_updated_date TEXT    NOT NULL,
        reminder_days     INTEGER NOT NULL DEFAULT 30 CHECK(reminder_days >= 0),
        status            TEXT    NOT NULL CHECK(status IN ('active', 'archived'))
      );

      CREATE INDEX IF NOT EXISTS idx_stored_cards_status ON StoredCards(status);
      CREATE INDEX IF NOT EXISTS idx_stored_cards_last_updated ON StoredCards(last_updated_date);
      CREATE INDEX IF NOT EXISTS idx_stored_cards_category ON StoredCards(category);
      CREATE INDEX IF NOT EXISTS idx_stored_cards_type ON StoredCards(card_type);
    `);

    // 某些历史数据库 user_version 已提升，但 image_uri 列未真正创建；这里统一兜底修复。
    await ensureColumn(current, 'OneTimeItems', 'image_uri', 'TEXT');
    await ensureColumn(current, 'Subscriptions', 'image_uri', 'TEXT');
    await ensureColumn(current, 'StoredCards', 'image_uri', 'TEXT');
    await ensureColumn(
      current,
      'OneTimeItems',
      'expected_life_days',
      'INTEGER CHECK(expected_life_days IS NULL OR expected_life_days > 0)',
    );
    await ensureColumn(current, 'OneTimeItems', 'warranty_expiry_date', 'TEXT');
    await ensureColumn(current, 'OneTimeItems', 'notes', 'TEXT');
    await ensureColumn(current, 'OneTimeItems', 'purchase_channel', 'TEXT');
    await ensureColumn(current, 'OneTimeItems', 'serial_number', 'TEXT');
    // Accessories.entity_type 兜底：历史上 v14 表无该列、v15 迁移可能被跳过
    // （dev 模式重置或跨版本升级路径异常时），此处再保险一次。
    await ensureColumn(
      current,
      'Accessories',
      'entity_type',
      `TEXT NOT NULL DEFAULT 'item' CHECK(entity_type IN ('item', 'subscription', 'stored_card'))`,
    );

    await current.execAsync(`
      CREATE TABLE IF NOT EXISTS Categories (
        id   TEXT NOT NULL,
        name TEXT NOT NULL,
        icon TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('item', 'subscription', 'stored_card')),
        PRIMARY KEY (id, type)
      );

      CREATE INDEX IF NOT EXISTS idx_categories_type ON Categories(type);
    `);

    await ensureCategoriesTable(current);

    await current.execAsync(`
      CREATE TABLE IF NOT EXISTS AppPreferences (
        key   TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);

    await current.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }

  if (Platform.OS === 'web') {
    await db.withTransactionAsync(async () => {
      await migrate(db);
    });
  } else {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await migrate(txn);
    });
  }

  await seedSampleData(db);
}
