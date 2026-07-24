import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../types';
import {
  initDB,
  getPreference,
  setPreference,
  getAllOneTimeItems,
  getAllSubscriptions,
  getAllStoredCards,
  getAllActiveMaintenancePlans,
} from '../database';
import { useCategories } from '../contexts/CategoriesContext';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import i18n, { SUPPORTED_LANGUAGES, type AppLanguage } from '../i18n';
import { BrutalButton } from '../components';
import { THEME, THEME_LIST, type ThemeId } from '../utils/constants';
import { deleteAllEntityImagesAsync } from '../utils/entityImages';
import { alertConfirm, alertError, alertSuccess, showPixelAlert } from '../utils/pixelAlert';
import {
  NOTIFICATION_ENABLED_KEY,
  requestNotificationPermissionsAsync,
  cancelAllScheduledNotificationsAsync,
  scheduleReminderNotificationsAsync,
  getScheduledNotificationCountAsync,
} from '../utils/notifications';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const GITHUB_LATEST_RELEASE_URL = 'https://api.github.com/repos/ther7777/DayValue/releases/latest';
const GITHUB_RELEASES_PAGE_URL = 'https://github.com/ther7777/DayValue/releases';
const APP_NAME = 'DayValue';

type GitHubReleaseResponse = {
  tag_name?: string;
  html_url?: string;
  assets?: Array<{
    browser_download_url?: string;
  }>;
};

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}

function parseSemverParts(version: string): [number, number, number] {
  const clean = normalizeVersion(version);
  const parts = clean.split('.');
  const major = Number.parseInt(parts[0]?.match(/\d+/)?.[0] ?? '0', 10);
  const minor = Number.parseInt(parts[1]?.match(/\d+/)?.[0] ?? '0', 10);
  const patch = Number.parseInt(parts[2]?.match(/\d+/)?.[0] ?? '0', 10);
  return [
    Number.isFinite(major) ? major : 0,
    Number.isFinite(minor) ? minor : 0,
    Number.isFinite(patch) ? patch : 0,
  ];
}

function compareSemver(a: string, b: string): number {
  const [a1, a2, a3] = parseSemverParts(a);
  const [b1, b2, b3] = parseSemverParts(b);
  if (a1 !== b1) return a1 > b1 ? 1 : -1;
  if (a2 !== b2) return a2 > b2 ? 1 : -1;
  if (a3 !== b3) return a3 > b3 ? 1 : -1;
  return 0;
}

function pickApkDownloadUrl(release: GitHubReleaseResponse): string | null {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const apk = assets.find(asset => {
    const url = asset?.browser_download_url;
    return typeof url === 'string' && url.toLowerCase().endsWith('.apk');
  });
  return typeof apk?.browser_download_url === 'string' ? apk.browser_download_url : null;
}

function BrutalCard({
  title,
  titleColor,
  children,
}: {
  title: string;
  titleColor: string;
  children: React.ReactNode;
}) {
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);
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

