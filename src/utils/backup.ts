import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

import { SCHEMA_VERSION } from '../database';
import { getPreference, setPreference } from '../database/preferences';
import { deleteAllEntityImagesAsync } from './entityImages';

/** 备份文件格式版本（与 app 版本独立，仅在备份结构发生变化时升级）。 */
export const BACKUP_FORMAT_VERSION = 1;

/** 备份文件扩展名。 */
export const BACKUP_FILE_EXTENSION = '.dayvalue-backup';

/** WebDAV 配置在 AppPreferences 中使用的前缀，备份时会跳过这些 key。 */
const WEBDAV_PREF_PREFIX = 'webdav_';

const WEBDAV_PREF_KEYS = {
  server: `${WEBDAV_PREF_PREFIX}server`,
  username: `${WEBDAV_PREF_PREFIX}username`,
  password: `${WEBDAV_PREF_PREFIX}password`,
  remotePath: `${WEBDAV_PREF_PREFIX}remote_path`,
} as const;

/** 需要备份的数据表名（顺序即恢复顺序）。 */
const BACKUP_TABLES = [
  'OneTimeItems',
  'Subscriptions',
  'StoredCards',
  'Categories',
  'MaintenanceLogs',
  'MaintenancePlans',
  'Accessories',
  'NetWorthSnapshots',
  'AppPreferences',
  '_meta',
] as const;

type BackupTableName = (typeof BACKUP_TABLES)[number];

/** 备份文件内容结构。 */
export interface BackupData {
  /** 备份文件格式版本。 */
  version: number;
  /** 创建备份时的 App 版本。 */
  appVersion: string;
  /** 创建备份时的数据库结构版本。 */
  schemaVersion: number;
  /** 创建时间（ISO 字符串）。 */
  createdAt: string;
  /** 各表的行数据。 */
  tables: Partial<Record<BackupTableName, Record<string, unknown>[]>>;
  /** 实体封面图片，按类型分组，key 为文件名、value 为 base64。 */
  images: Partial<Record<'item' | 'subscription' | 'stored_card', Record<string, string>>>;
}

/** WebDAV 连接配置。 */
export interface WebDAVConfig {
  server: string;
  username: string;
  password: string;
  remotePath: string;
}

/** WebDAV 默认远端路径（相对 server 根）。 */
export const DEFAULT_WEBDAV_REMOTE_PATH = '/DayValue/';

const ENTITY_IMAGE_TYPES = ['item', 'subscription', 'stored_card'] as const;
type EntityImageType = (typeof ENTITY_IMAGE_TYPES)[number];

