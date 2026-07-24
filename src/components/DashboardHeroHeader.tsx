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
  onPressAssetFilterTrigger: () => void;
  onClearAssetFilter: () => void;
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
  onPressAssetFilterTrigger,
  onClearAssetFilter,
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
          >
            <Text style={styles.iconText}>📊</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onPressSettings}
            activeOpacity={0.7}
          >
            <Text style={styles.iconText}>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.helpButton}
            onPress={onPressHelp}
            activeOpacity={0.7}
          >
            <Text style={styles.helpText}>?</Text>
          </TouchableOpacity>
        </View>
      </View>

      {activeTab === 'assets' && (
        <>
          <View style={styles.assetSubtitleRow}>
            <Text
              style={styles.assetSubtitle}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              今日日均成本 ·
            </Text>
            <AssetFilterChip
              selectedCategory={selectedAssetCategory}
              isFiltered={isAssetFiltered}
              onPressTrigger={onPressAssetFilterTrigger}
              onClear={onClearAssetFilter}
            />
          </View>
          <View style={styles.costRow}>
            <Text style={styles.cost}>
              {formatCurrency(assetDailyCost)}
              <Text style={styles.unit}>/天</Text>
            </Text>
            <Text style={styles.assetHintInline} numberOfLines={1}>
              {assetSummary}
            </Text>
          </View>
        </>
      )}

      {activeTab === 'debts' && (
        <>
          <Text style={[styles.subtitle, styles.debtSubtitle]}>今日固定流失</Text>
          <View style={styles.costRow}>
            <Text style={styles.cost}>
              {formatCurrency(totalDebtDailyCost)}
              <Text style={styles.unit}>/天</Text>
            </Text>
            <Text style={styles.assetHintInline} numberOfLines={1}>
              分期 {formatCurrency(totalInstallmentDebt)} · 订阅 {formatCurrency(totalSubscriptionCost)}
            </Text>
          </View>
        </>
      )}

      {activeTab === 'stored_cards' && (
        <>
          <Text style={[styles.subtitle, styles.storedSubtitle]}>实际沉睡本金</Text>
          <View style={styles.costRow}>
            <Text style={[styles.cost, chrome.costColor ? { color: chrome.costColor } : null]}>
              {formatCurrency(totalPrincipal)}
            </Text>
            <Text
              style={[
                styles.assetHintInline,
                chrome.hintColor ? { color: chrome.hintColor } : null,
              ]}
              numberOfLines={1}
            >
              {activeStoredCardCount} 张在用 · 越早更新越不易遗忘
            </Text>
          </View>
        </>
      )}

      <View style={styles.netWorthRow}>
        <View style={styles.netWorthBlock}>
          <Text style={styles.netWorthLabel}>净资产估算</Text>
          <Text style={styles.netWorthValue}>{formatCurrency(netAssetValue)}</Text>
        </View>
        <View style={styles.statusRow}>
          <View style={styles.statusChip}>
            <View style={[styles.statusDot, { backgroundColor: THEME.colors.success }]} />
            <Text style={styles.statusText}>服役 {statusCounts.active}</Text>
          </View>
          <View style={styles.statusChip}>
            <View style={[styles.statusDot, { backgroundColor: THEME.colors.warning }]} />
            <Text style={styles.statusText}>停用 {statusCounts.paused}</Text>
          </View>
          <View style={styles.statusChip}>
            <View style={[styles.statusDot, { backgroundColor: THEME.colors.danger }]} />
            <Text style={styles.statusText}>售出 {statusCounts.sold}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  hero: {
    paddingHorizontal: THEME.spacing.xl,
    paddingBottom: THEME.spacing.sm,
    borderBottomWidth: 2,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  title: {
    fontSize: 18,
    fontFamily: THEME.fontFamily.pixel,
    color: THEME.colors.onPrimary,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 13,
  },
  helpButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
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
  assetSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    minWidth: 0,
    marginTop: 2,
    marginBottom: 2,
  },
  assetSubtitle: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.onPrimary,
    fontWeight: '700',
    marginRight: THEME.spacing.xs,
    flexShrink: 0,
  },
  subtitle: {
    fontSize: THEME.fontSize.xs,
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
  // 成本数字与提示放在同一行，节省垂直空间
  costRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: THEME.spacing.sm,
    minWidth: 0,
  },
  cost: {
    fontSize: 20,
    fontFamily: THEME.fontFamily.pixel,
    color: THEME.colors.onPrimary,
    flexShrink: 0,
  },
  unit: {
    fontSize: THEME.fontSize.xs,
    fontFamily: undefined,
  },
  // 内联提示文字，放在 cost 旁边，不再单独占一行
  assetHintInline: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.onPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
  netWorthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: THEME.spacing.xs,
    paddingTop: THEME.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.18)',
  },
  netWorthBlock: {
    flexShrink: 1,
  },
  netWorthLabel: {
    fontSize: 10,
    color: THEME.colors.onPrimary,
    fontWeight: '700',
    marginBottom: 2,
  },
  netWorthValue: {
    fontSize: THEME.fontSize.md,
    fontFamily: THEME.fontFamily.pixel,
    color: THEME.colors.onPrimary,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  statusText: {
    fontSize: 10,
    color: THEME.colors.onPrimary,
    fontWeight: '700',
  },
});
