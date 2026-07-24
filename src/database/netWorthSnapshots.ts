import type { SQLiteDatabase } from 'expo-sqlite';
import type { NetWorthSnapshot, NetWorthSnapshotInput } from '../types';

/** 获取全部净资产快照（按日期升序），用于趋势图展示 */
export async function getAllNetWorthSnapshots(
  db: SQLiteDatabase,
): Promise<NetWorthSnapshot[]> {
  return db.getAllAsync<NetWorthSnapshot>(
    `SELECT * FROM NetWorthSnapshots ORDER BY snapshot_date ASC`,
  );
}

/** 获取最近 N 条净资产快照（按日期升序） */
export async function getRecentNetWorthSnapshots(
  db: SQLiteDatabase,
  limit: number,
): Promise<NetWorthSnapshot[]> {
  return db.getAllAsync<NetWorthSnapshot>(
    `SELECT * FROM (
       SELECT * FROM NetWorthSnapshots ORDER BY snapshot_date DESC LIMIT ?
     ) AS recent ORDER BY snapshot_date ASC`,
    [limit],
  );
}

/** 获取指定日期的净资产快照 */
export async function getNetWorthSnapshotByDate(
  db: SQLiteDatabase,
  snapshotDate: string,
): Promise<NetWorthSnapshot | null> {
  return db.getFirstAsync<NetWorthSnapshot>(
    `SELECT * FROM NetWorthSnapshots WHERE snapshot_date = ? LIMIT 1`,
    [snapshotDate],
  );
}

/**
 * 插入或覆盖一条净资产快照。
 * 同一日期已存在时，更新各项数值；否则插入新行。
 * 返回写入后的快照 ID。
 */
export async function upsertNetWorthSnapshot(
  db: SQLiteDatabase,
  input: NetWorthSnapshotInput,
): Promise<number> {
  const existing = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM NetWorthSnapshots WHERE snapshot_date = ? LIMIT 1`,
    [input.snapshot_date],
  );

  if (existing) {
    await db.runAsync(
      `UPDATE NetWorthSnapshots
       SET asset_value = ?, card_principal = ?, installment_debt = ?, net_value = ?
       WHERE id = ?`,
      [
        input.asset_value,
        input.card_principal,
        input.installment_debt,
        input.net_value,
        existing.id,
      ],
    );
    return existing.id;
  }

  const result = await db.runAsync(
    `INSERT INTO NetWorthSnapshots (snapshot_date, asset_value, card_principal, installment_debt, net_value)
     VALUES (?, ?, ?, ?, ?)`,
    [
      input.snapshot_date,
      input.asset_value,
      input.card_principal,
      input.installment_debt,
      input.net_value,
    ],
  );
  return result.lastInsertRowId;
}

/** 删除指定 ID 的快照 */
export async function deleteNetWorthSnapshot(
  db: SQLiteDatabase,
  id: number,
): Promise<void> {
  await db.runAsync('DELETE FROM NetWorthSnapshots WHERE id = ?', [id]);
}

/** 删除全部快照 */
export async function clearAllNetWorthSnapshots(
  db: SQLiteDatabase,
): Promise<void> {
  await db.runAsync('DELETE FROM NetWorthSnapshots');
}