const IMAGE_ROOT_DIR = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}entity-images`
  : null;

function getCurrentAppVersion(): string {
  const version = Constants.expoConfig?.version;
  return typeof version === 'string' && version.trim() ? version.trim() : '0.0.0';
}

function buildTimestampForFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function buildBackupFileName(): string {
  return `dayvalue-backup-${buildTimestampForFileName()}${BACKUP_FILE_EXTENSION}`;
}

function isWebDAVPrefKey(key: string): boolean {
  return key.startsWith(WEBDAV_PREF_PREFIX);
}

// ===================== WebDAV 配置存取 =====================

/** 读取已保存的 WebDAV 配置；未配置时返回 null。 */
export async function getWebDAVConfig(db: SQLiteDatabase): Promise<WebDAVConfig | null> {
  const [server, username, password, remotePath] = await Promise.all([
    getPreference(db, WEBDAV_PREF_KEYS.server),
    getPreference(db, WEBDAV_PREF_KEYS.username),
    getPreference(db, WEBDAV_PREF_KEYS.password),
    getPreference(db, WEBDAV_PREF_KEYS.remotePath),
  ]);

  if (!server) return null;

  return {
    server: server,
    username: username ?? '',
    password: password ?? '',
    remotePath: remotePath && remotePath.trim() ? remotePath : DEFAULT_WEBDAV_REMOTE_PATH,
  };
}

/** 保存 WebDAV 配置；传 null 清空。 */
export async function setWebDAVConfig(
  db: SQLiteDatabase,
  config: WebDAVConfig | null,
): Promise<void> {
  if (!config) {
    await Promise.all(
      Object.values(WEBDAV_PREF_KEYS).map(key =>
        db.runAsync(`DELETE FROM AppPreferences WHERE key = ?`, [key]),
      ),
    );
    return;
  }

  const remotePath = config.remotePath.trim() || DEFAULT_WEBDAV_REMOTE_PATH;
  await Promise.all([
    setPreference(db, WEBDAV_PREF_KEYS.server, config.server.trim()),
    setPreference(db, WEBDAV_PREF_KEYS.username, config.username),
    setPreference(db, WEBDAV_PREF_KEYS.password, config.password),
    setPreference(db, WEBDAV_PREF_KEYS.remotePath, remotePath),
  ]);
}

function normalizeWebDAVServer(server: string): string {
  let url = server.trim();
  if (!url) return url;
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  if (!url.endsWith('/')) {
    url = `${url}/`;
  }
  return url;
}

function normalizeWebDAVRemotePath(path: string): string {
  let p = path.trim() || DEFAULT_WEBDAV_REMOTE_PATH;
  if (!p.startsWith('/')) p = `/${p}`;
  if (!p.endsWith('/')) p = `${p}/`;
  return p;
}

function buildWebDAVAuthHeader(config: WebDAVConfig): string {
  // btoa 仅支持 ASCII；WebDAV 用户名/密码通常也是 ASCII。
  const raw = `${config.username}:${config.password}`;
  return `Basic ${btoa(raw)}`;
}

function buildWebDAVFileUrl(config: WebDAVConfig, fileName: string): string {
  const server = normalizeWebDAVServer(config.server);
  const remotePath = normalizeWebDAVRemotePath(config.remotePath);
  return `${server}${remotePath.replace(/^\//, '')}${fileName}`;
}

function buildWebDAVFolderUrl(config: WebDAVConfig): string {
  const server = normalizeWebDAVServer(config.server);
  const remotePath = normalizeWebDAVRemotePath(config.remotePath);
  // 移除末尾斜杠，MKCOL 部分服务器对带斜杠的 URL 行为不一致。
  return `${server}${remotePath.replace(/^\//, '').replace(/\/$/, '')}`;
}

// ===================== WebDAV HTTP 客户端 =====================

interface WebDAVRequestOptions {
  method: string;
  body?: string;
  headers?: Record<string, string>;
  /** 期望的状态码集合；不在集合内时抛错。 */
  expectedStatus?: number[];
}

class WebDAVError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'WebDAVError';
  }
}

/** 通用 WebDAV 请求，使用 XMLHttpRequest 以支持 PUT/MKCOL/PROPFIND 等非标准方法。 */
function webdavRequest(
  url: string,
  config: WebDAVConfig,
  options: WebDAVRequestOptions,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method, url, true);
    xhr.setRequestHeader('Authorization', buildWebDAVAuthHeader(config));
    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        xhr.setRequestHeader(key, value);
      }
    }
    xhr.onload = () => {
      const status = xhr.status ?? 0;
      const body = typeof xhr.responseText === 'string' ? xhr.responseText : '';
      const expected = options.expectedStatus ?? [200, 204];
      if (expected.includes(status)) {
        resolve({ status, body });
      } else {
        reject(
          new WebDAVError(
            `${options.method} ${url} 失败：HTTP ${status}${body ? `\n${body.slice(0, 200)}` : ''}`,
            status,
          ),
        );
      }
    };
    xhr.onerror = () => {
      reject(
        new WebDAVError(
          `${options.method} ${url} 网络错误，请检查服务器地址、网络或证书是否可用。`,
          0,
        ),
      );
    };
    xhr.ontimeout = () => {
      reject(new WebDAVError(`${options.method} ${url} 请求超时。`, 0));
    };
    xhr.timeout = 30000;
    if (options.body !== undefined) {
      xhr.send(options.body);
    } else {
      xhr.send();
    }
  });
}

