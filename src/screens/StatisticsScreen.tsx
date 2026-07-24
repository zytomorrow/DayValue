import React, { useCallback, useMemo, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PieChart } from 'react-native-chart-kit';

import type { CategoryInfo, MaintenanceLog, NetWorthSnapshot, OneTimeItem, RootStackParamList, StoredCard, Subscription } from '../types';
import { getAllMaintenanceLogs, getAllOneTimeItems, getAllStoredCards, getAllSubscriptions, getRecentNetWorthSnapshots, upsertNetWorthSnapshot } from '../database';
import { useCategories } from '../contexts/CategoriesContext';
import {
  calculateDailyCost,
  calculateDailyDebt,
  calculateDepreciatedValue,
  calculateMonthlySpendingTrend,
  calculateNetAssetValue,
  calculateOneTimeItemActiveDays,
  calculateStoredPrincipal,
  calculateSubscriptionDailyCost,
} from '../utils/calculations';
import { formatCurrency, getTodayString } from '../utils/formatters';
import { THEME } from '../utils/constants';
import { EmptyState } from '../components';
import { alertSuccess } from '../utils/pixelAlert';

type Props = NativeStackScreenProps<RootStackParamList, 'Statistics'>;

type PieSeriesItem = {
  categoryId: string;
  name: string;
  icon: string;
  value: number;
  color: string;
};

const PALETTE = [
  '#6C5CE7',
  '#00CEC9',
  '#0984E3',
  '#00B894',
  '#FDCB6E',
  '#E17055',
  '#D63031',
  '#A29BFE',
  '#81ECEC',
  '#74B9FF',
];

function fallbackCategory(
  categoryId: string,
  type: 'item' | 'subscription' | 'stored_card',
): CategoryInfo {
  if (categoryId === 'other') {
    if (type === 'subscription') return { id: 'other', name: '其他服务', icon: '📦' };
    if (type === 'stored_card') return { id: 'other', name: '其他卡包', icon: '💳' };
    return { id: 'other', name: '其他资产', icon: '📦' };
  }

  return { id: categoryId, name: categoryId, icon: '📦' };
}

function buildPieSeries(
  sumsByCategoryId: Map<string, number>,
  resolveInfo: (categoryId: string) => CategoryInfo,
): PieSeriesItem[] {
  const entries = Array.from(sumsByCategoryId.entries())
    .filter(([, value]) => value > 0)
    .sort(([left], [right]) => left.localeCompare(right));

  return entries.map(([categoryId, value], index) => {
    const info = resolveInfo(categoryId);
    return {
      categoryId,
      name: info.name,
      icon: info.icon,
      value,
      color: PALETTE[index % PALETTE.length],
    };
  });
}

function toPieChartData(series: PieSeriesItem[]) {
  return series.map(item => ({
    name: `${item.icon} ${item.name}`,
    population: item.value,
    color: item.color,
    legendFontColor: THEME.colors.textSecondary,
    legendFontSize: 12,
  }));
}

function formatPercent(value: number, total: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return '0%';
  const percent = (value / total) * 100;
  if (!Number.isFinite(percent) || percent <= 0) return '0%';
  if (percent < 0.1) return '<0.1%';
  if (percent < 10) return `${percent.toFixed(1)}%`;
  return `${percent.toFixed(0)}%`;
}

