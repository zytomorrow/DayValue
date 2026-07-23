import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../types';
import { useCategories } from '../contexts/CategoriesContext';
import { BrutalButton, PixelInput } from '../components';
import { THEME } from '../utils/constants';
import {
  DEFAULT_WEBDAV_REMOTE_PATH,
  getWebDAVConfig,
  pickAndImportLocalBackupAsync,
  setWebDAVConfig,
  shareLocalBackupAsync,
  testWebDAVConnectionAsync,
  uploadBackupToWebDAVAsync,
  restoreFromWebDAVAsync,
  type WebDAVConfig,
} from '../utils/backup';

type Props = NativeStackScreenProps<RootStackParamList, 'Backup'>;

type BusyKind =
  | 'export'
  | 'import'
  | 'saveConfig'
  | 'testConnection'
  | 'upload'
  | 'restore'
  | null;

function BrutalCard({
  title,
  titleColor,
  children,
}: {
  title: string;
  titleColor: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.cardWrap}>
      <View style={styles.cardShadow} pointerEvents="none" />
      <View style={styles.card}>
        <View style={[styles.cardHeader, { backgroundColor: titleColor }]}>
          <Text style={styles.cardHeaderText}>{title}</Text>
        </View>
        <View style={styles.cardBody}>{children}</View>
      </View>
    </View>
  );
}