/** 测试 WebDAV 连接：尝试 PROPFIND 远端目录，目录不存在则尝试创建。 */
export async function testWebDAVConnectionAsync(config: WebDAVConfig): Promise<void> {
  if (!config.server.trim()) {
    throw new Error('请填写 WebDAV 服务器地址');
  }

  const folderUrl = buildWebDAVFolderUrl(config);
  // PROPFIND 0 深度探测目录是否存在。
  try {
    await webdavRequest(folderUrl, config, {
      method: 'PROPFIND',
      headers: { Depth: '0' },
      expectedStatus: [200, 207, 301, 302, 404],
    });
  } catch (error) {
    if (error instanceof WebDAVError && error.status === 404) {
      // 目录不存在，尝试创建。
      await webdavRequest(folderUrl, config, {
        method: 'MKCOL',
        expectedStatus: [201],
      });
      return;
    }
    throw error;
  }
}

// ===================== 备份文件读写 =====================

async function collectTableRows(
  db: SQLiteDatabase,
): Promise<BackupData['tables']> {
  const result: BackupData['tables'] = {};
  for (const table of BACKUP_TABLES) {
    try {
      const rows = await db.getAllAsync<Record<string, unknown>>(
        `SELECT * FROM ${table}`,
      );
      result[table] = rows;
    } catch {
      // 表不存在等异常：跳过，备份仍可继续。
      result[table] = [];
    }
  }
  return result;
}

async function collectEntityImages(): Promise<BackupData['images']> {
  const images: BackupData['images'] = {};
  if (!IMAGE_ROOT_DIR || Platform.OS === 'web') {
    return images;
  }

  const rootInfo = await FileSystem.getInfoAsync(IMAGE_ROOT_DIR);
  if (!rootInfo.exists) {
    return images;
  }

  for (const type of ENTITY_IMAGE_TYPES) {
    const dir = `${IMAGE_ROOT_DIR}/${type}`;
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) continue;

    let fileNames: string[] = [];
    try {
      fileNames = await FileSystem.readDirectoryAsync(dir);
    } catch {
      continue;
    }

    const entries: Record<string, string> = {};
    for (const fileName of fileNames) {
      const fileUri = `${dir}/${fileName}`;
      try {
        const base64 = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        entries[fileName] = base64;
      } catch {
        // 单个图片读取失败：跳过，不影响整体备份。
      }
    }
    if (Object.keys(entries).length > 0) {
      images[type as EntityImageType] = entries;
    }
  }

  return images;
}

/** 生成完整的备份内容（不写文件）。 */
export async function buildBackupData(db: SQLiteDatabase): Promise<BackupData> {
  const [tables, images] = await Promise.all([
    collectTableRows(db),
    collectEntityImages(),
  ]);

  // AppPreferences 中过滤掉 WebDAV 配置（避免在导出的文件中泄露密码）。
  if (tables.AppPreferences) {
    tables.AppPreferences = tables.AppPreferences.filter(
      row => !isWebDAVPrefKey(String(row.key ?? '')),
    );
  }

  return {
    version: BACKUP_FORMAT_VERSION,
    appVersion: getCurrentAppVersion(),
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    tables,
    images,
  };
}

function serializeBackup(data: BackupData): string {
  return JSON.stringify(data);
}

function parseBackup(content: string): BackupData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('备份文件内容不是合法的 JSON，可能已损坏。');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('备份文件结构异常。');
  }

  const data = parsed as Partial<BackupData>;
  if (data.version !== BACKUP_FORMAT_VERSION) {
    throw new Error(
      `不支持的备份格式版本（期望 ${BACKUP_FORMAT_VERSION}，实际 ${String(data.version)}）。`,
    );
  }
  if (!data.tables || typeof data.tables !== 'object') {
    throw new Error('备份文件缺少 tables 字段。');
  }
  if (typeof data.schemaVersion !== 'number') {
    throw new Error('备份文件缺少 schemaVersion 字段。');
  }
  return data as BackupData;
}

// ===================== 恢复逻辑 =====================

function buildInsertPlaceholders(columns: string[], rowCount: number): string {
  const single = `(${columns.map(() => '?').join(', ')})`;
  return Array.from({ length: rowCount }, () => single).join(', ');
}

