import React, { useMemo, useState } from 'react';
import {
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../types';
import { THEME } from '../utils/constants';
import { alertError } from '../utils/pixelAlert';

type Props = NativeStackScreenProps<RootStackParamList, 'About'>;

const GITHUB_REPO_URL = 'https://github.com/ther7777/DayValue';
const GITHUB_ISSUES_URL = 'https://github.com/ther7777/DayValue/issues';
const LICENSE_URL = 'https://www.gnu.org/licenses/agpl-3.0.html';

/** 更新日志（最近版本） */
const CHANGELOG: Array<{ version: string; date: string; notes: string[] }> = [
  {
    version: '1.1.0',
    date: '2026-07',
    notes: [
      '新增：维修 / 保养记录与真实持有成本汇总',
      '新增：资产健康度评分（服役 / 保修 / 状态三维）',
      '新增：净资产历史快照与趋势追踪',
      '新增：月度支出趋势（购置/分期/订阅/维修）',
      '新增：订阅续费提醒与年度预算投影',
      '新增：保修状态筛选与到期提醒',
      '新增：资产备注、购买渠道、序列号字段',
      '新增：数字陈列柜搜索与分类筛选',
      '新增：独立「关于」页与开源协议展示',
    ],
  },
  {
    version: '1.0.6',
    date: '2026-06',
    notes: [
      '基础功能：买断资产 / 每日消耗 / 沉睡卡包',
      '支持分期 IRR 计算与影子日供',
      '支持像素风分享卡片导出',
      '支持 WebDAV 云备份与本地备份恢复',
    ],
  },
];

const ACKNOWLEDGEMENTS: Array<{ name: string; license: string }> = [
  { name: 'React Native', license: 'MIT' },
  { name: 'Expo', license: 'MIT' },
  { name: 'expo-sqlite', license: 'MIT' },
  { name: 'react-navigation', license: 'MIT' },
  { name: 'react-native-chart-kit', license: 'MIT' },
  { name: 'react-native-svg', license: 'MIT' },
  { name: 'expo-image', license: 'MIT' },
  { name: 'expo-sharing', license: 'MIT' },
  { name: 'expo-media-library', license: 'MIT' },
  { name: 'expo-document-picker', license: 'MIT' },
  { name: '@expo-google-fonts/press-start-2p', license: 'MIT' },
];

function SectionCard({
  title,
  accentColor,
  children,
}: {
  title: string;
  accentColor: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.cardWrap}>
      <View style={styles.cardShadow} pointerEvents="none" />
      <View style={styles.card}>
        <View style={[styles.cardHeader, { backgroundColor: accentColor }]}>
          <Text style={styles.cardHeaderText}>{title}</Text>
        </View>
        <View style={styles.cardBody}>{children}</View>
      </View>
    </View>
  );
}

