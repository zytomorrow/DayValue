import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  Accessory,
  AccessoryEntityType,
  AccessoryInput,
  AccessoryStatus,
} from '../types';

/**
 * 获取指定实体的全部配件（按创建时间正序）。
 * entityType 默认 'item'，兼容旧调用方。
 */
export async function getAccessoriesByEntity(
  db: SQLiteDatabase,
  entityType: AccessoryEntityType,
  entityId: number,
): Promise<Accessory[]> {
  return db.getAllAsync<Accessory>(
    `SELECT * FROM Accessories WHERE entity_type = ? AND item_id = ? ORDER BY created_at ASC, id ASC`,
    [entityType, entityId],
  );
}

/** 获取指定物品的全部配件（entity_type='item' 的快捷方法） */
export async function getAccessoriesByItem(
  db: SQLiteDatabase,
  itemId: number,
): Promise<Accessory[]> {
  return getAccessoriesByEntity(db, 'item', itemId);
}

/** 新增配件，返回插入 ID */
export async function createAccessory(
  db: SQLiteDatabase,
  input: AccessoryInput,
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO Accessories (item_id, entity_type, name, quantity, unit_price, buy_date, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.item_id,
      input.entity_type ?? 'item',
      input.name,
      input.quantity ?? 1,
      input.unit_price ?? 0,
      input.buy_date ?? null,
      input.status ?? 'in_use',
      input.notes ?? null,
    ],
  );
  return result.lastInsertRowId;
}

/** 更新配件（只更新传入字段） */
export async function updateAccessory(
  db: SQLiteDatabase,
  id: number,
  patch: Partial<Omit<AccessoryInput, 'item_id' | 'entity_type'>>,
): Promise<void> {
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (patch.name !== undefined) { fields.push('name = ?'); values.push(patch.name); }
  if (patch.quantity !== undefined) { fields.push('quantity = ?'); values.push(patch.quantity); }
  if (patch.unit_price !== undefined) { fields.push('unit_price = ?'); values.push(patch.unit_price); }
  if (patch.buy_date !== undefined) { fields.push('buy_date = ?'); values.push(patch.buy_date); }
  if (patch.status !== undefined) { fields.push('status = ?'); values.push(patch.status); }
  if (patch.notes !== undefined) { fields.push('notes = ?'); values.push(patch.notes ?? null); }

  if (fields.length === 0) return;

  values.push(id);
  await db.runAsync(
    `UPDATE Accessories SET ${fields.join(', ')} WHERE id = ?`,
    values,
  );
}

/** 删除配件 */
export async function deleteAccessory(
  db: SQLiteDatabase,
  id: number,
): Promise<void> {
  await db.runAsync('DELETE FROM Accessories WHERE id = ?', [id]);
}

/** 删除指定实体的全部配件（实体删除时调用） */
export async function deleteAccessoriesByEntity(
  db: SQLiteDatabase,
  entityType: AccessoryEntityType,
  entityId: number,
): Promise<void> {
  await db.runAsync(
    'DELETE FROM Accessories WHERE entity_type = ? AND item_id = ?',
    [entityType, entityId],
  );
}

/** 删除指定物品的全部配件（entity_type='item' 的快捷方法） */
export async function deleteAccessoriesByItem(
  db: SQLiteDatabase,
  itemId: number,
): Promise<void> {
  await deleteAccessoriesByEntity(db, 'item', itemId);
}

/** 汇总指定实体的配件总成本（quantity * unit_price 之和，仅含在用+损坏的，不含丢失的） */
export async function sumAccessoryCostByEntity(
  db: SQLiteDatabase,
  entityType: AccessoryEntityType,
  entityId: number,
): Promise<number> {
  const row = await db.getFirstAsync<{ total: number | null }>(
    `SELECT COALESCE(SUM(quantity * unit_price), 0) AS total
     FROM Accessories
     WHERE entity_type = ? AND item_id = ? AND status != 'lost'`,
    [entityType, entityId],
  );
  return row?.total ?? 0;
}

/** 汇总指定物品的配件总成本（entity_type='item' 的快捷方法） */
export async function sumAccessoryCostByItem(
  db: SQLiteDatabase,
  itemId: number,
): Promise<number> {
  return sumAccessoryCostByEntity(db, 'item', itemId);
}

/** 更新配件状态快捷方法 */
export async function setAccessoryStatus(
  db: SQLiteDatabase,
  id: number,
  status: AccessoryStatus,
): Promise<void> {
  await db.runAsync(
    `UPDATE Accessories SET status = ? WHERE id = ?`,
    [status, id],
  );
}
