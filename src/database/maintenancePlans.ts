import type { SQLiteDatabase } from 'expo-sqlite';
import type { MaintenancePlan, MaintenancePlanInput } from '../types';
import { getTodayString } from '../utils/formatters';

/** 计算下次到期日期：last_done_date + interval_days，若无 last_done_date 则 today + interval_days */
function computeNextDueDate(lastDoneDate: string | null, intervalDays: number): string {
  const baseDate = lastDoneDate ?? getTodayString();
  const base = new Date(baseDate + 'T00:00:00');
  base.setDate(base.getDate() + intervalDays);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 获取指定物品的全部保养计划 */
export async function getMaintenancePlansByItem(
  db: SQLiteDatabase,
  itemId: number,
): Promise<MaintenancePlan[]> {
  return db.getAllAsync<MaintenancePlan>(
    `SELECT * FROM MaintenancePlans WHERE item_id = ? ORDER BY next_due_date ASC, id ASC`,
    [itemId],
  );
}

/** 获取全部启用的保养计划（用于提醒/日历） */
export async function getAllActiveMaintenancePlans(
  db: SQLiteDatabase,
): Promise<MaintenancePlan[]> {
  return db.getAllAsync<MaintenancePlan>(
    `SELECT * FROM MaintenancePlans WHERE enabled = 1 ORDER BY next_due_date ASC, id ASC`,
  );
}

/** 获取全部保养计划 */
export async function getAllMaintenancePlans(
  db: SQLiteDatabase,
): Promise<MaintenancePlan[]> {
  return db.getAllAsync<MaintenancePlan>(
    `SELECT * FROM MaintenancePlans ORDER BY next_due_date ASC, id ASC`,
  );
}

/** 新增保养计划，返回插入 ID。自动计算 next_due_date */
export async function createMaintenancePlan(
  db: SQLiteDatabase,
  input: MaintenancePlanInput,
): Promise<number> {
  const nextDue = computeNextDueDate(input.last_done_date ?? null, input.interval_days);
  const result = await db.runAsync(
    `INSERT INTO MaintenancePlans (item_id, title, interval_days, last_done_date, next_due_date, enabled)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.item_id,
      input.title,
      input.interval_days,
      input.last_done_date ?? null,
      nextDue,
      input.enabled ?? 1,
    ],
  );
  return result.lastInsertRowId;
}

/** 更新保养计划 */
export async function updateMaintenancePlan(
  db: SQLiteDatabase,
  id: number,
  patch: Partial<Omit<MaintenancePlanInput, 'item_id'>>,
): Promise<void> {
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (patch.title !== undefined) { fields.push('title = ?'); values.push(patch.title); }
  if (patch.interval_days !== undefined) { fields.push('interval_days = ?'); values.push(patch.interval_days); }
  if (patch.last_done_date !== undefined) { fields.push('last_done_date = ?'); values.push(patch.last_done_date); }
  if (patch.enabled !== undefined) { fields.push('enabled = ?'); values.push(patch.enabled); }

  // 如果 last_done_date 或 interval_days 变了，重新计算 next_due_date
  if (patch.last_done_date !== undefined || patch.interval_days !== undefined) {
    // 需要读取当前记录来计算
    const current = await db.getFirstAsync<MaintenancePlan>(
      `SELECT * FROM MaintenancePlans WHERE id = ?`,
      [id],
    );
    if (current) {
      const newLastDone = patch.last_done_date !== undefined ? patch.last_done_date : current.last_done_date;
      const newInterval = patch.interval_days !== undefined ? patch.interval_days : current.interval_days;
      const nextDue = computeNextDueDate(newLastDone ?? null, newInterval);
      fields.push('next_due_date = ?');
      values.push(nextDue);
    }
  }

  if (fields.length === 0) return;

  values.push(id);
  await db.runAsync(
    `UPDATE MaintenancePlans SET ${fields.join(', ')} WHERE id = ?`,
    values,
  );
}

/** 标记保养计划已完成：更新 last_done_date 并重算 next_due_date */
export async function markMaintenancePlanDone(
  db: SQLiteDatabase,
  id: number,
  doneDate: string,
): Promise<void> {
  const current = await db.getFirstAsync<MaintenancePlan>(
    `SELECT * FROM MaintenancePlans WHERE id = ?`,
    [id],
  );
  if (!current) return;
  const nextDue = computeNextDueDate(doneDate, current.interval_days);
  await db.runAsync(
    `UPDATE MaintenancePlans SET last_done_date = ?, next_due_date = ? WHERE id = ?`,
    [doneDate, nextDue, id],
  );
}

/** 删除保养计划 */
export async function deleteMaintenancePlan(
  db: SQLiteDatabase,
  id: number,
): Promise<void> {
  await db.runAsync('DELETE FROM MaintenancePlans WHERE id = ?', [id]);
}

/** 删除指定物品的全部保养计划（物品删除时调用） */
export async function deleteMaintenancePlansByItem(
  db: SQLiteDatabase,
  itemId: number,
): Promise<void> {
  await db.runAsync('DELETE FROM MaintenancePlans WHERE item_id = ?', [itemId]);
}