export function BackupScreen({}: Props) {
  const db = useSQLiteContext();
  const { refreshCategories } = useCategories();

  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remotePath, setRemotePath] = useState(DEFAULT_WEBDAV_REMOTE_PATH);

  const [configLoaded, setConfigLoaded] = useState(false);
  const [busy, setBusy] = useState<BusyKind>(null);

  const loadConfig = useCallback(async () => {
    try {
      const config = await getWebDAVConfig(db);
      if (config) {
        setServer(config.server);
        setUsername(config.username);
        setPassword(config.password);
        setRemotePath(config.remotePath || DEFAULT_WEBDAV_REMOTE_PATH);
      }
    } catch {
      // 忽略读取错误，用户可重新填写。
    } finally {
      setConfigLoaded(true);
    }
  }, [db]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  function isBusy(kind: BusyKind): boolean {
    return busy !== null && busy !== kind;
  }

  function buildConfigFromForm(): WebDAVConfig {
    return {
      server: server.trim(),
      username,
      password,
      remotePath: remotePath.trim() || DEFAULT_WEBDAV_REMOTE_PATH,
    };
  }

  async function withBusy(kind: Exclude<BusyKind, null>, task: () => Promise<void>) {
    if (busy !== null) return;
    setBusy(kind);
    try {
      await task();
    } catch (error) {
      Alert.alert(
        '操作失败',
        error instanceof Error ? error.message : '未知错误，请重试。',
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleExport() {
    await withBusy('export', async () => {
      await shareLocalBackupAsync(db);
    });
  }

  function confirmImport() {
    Alert.alert(
      '从文件恢复',
      '恢复将覆盖当前的全部资产、订阅、卡包、分类和图片，且不可撤销。建议先导出当前数据备份。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '继续恢复',
          style: 'destructive',
          onPress: () => void withBusy('import', doImport),
        },
      ],
    );
  }

  async function doImport() {
    const restored = await pickAndImportLocalBackupAsync(db);
    if (!restored) return;
    await refreshCategories();
    Alert.alert('恢复完成', '已从备份文件恢复数据。', [
      { text: '好的', onPress: () => {} },
    ]);
  }

  async function handleSaveConfig() {
    await withBusy('saveConfig', async () => {
      if (!server.trim()) {
        throw new Error('请填写 WebDAV 服务器地址');
      }
      await setWebDAVConfig(db, buildConfigFromForm());
      Alert.alert('已保存', 'WebDAV 配置已保存。');
    });
  }

  async function handleTestConnection() {
    await withBusy('testConnection', async () => {
      if (!server.trim()) {
        throw new Error('请先填写 WebDAV 服务器地址');
      }
      await testWebDAVConnectionAsync(buildConfigFromForm());
      Alert.alert('连接成功', 'WebDAV 服务器可访问，远端目录已就绪。');
    });
  }

  function confirmUpload() {
    Alert.alert(
      '上传到 WebDAV',
      '将用当前数据生成备份并覆盖远端同名文件。继续？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '上传',
          onPress: () => void withBusy('upload', doUpload),
        },
      ],
    );
  }

  async function doUpload() {
    await uploadBackupToWebDAVAsync(db, buildConfigFromForm());
    Alert.alert('上传成功', '备份已上传到 WebDAV 服务器。');
  }

  function confirmRestoreFromWebDAV() {
    Alert.alert(
      '从 WebDAV 恢复',
      '将从远端下载备份并覆盖当前的全部资产、订阅、卡包、分类和图片，且不可撤销。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '继续恢复',
          style: 'destructive',
          onPress: () => void withBusy('restore', doRestoreFromWebDAV),
        },
      ],
    );
  }

  async function doRestoreFromWebDAV() {
    await restoreFromWebDAVAsync(db, buildConfigFromForm());
    await refreshCategories();
    Alert.alert('恢复完成', '已从 WebDAV 备份恢复数据。');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <BrutalCard title="本地备份" titleColor={THEME.colors.primary}>
            <Text style={styles.sectionHint}>
              导出包含全部资产、订阅、卡包、分类与封面图片的备份文件，可保存到本地或分享给其他设备。
            </Text>
            <BrutalButton
              title="导出备份文件"
              onPress={handleExport}
              variant="primary"
              loading={busy === 'export'}
              disabled={busy !== null}
              style={styles.fullWidth}
            />
            <BrutalButton
              title="从备份文件恢复"
              onPress={confirmImport}
              variant="outline"
              loading={busy === 'import'}
              disabled={busy !== null}
              style={styles.fullWidth}
            />
            <Text style={styles.tipHint}>
              提示：恢复会覆盖当前数据，请先导出当前数据作为留底。备份文件不包含 WebDAV 密码。
            </Text>
          </BrutalCard>

          <BrutalCard title="WebDAV 云备份" titleColor={THEME.colors.accent}>
            <Text style={styles.sectionHint}>
              通过 WebDAV 协议把备份上传到你自己的网盘或 NAS（如坚果云、Nextcloud 等）。配置仅保存在本机。
            </Text>

            <PixelInput
              label="服务器地址"
              value={server}
              onChangeText={setServer}
              placeholder="https://dav.example.com/dav/"
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              editable={configLoaded && !busy}
            />
            <PixelInput
              label="用户名"
              value={username}
              onChangeText={setUsername}
              placeholder="WebDAV 账号"
              autoCapitalize="none"
              autoCorrect={false}
              editable={configLoaded && !busy}
            />
            <PixelInput
              label="密码 / 应用专用密码"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={configLoaded && !busy}
            />
            <PixelInput
              label="远端目录"
              value={remotePath}
              onChangeText={setRemotePath}
              placeholder={DEFAULT_WEBDAV_REMOTE_PATH}
              autoCapitalize="none"
              autoCorrect={false}
              editable={configLoaded && !busy}
            />

            <BrutalButton
              title="保存配置"
              onPress={handleSaveConfig}
              variant="primary"
              loading={busy === 'saveConfig'}
              disabled={isBusy('saveConfig')}
              style={styles.fullWidth}
            />
            <BrutalButton
              title="测试连接"
              onPress={handleTestConnection}
              variant="outline"
              loading={busy === 'testConnection'}
              disabled={isBusy('testConnection')}
              style={styles.fullWidth}
            />
            <BrutalButton
              title="上传备份到 WebDAV"
              onPress={confirmUpload}
              variant="accent"
              loading={busy === 'upload'}
              disabled={isBusy('upload')}
              style={styles.fullWidth}
            />
            <BrutalButton
              title="从 WebDAV 恢复"
              onPress={confirmRestoreFromWebDAV}
              variant="danger"
              loading={busy === 'restore'}
              disabled={isBusy('restore')}
              style={styles.fullWidth}
            />
            <Text style={styles.tipHint}>
              注意：HTTP（非 HTTPS）的 WebDAV 在 Android 上默认无法访问，请尽量使用 HTTPS。密码以明文存储在本地数据库中，仅用于发起到你指定服务器的请求。
            </Text>
          </BrutalCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  content: {
    padding: THEME.spacing.xl,
    paddingBottom: 40,
    gap: THEME.spacing.xl,
  },
  cardWrap: {
    paddingRight: 4,
    paddingBottom: 4,
  },
  cardShadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    borderRadius: THEME.borderRadius,
  },
  card: {
    backgroundColor: THEME.colors.surface,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: THEME.borderRadius,
    overflow: 'hidden',
  },
  cardHeader: {
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: THEME.spacing.sm + 2,
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
  },
  cardHeaderText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  cardBody: {
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: THEME.spacing.md,
    gap: THEME.spacing.sm,
  },
  sectionHint: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
  },
  tipHint: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textLight,
    lineHeight: 16,
  },
  fullWidth: {
    width: '100%',
  },
});
