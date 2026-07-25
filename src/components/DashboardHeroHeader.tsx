import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { CategoryInfo } from '../types';
import { THEME } from '../utils/constants';
import { useTheme } from '../contexts/ThemeContext';
import { formatCurrency } from '../utils/formatters';
import { AssetFilterChip } from './AssetFilterChip';

type DashboardTabKey = 'assets' | 'debts' | 'stored_cards';

export interface AssetStatusCounts {
  active: number;
  paused: number;
  sold: number;
}

interface DashboardHeroHeaderProps {
  activeTab: DashboardTabKey;
  topPadding: number;
  chrome: {
    backgroundColor: string;
    borderColor: string;
    subtitleColor?: string;
    costColor?: string;
    hintColor?: string;
  };
  assetDailyCost: number;
  assetSummary: string;
  selectedAssetCategory: CategoryInfo | null;
  isAssetFiltered: boolean;
  totalDebtDailyCost: number;
  totalInstallmentDebt: number;
  totalSubscriptionCost: number;
  totalPrincipal: number;
  activeStoredCardCount: number;
  netAssetValue: number;
  statusCounts: AssetStatusCounts;
  onPressStatistics: () => void;
  onPressSettings: () => void;
  onPressHelp: () => void;
  onPressShare: () => void;
  onPressCabinet: () => void;
  onPressAnnualReport: () => void;
  onPressCalendar: () => void;
  onPressAssetFilterTrigger: () => void;
  onClearAssetFilter: () => void;
  onTabChange: (tab: DashboardTabKey) => void;
}

