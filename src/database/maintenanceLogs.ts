import type { SQLiteDatabase } from 'expo-sqlite';
import type { MaintenanceLog, MaintenanceLogInput } from '../types';

/** 获取指定物品的全部维修日志（按日期倒序） */
export async function getMaintenanceLogsByItem(
  db: SQLiteDatabase,
  itemId: number,
): Promise<MaintenanceLog[]> {
  return db.getAllAsync<MaintenanceLog>(
    `SELECT * FROM MaintenanceLogs WHERE item_id = ? ORDER BY log_date DESC, id DESC`,
    [itemId],
  );
}

/** 获取全部维修日志（按日期倒序），用于跨物品统计 */
export async function getAllMaintenanceLogs(
  db: SQLiteDatabase,
): Promise<MaintenanceLog[]> {
  return db.getAllAsync<MaintenanceLog>(
    `SELECT * FROM MaintenanceLogs ORDER BY log_date DESC, id DESC`,
  );
}

/** 新增一条维修日志，返回插入 ID */
export async function createMaintenanceLog(
  db: SQLiteDatabase,
  input: MaintenanceLogInput,
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO MaintenanceLogs (item_id, log_date, cost, title, description)
     VALUES (?, ?, ?, ?, ?)`,
    [
      input.item_id,
      input.log_date,
      input.cost,
      input.title,
      input.description ?? null,
    ],
  );
  return result.lastInsertRowId;
}

/** 更新一条维修日志（只更新传入字段） */
export async function updateMaintenanceLog(
  db: SQLiteDatabase,
  id: number,
  patch: Partial<Omit<MaintenanceLogInput, 'item_id'>>,
): Promise<void> {
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (patch.log_date !== undefined) { fields.push('log_date = ?'); values.push(patch.log_date); }
  if (patch.cost !== undefined) { fields.push('cost = ?'); values.push(patch.cost); }
  if (patch.title !== undefined) { fields.push('title = ?'); values.push(patch.title); }
  if (patch.description !== undefined) { fields.push('description = ?'); values.push(patch.description ?? null); }

  if (fields.length === 0) return;

  values.push(id);
  await db.runAsync(
    `UPDATE MaintenanceLogs SET ${fields.join(', ')} WHERE id = ?`,
    values,
  );
}

/** 删除一条维修日志 */
export async function deleteMaintenanceLog(
  db: SQLiteDatabase,
  id: number,
): Promise<void> {
  await db.runAsync('DELETE FROM MaintenanceLogs WHERE id = ?', [id]);
}

/** 删除指定物品的全部维修日志（物品删除时调用） */
export async function deleteMaintenanceLogsByItem(
  db: SQLiteDatabase,
  itemId: number,
): Promise<void> {
  await db.runAsync('DELETE FROM MaintenanceLogs WHERE item_id = ?', [itemId]);
}

/** 汇总指定物品的累计维修成本 */
export async function sumMaintenanceCostByItem(
  db: SQLiteDatabase,
  itemId: number,
): Promise<number> {
  const row = await db.getFirstAsync<{ total: number | null }>(
    `SELECT COALESCE(SUM(cost), 0) AS total FROM MaintenanceLogs WHERE item_id = ?`,
    [itemId],
  );
  return row?.total ?? 0;
}