async function getTableColumns(db: SQLiteDatabase, tableName: string): Promise<Set<string>> {
  try {
    const rows = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(${tableName})`,
    );
    return new Set(rows.map(r => r.name));
  } catch {
    return new Set();
  }
}

async function applyBackupData(db: SQLiteDatabase, data: BackupData): Promise<void> {
  if (data.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `备份来自更新的数据库版本（${data.schemaVersion} > 当前 ${SCHEMA_VERSION}），请先升级 App。`,
    );
  }

  // 清空所有目标表（保留结构）。
  // 注意：不在此处调用 initDB，因为 initDB 会开启自己的事务，无法在
  // withExclusiveTransactionAsync 内嵌套调用。当前 App 启动时已执行过
  // initDB，表结构已是最新，直接清空数据再写入备份即可。
  for (const table of BACKUP_TABLES) {
    try {
      await db.execAsync(`DELETE FROM ${table};`);
    } catch {
      // 表可能不存在，跳过。
    }
  }

  // 写入备份数据。
  for (const table of BACKUP_TABLES) {
    const rows = data.tables[table];
    if (!Array.isArray(rows) || rows.length === 0) continue;

    // 取所有 row 的列并集，便于在缺少列时回退到 NULL。
    const columnSet = new Set<string>();
    for (const row of rows) {
      if (row && typeof row === 'object') {
        for (const key of Object.keys(row)) {
          columnSet.add(key);
        }
      }
    }
    if (columnSet.size === 0) continue;

    // 仅保留当前表实际存在的列，避免备份中存在已废弃的列导致 INSERT 失败。
    const existingColumns = await getTableColumns(db, table);
    const columns = Array.from(columnSet).filter(c => existingColumns.has(c));
    if (columns.length === 0) continue;

    // 分批 INSERT，避免一次占位符过多。
    const BATCH = 50;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const placeholder = buildInsertPlaceholders(columns, slice.length);
      const values: (string | number | boolean | null)[] = [];
      for (const row of slice) {
        for (const col of columns) {
          const raw = (row as Record<string, unknown>)?.[col];
          if (raw === null || raw === undefined) {
            values.push(null);
          } else if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
            values.push(raw);
          } else {
            // 备份中不应出现对象/数组；兜底转字符串避免 INSERT 失败。
            values.push(JSON.stringify(raw));
          }
        }
      }
      await db.runAsync(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholder}`,
        values,
      );
    }
  }

  // 始终确保 _meta.seeded=1，避免下次启动时 initDB 又把示例数据塞回来。
  try {
    await db.runAsync(
      `INSERT INTO _meta (key, value) VALUES ('seeded', '1')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );
  } catch {
    // _meta 表不存在时忽略；正常流程下 initDB 已创建。
  }
}

async function restoreEntityImages(images: BackupData['images']): Promise<void> {
  if (!IMAGE_ROOT_DIR || Platform.OS === 'web') return;

  // 先清空旧图片，再写回备份中的图片。
  await deleteAllEntityImagesAsync();

  if (!images) return;

  for (const type of ENTITY_IMAGE_TYPES) {
    const entries = images[type as EntityImageType];
    if (!entries) continue;

    const dir = `${IMAGE_ROOT_DIR}/${type}`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

    for (const [fileName, base64] of Object.entries(entries)) {
      if (!fileName || typeof base64 !== 'string') continue;
      const fileUri = `${dir}/${fileName}`;
      try {
        await FileSystem.writeAsStringAsync(fileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch {
        // 单个图片写入失败：忽略，不阻塞整体恢复。
      }
    }
  }
}

/** 将备份数据恢复到当前数据库（包含表数据 + 实体图片）。 */
export async function restoreFromBackupData(
  db: SQLiteDatabase,
  data: BackupData,
): Promise<void> {
  if (Platform.OS === 'web') {
    await db.withTransactionAsync(async () => {
      await applyBackupData(db, data);
    });
  } else {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await applyBackupData(txn, data);
    });
  }

  await restoreEntityImages(data.images);
}

// ===================== 本地导出/导入 =====================

function getBackupCacheDir(): string {
  const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!base) {
    throw new Error('当前平台不支持文件系统操作');
  }
  return `${base}backups/`;
}

async function ensureBackupCacheDir(): Promise<string> {
  const dir = getBackupCacheDir();
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  return dir;
}

/** 生成备份文件并写入缓存目录，返回文件 URI 与文件名。 */
export async function exportLocalBackupFile(
  db: SQLiteDatabase,
): Promise<{ fileUri: string; fileName: string }> {
  const data = await buildBackupData(db);
  const content = serializeBackup(data);
  const dir = await ensureBackupCacheDir();
  const fileName = buildBackupFileName();
  const fileUri = `${dir}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return { fileUri, fileName };
}

/** 调用系统分享面板导出备份文件。返回是否成功打开分享面板。 */
export async function shareLocalBackupAsync(
  db: SQLiteDatabase,
): Promise<boolean> {
  const { fileUri, fileName } = await exportLocalBackupFile(db);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(`当前设备不支持系统分享，备份文件已生成在：\n${fileUri}`);
  }

  await Sharing.shareAsync(fileUri, {
    mimeType: 'application/octet-stream',
    dialogTitle: '导出 DayValue 备份',
    UTI: 'public.data',
  });
  return true;
}