export function DashboardHeroHeader({
  activeTab,
  topPadding,
  chrome,
  assetDailyCost,
  assetSummary,
  selectedAssetCategory,
  isAssetFiltered,
  totalDebtDailyCost,
  totalInstallmentDebt,
  totalSubscriptionCost,
  totalPrincipal,
  activeStoredCardCount,
  netAssetValue,
  statusCounts,
  onPressStatistics,
  onPressSettings,
  onPressHelp,
  onPressShare,
  onPressCabinet,
  onPressAnnualReport,
  onPressCalendar,
  onPressAssetFilterTrigger,
  onClearAssetFilter,
  onTabChange,
}: DashboardHeroHeaderProps) {
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);
  return (
    <View
      style={[
        styles.hero,
        {
          backgroundColor: chrome.backgroundColor,
          borderBottomColor: chrome.borderColor,
          paddingTop: topPadding,
        },
      ]}
    >
      <View style={styles.titleRow}>
        <Text style={styles.title}>DayValue</Text>
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onPressAnnualReport}
            activeOpacity={0.7}
            accessibilityLabel="年度回顾"
          >
            <Text style={styles.iconText}>📈</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onPressCalendar}
            activeOpacity={0.7}
            accessibilityLabel="资产日历"
          >
            <Text style={styles.iconText}>📅</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onPressShare}
            activeOpacity={0.7}
            accessibilityLabel="分享总览"
          >
            <Text style={styles.iconText}>📤</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onPressCabinet}
            activeOpacity={0.7}
            accessibilityLabel="数字陈列柜"
          >
            <Text style={styles.iconText}>🗄️</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onPressStatistics}
            activeOpacity={0.7}
            accessibilityLabel="统计详情"
          >
            <Text style={styles.iconText}>📊</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onPressSettings}
            activeOpacity={0.7}
            accessibilityLabel="设置"
          >
            <Text style={styles.iconText}>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.helpButton}
            onPress={onPressHelp}
            activeOpacity={0.7}
            accessibilityLabel="帮助"
          >
            <Text style={styles.helpText}>?</Text>
          </TouchableOpacity>
        </View>
      </View>

      {activeTab === 'assets' && (
        <>
          <View style={styles.costRow}>
            <View style={styles.costLeft}>
              <Text style={styles.costSubtitle}>今日日均</Text>
              <Text style={styles.cost}>
                {formatCurrency(assetDailyCost)}
                <Text style={styles.unit}>/天</Text>
              </Text>
            </View>
            <AssetFilterChip
              selectedCategory={selectedAssetCategory}
              isFiltered={isAssetFiltered}
              onPressTrigger={onPressAssetFilterTrigger}
              onClear={onClearAssetFilter}
            />
          </View>
        </>
      )}

      {activeTab === 'debts' && (
        <>
          <View style={styles.costRow}>
            <View style={styles.costLeft}>
              <Text style={[styles.costSubtitle, styles.debtSubtitle]}>今日固定流失</Text>
              <Text style={styles.cost}>
                {formatCurrency(totalDebtDailyCost)}
                <Text style={styles.unit}>/天</Text>
              </Text>
            </View>
          </View>
        </>
      )}

      {activeTab === 'stored_cards' && (
        <>
          <View style={styles.costRow}>
            <View style={styles.costLeft}>
              <Text style={[styles.costSubtitle, styles.storedSubtitle]}>实际沉睡本金</Text>
              <Text style={[styles.cost, chrome.costColor ? { color: chrome.costColor } : null]}>
                {formatCurrency(totalPrincipal)}
              </Text>
            </View>
          </View>
        </>
      )}

      {/* 合并后的元信息行：左侧 hint 文案，右侧净资产 + 状态计数。
          原来这分三行（assetHintLine / netWorthRow / 状态），现合并为单行节省垂直空间。 */}
      <View style={styles.metaRow}>
        <Text
          style={[
            styles.metaHint,
            chrome.hintColor ? { color: chrome.hintColor } : null,
          ]}
          numberOfLines={1}
        >
          {activeTab === 'assets'
            ? assetSummary
            : activeTab === 'debts'
              ? `分期 ${formatCurrency(totalInstallmentDebt)} · 订阅 ${formatCurrency(totalSubscriptionCost)}`
              : `${activeStoredCardCount} 张在用 · 越早更新越不易遗忘`}
        </Text>
        <View style={styles.metaRight}>
          <Text style={styles.netWorthInline}>
            净{formatCurrency(netAssetValue)}
          </Text>
          <View style={styles.statusRow}>
            <View style={styles.statusChip}>
              <View style={[styles.statusDot, { backgroundColor: THEME.colors.success }]} />
              <Text style={styles.statusText}>{statusCounts.active}</Text>
            </View>
            <View style={styles.statusChip}>
              <View style={[styles.statusDot, { backgroundColor: THEME.colors.warning }]} />
              <Text style={styles.statusText}>{statusCounts.paused}</Text>
            </View>
            <View style={styles.statusChip}>
              <View style={[styles.statusDot, { backgroundColor: THEME.colors.danger }]} />
              <Text style={styles.statusText}>{statusCounts.sold}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.tabsRow}>
        {([
          { key: 'assets', label: '买断资产' },
          { key: 'debts', label: '每日消耗' },
          { key: 'stored_cards', label: '沉睡卡包' },
        ] as const).map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              onPress={() => onTabChange(tab.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  hero: {
    paddingHorizontal: THEME.spacing.xl,
    paddingBottom: 4,
    borderBottomWidth: 2,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
  },
  title: {
    fontSize: 16,
    fontFamily: THEME.fontFamily.pixel,
    color: THEME.colors.onPrimary,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 12,
  },
  helpButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  helpText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '700',
  },
  // 副标题与成本数字纵向紧贴成一组
  costLeft: {
    flexDirection: 'column',
    flexShrink: 1,
    gap: 0,
  },
  costSubtitle: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '700',
    marginBottom: 0,
  },
  // 成本数字与右侧筛选 chip 同一行
  costRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: THEME.spacing.xs,
    minWidth: 0,
    marginTop: 2,
  },
  cost: {
    fontSize: 18,
    fontFamily: THEME.fontFamily.pixel,
    color: THEME.colors.onPrimary,
    flexShrink: 0,
  },
  unit: {
    fontSize: 10,
    fontFamily: undefined,
  },
  // 合并后的元信息行：左 hint 右净资产+状态，单行承载
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 3,
    paddingTop: 3,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.18)',
  },
  metaHint: {
    flex: 1,
    fontSize: 9,
    color: 'rgba(255,255,255,0.8)',
    minWidth: 0,
  },
  metaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  },
  // 净资产 inline：标签与数值紧贴，单字符前缀节省空间
  netWorthInline: {
    fontSize: 10,
    fontFamily: THEME.fontFamily.pixel,
    color: THEME.colors.onPrimary,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 10,
    color: THEME.colors.onPrimary,
    marginBottom: 2,
    marginTop: 2,
  },
  debtSubtitle: {
    color: THEME.colors.danger,
  },
  storedSubtitle: {
    color: THEME.colors.highlight,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 2,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 4,
    gap: 2,
  },
  statusDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  statusText: {
    fontSize: 8,
    color: THEME.colors.onPrimary,
    fontWeight: '700',
  },
  // 底部 tab 切换行，作为 Hero 的一部分，省掉独立一行
  tabsRow: {
    flexDirection: 'row',
    marginTop: 3,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
  },
  tabButtonActive: {
    borderColor: THEME.colors.onPrimary,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  tabText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
  },
  tabTextActive: {
    color: THEME.colors.onPrimary,
    fontWeight: '900',
  },
});