function SettingRow({
  title,
  value,
  onPress,
  showChevron = true,
  last = false,
  danger = false,
}: {
  title: string;
  value?: string;
  onPress?: () => void;
  showChevron?: boolean;
  last?: boolean;
  danger?: boolean;
}) {
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);
  const clickable = typeof onPress === 'function';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!clickable}
      activeOpacity={0.75}
      style={[styles.row, last && styles.rowLast]}
    >
      <Text style={[styles.rowTitle, danger && styles.rowTitleDanger]}>{title}</Text>
      <View style={styles.rowRight}>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        {clickable && showChevron ? <Text style={styles.rowChevron}>›</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

export function SettingsScreen({ navigation }: Props) {
  const db = useSQLiteContext();
  const { refreshCategories } = useCategories();
  const { themeId, setThemeId } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(), [themeId]);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [cacheCleaning, setCacheCleaning] = useState(false);
  const [cacheSizeText, setCacheSizeText] = useState('计算中...');
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderDays, setReminderDays] = useState('30');
  const [monthlyBudget, setMonthlyBudget] = useState('');
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [togglingNotification, setTogglingNotification] = useState(false);
  const [appLanguage, setAppLanguage] = useState<AppLanguage>(
    (i18n.language as AppLanguage) || 'zh-CN',
  );

  const REMINDER_ENABLED_KEY = 'reminder_enabled';
  const REMINDER_DAYS_KEY = 'reminder_days';
  const MONTHLY_BUDGET_KEY = 'monthly_budget';
  const APP_LANGUAGE_KEY = 'app_language';

  const currentVersion = useMemo(() => {
    const version = Constants.expoConfig?.version;
    return typeof version === 'string' && version.trim() ? version.trim() : '0.0.0';
  }, []);

  /** 计算缓存（实体图片目录）大小 */
  const refreshCacheSize = useCallback(async () => {
    try {
      const root = FileSystem.documentDirectory
        ? `${FileSystem.documentDirectory}entity-images`
        : null;
      if (!root) {
        setCacheSizeText('不可用');
        return;
      }
      const info = await FileSystem.getInfoAsync(root);
      if (!info.exists || !('size' in info) || typeof info.size !== 'number') {
        setCacheSizeText('0 B');
        return;
      }
      const bytes = info.size;
      let text: string;
      if (bytes < 1024) text = `${bytes} B`;
      else if (bytes < 1024 * 1024) text = `${(bytes / 1024).toFixed(1)} KB`;
      else text = `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
      setCacheSizeText(text);
    } catch {
      setCacheSizeText('未知');
    }
  }, []);

  const loadReminderPrefs = useCallback(async () => {
    try {
      const [enabled, days, budget, lang, notifEnabled] = await Promise.all([
        getPreference(db, REMINDER_ENABLED_KEY),
        getPreference(db, REMINDER_DAYS_KEY),
        getPreference(db, MONTHLY_BUDGET_KEY),
        getPreference(db, APP_LANGUAGE_KEY),
        getPreference(db, NOTIFICATION_ENABLED_KEY),
      ]);
      if (enabled !== null) setReminderEnabled(enabled === '1');
      if (days !== null && /^\d+$/.test(days)) setReminderDays(days);
      if (budget !== null && /^\d+(\.\d+)?$/.test(budget)) setMonthlyBudget(budget);
      if (notifEnabled !== null) setNotificationEnabled(notifEnabled === '1');
      if (lang === 'zh-CN' || lang === 'en-US') {
        setAppLanguage(lang);
        void i18n.changeLanguage(lang);
      }
    } catch (error) {
      console.error('加载提醒偏好失败', error);
    }
  }, [db]);

  useEffect(() => {
    void refreshCacheSize();
    void loadReminderPrefs();
  }, [refreshCacheSize, loadReminderPrefs]);

  const handleBudgetChange = useCallback((text: string) => {
    // 允许数字 + 小数点
    if (!/^\d*\.?\d*$/.test(text)) return;
    setMonthlyBudget(text);
  }, []);

  const handleBudgetBlur = useCallback(() => {
    const num = parseFloat(monthlyBudget);
    const normalized = Number.isFinite(num) && num > 0 ? String(num) : '';
    if (normalized !== monthlyBudget) setMonthlyBudget(normalized);
    void setPreference(db, MONTHLY_BUDGET_KEY, normalized).catch(error => {
      console.error('保存月度预算失败', error);
    });
  }, [db, monthlyBudget]);

  const handleToggleReminder = useCallback((next: boolean) => {
    setReminderEnabled(next);
    void setPreference(db, REMINDER_ENABLED_KEY, next ? '1' : '0').catch(error => {
      console.error('保存提醒开关失败', error);
    });
  }, [db]);

  const handleReminderDaysChange = useCallback((text: string) => {
    // 仅允许整数
    if (!/^\d*$/.test(text)) return;
    setReminderDays(text);
  }, []);

  const handleReminderDaysBlur = useCallback(() => {
    let num = parseInt(reminderDays, 10);
    if (Number.isNaN(num) || num < 1) num = 1;
    if (num > 365) num = 365;
    const normalized = String(num);
    if (normalized !== reminderDays) setReminderDays(normalized);
    void setPreference(db, REMINDER_DAYS_KEY, normalized).catch(error => {
      console.error('保存提醒天数失败', error);
    });
  }, [db, reminderDays]);

  const handleToggleNotification = useCallback(
    async (next: boolean) => {
      if (togglingNotification) return;

      if (!next) {
        try {
          await cancelAllScheduledNotificationsAsync();
        } catch {
          // 取消失败不影响关闭开关。
        }
        setNotificationEnabled(false);
        void setPreference(db, NOTIFICATION_ENABLED_KEY, '0').catch(error => {
          console.error('保存通知开关失败', error);
        });
        return;
      }

      setTogglingNotification(true);
      try {
        const granted = await requestNotificationPermissionsAsync();
        if (!granted) {
          alertError(
            '无法开启通知',
            '未获得通知权限，请在系统设置中允许通知后重试。',
          );
          return;
        }

        const [items, subscriptions, storedCards, maintenancePlans] = await Promise.all([
          getAllOneTimeItems(db),
          getAllSubscriptions(db),
          getAllStoredCards(db),
          getAllActiveMaintenancePlans(db),
        ]);
        const advanceDays = parseInt(reminderDays, 10) || 30;
        await scheduleReminderNotificationsAsync({
          items,
          subscriptions,
          storedCards,
          maintenancePlans,
          advanceDays,
        });
        const count = await getScheduledNotificationCountAsync();
        setNotificationEnabled(true);
        await setPreference(db, NOTIFICATION_ENABLED_KEY, '1');
        alertSuccess('通知已开启', `已调度 ${count} 条到期提醒，将在到期日推送。`);
      } catch (error) {
        alertError(
          '开启通知失败',
          error instanceof Error ? error.message : '请重试',
        );
      } finally {
        setTogglingNotification(false);
      }
    },
    [db, togglingNotification, reminderDays],
  );

  const handleLanguageChange = useCallback(
    (lang: AppLanguage) => {
      if (lang === appLanguage) return;
      setAppLanguage(lang);
      void i18n.changeLanguage(lang);
      void setPreference(db, APP_LANGUAGE_KEY, lang).catch(error => {
        console.error('保存语言偏好失败', error);
      });
    },
    [appLanguage, db],
  );

  async function handleCleanCache() {
    if (cacheCleaning) return;
    alertConfirm(
      '清理图片缓存',
      '将删除本机未被任何记录引用的图片文件（不会删除数据库中的记录）。建议清理前先备份。',
      () => void cleanCache(),
      { confirmText: '清理', destructive: true },
    );
  }

  async function cleanCache() {
    if (cacheCleaning) return;
    setCacheCleaning(true);
    try {
      await deleteAllEntityImagesAsync();
      await refreshCacheSize();
      alertSuccess('已清理', '图片缓存已清空。受影响记录将显示默认图标。');
    } catch (error) {
      alertError('清理失败', error instanceof Error ? error.message : '请重试');
    } finally {
      setCacheCleaning(false);
    }
  }

  async function openExternalUrl(
    url: string,
    failureTitle: string,
    failureMessage: string,
  ) {
    try {
      await Linking.openURL(url);
    } catch {
      alertError(failureTitle, `${failureMessage}\n\n${url}`);
    }
  }

  async function handleCheckUpdate() {
    if (checkingUpdate) return;

    setCheckingUpdate(true);
    try {
      const response = await fetch(GITHUB_LATEST_RELEASE_URL, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json = (await response.json()) as GitHubReleaseResponse;
      const latestTag = typeof json.tag_name === 'string' ? json.tag_name : '';
      if (!latestTag) {
        throw new Error('missing tag_name');
      }

      if (compareSemver(latestTag, currentVersion) <= 0) {
        alertSuccess('已是最新版', `当前版本 ${currentVersion} 已是最新。`);
        return;
      }

      const apkUrl = pickApkDownloadUrl(json);
      if (!apkUrl) {
        showPixelAlert(
          '发现新版本',
          `最新版本：${latestTag}\n未找到可直接下载的 APK 资源，请前往 GitHub Releases 页面手动下载。`,
          [
            { text: '取消', style: 'cancel' },
            {
              text: '打开 GitHub',
              onPress: () =>
                void openExternalUrl(
                  json.html_url ?? GITHUB_RELEASES_PAGE_URL,
                  '无法打开 GitHub',
                  '请手动打开 GitHub Releases 页面：',
                ),
            },
          ],
        );
        return;
      }

      showPixelAlert(
        '发现新版本',
        `最新版本：${latestTag}\n将直接打开 APK 下载链接。`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '下载 APK',
            onPress: () =>
              void openExternalUrl(
                apkUrl,
                '无法打开下载链接',
                '请手动打开下面的 APK 下载链接：',
              ),
          },
        ],
      );
    } catch {
      showPixelAlert(
        '检查更新失败',
        '网络异常或 GitHub 接口不可用，请稍后重试，或手动前往 GitHub Releases 页面下载。',
        [
          { text: '取消', style: 'cancel' },
          {
            text: '打开 GitHub',
            onPress: () =>
              void openExternalUrl(
                GITHUB_RELEASES_PAGE_URL,
                '无法打开 GitHub',
                '请手动打开 GitHub Releases 页面：',
              ),
          },
        ],
      );
    } finally {
      setCheckingUpdate(false);
    }
  }

  function confirmResetAllData() {
    if (resetting) return;

    alertConfirm(
      '警告：请确认',
      '这会永久删除你的全部资产、分期、订阅和卡包记录。此操作不可恢复。',
      () => void resetAllData(),
      { confirmText: '我已了解，继续删除', destructive: true },
    );
  }

  async function resetAllData() {
    if (resetting) return;

    setResetting(true);
    try {
      await deleteAllEntityImagesAsync();
      await db.execAsync(`
        DROP TABLE IF EXISTS OneTimeItems;
        DROP TABLE IF EXISTS Subscriptions;
        DROP TABLE IF EXISTS StoredCards;
        DROP TABLE IF EXISTS Categories;
        DROP TABLE IF EXISTS AppPreferences;
        DROP TABLE IF EXISTS one_time_items;
        DROP TABLE IF EXISTS subscriptions;
        DROP TABLE IF EXISTS stored_cards;
        DROP TABLE IF EXISTS _meta;
        PRAGMA user_version = 0;
      `);

      await initDB(db);
      await refreshCategories();

      showPixelAlert('已初始化', '已清除所有数据，并恢复示例配置。', [
        { text: '好的', onPress: () => navigation.popToTop() },
      ]);
    } catch {
      alertError('清除失败', '清除数据时发生错误，请重试。');
    } finally {
      setResetting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <BrutalCard title={t('settings.general')} titleColor={THEME.colors.primary}>
          <SettingRow title={t('settings.categories')} onPress={() => navigation.navigate('Categories')} />
          <SettingRow title={t('settings.backup')} onPress={() => navigation.navigate('Backup')} />
          <SettingRow title={t('settings.version')} value={currentVersion} showChevron={false} last />
        </BrutalCard>

        <BrutalCard title={t('settings.theme')} titleColor={THEME.colors.primaryLight}>
          <Text style={styles.themePickerHint}>
            {t('settings.theme_hint')}
          </Text>
          <View style={styles.themeGrid}>
            {THEME_LIST.map(theme => {
              const isActive = theme.id === themeId;
              return (
                <TouchableOpacity
                  key={theme.id}
                  style={[
                    styles.themeCard,
                    isActive && styles.themeCardActive,
                  ]}
                  onPress={() => setThemeId(theme.id as ThemeId)}
                  activeOpacity={0.7}
                >
                  <View style={styles.themeSwatchRow}>
                    <View
                      style={[
                        styles.themeSwatch,
                        { backgroundColor: theme.colors.primary },
                      ]}
                    />
                    <View
                      style={[
                        styles.themeSwatch,
                        { backgroundColor: theme.colors.accent },
                      ]}
                    />
                    <View
                      style={[
                        styles.themeSwatch,
                        { backgroundColor: theme.colors.success },
                      ]}
                    />
                    <View
                      style={[
                        styles.themeSwatch,
                        { backgroundColor: theme.colors.warning },
                      ]}
                    />
                    <View
                      style={[
                        styles.themeSwatch,
                        { backgroundColor: theme.colors.danger },
                      ]}
                    />
                  </View>
                  <View style={styles.themeInfo}>
                    <Text style={styles.themeName}>
                      {theme.emoji} {theme.name}
                    </Text>
                    <Text style={styles.themeDesc} numberOfLines={2}>
                      {theme.description}
                    </Text>
                  </View>
                  {isActive && (
                    <View style={styles.themeCheckBadge}>
                      <Text style={styles.themeCheckText}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </BrutalCard>

        <BrutalCard title={t('settings.language')} titleColor={THEME.colors.primaryLight}>
          <View style={styles.langGrid}>
            {SUPPORTED_LANGUAGES.map(lang => {
              const isActive = lang.id === appLanguage;
              return (
                <TouchableOpacity
                  key={lang.id}
                  style={[
                    styles.langCard,
                    isActive && styles.langCardActive,
                  ]}
                  onPress={() => handleLanguageChange(lang.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.langName}>{lang.nativeName}</Text>
                  {isActive ? (
                    <View style={styles.langCheckBadge}>
                      <Text style={styles.langCheckText}>✓</Text>
                    </View>
                  ) : (
                    <View style={styles.langCheckBadgePlaceholder} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </BrutalCard>

        <BrutalCard title={t('settings.reminders')} titleColor={THEME.colors.accent}>
          <View style={styles.row}>
            <View style={styles.reminderLabelBox}>
              <Text style={styles.rowTitle}>{t('settings.in_app_reminder')}</Text>
              <Text style={styles.reminderHint}>
                {t('settings.in_app_reminder_hint')}
              </Text>
            </View>
            <Switch
              value={reminderEnabled}
              onValueChange={handleToggleReminder}
              trackColor={{ false: THEME.colors.border, true: THEME.colors.accent }}
              thumbColor={THEME.colors.surface}
              ios_backgroundColor={THEME.colors.border}
            />
          </View>
          <View style={styles.row}>
            <View style={styles.reminderLabelBox}>
              <Text style={styles.rowTitle}>本地推送通知</Text>
              <Text style={styles.reminderHint}>
                开启后将在到期前主动推送通知提醒
              </Text>
            </View>
            <Switch
              value={notificationEnabled}
              onValueChange={v => void handleToggleNotification(v)}
              disabled={togglingNotification}
              trackColor={{ false: THEME.colors.border, true: THEME.colors.accent }}
              thumbColor={THEME.colors.surface}
              ios_backgroundColor={THEME.colors.border}
            />
          </View>
          <View style={[styles.row, styles.rowLast]}>
            <View style={styles.reminderLabelBox}>
              <Text style={styles.rowTitle}>{t('settings.advance_days')}</Text>
              <Text style={styles.reminderHint}>
                {t('settings.advance_days_hint')}
              </Text>
            </View>
            <View style={styles.reminderDaysInputBox}>
              <TextInput
                value={reminderDays}
                onChangeText={handleReminderDaysChange}
                onBlur={handleReminderDaysBlur}
                keyboardType="numeric"
                selectTextOnFocus
                style={styles.reminderDaysInput}
                editable={reminderEnabled || notificationEnabled}
              />
              <Text style={styles.reminderDaysSuffix}>{t('common.days')}</Text>
            </View>
          </View>
          {!reminderEnabled && (
            <Text style={styles.reminderDisabledHint}>
              {t('settings.reminder_disabled_hint')}
            </Text>
          )}
        </BrutalCard>

        <BrutalCard title={t('settings.monthly_budget')} titleColor={THEME.colors.primaryLight}>
          <View style={[styles.row, styles.rowLast]}>
            <View style={styles.reminderLabelBox}>
              <Text style={styles.rowTitle}>{t('settings.monthly_budget')}</Text>
              <Text style={styles.reminderHint}>
                {t('settings.monthly_budget_hint')}
              </Text>
            </View>
            <View style={styles.reminderDaysInputBox}>
              <TextInput
                value={monthlyBudget}
                onChangeText={handleBudgetChange}
                onBlur={handleBudgetBlur}
                keyboardType="numeric"
                selectTextOnFocus
                placeholder="0"
                style={styles.reminderDaysInput}
              />
              <Text style={styles.reminderDaysSuffix}>{t('common.yuan')}</Text>
            </View>
          </View>
          {monthlyBudget === '' && (
            <Text style={styles.reminderDisabledHint}>
              {t('settings.monthly_budget_empty_hint')}
            </Text>
          )}
        </BrutalCard>

        <BrutalCard title="存储" titleColor={THEME.colors.success}>
          <SettingRow
            title="图片缓存"
            value={cacheSizeText}
            showChevron={false}
          />
          <BrutalButton
            title="🧹 清理图片缓存"
            onPress={handleCleanCache}
            variant="outline"
            loading={cacheCleaning}
            disabled={cacheCleaning || resetting || checkingUpdate}
            style={{ width: '100%' }}
          />
          <Text style={styles.updateHint}>
            清理后已上传的封面图会丢失，记录本身不受影响。
          </Text>
        </BrutalCard>

        <BrutalCard title="版本更新" titleColor={THEME.colors.accent}>
          <BrutalButton
            title="检查并下载更新"
            onPress={handleCheckUpdate}
            variant="accent"
            loading={checkingUpdate}
            disabled={checkingUpdate || resetting}
            style={{ width: '100%' }}
          />
          <Text style={styles.updateHint}>
            提示：此功能需要联网；检测到 APK 后会直接打开下载链接。
          </Text>
        </BrutalCard>

        <BrutalCard title={t('settings.about')} titleColor={THEME.colors.warning}>
          <SettingRow title="应用名称" value={APP_NAME} showChevron={false} />
          <SettingRow title={t('settings.version')} value={currentVersion} showChevron={false} />
          <SettingRow
            title="关于 DayValue"
            onPress={() => navigation.navigate('About')}
            last
          />
        </BrutalCard>

        <BrutalCard title="危险区" titleColor={THEME.colors.dangerDark}>
          <Text style={styles.dangerHint}>
            清除后将恢复到首次启动时的示例数据状态。
          </Text>
          <BrutalButton
            title="⚠️ 清除所有数据"
            onPress={confirmResetAllData}
            variant="danger"
            loading={resetting}
            disabled={resetting || checkingUpdate}
            style={{ width: '100%' }}
          />
        </BrutalCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = () => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: THEME.colors.background,
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: THEME.spacing.md,
    borderBottomWidth: 1.5,
    borderBottomColor: THEME.colors.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowTitle: {
    fontSize: THEME.fontSize.md,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  rowTitleDanger: {
    color: THEME.colors.dangerDark,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowValue: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  rowChevron: {
    fontSize: 20,
    fontWeight: '900',
    color: THEME.colors.textLight,
    marginLeft: 4,
    marginTop: -1,
  },
  updateHint: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
  },
  dangerHint: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
  },
  reminderLabelBox: {
    flex: 1,
    paddingRight: THEME.spacing.md,
  },
  reminderHint: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textLight,
    marginTop: 2,
    lineHeight: 16,
  },
  reminderDaysInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reminderDaysInput: {
    width: 56,
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    borderRadius: 4,
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: 4,
    fontSize: THEME.fontSize.md,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
    backgroundColor: THEME.colors.background,
    textAlign: 'center',
  },
  reminderDaysSuffix: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  reminderDisabledHint: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.warning,
    marginTop: 4,
    fontWeight: '700',
  },
  themePickerHint: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.md,
    fontWeight: '600',
  },
  themeGrid: {
    gap: THEME.spacing.md,
  },
  themeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.md,
    backgroundColor: THEME.colors.background,
    borderWidth: 2,
    borderColor: THEME.colors.border,
    borderRadius: THEME.borderRadius,
    gap: THEME.spacing.md,
    position: 'relative',
  },
  themeCardActive: {
    borderColor: THEME.colors.primary,
    backgroundColor: THEME.colors.surface,
    ...THEME.pixelShadow,
  },
  themeSwatchRow: {
    flexDirection: 'row',
    gap: 0,
  },
  themeSwatch: {
    width: 18,
    height: 36,
    borderWidth: 1.5,
    borderColor: THEME.colors.borderDark,
    marginRight: -1.5,
  },
  themeInfo: {
    flex: 1,
    gap: 2,
  },
  themeName: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  themeDesc: {
    fontSize: 10,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
    lineHeight: 14,
  },
  themeCheckBadge: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: THEME.colors.primary,
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  themeCheckText: {
    color: THEME.colors.onPrimary,
    fontSize: 12,
    fontWeight: '900',
  },
  langGrid: {
    gap: THEME.spacing.sm,
  },
  langCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.md,
    backgroundColor: THEME.colors.background,
    borderWidth: 2,
    borderColor: THEME.colors.border,
    borderRadius: THEME.borderRadius,
  },
  langCardActive: {
    borderColor: THEME.colors.primary,
    backgroundColor: THEME.colors.surface,
    ...THEME.pixelShadow,
  },
  langName: {
    fontSize: THEME.fontSize.md,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  langCheckBadge: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: THEME.colors.primary,
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  langCheckText: {
    color: THEME.colors.onPrimary,
    fontSize: 12,
    fontWeight: '900',
  },
  langCheckBadgePlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: THEME.colors.border,
    backgroundColor: 'transparent',
  },
});