/** 通过系统文件选择器选择备份文件并恢复。返回是否实际执行了恢复。 */
export async function pickAndImportLocalBackupAsync(
  db: SQLiteDatabase,
): Promise<boolean> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled) return false;
  const asset = result.assets?.[0];
  if (!asset || !asset.uri) {
    return false;
  }

  // 校验扩展名（弱校验，主要避免误选）。
  const lowerName = (asset.name ?? '').toLowerCase();
  if (
    !lowerName.endsWith(BACKUP_FILE_EXTENSION) &&
    !lowerName.endsWith('.json')
  ) {
    throw new Error(`所选文件不像 DayValue 备份（${asset.name ?? '未知文件名'}）。`);
  }

  const content = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  const data = parseBackup(content);
  await restoreFromBackupData(db, data);
  return true;
}

// ===================== WebDAV 上传/下载 =====================

const REMOTE_BACKUP_FILE_NAME = `dayvalue-backup${BACKUP_FILE_EXTENSION}`;

/** 上传当前数据库 + 图片到 WebDAV。 */
export async function uploadBackupToWebDAVAsync(
  db: SQLiteDatabase,
  config: WebDAVConfig,
): Promise<void> {
  if (!config.server.trim()) {
    throw new Error('请先填写 WebDAV 服务器地址');
  }

  // 先确保远端目录存在（忽略已存在的错误）。
  const folderUrl = buildWebDAVFolderUrl(config);
  try {
    await webdavRequest(folderUrl, config, {
      method: 'MKCOL',
      expectedStatus: [201, 200, 204, 405, 301, 302],
    });
  } catch (error) {
    // MKCOL 失败不一定是致命错误，继续尝试 PUT，让 PUT 报具体错误。
    if (!(error instanceof WebDAVError) || error.status === 0) {
      throw error;
    }
  }

  const data = await buildBackupData(db);
  const content = serializeBackup(data);
  const fileUrl = buildWebDAVFileUrl(config, REMOTE_BACKUP_FILE_NAME);

  await webdavRequest(fileUrl, config, {
    method: 'PUT',
    body: content,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    expectedStatus: [200, 201, 204],
  });
}

/** 从 WebDAV 下载备份并恢复。返回是否实际执行了恢复（远端无文件时返回 false）。 */
export async function restoreFromWebDAVAsync(
  db: SQLiteDatabase,
  config: WebDAVConfig,
): Promise<boolean> {
  if (!config.server.trim()) {
    throw new Error('请先填写 WebDAV 服务器地址');
  }

  const fileUrl = buildWebDAVFileUrl(config, REMOTE_BACKUP_FILE_NAME);
  const response = await webdavRequest(fileUrl, config, {
    method: 'GET',
    expectedStatus: [200],
  });

  if (!response.body) {
    throw new Error('WebDAV 服务器返回了空内容。');
  }

  const data = parseBackup(response.body);
  await restoreFromBackupData(db, data);
  return true;
}