export function AboutScreen({}: Props) {
  const [licenseModalVisible, setLicenseModalVisible] = useState(false);
  const [ackModalVisible, setAckModalVisible] = useState(false);

  const appVersion = useMemo(() => {
    const version = Constants.expoConfig?.version;
    return typeof version === 'string' && version.trim() ? version.trim() : '0.0.0';
  }, []);

  async function openUrl(url: string, failureTitle: string, failureMessage: string) {
    try {
      await Linking.openURL(url);
    } catch {
      alertError(failureTitle, `${failureMessage}\n\n${url}`);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <View style={styles.heroIconBox}>
            <Text style={styles.heroIcon}>💵</Text>
          </View>
          <Text style={styles.heroTitle}>DayValue</Text>
          <Text style={styles.heroSubtitle}>让每一笔花销都看见「日均成本」</Text>
          <View style={styles.heroVersionPill}>
            <Text style={styles.heroVersionText}>v{appVersion}</Text>
          </View>
        </View>

        <SectionCard title="项目简介" accentColor={THEME.colors.primary}>
          <Text style={styles.paragraph}>
            DayValue 是一款开源的资产持有成本追踪应用，用「日均成本」的视角衡量每一次购买：买断资产到底用得值不值？分期月供每天消耗多少？储值卡是不是在沉睡？
          </Text>
          <Text style={styles.paragraph}>
            所有数据仅保存在本机 SQLite 数据库中，不上传任何服务器；可随时通过 WebDAV 或本地文件备份/恢复。
          </Text>
        </SectionCard>

        <SectionCard title="更新日志" accentColor={THEME.colors.accent}>
          {CHANGELOG.map(entry => (
            <View key={entry.version} style={styles.changelogEntry}>
              <View style={styles.changelogHeader}>
                <Text style={styles.changelogVersion}>v{entry.version}</Text>
                <Text style={styles.changelogDate}>{entry.date}</Text>
              </View>
              {entry.notes.map((note, idx) => (
                <View key={`note-${entry.version}-${idx}`} style={styles.changelogNoteRow}>
                  <Text style={styles.changelogBullet}>·</Text>
                  <Text style={styles.changelogNoteText}>{note}</Text>
                </View>
              ))}
            </View>
          ))}
        </SectionCard>

        <SectionCard title="开源与协议" accentColor={THEME.colors.warning}>
          <Text style={styles.paragraph}>
            本应用基于 AGPL-3.0 协议开源。你可以自由使用、修改和分发，但衍生作品必须同样开源。
          </Text>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() =>
              openUrl(GITHUB_REPO_URL, '无法打开', '请手动访问 GitHub 仓库：')
            }
            activeOpacity={0.7}
          >
            <Text style={styles.linkIcon}>📦</Text>
            <View style={styles.linkInfo}>
              <Text style={styles.linkTitle}>GitHub 仓库</Text>
              <Text style={styles.linkUrl} numberOfLines={1}>github.com/ther7777/DayValue</Text>
            </View>
            <Text style={styles.linkChevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => setLicenseModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.linkIcon}>📜</Text>
            <View style={styles.linkInfo}>
              <Text style={styles.linkTitle}>开源协议</Text>
              <Text style={styles.linkUrl} numberOfLines={1}>AGPL-3.0 全文</Text>
            </View>
            <Text style={styles.linkChevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() =>
              openUrl(GITHUB_ISSUES_URL, '无法打开', '请手动访问 Issues 页面：')
            }
            activeOpacity={0.7}
          >
            <Text style={styles.linkIcon}>🐛</Text>
            <View style={styles.linkInfo}>
              <Text style={styles.linkTitle}>反馈 / 提交 Bug</Text>
              <Text style={styles.linkUrl} numberOfLines={1}>GitHub Issues</Text>
            </View>
            <Text style={styles.linkChevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.linkRow, styles.linkRowLast]}
            onPress={() => setAckModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.linkIcon}>🙏</Text>
            <View style={styles.linkInfo}>
              <Text style={styles.linkTitle}>第三方依赖许可</Text>
              <Text style={styles.linkUrl} numberOfLines={1}>共 {ACKNOWLEDGEMENTS.length} 项</Text>
            </View>
            <Text style={styles.linkChevron}>›</Text>
          </TouchableOpacity>
        </SectionCard>

        <Text style={styles.footerText}>
          Made with ❤️ · AGPL-3.0 · 数据本机存储
        </Text>
      </ScrollView>

      {/* AGPL-3.0 协议全文 Modal */}
      <Modal
        visible={licenseModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLicenseModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>AGPL-3.0 协议</Text>
              <TouchableOpacity
                onPress={() => setLicenseModalVisible(false)}
                activeOpacity={0.6}
              >
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent}>
              <Text style={styles.licenseText}>
                GNU Affero General Public License v3.0{'\n\n'}
                Copyright (C) 2026 DayValue contributors{'\n\n'}
                本程序是自由软件：你可以重新分发和/或修改它，条件是遵守由自由软件基金会发布的 GNU Affero 通用公共许可证第 3 版，或（按你的选择）任何更高版本。{'\n\n'}
                本程序的发布旨在希望它有用，但不附带任何担保；甚至不附带适销性或特定用途适用性的默示担保。详见 GNU Affero 通用公共许可证。{'\n\n'}
                你应该已随本程序收到一份 GNU Affero 通用公共许可证的副本。如果没有，请访问 https://www.gnu.org/licenses/agpl-3.0.html{'\n\n'}
                任何使用、修改、分发本程序的网络服务也必须开源其完整源代码。
              </Text>
              <TouchableOpacity
                style={styles.modalLinkBtn}
                onPress={() => openUrl(LICENSE_URL, '无法打开', '请手动访问：')}
                activeOpacity={0.75}
              >
                <Text style={styles.modalLinkBtnText}>查看完整协议 ›</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 第三方依赖 Modal */}
      <Modal
        visible={ackModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAckModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>第三方依赖</Text>
              <TouchableOpacity
                onPress={() => setAckModalVisible(false)}
                activeOpacity={0.6}
              >
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent}>
              {ACKNOWLEDGEMENTS.map(item => (
                <View key={item.name} style={styles.ackRow}>
                  <Text style={styles.ackName}>{item.name}</Text>
                  <Text style={styles.ackLicense}>{item.license}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  heroCard: {
    backgroundColor: THEME.colors.primary,
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    borderRadius: THEME.borderRadius,
    paddingVertical: THEME.spacing.xxl,
    paddingHorizontal: THEME.spacing.xl,
    alignItems: 'center',
    ...THEME.pixelShadow,
  },
  heroIconBox: {
    width: 72,
    height: 72,
    borderRadius: THEME.borderRadius,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: THEME.spacing.md,
  },
  heroIcon: {
    fontSize: 40,
  },
  heroTitle: {
    fontSize: THEME.fontSize.xxl,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  heroSubtitle: {
    fontSize: THEME.fontSize.sm,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 6,
    textAlign: 'center',
  },
  heroVersionPill: {
    marginTop: THEME.spacing.md,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
  },
  heroVersionText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '900',
    color: THEME.colors.primaryDark,
    fontFamily: THEME.fontFamily.pixel,
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
  paragraph: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textPrimary,
    lineHeight: 20,
  },
  changelogEntry: {
    paddingVertical: THEME.spacing.xs,
  },
  changelogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  changelogVersion: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '900',
    color: THEME.colors.primaryDark,
    fontFamily: THEME.fontFamily.pixel,
  },
  changelogDate: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textLight,
    fontWeight: '700',
  },
  changelogNoteRow: {
    flexDirection: 'row',
    gap: 6,
    marginVertical: 2,
  },
  changelogBullet: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '900',
    color: THEME.colors.accent,
  },
  changelogNoteText: {
    flex: 1,
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textSecondary,
    lineHeight: 17,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: THEME.spacing.md,
    borderBottomWidth: 1.5,
    borderBottomColor: THEME.colors.border,
    gap: THEME.spacing.sm,
  },
  linkRowLast: {
    borderBottomWidth: 0,
  },
  linkIcon: {
    fontSize: 18,
  },
  linkInfo: {
    flex: 1,
    minWidth: 0,
  },
  linkTitle: {
    fontSize: THEME.fontSize.md,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  linkUrl: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textLight,
    marginTop: 2,
  },
  linkChevron: {
    fontSize: 20,
    fontWeight: '900',
    color: THEME.colors.textLight,
  },
  footerText: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textLight,
    textAlign: 'center',
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: THEME.spacing.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '80%',
    backgroundColor: THEME.colors.surface,
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    borderRadius: THEME.borderRadius,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: THEME.spacing.md,
    backgroundColor: THEME.colors.primary,
    borderBottomWidth: 2,
    borderBottomColor: THEME.colors.borderDark,
  },
  modalTitle: {
    fontSize: THEME.fontSize.md,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  modalClose: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  modalBody: {
    maxHeight: 460,
  },
  modalBodyContent: {
    padding: THEME.spacing.lg,
    gap: THEME.spacing.sm,
  },
  licenseText: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textPrimary,
    lineHeight: 20,
  },
  modalLinkBtn: {
    marginTop: THEME.spacing.sm,
    alignSelf: 'flex-start',
    paddingVertical: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.md,
    backgroundColor: THEME.colors.primaryLight + '40',
    borderWidth: 1.5,
    borderColor: THEME.colors.primary,
    borderRadius: 4,
  },
  modalLinkBtnText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '900',
    color: THEME.colors.primaryDark,
  },
  ackRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: THEME.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  ackName: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  ackLicense: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '800',
    color: THEME.colors.textSecondary,
    backgroundColor: THEME.colors.background,
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
});
