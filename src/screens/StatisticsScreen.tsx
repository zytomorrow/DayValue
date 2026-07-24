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
import { useTheme } from '../contexts/ThemeContext';
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
      color: THEME.chartPalette[index % THEME.chartPalette.length],
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
  styles,
}: {
  series: PieSeriesItem[];
  total: number;
  valueSuffix?: string;
  styles: ReturnType<typeof createStyles>;
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
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);
  const chartColors = THEME.chartPalette;
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

  /** 折旧 vs 维修成本对比：评估维修投入是否已超过资产折旧损失 */
  const maintenanceVsDepreciation = useMemo(() => {
    // 仅统计在用 + 停用（非售出）资产的维修记录
    const validItemIds = new Set(
      items
        .filter(item => {
          if (item.status === 'unredeemed') return false;
          const archivedReason =
            item.archived_reason ?? (item.salvage_value > 0 ? 'sold' : 'paused');
          return !(item.status === 'archived' && archivedReason === 'sold');
        })
        .map(item => item.id),
    );

    const totalMaintenance = maintenanceLogs
      .filter(log => validItemIds.has(log.item_id))
      .reduce((sum, log) => sum + log.cost, 0);

    const totalDepreciationLoss = depreciationSummary.totalDepreciationLoss;
    const totalDepreciated = depreciationSummary.totalDepreciated;

    // 维修占当前现值的比例：超过阈值意味着「修不如换」
    const maintenanceToValueRatio =
      totalDepreciated > 0 ? (totalMaintenance / totalDepreciated) * 100 : 0;

    // 维修 / 折旧损失比：> 100% 表示维修投入已超过价值衰减
    const maintenanceToDepreciationRatio =
      totalDepreciationLoss > 0 ? (totalMaintenance / totalDepreciationLoss) * 100 : 0;

    const higher =
      totalMaintenance > totalDepreciationLoss
        ? 'maintenance'
        : totalDepreciationLoss > totalMaintenance
          ? 'depreciation'
          : 'equal';

    // 每个资产的维修成本 TOP 5（找出「维修黑洞」）
    const perItemMaintenance = new Map<number, number>();
    for (const log of maintenanceLogs) {
      if (!validItemIds.has(log.item_id)) continue;
      perItemMaintenance.set(
        log.item_id,
        (perItemMaintenance.get(log.item_id) ?? 0) + log.cost,
      );
    }
    const moneyPits = items
      .map(item => {
        const maintenance = perItemMaintenance.get(item.id) ?? 0;
        if (maintenance <= 0) return null;
        const activeDays = calculateOneTimeItemActiveDays(item);
        const depValue = calculateDepreciatedValue(item, activeDays);
        const loss = item.total_price - depValue;
        // 维修占现值比，超过 50% 视为建议更换
        const ratio = depValue > 0 ? (maintenance / depValue) * 100 : 0;
        const recommendReplace = ratio >= 50 || maintenance > loss;
        return {
          item,
          maintenance,
          depreciatedValue: depValue,
          depreciationLoss: loss,
          ratio,
          recommendReplace,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((a, b) => b.maintenance - a.maintenance)
      .slice(0, 5);

    return {
      totalMaintenance,
      totalDepreciationLoss,
      totalDepreciated,
      maintenanceToValueRatio,
      maintenanceToDepreciationRatio,
      higher,
      moneyPits,
      maintenanceLogCount: maintenanceLogs.filter(log => validItemIds.has(log.item_id)).length,
    };
  }, [items, maintenanceLogs, depreciationSummary]);

  const totalAssets = useMemo(
    () => assetSeries.reduce((sum, item) => sum + item.value, 0),
    [assetSeries],
  );

  /** 资产老化分布：按购买年份分组，识别老化资产 */
  const assetAgeDistribution = useMemo(() => {
    type AgeRow = { year: number; count: number; value: number; oldestDays: number };
    const map = new Map<number, AgeRow>();
    const today = new Date();

    for (const item of items) {
      if (item.status === 'unredeemed') continue;
      // 已售出资产已离手，不计入当前持有资产的老化分析
      const archivedReason =
        item.archived_reason ?? (item.salvage_value > 0 ? 'sold' : 'paused');
      if (item.status === 'archived' && archivedReason === 'sold') continue;

      const buyDate = new Date(item.buy_date);
      const year = buyDate.getFullYear();
      const ageDays = Math.floor(
        (today.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      const existing = map.get(year);
      if (existing) {
        existing.count += 1;
        existing.value += item.total_price;
        existing.oldestDays = Math.max(existing.oldestDays, ageDays);
      } else {
        map.set(year, { year, count: 1, value: item.total_price, oldestDays: ageDays });
      }
    }

    const rows = Array.from(map.values()).sort((a, b) => a.year - b.year);
    const totalValue = rows.reduce((s, r) => s + r.value, 0);
    const totalCount = rows.reduce((s, r) => s + r.count, 0);
    const avgAgeDays =
      totalCount > 0
        ? Math.round(
            items
              .filter(item => {
                if (item.status === 'unredeemed') return false;
                const archivedReason =
                  item.archived_reason ?? (item.salvage_value > 0 ? 'sold' : 'paused');
                return !(item.status === 'archived' && archivedReason === 'sold');
              })
              .reduce((sum, item) => {
                const buyDate = new Date(item.buy_date);
                return sum + Math.floor((today.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24));
              }, 0) / totalCount,
          )
        : 0;

    // 老化资产：购买超过 3 年（1095 天）
    const agingThresholdDays = 365 * 3;
    const agingAssets = items.filter(item => {
      if (item.status === 'unredeemed') return false;
      const archivedReason =
        item.archived_reason ?? (item.salvage_value > 0 ? 'sold' : 'paused');
      if (item.status === 'archived' && archivedReason === 'sold') return false;
      const buyDate = new Date(item.buy_date);
      const ageDays = Math.floor(
        (today.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      return ageDays >= agingThresholdDays;
    });

    return {
      rows,
      totalValue,
      totalCount,
      avgAgeDays,
      agingAssets,
      maxCount: rows.reduce((m, r) => Math.max(m, r.count), 0),
    };
  }, [items]);

  /** 资产集中度：基于在用资产的总价计算 CR3/CR5 与 HHI 指数 */
  const concentrationIndex = useMemo(() => {
    const activeItems = items.filter(item => item.status === 'active');
    if (activeItems.length === 0) {
      return {
        totalValue: 0,
        top3Ratio: 0,
        top5Ratio: 0,
        hhi: 0,
        concentration: 'none' as 'none' | 'low' | 'medium' | 'high',
        topAssets: [] as Array<{ id: number; name: string; value: number; share: number }>,
      };
    }

    const sorted = [...activeItems].sort((a, b) => b.total_price - a.total_price);
    const totalValue = sorted.reduce((s, i) => s + i.total_price, 0);
    if (totalValue <= 0) {
      return {
        totalValue: 0,
        top3Ratio: 0,
        top5Ratio: 0,
        hhi: 0,
        concentration: 'none' as 'none' | 'low' | 'medium' | 'high',
        topAssets: [] as Array<{ id: number; name: string; value: number; share: number }>,
      };
    }

    const top3 = sorted.slice(0, 3).reduce((s, i) => s + i.total_price, 0);
    const top5 = sorted.slice(0, 5).reduce((s, i) => s + i.total_price, 0);
    const top3Ratio = (top3 / totalValue) * 100;
    const top5Ratio = (top5 / totalValue) * 100;

    // HHI = Σ (share%)²，0~10000。0=完全分散，10000=完全垄断
    let hhi = 0;
    for (const item of sorted) {
      const share = (item.total_price / totalValue) * 100;
      hhi += share * share;
    }

    let concentration: 'none' | 'low' | 'medium' | 'high';
    if (hhi >= 2500) concentration = 'high';
    else if (hhi >= 1500) concentration = 'medium';
    else if (hhi >= 800) concentration = 'low';
    else concentration = 'none';

    const topAssets = sorted.slice(0, 5).map(item => ({
      id: item.id,
      name: item.name,
      value: item.total_price,
      share: (item.total_price / totalValue) * 100,
    }));

    return { totalValue, top3Ratio, top5Ratio, hhi, concentration, topAssets };
  }, [items]);
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
          <Text style={styles.title}>折旧 vs 维修 · 成本天平</Text>
          <Text style={styles.subTitle}>
            维修 {maintenanceVsDepreciation.maintenanceLogCount} 笔 · 现值 {formatCurrency(maintenanceVsDepreciation.totalDepreciated)}
          </Text>
          {maintenanceVsDepreciation.totalMaintenance === 0 &&
          maintenanceVsDepreciation.totalDepreciationLoss === 0 ? (
            <EmptyState message="暂无可对比的数据，添加维修记录并设置资产预期寿命后可见。" icon="⚖️" />
          ) : (
            <>
              <View style={styles.balanceRow}>
                <View
                  style={[
                    styles.balanceBlock,
                    maintenanceVsDepreciation.higher === 'maintenance' &&
                      styles.balanceBlockWinner,
                  ]}
                >
                  <Text style={styles.balanceLabel}>🔧 累计维修</Text>
                  <Text
                    style={[
                      styles.balanceValue,
                      { color: THEME.colors.warning },
                    ]}
                  >
                    {formatCurrency(maintenanceVsDepreciation.totalMaintenance)}
                  </Text>
                </View>
                <View style={styles.balanceVersus}>
                  <Text style={styles.balanceVersusText}>VS</Text>
                  <Text
                    style={[
                      styles.balanceArrow,
                      {
                        color:
                          maintenanceVsDepreciation.higher === 'maintenance'
                            ? THEME.colors.warning
                            : maintenanceVsDepreciation.higher === 'depreciation'
                              ? THEME.colors.dangerDark
                              : THEME.colors.textSecondary,
                      },
                    ]}
                  >
                    {maintenanceVsDepreciation.higher === 'maintenance'
                      ? '◀'
                      : maintenanceVsDepreciation.higher === 'depreciation'
                        ? '▶'
                        : '='}
                  </Text>
                </View>
                <View
                  style={[
                    styles.balanceBlock,
                    maintenanceVsDepreciation.higher === 'depreciation' &&
                      styles.balanceBlockWinner,
                  ]}
                >
                  <Text style={styles.balanceLabel}>📉 累计折旧</Text>
                  <Text
                    style={[
                      styles.balanceValue,
                      { color: THEME.colors.dangerDark },
                    ]}
                  >
                    -{formatCurrency(maintenanceVsDepreciation.totalDepreciationLoss)}
                  </Text>
                </View>
              </View>

              {/* 维修 / 折旧损失比 进度条 */}
              <View style={styles.ratioBarWrap}>
                <View style={styles.ratioBarHeader}>
                  <Text style={styles.ratioBarLabel}>维修 / 折旧损失</Text>
                  <Text
                    style={[
                      styles.ratioBarValue,
                      {
                        color:
                          maintenanceVsDepreciation.maintenanceToDepreciationRatio >= 100
                            ? THEME.colors.dangerDark
                            : maintenanceVsDepreciation.maintenanceToDepreciationRatio >= 50
                              ? THEME.colors.warning
                              : THEME.colors.success,
                      },
                    ]}
                  >
                    {maintenanceVsDepreciation.maintenanceToDepreciationRatio.toFixed(0)}%
                  </Text>
                </View>
                <View style={styles.ratioBarTrack}>
                  <View
                    style={[
                      styles.ratioBarFill,
                      {
                        width: `${Math.min(maintenanceVsDepreciation.maintenanceToDepreciationRatio, 100)}%`,
                        backgroundColor:
                          maintenanceVsDepreciation.maintenanceToDepreciationRatio >= 100
                            ? THEME.colors.danger
                            : maintenanceVsDepreciation.maintenanceToDepreciationRatio >= 50
                              ? THEME.colors.warning
                              : THEME.colors.success,
                      },
                    ]}
                  />
                  <View style={styles.ratioBarThreshold} />
                </View>
                <Text style={styles.ratioBarHint}>
                  {maintenanceVsDepreciation.maintenanceToDepreciationRatio >= 100
                    ? '⚠️ 维修投入已超过折旧损失，建议评估是否更换资产'
                    : maintenanceVsDepreciation.maintenanceToDepreciationRatio >= 50
                      ? '维修成本接近折旧损失，关注后续保养支出'
                      : '维修投入合理，资产维护性价比良好'}
                </Text>
              </View>

              {/* 维修黑洞 TOP 5 */}
              {maintenanceVsDepreciation.moneyPits.length > 0 && (
                <View style={styles.moneyPitList}>
                  <Text style={styles.moneyPitTitle}>🕳️ 维修黑洞 TOP {maintenanceVsDepreciation.moneyPits.length}</Text>
                  {maintenanceVsDepreciation.moneyPits.map((entry, index) => (
                    <View key={`pit-${entry.item.id}`} style={styles.moneyPitRow}>
                      <View style={styles.rankingBadge}>
                        <Text style={styles.rankingBadgeText}>{index + 1}</Text>
                      </View>
                      <View style={styles.moneyPitInfo}>
                        <Text style={styles.moneyPitName} numberOfLines={1}>
                          {entry.item.name}
                        </Text>
                        <Text style={styles.moneyPitMeta} numberOfLines={1}>
                          维修 {formatCurrency(entry.maintenance)} · 现值 {formatCurrency(entry.depreciatedValue)} · 占比 {entry.ratio.toFixed(0)}%
                        </Text>
                      </View>
                      {entry.recommendReplace && (
                        <View style={styles.replaceBadge}>
                          <Text style={styles.replaceBadgeText}>建议更换</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>资产老化分布 · 持仓年龄</Text>
          <Text style={styles.subTitle}>
            平均年龄 {Math.floor(assetAgeDistribution.avgAgeDays / 30)} 月 · 共 {assetAgeDistribution.totalCount} 件 · 价值 {formatCurrency(assetAgeDistribution.totalValue)}
          </Text>
          {assetAgeDistribution.rows.length === 0 ? (
            <EmptyState message="暂无资产数据，添加资产后可见老化分布。" icon="📅" />
          ) : (
            <>
              <View style={styles.ageBarChart}>
                {assetAgeDistribution.rows.map(row => {
                  const heightPct =
                    assetAgeDistribution.maxCount > 0
                      ? (row.count / assetAgeDistribution.maxCount) * 100
                      : 0;
                  return (
                    <View key={`age-${row.year}`} style={styles.ageBarColumn}>
                      <Text style={styles.ageBarValue}>{row.count}</Text>
                      <View style={styles.ageBarTrack}>
                        <View
                          style={[
                            styles.ageBarFill,
                            {
                              height: `${Math.max(heightPct, 8)}%`,
                              backgroundColor:
                                row.oldestDays >= 365 * 3
                                  ? THEME.colors.danger
                                  : row.oldestDays >= 365 * 2
                                    ? THEME.colors.warning
                                    : THEME.colors.success,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.ageBarLabel} numberOfLines={1}>
                        '{String(row.year).slice(2)}
                      </Text>
                    </View>
                  );
                })}
              </View>
              <View style={styles.ageLegendRow}>
                <View style={styles.ageLegendItem}>
                  <View style={[styles.trendDot, { backgroundColor: THEME.colors.success }]} />
                  <Text style={styles.ageLegendText}>≤ 2 年</Text>
                </View>
                <View style={styles.ageLegendItem}>
                  <View style={[styles.trendDot, { backgroundColor: THEME.colors.warning }]} />
                  <Text style={styles.ageLegendText}>2-3 年</Text>
                </View>
                <View style={styles.ageLegendItem}>
                  <View style={[styles.trendDot, { backgroundColor: THEME.colors.danger }]} />
                  <Text style={styles.ageLegendText}>≥ 3 年</Text>
                </View>
              </View>
              {assetAgeDistribution.agingAssets.length > 0 && (
                <View style={styles.agingAlertBox}>
                  <Text style={styles.agingAlertTitle}>
                    ⏳ 老化资产提醒 · {assetAgeDistribution.agingAssets.length} 件已超 3 年
                  </Text>
                  <Text style={styles.agingAlertHint}>
                    建议评估这些资产是否还能继续服役，或考虑更新换代
                  </Text>
                  {assetAgeDistribution.agingAssets
                    .slice(0, 3)
                    .sort((a, b) => new Date(a.buy_date).getTime() - new Date(b.buy_date).getTime())
                    .map(item => {
                      const ageDays = Math.floor(
                        (Date.now() - new Date(item.buy_date).getTime()) / (1000 * 60 * 60 * 24),
                      );
                      return (
                        <View key={`aging-${item.id}`} style={styles.agingAssetRow}>
                          <Text style={styles.agingAssetName} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={styles.agingAssetAge}>
                            {Math.floor(ageDays / 365)} 年 {Math.floor((ageDays % 365) / 30)} 月
                          </Text>
                        </View>
                      );
                    })}
                </View>
              )}
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>资产集中度 · 持仓风险</Text>
          <Text style={styles.subTitle}>
            在用资产 {formatCurrency(concentrationIndex.totalValue)} · HHI 指数 {concentrationIndex.hhi.toFixed(0)}
          </Text>
          {concentrationIndex.totalValue === 0 ? (
            <EmptyState message="暂无在用资产，添加后可见集中度分析。" icon="📊" />
          ) : (
            <>
              <View
                style={[
                  styles.concentrationBanner,
                  concentrationIndex.concentration === 'high' && styles.concentrationBannerHigh,
                  concentrationIndex.concentration === 'medium' && styles.concentrationBannerMedium,
                  concentrationIndex.concentration === 'low' && styles.concentrationBannerLow,
                ]}
              >
                <Text style={styles.concentrationBannerLabel}>集中度等级</Text>
                <Text style={styles.concentrationBannerValue}>
                  {concentrationIndex.concentration === 'high'
                    ? '过高'
                    : concentrationIndex.concentration === 'medium'
                      ? '偏高'
                      : concentrationIndex.concentration === 'low'
                        ? '适中'
                        : '分散'}
                </Text>
              </View>
              <View style={styles.concentrationRow}>
                <View style={styles.concentrationBlock}>
                  <Text style={styles.concentrationLabel}>CR3 (TOP3 占比)</Text>
                  <Text
                    style={[
                      styles.concentrationValue,
                      {
                        color:
                          concentrationIndex.top3Ratio >= 80
                            ? THEME.colors.dangerDark
                            : concentrationIndex.top3Ratio >= 60
                              ? THEME.colors.warning
                              : THEME.colors.success,
                      },
                    ]}
                  >
                    {concentrationIndex.top3Ratio.toFixed(0)}%
                  </Text>
                </View>
                <View style={styles.depSummaryDivider} />
                <View style={styles.concentrationBlock}>
                  <Text style={styles.concentrationLabel}>CR5 (TOP5 占比)</Text>
                  <Text
                    style={[
                      styles.concentrationValue,
                      {
                        color:
                          concentrationIndex.top5Ratio >= 90
                            ? THEME.colors.dangerDark
                            : concentrationIndex.top5Ratio >= 70
                              ? THEME.colors.warning
                              : THEME.colors.success,
                      },
                    ]}
                  >
                    {concentrationIndex.top5Ratio.toFixed(0)}%
                  </Text>
                </View>
              </View>
              {concentrationIndex.topAssets.length > 0 && (
                <View style={styles.legend}>
                  <Text style={styles.moneyPitTitle}>🏆 TOP {concentrationIndex.topAssets.length} 资产</Text>
                  {concentrationIndex.topAssets.map((entry, index) => (
                    <View key={`top-${entry.id}`} style={styles.legendRow}>
                      <View style={styles.legendLeft}>
                        <View style={styles.rankingBadge}>
                          <Text style={styles.rankingBadgeText}>{index + 1}</Text>
                        </View>
                        <Text style={styles.legendName} numberOfLines={1}>
                          {entry.name}
                        </Text>
                      </View>
                      <View style={styles.depRowRight}>
                        <Text style={styles.legendMeta} numberOfLines={1}>
                          {formatCurrency(entry.value)}
                        </Text>
                        <Text
                          style={[
                            styles.depRowRate,
                            entry.share >= 50
                              ? { color: THEME.colors.dangerDark }
                              : entry.share >= 30
                                ? { color: THEME.colors.warning }
                                : { color: THEME.colors.success },
                          ]}
                        >
                          {entry.share.toFixed(0)}%
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
              {concentrationIndex.concentration === 'high' && (
                <Text style={styles.concentrationHint}>
                  ⚠️ 资产过度集中于少数大件，建议分散配置以降低单点风险
                </Text>
              )}
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
              <LegendList series={assetSeries} total={totalAssets} styles={styles} />
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
              <LegendList series={dailySeries} total={totalDaily} valueSuffix="/天" styles={styles} />
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
              <LegendList series={storedCardSeries} total={totalStoredPrincipal} styles={styles} />
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
                      <View style={[styles.legendSwatch, { backgroundColor: chartColors[index % chartColors.length] }]} />
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
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    alignSelf: 'stretch',
    marginBottom: THEME.spacing.md,
    gap: THEME.spacing.xs,
  },
  balanceBlock: {
    flex: 1,
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.sm,
    backgroundColor: THEME.colors.background,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    borderRadius: THEME.borderRadius,
    alignItems: 'center',
    gap: 4,
  },
  balanceBlockWinner: {
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    backgroundColor: THEME.colors.surface,
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  balanceValue: {
    fontSize: THEME.fontSize.md,
    fontWeight: '900',
    fontFamily: THEME.fontFamily.pixel,
  },
  balanceVersus: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  balanceVersusText: {
    fontSize: 10,
    fontWeight: '900',
    color: THEME.colors.textSecondary,
    fontFamily: THEME.fontFamily.pixel,
  },
  balanceArrow: {
    fontSize: 14,
    fontWeight: '900',
  },
  ratioBarWrap: {
    alignSelf: 'stretch',
    marginBottom: THEME.spacing.md,
    gap: 6,
  },
  ratioBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ratioBarLabel: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  ratioBarValue: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '900',
    fontFamily: THEME.fontFamily.pixel,
  },
  ratioBarTrack: {
    height: 14,
    backgroundColor: THEME.colors.background,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    borderRadius: THEME.borderRadius,
    overflow: 'hidden',
    position: 'relative',
  },
  ratioBarFill: {
    height: '100%',
    backgroundColor: THEME.colors.success,
    borderRadius: 2,
  },
  ratioBarThreshold: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1.5,
    backgroundColor: THEME.colors.borderDark,
  },
  ratioBarHint: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    textAlign: 'center',
  },
  moneyPitList: {
    alignSelf: 'stretch',
    marginTop: THEME.spacing.sm,
    gap: THEME.spacing.xs,
  },
  moneyPitTitle: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
    marginBottom: 4,
  },
  moneyPitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: THEME.spacing.sm,
    backgroundColor: THEME.colors.background,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    borderRadius: THEME.borderRadius,
  },
  moneyPitInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  moneyPitName: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  moneyPitMeta: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  replaceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: THEME.colors.danger,
    borderWidth: 1.5,
    borderColor: THEME.colors.dangerDark,
    borderRadius: 4,
  },
  replaceBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: THEME.colors.onPrimary,
  },
  ageBarChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    height: 130,
    marginTop: THEME.spacing.sm,
    marginBottom: THEME.spacing.xs,
    paddingHorizontal: 4,
    gap: 6,
  },
  ageBarColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
    gap: 4,
  },
  ageBarValue: {
    fontSize: 9,
    fontWeight: '900',
    color: THEME.colors.textSecondary,
    fontFamily: THEME.fontFamily.pixel,
  },
  ageBarTrack: {
    width: '70%',
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: THEME.colors.background,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    borderRadius: THEME.borderRadius,
    overflow: 'hidden',
    minHeight: 50,
  },
  ageBarFill: {
    width: '100%',
    borderRadius: 2,
  },
  ageBarLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  ageLegendRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    justifyContent: 'center',
    gap: THEME.spacing.lg,
    marginBottom: THEME.spacing.sm,
  },
  ageLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ageLegendText: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  agingAlertBox: {
    alignSelf: 'stretch',
    backgroundColor: THEME.colors.dangerBg,
    borderWidth: 1.5,
    borderColor: THEME.colors.danger,
    borderRadius: THEME.borderRadius,
    padding: THEME.spacing.md,
    gap: 4,
  },
  agingAlertTitle: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '900',
    color: THEME.colors.dangerDark,
  },
  agingAlertHint: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    marginBottom: 4,
  },
  agingAssetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  agingAssetName: {
    flex: 1,
    fontSize: THEME.fontSize.xs,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  agingAssetAge: {
    fontSize: 10,
    fontWeight: '900',
    color: THEME.colors.dangerDark,
    fontFamily: THEME.fontFamily.pixel,
  },
  concentrationBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.lg,
    backgroundColor: THEME.colors.background,
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    borderRadius: THEME.borderRadius,
    marginBottom: THEME.spacing.md,
  },
  concentrationBannerHigh: {
    backgroundColor: THEME.colors.dangerBg,
    borderColor: THEME.colors.dangerDark,
  },
  concentrationBannerMedium: {
    backgroundColor: THEME.colors.warningBg,
    borderColor: THEME.colors.warning,
  },
  concentrationBannerLow: {
    backgroundColor: THEME.colors.successBg,
    borderColor: THEME.colors.success,
  },
  concentrationBannerLabel: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  concentrationBannerValue: {
    fontSize: THEME.fontSize.lg,
    fontWeight: '900',
    fontFamily: THEME.fontFamily.pixel,
    color: THEME.colors.primaryDark,
  },
  concentrationRow: {
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
  concentrationBlock: {
    flex: 1,
    alignItems: 'center',
  },
  concentrationLabel: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    fontWeight: '700',
    marginBottom: 4,
  },
  concentrationValue: {
    fontSize: THEME.fontSize.md,
    fontWeight: '900',
    fontFamily: THEME.fontFamily.pixel,
  },
  concentrationHint: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.dangerDark,
    textAlign: 'center',
    marginTop: THEME.spacing.xs,
  },
});