function LegendList({
  series,
  total,
  valueSuffix,
}: {
  series: PieSeriesItem[];
  total: number;
  valueSuffix?: string;
}) {
  return (
    <View style={styles.legend}>
      {series.map(item => (
        <View key={item.categoryId} style={styles.legendRow}>
          <View style={styles.legendLeft}>
            <View style={[styles.legendSwatch, { backgroundColor: item.color }]} />
            <Text style={styles.legendName} numberOfLines={1}>
              {item.icon} {item.name}
            </Text>
          </View>
          <Text style={styles.legendMeta} numberOfLines={1}>
            {formatPercent(item.value, total)} · {formatCurrency(item.value)}
            {valueSuffix ?? ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function StatisticsScreen({}: Props) {
  const db = useSQLiteContext();
  const { itemCategories, subscriptionCategories, storedCardCategories } = useCategories();
  const [items, setItems] = useState<OneTimeItem[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [storedCards, setStoredCards] = useState<StoredCard[]>([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLog[]>([]);
  const [snapshots, setSnapshots] = useState<NetWorthSnapshot[]>([]);
  const [snapshotBusy, setSnapshotBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextItems, nextSubscriptions, nextStoredCards, nextLogs, nextSnapshots] = await Promise.all([
        getAllOneTimeItems(db),
        getAllSubscriptions(db),
        getAllStoredCards(db),
        getAllMaintenanceLogs(db),
        getRecentNetWorthSnapshots(db, 30),
      ]);
      setItems(nextItems);
      setSubscriptions(nextSubscriptions);
      setStoredCards(nextStoredCards);
      setMaintenanceLogs(nextLogs);
      setSnapshots(nextSnapshots);
    } catch (error) {
      console.error('加载统计数据失败', error);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const chartWidth = Math.min(Dimensions.get('window').width - THEME.spacing.xl * 2, 520);
  const piePaddingLeft = String(Math.round(chartWidth / 4));

  const resolveItemCategory = useCallback(
    (categoryId: string) =>
      itemCategories.find(category => category.id === categoryId) ??
      fallbackCategory(categoryId, 'item'),
    [itemCategories],
  );

  const resolveSubscriptionCategory = useCallback(
    (categoryId: string) =>
      subscriptionCategories.find(category => category.id === categoryId) ??
      itemCategories.find(category => category.id === categoryId) ??
      fallbackCategory(categoryId, 'subscription'),
    [itemCategories, subscriptionCategories],
  );

  const resolveStoredCardCategory = useCallback(
    (categoryId: string) =>
      storedCardCategories.find(category => category.id === categoryId) ??
      fallbackCategory(categoryId, 'stored_card'),
    [storedCardCategories],
  );

  const assetSeries = useMemo(() => {
    const sums = new Map<string, number>();
    for (const item of items) {
      if (item.status !== 'active') continue;
      const categoryId = item.category ?? 'other';
      sums.set(categoryId, (sums.get(categoryId) ?? 0) + item.total_price);
    }
    return buildPieSeries(sums, resolveItemCategory);
  }, [items, resolveItemCategory]);

  const dailySeries = useMemo(() => {
    const sums = new Map<string, number>();

    for (const item of items) {
      if (item.status !== 'unredeemed') continue;
      const categoryId = item.category ?? 'other';
      const dailyDebt = calculateDailyDebt(item.monthly_payment ?? 0);
      sums.set(categoryId, (sums.get(categoryId) ?? 0) + dailyDebt);
    }

    for (const subscription of subscriptions) {
      if (subscription.status !== 'active') continue;
      const categoryId = subscription.category ?? 'other';
      const dailyCost = calculateSubscriptionDailyCost(
        subscription.cycle_price,
        subscription.billing_cycle,
      );
      sums.set(categoryId, (sums.get(categoryId) ?? 0) + dailyCost);
    }

    return buildPieSeries(sums, resolveSubscriptionCategory);
  }, [items, resolveSubscriptionCategory, subscriptions]);

  const storedCardSeries = useMemo(() => {
    const sums = new Map<string, number>();
    for (const card of storedCards) {
      if (card.status !== 'active') continue;
      const categoryId = card.category ?? 'other';
      const principal = calculateStoredPrincipal(
        card.actual_paid,
        card.face_value,
        card.current_balance,
      );
      sums.set(categoryId, (sums.get(categoryId) ?? 0) + principal);
    }
    return buildPieSeries(sums, resolveStoredCardCategory);
  }, [resolveStoredCardCategory, storedCards]);

  /** 折旧汇总：在用/停用资产的买入总价 vs 当前折旧现值 */
  const depreciationSummary = useMemo(() => {
    type CatRow = {
      categoryId: string;
      name: string;
      icon: string;
      purchaseValue: number;
      depreciatedValue: number;
      count: number;
    };
    const map = new Map<string, CatRow>();

    for (const item of items) {
      if (item.status === 'unredeemed') continue;
      const archivedReason =
        item.archived_reason ?? (item.salvage_value > 0 ? 'sold' : 'paused');
      // 已售出资产已离手，不计入当前持有折旧
      if (item.status === 'archived' && archivedReason === 'sold') continue;

      const categoryId = item.category ?? 'other';
      const info = resolveItemCategory(categoryId);
      const activeDays = calculateOneTimeItemActiveDays(item);
      const depValue = calculateDepreciatedValue(item, activeDays);

      const existing = map.get(categoryId);
      if (existing) {
        existing.purchaseValue += item.total_price;
        existing.depreciatedValue += depValue;
        existing.count += 1;
      } else {
        map.set(categoryId, {
          categoryId,
          name: info.name,
          icon: info.icon,
          purchaseValue: item.total_price,
          depreciatedValue: depValue,
          count: 1,
        });
      }
    }

    const rows = Array.from(map.values()).sort(
      (a, b) => b.depreciatedValue - a.depreciatedValue,
    );
    const totalPurchase = rows.reduce((s, r) => s + r.purchaseValue, 0);
    const totalDepreciated = rows.reduce((s, r) => s + r.depreciatedValue, 0);
    const totalDepreciationLoss = totalPurchase - totalDepreciated;
    const depreciationRate =
      totalPurchase > 0 ? (totalDepreciationLoss / totalPurchase) * 100 : 0;

    return {
      rows,
      totalPurchase,
      totalDepreciated,
      totalDepreciationLoss,
      depreciationRate,
    };
  }, [items, resolveItemCategory]);

  const totalAssets = useMemo(
    () => assetSeries.reduce((sum, item) => sum + item.value, 0),
    [assetSeries],
  );
  const totalDaily = useMemo(
    () => dailySeries.reduce((sum, item) => sum + item.value, 0),
    [dailySeries],
  );
  const totalStoredPrincipal = useMemo(
    () => storedCardSeries.reduce((sum, item) => sum + item.value, 0),
    [storedCardSeries],
  );

  /** 最近 6 个月的支出趋势 */
  const monthlyTrend = useMemo(
    () =>
      calculateMonthlySpendingTrend(
        items,
        subscriptions,
        maintenanceLogs,
        6,
      ),
    [items, subscriptions, maintenanceLogs],
  );

  const trendMaxTotal = useMemo(
    () => monthlyTrend.reduce((max, row) => Math.max(max, row.total), 0),
    [monthlyTrend],
  );

  const trendTotals = useMemo(() => {
    const purchases = monthlyTrend.reduce((s, r) => s + r.purchases, 0);
    const installments = monthlyTrend.reduce((s, r) => s + r.installments, 0);
    const subscriptionsCost = monthlyTrend.reduce((s, r) => s + r.subscriptions, 0);
    const maintenance = monthlyTrend.reduce((s, r) => s + r.maintenance, 0);
    return {
      purchases,
      installments,
      subscriptions: subscriptionsCost,
      maintenance,
      total: purchases + installments + subscriptionsCost + maintenance,
    };
  }, [monthlyTrend]);

  /** 当前月相比上月的变化百分比 */
  const trendMoMChange = useMemo(() => {
    if (monthlyTrend.length < 2) return null;
    const current = monthlyTrend[monthlyTrend.length - 1];
    const previous = monthlyTrend[monthlyTrend.length - 2];
    if (previous.total <= 0) return null;
    return ((current.total - previous.total) / previous.total) * 100;
  }, [monthlyTrend]);

  /** TOP 5 日均成本最高的在用资产（含已售出盈利的资产不计入） */
  const topDailyCostAssets = useMemo(() => {
    return items
      .filter(item => item.status === 'active' || item.status === 'archived')
      .map(item => {
        const archivedReason =
          item.archived_reason ?? (item.salvage_value > 0 ? 'sold' : 'paused');
        // 已售出资产已离手，不参与排行
        if (item.status === 'archived' && archivedReason === 'sold') {
          return null;
        }
        const activeDays = calculateOneTimeItemActiveDays(item);
        const dailyCost = calculateDailyCost(
          item.total_price,
          archivedReason === 'sold' ? item.salvage_value : 0,
          activeDays,
        );
        return { item, activeDays, dailyCost };
      })
      .filter((entry): entry is { item: OneTimeItem; activeDays: number; dailyCost: number } => entry !== null)
      .sort((a, b) => b.dailyCost - a.dailyCost)
      .slice(0, 5);
  }, [items]);

  /** 订阅年度预算投影 */
  const subscriptionProjection = useMemo(() => {
    const rows = subscriptions
      .filter(sub => sub.status === 'active')
      .map(sub => {
        const cyclesPerYear =
          sub.billing_cycle === 'monthly'
            ? 12
            : sub.billing_cycle === 'quarterly'
              ? 4
              : 1;
        return {
          id: sub.id,
          name: sub.name,
          yearlyCost: sub.cycle_price * cyclesPerYear,
        };
      })
      .sort((a, b) => b.yearlyCost - a.yearlyCost);

    const totalYearly = rows.reduce((s, r) => s + r.yearlyCost, 0);
    const totalDaily = totalYearly / 365;
    return { rows, totalYearly, totalDaily };
  }, [subscriptions]);

  /** 当前净资产（实时计算，用于和快照对比） */
  const currentNetWorth = useMemo(
    () =>
      calculateNetAssetValue(items, storedCards, card =>
        calculateStoredPrincipal(card.actual_paid, card.face_value, card.current_balance),
      ),
    [items, storedCards],
  );

  /** 净资产趋势：最近 N 个快照，找到最大值用于纵向缩放 */
  const netWorthTrend = useMemo(() => {
    if (snapshots.length === 0) {
      return { rows: [], maxNet: 0, minNet: 0, delta: 0 };
    }
    const maxNet = snapshots.reduce((m, s) => Math.max(m, s.net_value), 0);
    const minNet = snapshots.reduce((m, s) => Math.min(m, s.net_value), 0);
    const first = snapshots[0].net_value;
    const last = snapshots[snapshots.length - 1].net_value;
    const delta = first === 0 ? 0 : last - first;
    return { rows: snapshots, maxNet, minNet, delta };
  }, [snapshots]);

  const handleSaveSnapshot = useCallback(async () => {
    if (snapshotBusy) return;
    setSnapshotBusy(true);
    try {
      await upsertNetWorthSnapshot(db, {
        snapshot_date: getTodayString(),
        asset_value: currentNetWorth.assetValue,
        card_principal: currentNetWorth.cardPrincipal,
        installment_debt: currentNetWorth.installmentDebt,
        net_value: currentNetWorth.netValue,
      });
      const nextSnapshots = await getRecentNetWorthSnapshots(db, 30);
      setSnapshots(nextSnapshots);
      alertSuccess('快照已保存', `已记录今日净资产 ${formatCurrency(currentNetWorth.netValue)}`);
    } catch (error) {
      console.error('保存净资产快照失败', error);
    } finally {
      setSnapshotBusy(false);
    }
  }, [currentNetWorth, db, snapshotBusy]);

  const chartConfig = useMemo(
    () => ({
      color: () => THEME.colors.textPrimary,
      labelColor: () => THEME.colors.textSecondary,
      backgroundGradientFrom: THEME.colors.surface,
      backgroundGradientTo: THEME.colors.surface,
    }),
    [],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>净资产追踪 · 历史快照</Text>
          <Text style={styles.subTitle}>
            当前 {formatCurrency(currentNetWorth.netValue)} · 资产 {formatCurrency(currentNetWorth.assetValue)} · 卡包 {formatCurrency(currentNetWorth.cardPrincipal)} · 负债 {formatCurrency(currentNetWorth.installmentDebt)}
          </Text>
          {netWorthTrend.rows.length === 0 ? (
            <EmptyState message="还没有保存过净资产快照。点击下方按钮可保存今日快照。" icon="📸" />
          ) : (
            <>
              <View style={styles.netWorthChart}>
                {netWorthTrend.rows.map((snap, index) => {
                  const range = Math.max(netWorthTrend.maxNet - netWorthTrend.minNet, 1);
                  const heightPct =
                    ((snap.net_value - netWorthTrend.minNet) / range) * 100;
                  const isLast = index === netWorthTrend.rows.length - 1;
                  return (
                    <View key={snap.id} style={styles.netWorthBarColumn}>
                      <View style={styles.netWorthBarTrack}>
                        <View
                          style={[
                            styles.netWorthBarFill,
                            {
                              height: `${Math.max(heightPct, 4)}%`,
                              backgroundColor: isLast
                                ? THEME.colors.primary
                                : THEME.colors.primaryLight,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.netWorthBarLabel} numberOfLines={1}>
                        {snap.snapshot_date.slice(5)}
                      </Text>
                    </View>
                  );
                })}
              </View>
              <View style={styles.netWorthDeltaRow}>
                <Text style={styles.netWorthDeltaLabel}>
                  {netWorthTrend.rows.length} 个快照 · 期间变化
                </Text>
                <Text
                  style={[
                    styles.netWorthDeltaValue,
                    { color: netWorthTrend.delta > 0 ? THEME.colors.success : netWorthTrend.delta < 0 ? THEME.colors.dangerDark : THEME.colors.textSecondary },
                  ]}
                >
                  {netWorthTrend.delta > 0 ? '+' : ''}{formatCurrency(netWorthTrend.delta)}
                </Text>
              </View>
            </>
          )}
          <TouchableOpacity
            style={[styles.snapshotBtn, snapshotBusy && styles.snapshotBtnDisabled]}
            onPress={handleSaveSnapshot}
            activeOpacity={0.75}
            disabled={snapshotBusy}
          >
            <Text style={styles.snapshotBtnText}>
              {snapshotBusy ? '保存中...' : '📸 保存今日快照'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>月度支出趋势 · 最近 6 个月</Text>
          <Text style={styles.subTitle}>
            累计 {formatCurrency(trendTotals.total)} · 月均 {formatCurrency(trendTotals.total / Math.max(monthlyTrend.length, 1))}
          </Text>
          {trendMaxTotal <= 0 ? (
            <EmptyState message="最近 6 个月暂无支出记录，添加资产或订阅后会出现趋势。" icon="📊" />
          ) : (
            <>
              <View style={styles.trendChart}>
                {monthlyTrend.map(row => {
                  const heightPct = trendMaxTotal > 0 ? (row.total / trendMaxTotal) * 100 : 0;
                  const isCurrent = row === monthlyTrend[monthlyTrend.length - 1];
                  return (
                    <View key={row.monthKey} style={styles.trendBarColumn}>
                      <Text style={styles.trendBarValue}>
                        {row.total > 0 ? formatCurrency(row.total) : '—'}
                      </Text>
                      <View style={styles.trendBarTrack}>
                        <View
                          style={[
                            styles.trendBarFill,
                            {
                              height: `${Math.max(heightPct, row.total > 0 ? 6 : 0)}%`,
                              backgroundColor: isCurrent
                                ? THEME.colors.primary
                                : THEME.colors.primaryLight,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.trendBarLabel}>{row.label.slice(5)}</Text>
                    </View>
                  );
                })}
              </View>
              {trendMoMChange !== null && (
                <View style={styles.trendMoMRow}>
                  <Text style={styles.trendMoMLabel}>环比上月</Text>
                  <Text
                    style={[
                      styles.trendMoMValue,
                      { color: trendMoMChange > 0 ? THEME.colors.dangerDark : THEME.colors.success },
                    ]}
                  >
                    {trendMoMChange > 0 ? '↑' : trendMoMChange < 0 ? '↓' : '·'}
                    {' '}
                    {Math.abs(trendMoMChange).toFixed(1)}%
                  </Text>
                </View>
              )}
              <View style={styles.trendBreakdown}>
                <View style={styles.trendBreakdownRow}>
                  <View style={[styles.trendDot, { backgroundColor: THEME.colors.primary }]} />
                  <Text style={styles.trendBreakdownLabel}>购置</Text>
                  <Text style={styles.trendBreakdownValue}>{formatCurrency(trendTotals.purchases)}</Text>
                </View>
                <View style={styles.trendBreakdownRow}>
                  <View style={[styles.trendDot, { backgroundColor: THEME.colors.warning }]} />
                  <Text style={styles.trendBreakdownLabel}>分期</Text>
                  <Text style={styles.trendBreakdownValue}>{formatCurrency(trendTotals.installments)}</Text>
                </View>
                <View style={styles.trendBreakdownRow}>
                  <View style={[styles.trendDot, { backgroundColor: THEME.colors.success }]} />
                  <Text style={styles.trendBreakdownLabel}>订阅</Text>
                  <Text style={styles.trendBreakdownValue}>{formatCurrency(trendTotals.subscriptions)}</Text>
                </View>
                <View style={styles.trendBreakdownRow}>
                  <View style={[styles.trendDot, { backgroundColor: THEME.colors.danger }]} />
                  <Text style={styles.trendBreakdownLabel}>维修</Text>
                  <Text style={styles.trendBreakdownValue}>{formatCurrency(trendTotals.maintenance)}</Text>
                </View>
              </View>
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>折旧汇总 · 资产价值衰减</Text>
          <Text style={styles.subTitle}>
            买入 {formatCurrency(depreciationSummary.totalPurchase)} · 现值 {formatCurrency(depreciationSummary.totalDepreciated)}
          </Text>
          {depreciationSummary.rows.length === 0 ? (
            <EmptyState message="暂无可折旧的资产，先去添加并设置预期使用天数。" icon="📉" />
          ) : (
            <>
              <View style={styles.depSummaryRow}>
                <View style={styles.depSummaryBlock}>
                  <Text style={styles.depSummaryLabel}>累计折旧损失</Text>
                  <Text
                    style={[
                      styles.depSummaryValue,
                      { color: THEME.colors.dangerDark },
                    ]}
                  >
                    -{formatCurrency(depreciationSummary.totalDepreciationLoss)}
                  </Text>
                </View>
                <View style={styles.depSummaryDivider} />
                <View style={styles.depSummaryBlock}>
                  <Text style={styles.depSummaryLabel}>整体折旧率</Text>
                  <Text
                    style={[
                      styles.depSummaryValue,
                      { color: THEME.colors.warning },
                    ]}
                  >
                    {depreciationSummary.depreciationRate.toFixed(1)}%
                  </Text>
                </View>
              </View>
              <View style={styles.legend}>
                {depreciationSummary.rows.map(row => {
                  const loss = row.purchaseValue - row.depreciatedValue;
                  const rate =
                    row.purchaseValue > 0
                      ? (loss / row.purchaseValue) * 100
                      : 0;
                  return (
                    <View key={row.categoryId} style={styles.legendRow}>
                      <View style={styles.legendLeft}>
                        <Text style={styles.depRowIcon}>{row.icon}</Text>
                        <Text style={styles.legendName} numberOfLines={1}>
                          {row.name} · {row.count} 件
                        </Text>
                      </View>
                      <View style={styles.depRowRight}>
                        <Text style={styles.depRowValue} numberOfLines={1}>
                          {formatCurrency(row.depreciatedValue)} / {formatCurrency(row.purchaseValue)}
                        </Text>
                        <Text
                          style={[
                            styles.depRowRate,
                            rate > 50
                              ? { color: THEME.colors.dangerDark }
                              : rate > 20
                                ? { color: THEME.colors.warning }
                                : { color: THEME.colors.success },
                          ]}
                        >
                          -{rate.toFixed(0)}%
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>在用资产 · 分类价值占比</Text>
          <Text style={styles.subTitle}>合计：{formatCurrency(totalAssets)}</Text>
          {assetSeries.length === 0 ? (
            <EmptyState message="暂无在用资产数据，先去添加一些大件资产吧。" icon="📦" />
          ) : (
            <>
              <PieChart
                data={toPieChartData(assetSeries)}
                width={chartWidth}
                height={220}
                chartConfig={chartConfig}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft={piePaddingLeft}
                hasLegend={false}
              />
              <LegendList series={assetSeries} total={totalAssets} />
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>每日成本 · 分类金额占比</Text>
          <Text style={styles.subTitle}>合计：{formatCurrency(totalDaily)} / 天</Text>
          {dailySeries.length === 0 ? (
            <EmptyState message="暂无分期或订阅数据，先去添加长期成本项目吧。" icon="🧾" />
          ) : (
            <>
              <PieChart
                data={toPieChartData(dailySeries)}
                width={chartWidth}
                height={220}
                chartConfig={chartConfig}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft={piePaddingLeft}
                hasLegend={false}
              />
              <LegendList series={dailySeries} total={totalDaily} valueSuffix="/天" />
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>卡包本金 · 分类占比</Text>
          <Text style={styles.subTitle}>合计：{formatCurrency(totalStoredPrincipal)}</Text>
          {storedCardSeries.length === 0 ? (
            <EmptyState message="暂无卡包数据，去首页卡包标签页添加一项吧。" icon="💳" />
          ) : (
            <>
              <PieChart
                data={toPieChartData(storedCardSeries)}
                width={chartWidth}
                height={220}
                chartConfig={chartConfig}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft={piePaddingLeft}
                hasLegend={false}
              />
              <LegendList series={storedCardSeries} total={totalStoredPrincipal} />
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>日均成本排行 · TOP 5</Text>
          <Text style={styles.subTitle}>最贵的 5 个在用资产 · 帮助识别是否值得保留</Text>
          {topDailyCostAssets.length === 0 ? (
            <EmptyState message="暂无在用资产，添加资产并使用一段时间后可见排行。" icon="🏆" />
          ) : (
            <View style={styles.rankingList}>
              {topDailyCostAssets.map((entry, index) => (
                <View key={`rank-${entry.item.id}`} style={styles.rankingRow}>
                  <View style={styles.rankingBadge}>
                    <Text style={styles.rankingBadgeText}>{index + 1}</Text>
                  </View>
                  <View style={styles.rankingInfo}>
                    <Text style={styles.rankingName} numberOfLines={1}>
                      {entry.item.name}
                    </Text>
                    <Text style={styles.rankingMeta} numberOfLines={1}>
                      {formatCurrency(entry.item.total_price)} · {entry.activeDays} 天
                    </Text>
                  </View>
                  <View style={styles.rankingRight}>
                    <Text style={styles.rankingValue}>
                      {formatCurrency(entry.dailyCost)}
                    </Text>
                    <Text style={styles.rankingUnit}>/天</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>订阅年度预算 · 投影</Text>
          <Text style={styles.subTitle}>
            活跃订阅按当前周期推算未来 12 个月支出
          </Text>
          {subscriptionProjection.totalYearly === 0 ? (
            <EmptyState message="暂无活跃订阅，添加订阅后可查看年度预算投影。" icon="📅" />
          ) : (
            <>
              <View style={styles.projSummaryRow}>
                <View style={styles.projSummaryBlock}>
                  <Text style={styles.projSummaryLabel}>年度预算</Text>
                  <Text style={[styles.projSummaryValue, { color: THEME.colors.primaryDark }]}>
                    {formatCurrency(subscriptionProjection.totalYearly)}
                  </Text>
                </View>
                <View style={styles.depSummaryDivider} />
                <View style={styles.projSummaryBlock}>
                  <Text style={styles.projSummaryLabel}>月均</Text>
                  <Text style={[styles.projSummaryValue, { color: THEME.colors.warning }]}>
                    {formatCurrency(subscriptionProjection.totalYearly / 12)}
                  </Text>
                </View>
                <View style={styles.depSummaryDivider} />
                <View style={styles.projSummaryBlock}>
                  <Text style={styles.projSummaryLabel}>日均</Text>
                  <Text style={[styles.projSummaryValue, { color: THEME.colors.success }]}>
                    {formatCurrency(subscriptionProjection.totalDaily)}
                  </Text>
                </View>
              </View>
              <View style={styles.legend}>
                {subscriptionProjection.rows.map((row, index) => (
                  <View key={`proj-${row.id}`} style={styles.legendRow}>
                    <View style={styles.legendLeft}>
                      <View style={[styles.legendSwatch, { backgroundColor: PALETTE[index % PALETTE.length] }]} />
                      <Text style={styles.legendName} numberOfLines={1}>
                        {row.name}
                      </Text>
                    </View>
                    <Text style={styles.legendMeta} numberOfLines={1}>
                      {formatCurrency(row.yearlyCost)}/年
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>
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
  },
  card: {
    backgroundColor: THEME.colors.surface,
    ...THEME.pixelBorder,
    ...THEME.pixelShadow,
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.xl,
    alignItems: 'center',
  },
  title: {
    fontSize: THEME.fontSize.lg,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  subTitle: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.md,
  },
  legend: {
    alignSelf: 'stretch',
    marginTop: THEME.spacing.sm,
    gap: 8,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: THEME.spacing.sm,
  },
  legendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: THEME.colors.borderDark,
  },
  legendName: {
    flex: 1,
    minWidth: 0,
    fontSize: THEME.fontSize.sm,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  legendMeta: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  depSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginBottom: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.md,
    backgroundColor: THEME.colors.background,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    borderRadius: THEME.borderRadius,
  },
  depSummaryBlock: {
    flex: 1,
    alignItems: 'center',
  },
  depSummaryDivider: {
    width: 1.5,
    height: 32,
    backgroundColor: THEME.colors.border,
    marginHorizontal: THEME.spacing.sm,
  },
  depSummaryLabel: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    fontWeight: '700',
    marginBottom: 4,
  },
  depSummaryValue: {
    fontSize: THEME.fontSize.md,
    fontWeight: '900',
    fontFamily: THEME.fontFamily.pixel,
  },
  depRowIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  depRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  depRowValue: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  depRowRate: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '900',
    minWidth: 40,
    textAlign: 'right',
  },
  trendChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    height: 160,
    marginTop: THEME.spacing.sm,
    marginBottom: THEME.spacing.md,
    paddingHorizontal: 4,
  },
  trendBarColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
    marginHorizontal: 2,
    gap: 4,
  },
  trendBarValue: {
    fontSize: 9,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    minHeight: 24,
  },
  trendBarTrack: {
    width: '70%',
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: THEME.colors.background,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    borderRadius: THEME.borderRadius,
    overflow: 'hidden',
    minHeight: 80,
  },
  trendBarFill: {
    width: '100%',
    backgroundColor: THEME.colors.primary,
    borderRadius: 2,
  },
  trendBarLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  trendMoMRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: THEME.spacing.sm,
    marginBottom: THEME.spacing.sm,
    backgroundColor: THEME.colors.background,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    borderRadius: THEME.borderRadius,
    alignSelf: 'stretch',
  },
  trendMoMLabel: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  trendMoMValue: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '900',
    fontFamily: THEME.fontFamily.pixel,
  },
  trendBreakdown: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: THEME.spacing.sm,
    marginTop: THEME.spacing.xs,
  },
  trendBreakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: '45%',
    paddingVertical: 6,
    paddingHorizontal: THEME.spacing.sm,
    backgroundColor: THEME.colors.background,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    borderRadius: THEME.borderRadius,
  },
  trendDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: THEME.colors.borderDark,
  },
  trendBreakdownLabel: {
    flex: 1,
    fontSize: THEME.fontSize.xs,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  trendBreakdownValue: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  rankingList: {
    alignSelf: 'stretch',
    marginTop: THEME.spacing.sm,
    gap: THEME.spacing.sm,
  },
  rankingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
    paddingVertical: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.md,
    backgroundColor: THEME.colors.background,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    borderRadius: THEME.borderRadius,
  },
  rankingBadge: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    backgroundColor: THEME.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankingBadgeText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '900',
    fontFamily: THEME.fontFamily.pixel,
    color: THEME.colors.surface,
  },
  rankingInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rankingName: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  rankingMeta: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  rankingRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  rankingValue: {
    fontSize: THEME.fontSize.md,
    fontWeight: '900',
    fontFamily: THEME.fontFamily.pixel,
    color: THEME.colors.dangerDark,
  },
  rankingUnit: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  projSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginBottom: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.md,
    backgroundColor: THEME.colors.background,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    borderRadius: THEME.borderRadius,
  },
  projSummaryBlock: {
    flex: 1,
    alignItems: 'center',
  },
  projSummaryLabel: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    fontWeight: '700',
    marginBottom: 4,
  },
  projSummaryValue: {
    fontSize: THEME.fontSize.md,
    fontWeight: '900',
    fontFamily: THEME.fontFamily.pixel,
  },
  netWorthChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    height: 140,
    marginTop: THEME.spacing.sm,
    marginBottom: THEME.spacing.sm,
    paddingHorizontal: 4,
    gap: 4,
  },
  netWorthBarColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
    gap: 4,
  },
  netWorthBarTrack: {
    width: '80%',
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: THEME.colors.background,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    borderRadius: THEME.borderRadius,
    overflow: 'hidden',
  },
  netWorthBarFill: {
    width: '100%',
    borderRadius: 2,
  },
  netWorthBarLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  netWorthDeltaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.md,
    backgroundColor: THEME.colors.background,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    borderRadius: THEME.borderRadius,
    alignSelf: 'stretch',
    marginBottom: THEME.spacing.md,
  },
  netWorthDeltaLabel: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  netWorthDeltaValue: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '900',
    fontFamily: THEME.fontFamily.pixel,
  },
  snapshotBtn: {
    alignSelf: 'stretch',
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.lg,
    backgroundColor: THEME.colors.primary,
    borderWidth: 2,
    borderColor: THEME.colors.primaryDark,
    borderRadius: THEME.borderRadius,
    alignItems: 'center',
  },
  snapshotBtnDisabled: {
    opacity: 0.5,
  },
  snapshotBtnText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '900',
    color: THEME.colors.surface,
  },
});
