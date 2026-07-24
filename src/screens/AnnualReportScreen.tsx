/**
 * AnnualReportScreen - 年度资产回顾报告
 *
 * 汇总指定年份的资产购置、回本、售出、订阅、维修、卡包、净资产等数据，
 * 以像素风卡片形式呈现，并支持生成分享卡片。
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type {
  MaintenanceLog,
  NetWorthSnapshot,
  OneTimeItem,
  RootStackParamList,
  StoredCard,
  Subscription,
} from '../types';
import {
  getAllMaintenanceLogs,
  getAllNetWorthSnapshots,
  getAllOneTimeItems,
  getAllStoredCards,
  getAllSubscriptions,
} from '../database';
import { useTheme } from '../contexts/ThemeContext';
import { THEME } from '../utils/constants';
import {
  calculateAssetHealth,
  calculateDailyCost,
  calculateNetAssetValue,
  calculateOneTimeItemActiveDays,
  calculateRealizedProfit,
  calculateServiceProgress,
  calculateStoredPrincipal,
  calculateSubscriptionDailyCost,
} from '../utils/calculations';
import { formatCurrency, formatDate, getTodayString } from '../utils/formatters';
import {
  BrutalButton,
  EmptyState,
  EntityCover,
  HealthBadge,
  ServiceProgressBar,
  ShareModal,
} from '../components';
import type { ShareCardData } from '../components';
import type { ShareItemEntry } from '../components/ShareCard';
import { alertError } from '../utils/pixelAlert';

type Props = NativeStackScreenProps<RootStackParamList, 'AnnualReport'>;

/** 年份选择下限 */
const MIN_YEAR = 2020;

/** 取当前年份 */
function getCurrentYear(): number {
  return new Date().getFullYear();
}

/** 判断日期字符串是否属于指定年份 */
function isDateInYear(dateString: string | null | undefined, year: number): boolean {
  if (!dateString) return false;
  return dateString.startsWith(`${year}-`);
}

export function AnnualReportScreen({ route, navigation }: Props) {
  const db = useSQLiteContext();
  const { theme, themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);

  // 年份默认取路由参数，否则取当前年份
  const initialYear = route.params?.year ?? getCurrentYear();
  const [year, setYear] = useState<number>(initialYear);
  const maxYear = getCurrentYear() + 1;

  const [items, setItems] = useState<OneTimeItem[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [storedCards, setStoredCards] = useState<StoredCard[]>([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLog[]>([]);
  const [snapshots, setSnapshots] = useState<NetWorthSnapshot[]>([]);
  const [shareData, setShareData] = useState<ShareCardData | null>(null);

  // 加载所有原始数据（按年份筛选放在 useMemo 里做）
  const load = useCallback(async () => {
    try {
      const [
        nextItems,
        nextSubscriptions,
        nextStoredCards,
        nextLogs,
        nextSnapshots,
      ] = await Promise.all([
        getAllOneTimeItems(db),
        getAllSubscriptions(db),
        getAllStoredCards(db),
        getAllMaintenanceLogs(db),
        getAllNetWorthSnapshots(db),
      ]);
      setItems(nextItems);
      setSubscriptions(nextSubscriptions);
      setStoredCards(nextStoredCards);
      setMaintenanceLogs(nextLogs);
      setSnapshots(nextSnapshots);
    } catch (error) {
      console.error('加载年度报告数据失败', error);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // ===================== 1. 年度购入资产总览 =====================
  const purchasedSummary = useMemo(() => {
    const purchased = items.filter(item => isDateInYear(item.buy_date, year));
    const count = purchased.length;
    const totalAmount = purchased.reduce((sum, item) => sum + item.total_price, 0);
    // 按购买金额降序，取 TOP 5 用于展示
    const topPurchased = [...purchased]
      .sort((a, b) => b.total_price - a.total_price)
      .slice(0, 5);
    return { purchased, count, totalAmount, topPurchased };
  }, [items, year]);

  // ===================== 2. 年度回本资产 TOP3（日均成本最低的在用资产） =====================
  const topRecoveredAssets = useMemo(() => {
    return items
      .filter(item => item.status === 'active')
      .map(item => {
        const activeDays = calculateOneTimeItemActiveDays(item);
        const dailyCost = calculateDailyCost(item.total_price, 0, activeDays);
        return { item, activeDays, dailyCost };
      })
      .filter(entry => entry.activeDays > 0)
      .sort((a, b) => a.dailyCost - b.dailyCost)
      .slice(0, 3);
  }, [items]);

  // ===================== 3. 年度售出资产（end_date 在该年份的已售出资产） =====================
  const soldSummary = useMemo(() => {
    const sold = items.filter(
      item =>
        item.status === 'archived' &&
        item.archived_reason === 'sold' &&
        isDateInYear(item.end_date, year),
    );
    const rows = sold.map(item => {
      const profit = calculateRealizedProfit(item.total_price, item.salvage_value);
      return { item, profit };
    });
    const totalProfit = rows.reduce((sum, row) => sum + row.profit, 0);
    const totalRevenue = sold.reduce((sum, item) => sum + item.salvage_value, 0);
    const winnerCount = rows.filter(row => row.profit > 0).length;
    return { rows, totalProfit, totalRevenue, count: sold.length, winnerCount };
  }, [items, year]);

  // ===================== 4. 年度订阅支出汇总（按月付/季付/年付统计） =====================
  const subscriptionSummary = useMemo(() => {
    // 仅统计该年份仍处于活跃状态的订阅
    const active = subscriptions.filter(sub => sub.status === 'active');
    const groups: Record<'monthly' | 'quarterly' | 'yearly', Subscription[]> = {
      monthly: [],
      quarterly: [],
      yearly: [],
    };
    for (const sub of active) {
      groups[sub.billing_cycle].push(sub);
    }

    const cyclesPerYear: Record<'monthly' | 'quarterly' | 'yearly', number> = {
      monthly: 12,
      quarterly: 4,
      yearly: 1,
    };

    const monthlyTotal = groups.monthly.reduce(
      (sum, sub) => sum + sub.cycle_price * cyclesPerYear.monthly,
      0,
    );
    const quarterlyTotal = groups.quarterly.reduce(
      (sum, sub) => sum + sub.cycle_price * cyclesPerYear.quarterly,
      0,
    );
    const yearlyTotal = groups.yearly.reduce(
      (sum, sub) => sum + sub.cycle_price * cyclesPerYear.yearly,
      0,
    );
    const grandTotal = monthlyTotal + quarterlyTotal + yearlyTotal;
    const maxGroupTotal = Math.max(monthlyTotal, quarterlyTotal, yearlyTotal, 1);

    return {
      groups,
      monthlyTotal,
      quarterlyTotal,
      yearlyTotal,
      grandTotal,
      maxGroupTotal,
      activeCount: active.length,
    };
  }, [subscriptions]);

  // ===================== 5. 年度维修支出汇总 =====================
  const maintenanceSummary = useMemo(() => {
    const yearLogs = maintenanceLogs.filter(log =>
      isDateInYear(log.log_date, year),
    );
    const totalCost = yearLogs.reduce((sum, log) => sum + log.cost, 0);
    // 按资产聚合，找维修支出 TOP 3
    const perItem = new Map<number, { cost: number; count: number }>();
    for (const log of yearLogs) {
      const existing = perItem.get(log.item_id);
      if (existing) {
        existing.cost += log.cost;
        existing.count += 1;
      } else {
        perItem.set(log.item_id, { cost: log.cost, count: 1 });
      }
    }
    const topItems = Array.from(perItem.entries())
      .map(([itemId, stat]) => {
        const item = items.find(it => it.id === itemId);
        return { item, ...stat };
      })
      .filter(entry => entry.item)
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 3);
    return { yearLogs, totalCost, topItems, logCount: yearLogs.length };
  }, [maintenanceLogs, items, year]);

  // ===================== 6. 年度沉睡卡包提醒（剩余本金最多的卡） =====================
  const dormantCardSummary = useMemo(() => {
    const active = storedCards.filter(card => card.status === 'active');
    const rows = active
      .map(card => {
        const principal = calculateStoredPrincipal(
          card.actual_paid,
          card.face_value,
          card.current_balance,
        );
        return { card, principal };
      })
      .sort((a, b) => b.principal - a.principal);
    const totalPrincipal = rows.reduce((sum, row) => sum + row.principal, 0);
    return { rows, totalPrincipal, activeCount: active.length };
  }, [storedCards]);

  // ===================== 7. 年度净资产变化曲线 =====================
  const netWorthTrend = useMemo(() => {
    const yearSnapshots = snapshots
      .filter(snap => isDateInYear(snap.snapshot_date, year))
      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
    if (yearSnapshots.length === 0) {
      return { rows: [], maxNet: 0, minNet: 0, delta: 0, first: null, last: null };
    }
    const maxNet = yearSnapshots.reduce((m, s) => Math.max(m, s.net_value), 0);
    const minNet = yearSnapshots.reduce((m, s) => Math.min(m, s.net_value), 0);
    const first = yearSnapshots[0];
    const last = yearSnapshots[yearSnapshots.length - 1];
    const delta = last.net_value - first.net_value;
    return { rows: yearSnapshots, maxNet, minNet, delta, first, last };
  }, [snapshots, year]);

  // ===================== 8. 年度最佳资产（健康度最高的在用资产） =====================
  const bestAsset = useMemo(() => {
    const candidates = items
      .filter(item => item.status === 'active')
      .map(item => {
        const activeDays = calculateOneTimeItemActiveDays(item);
        const serviceProgress = calculateServiceProgress(item, activeDays);
        const health = calculateAssetHealth(item, serviceProgress);
        return { item, activeDays, serviceProgress, health };
      })
      .filter(entry => entry.health.grade !== 'unknown');
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.health.score - a.health.score);
    return candidates[0];
  }, [items]);

  // ===================== 当前净资产（用于与年末快照对比） =====================
  const currentNetWorth = useMemo(
    () =>
      calculateNetAssetValue(items, storedCards, card =>
        calculateStoredPrincipal(card.actual_paid, card.face_value, card.current_balance),
      ),
    [items, storedCards],
  );

  // ===================== 分享卡片数据构建 =====================
  const handleShare = useCallback(() => {
    if (purchasedSummary.count === 0 && soldSummary.count === 0 && subscriptionSummary.activeCount === 0) {
      alertError('暂无可分享数据', '该年份没有任何资产活动，无法生成年度报告卡片。');
      return;
    }

    // 年度支出折算日均
    const yearlyTotalSpending =
      purchasedSummary.totalAmount +
      subscriptionSummary.grandTotal +
      maintenanceSummary.totalCost;
    const avgDailyCost = yearlyTotalSpending / 365;

    const topAssets: ShareItemEntry[] = topRecoveredAssets.map(entry => ({
      name: entry.item.name,
      icon: entry.item.icon ?? '📦',
      imageUri: entry.item.image_uri,
      dailyCost: entry.dailyCost,
      extra: `${entry.activeDays} 天`,
    }));

    const topSubscriptions: ShareItemEntry[] = subscriptions
      .filter(sub => sub.status === 'active')
      .map(sub => {
        const dailyCost = calculateSubscriptionDailyCost(sub.cycle_price, sub.billing_cycle);
        return { sub, dailyCost };
      })
      .sort((a, b) => b.dailyCost - a.dailyCost)
      .slice(0, 3)
      .map(({ sub, dailyCost }) => ({
        name: sub.name,
        icon: sub.icon ?? '💿',
        imageUri: sub.image_uri,
        dailyCost,
        extra: sub.billing_cycle === 'monthly' ? '月付' : sub.billing_cycle === 'quarterly' ? '季付' : '年付',
      }));

    const topStoredCards: ShareItemEntry[] = dormantCardSummary.rows
      .slice(0, 3)
      .map(row => ({
        name: row.card.name,
        icon: row.card.icon ?? '💳',
        imageUri: row.card.image_uri,
        dailyCost: row.principal,
        extra: '剩余本金',
      }));

    const shareCardData: ShareCardData = {
      kind: 'summary',
      assetDailyCost: avgDailyCost,
      assetCount: purchasedSummary.count,
      realizedProfit: soldSummary.totalProfit,
      subscriptionDailyCost: subscriptionSummary.grandTotal / 365,
      installmentDailyDebt: currentNetWorth.installmentDebt / 30,
      storedPrincipal: dormantCardSummary.totalPrincipal,
      storedCardCount: dormantCardSummary.activeCount,
      topAssets,
      topSubscriptions,
      topStoredCards,
    };
    setShareData(shareCardData);
  }, [
    purchasedSummary,
    soldSummary,
    subscriptionSummary,
    maintenanceSummary,
    topRecoveredAssets,
    subscriptions,
    dormantCardSummary,
    currentNetWorth,
  ]);

  // 年份切换
  const handlePrevYear = useCallback(() => {
    setYear(prev => (prev > MIN_YEAR ? prev - 1 : prev));
  }, []);
  const handleNextYear = useCallback(() => {
    setYear(prev => (prev < maxYear ? prev + 1 : prev));
  }, [maxYear]);

  // 净资产变化百分比
  const netWorthDeltaPct = useMemo(() => {
    if (!netWorthTrend.first || netWorthTrend.first.net_value === 0) return null;
    return (netWorthTrend.delta / netWorthTrend.first.net_value) * 100;
  }, [netWorthTrend]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <StatusBar style={theme.colors.statusBar} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* 顶部年份选择器 */}
        <View style={styles.yearPickerCard}>
          <Text style={styles.yearPickerTitle}>📅 年度资产回顾</Text>
          <View style={styles.yearPickerRow}>
            <TouchableOpacity
              style={[styles.yearArrowBtn, year <= MIN_YEAR && styles.yearArrowBtnDisabled]}
              onPress={handlePrevYear}
              disabled={year <= MIN_YEAR}
              activeOpacity={0.7}
            >
              <Text style={styles.yearArrowText}>◀</Text>
            </TouchableOpacity>
            <View style={styles.yearDisplay}>
              <Text style={styles.yearText}>{year}</Text>
              <Text style={styles.yearSubLabel}>年</Text>
            </View>
            <TouchableOpacity
              style={[styles.yearArrowBtn, year >= maxYear && styles.yearArrowBtnDisabled]}
              onPress={handleNextYear}
              disabled={year >= maxYear}
              activeOpacity={0.7}
            >
              <Text style={styles.yearArrowText}>▶</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.yearRangeHint}>
            可选范围 {MIN_YEAR} ~ {maxYear}
          </Text>
        </View>

        {/* 1. 年度购入资产总览 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🛒 年度购入资产</Text>
          <Text style={styles.cardSubTitle}>
            共 {purchasedSummary.count} 件 · 合计 {formatCurrency(purchasedSummary.totalAmount)}
          </Text>
          {purchasedSummary.count === 0 ? (
            <EmptyState message={`${year} 年暂无购入资产记录`} icon="📦" />
          ) : (
            <View style={styles.listWrap}>
              {purchasedSummary.topPurchased.map((item, index) => (
                <View key={`purch-${item.id}`} style={styles.listRow}>
                  <View style={styles.rankingBadge}>
                    <Text style={styles.rankingBadgeText}>{index + 1}</Text>
                  </View>
                  <EntityCover
                    imageUri={item.image_uri}
                    icon={item.icon ?? '📦'}
                    size={32}
                    iconSize={16}
                  />
                  <View style={styles.listInfo}>
                    <Text style={styles.listName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.listMeta} numberOfLines={1}>
                      {formatDate(item.buy_date)} · {item.is_installment === 1 ? '分期' : '全款'}
                    </Text>
                  </View>
                  <Text style={styles.listValue} numberOfLines={1}>
                    {formatCurrency(item.total_price)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 2. 年度回本资产 TOP3 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>💚 年度回本 TOP 3</Text>
          <Text style={styles.cardSubTitle}>日均成本最低的在用资产 · 越低越划算</Text>
          {topRecoveredAssets.length === 0 ? (
            <EmptyState message="暂无在用资产，添加并使用一段时间后可见排行" icon="🏆" />
          ) : (
            <View style={styles.listWrap}>
              {topRecoveredAssets.map((entry, index) => {
                const totalCost = entry.item.total_price - 0;
                const recoveredPct =
                  totalCost > 0
                    ? Math.min(100, (totalCost - entry.dailyCost * entry.activeDays) / totalCost * 100)
                    : 0;
                return (
                  <View key={`recov-${entry.item.id}`} style={styles.listRow}>
                    <View style={styles.rankingBadge}>
                      <Text style={styles.rankingBadgeText}>{index + 1}</Text>
                    </View>
                    <EntityCover
                      imageUri={entry.item.image_uri}
                      icon={entry.item.icon ?? '📦'}
                      size={32}
                      iconSize={16}
                    />
                    <View style={styles.listInfo}>
                      <Text style={styles.listName} numberOfLines={1}>
                        {entry.item.name}
                      </Text>
                      <ServiceProgressBar
                        progress={recoveredPct / 100}
                        valueText={`${entry.activeDays} 天`}
                        label="回本"
                        style={styles.recovProgressBar}
                      />
                    </View>
                    <View style={styles.recovRight}>
                      <Text style={styles.recovValue}>{formatCurrency(entry.dailyCost)}</Text>
                      <Text style={styles.recovUnit}>/天</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* 3. 年度售出资产 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>💰 年度售出资产</Text>
          <Text style={styles.cardSubTitle}>
            共售出 {soldSummary.count} 件 · 回收 {formatCurrency(soldSummary.totalRevenue)} · 净盈亏{' '}
            {formatCurrency(soldSummary.totalProfit)}
          </Text>
          {soldSummary.count === 0 ? (
            <EmptyState message={`${year} 年暂无售出记录`} icon="🛒" />
          ) : (
            <View style={styles.listWrap}>
              {soldSummary.rows.map(row => (
                <View key={`sold-${row.item.id}`} style={styles.listRow}>
                  <EntityCover
                    imageUri={row.item.image_uri}
                    icon={row.item.icon ?? '📦'}
                    size={32}
                    iconSize={16}
                  />
                  <View style={styles.listInfo}>
                    <Text style={styles.listName} numberOfLines={1}>
                      {row.item.name}
                    </Text>
                    <Text style={styles.listMeta} numberOfLines={1}>
                      售出 {formatDate(row.item.end_date ?? row.item.buy_date)}
                    </Text>
                  </View>
                  <View style={styles.soldRight}>
                    <Text style={styles.soldRevenue}>{formatCurrency(row.item.salvage_value)}</Text>
                    <Text
                      style={[
                        styles.soldProfit,
                        row.profit > 0
                          ? { color: THEME.colors.success }
                          : row.profit < 0
                            ? { color: THEME.colors.dangerDark }
                            : { color: THEME.colors.textSecondary },
                      ]}
                    >
                      {row.profit > 0 ? '+' : ''}
                      {formatCurrency(row.profit)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 4. 年度订阅支出汇总 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📋 年度订阅支出</Text>
          <Text style={styles.cardSubTitle}>
            活跃订阅 {subscriptionSummary.activeCount} 项 · 年度预算{' '}
            {formatCurrency(subscriptionSummary.grandTotal)}
          </Text>
          {subscriptionSummary.grandTotal === 0 ? (
            <EmptyState message="暂无活跃订阅，添加订阅后可见年度预算" icon="📅" />
          ) : (
            <View style={styles.subBreakdownWrap}>
              {([
                { key: 'monthly' as const, label: '月付', value: subscriptionSummary.monthlyTotal, count: subscriptionSummary.groups.monthly.length },
                { key: 'quarterly' as const, label: '季付', value: subscriptionSummary.quarterlyTotal, count: subscriptionSummary.groups.quarterly.length },
                { key: 'yearly' as const, label: '年付', value: subscriptionSummary.yearlyTotal, count: subscriptionSummary.groups.yearly.length },
              ]).map(row => {
                const pct =
                  subscriptionSummary.maxGroupTotal > 0
                    ? (row.value / subscriptionSummary.maxGroupTotal) * 100
                    : 0;
                return (
                  <View key={row.key} style={styles.subBarRow}>
                    <View style={styles.subBarHeader}>
                      <Text style={styles.subBarLabel}>
                        {row.label} · {row.count} 项
                      </Text>
                      <Text style={styles.subBarValue}>{formatCurrency(row.value)}</Text>
                    </View>
                    <View style={styles.subBarTrack}>
                      <View
                        style={[
                          styles.subBarFill,
                          {
                            width: `${Math.max(pct, row.value > 0 ? 6 : 0)}%`,
                            backgroundColor:
                              row.key === 'monthly'
                                ? THEME.colors.primary
                                : row.key === 'quarterly'
                                  ? THEME.colors.accent
                                  : THEME.colors.warning,
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
              <View style={styles.subDailyHintRow}>
                <Text style={styles.subDailyHintLabel}>折算日均</Text>
                <Text style={styles.subDailyHintValue}>
                  {formatCurrency(subscriptionSummary.grandTotal / 365)} / 天
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* 5. 年度维修支出汇总 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🔧 年度维修支出</Text>
          <Text style={styles.cardSubTitle}>
            共 {maintenanceSummary.logCount} 笔 · 合计 {formatCurrency(maintenanceSummary.totalCost)}
          </Text>
          {maintenanceSummary.logCount === 0 ? (
            <EmptyState message={`${year} 年暂无维修记录`} icon="🛠️" />
          ) : (
            <View style={styles.listWrap}>
              {maintenanceSummary.topItems.map(entry => (
                <View key={`maint-${entry.item!.id}`} style={styles.listRow}>
                  <EntityCover
                    imageUri={entry.item!.image_uri}
                    icon={entry.item!.icon ?? '📦'}
                    size={32}
                    iconSize={16}
                  />
                  <View style={styles.listInfo}>
                    <Text style={styles.listName} numberOfLines={1}>
                      {entry.item!.name}
                    </Text>
                    <Text style={styles.listMeta} numberOfLines={1}>
                      {entry.count} 笔维修记录
                    </Text>
                  </View>
                  <Text style={styles.listValue} numberOfLines={1}>
                    {formatCurrency(entry.cost)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 6. 年度沉睡卡包提醒 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>💤 沉睡卡包提醒</Text>
          <Text style={styles.cardSubTitle}>
            活跃卡包 {dormantCardSummary.activeCount} 张 · 剩余本金合计{' '}
            {formatCurrency(dormantCardSummary.totalPrincipal)}
          </Text>
          {dormantCardSummary.rows.length === 0 ? (
            <EmptyState message="暂无活跃卡包，去添加储值卡后可见提醒" icon="💳" />
          ) : (
            <View style={styles.listWrap}>
              {dormantCardSummary.rows.slice(0, 3).map((row, index) => (
                <View key={`card-${row.card.id}`} style={styles.listRow}>
                  <View style={styles.rankingBadge}>
                    <Text style={styles.rankingBadgeText}>{index + 1}</Text>
                  </View>
                  <EntityCover
                    imageUri={row.card.image_uri}
                    icon={row.card.icon ?? '💳'}
                    size={32}
                    iconSize={16}
                  />
                  <View style={styles.listInfo}>
                    <Text style={styles.listName} numberOfLines={1}>
                      {row.card.name}
                    </Text>
                    <Text style={styles.listMeta} numberOfLines={1}>
                      余额 {formatCurrency(row.card.current_balance)} · 最近 {formatDate(row.card.last_updated_date)}
                    </Text>
                  </View>
                  <View style={styles.dormantRight}>
                    <Text style={styles.dormantValue}>{formatCurrency(row.principal)}</Text>
                    <Text style={styles.dormantUnit}>沉睡本金</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 7. 年度净资产变化曲线 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📈 年度净资产曲线</Text>
          <Text style={styles.cardSubTitle}>
            {netWorthTrend.rows.length} 个快照 · 当前 {formatCurrency(currentNetWorth.netValue)}
          </Text>
          {netWorthTrend.rows.length === 0 ? (
            <EmptyState message={`${year} 年暂无净资产快照`} icon="📉" />
          ) : (
            <>
              <View style={styles.netWorthChart}>
                {netWorthTrend.rows.map((snap, index) => {
                  const range = Math.max(netWorthTrend.maxNet - netWorthTrend.minNet, 1);
                  const heightPct = ((snap.net_value - netWorthTrend.minNet) / range) * 100;
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
                <View style={styles.netWorthDeltaBlock}>
                  <Text style={styles.netWorthDeltaLabel}>年初</Text>
                  <Text style={styles.netWorthDeltaValue}>
                    {netWorthTrend.first ? formatCurrency(netWorthTrend.first.net_value) : '—'}
                  </Text>
                </View>
                <View style={styles.netWorthDeltaArrow}>
                  <Text style={styles.netWorthDeltaArrowText}>→</Text>
                </View>
                <View style={styles.netWorthDeltaBlock}>
                  <Text style={styles.netWorthDeltaLabel}>年末</Text>
                  <Text style={styles.netWorthDeltaValue}>
                    {netWorthTrend.last ? formatCurrency(netWorthTrend.last.net_value) : '—'}
                  </Text>
                </View>
                <View style={styles.netWorthDeltaDivider} />
                <View style={styles.netWorthDeltaBlock}>
                  <Text style={styles.netWorthDeltaLabel}>变化</Text>
                  <Text
                    style={[
                      styles.netWorthDeltaValue,
                      {
                        color:
                          netWorthTrend.delta > 0
                            ? THEME.colors.success
                            : netWorthTrend.delta < 0
                              ? THEME.colors.dangerDark
                              : THEME.colors.textSecondary,
                      },
                    ]}
                  >
                    {netWorthTrend.delta > 0 ? '+' : ''}
                    {formatCurrency(netWorthTrend.delta)}
                  </Text>
                </View>
              </View>
              {netWorthDeltaPct !== null && (
                <Text style={styles.netWorthPctHint}>
                  同比{' '}
                  <Text
                    style={{
                      color:
                        netWorthDeltaPct > 0
                          ? THEME.colors.success
                          : netWorthDeltaPct < 0
                            ? THEME.colors.dangerDark
                            : THEME.colors.textSecondary,
                    }}
                  >
                    {netWorthDeltaPct > 0 ? '+' : ''}
                    {netWorthDeltaPct.toFixed(1)}%
                  </Text>
                </Text>
              )}
            </>
          )}
        </View>

        {/* 8. 年度最佳资产 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>👑 年度最佳资产</Text>
          <Text style={styles.cardSubTitle}>健康度评分最高的在用资产</Text>
          {!bestAsset ? (
            <EmptyState message="暂无可评估的在用资产，设置预期寿命与保修信息后可见" icon="🥇" />
          ) : (
            <View style={styles.bestAssetWrap}>
              <View style={styles.bestAssetHeader}>
                <EntityCover
                  imageUri={bestAsset.item.image_uri}
                  icon={bestAsset.item.icon ?? '📦'}
                  size={56}
                  iconSize={28}
                />
                <View style={styles.bestAssetMeta}>
                  <Text style={styles.bestAssetName} numberOfLines={2}>
                    {bestAsset.item.name}
                  </Text>
                  <Text style={styles.bestAssetHint} numberOfLines={1}>
                    {formatCurrency(bestAsset.item.total_price)} · 已服役 {bestAsset.activeDays} 天
                  </Text>
                  <HealthBadge grade={bestAsset.health.grade} score={bestAsset.health.score} />
                </View>
                <View style={styles.bestAssetScoreWrap}>
                  <Text style={styles.bestAssetScore}>{bestAsset.health.score}</Text>
                  <Text style={styles.bestAssetScoreUnit}>分</Text>
                </View>
              </View>
              {bestAsset.serviceProgress.expectedDays !== null && (
                <ServiceProgressBar
                  progress={bestAsset.serviceProgress.progress ?? 0}
                  valueText={`${bestAsset.activeDays} / ${bestAsset.serviceProgress.expectedDays} 天`}
                  overService={bestAsset.serviceProgress.overService}
                  label="服役"
                  style={styles.bestAssetProgress}
                />
              )}
              <View style={styles.healthBreakdownRow}>
                <View style={styles.healthBreakdownBlock}>
                  <Text style={styles.healthBreakdownLabel}>服役</Text>
                  <Text style={styles.healthBreakdownValue}>{bestAsset.health.breakdown.service}</Text>
                </View>
                <View style={styles.healthBreakdownBlock}>
                  <Text style={styles.healthBreakdownLabel}>保修</Text>
                  <Text style={styles.healthBreakdownValue}>{bestAsset.health.breakdown.warranty}</Text>
                </View>
                <View style={styles.healthBreakdownBlock}>
                  <Text style={styles.healthBreakdownLabel}>状态</Text>
                  <Text style={styles.healthBreakdownValue}>{bestAsset.health.breakdown.status}</Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* 底部分享按钮 */}
        <BrutalButton
          title="📤 分享年度报告"
          onPress={handleShare}
          variant="primary"
          size="lg"
          style={styles.shareBtn}
        />
      </ScrollView>

      <ShareModal
        visible={shareData !== null}
        data={shareData}
        onClose={() => setShareData(null)}
      />
    </SafeAreaView>
  );
}

const createStyles = () =>
  StyleSheet.create({
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
      paddingBottom: 48,
    },

    // 年份选择器
    yearPickerCard: {
      backgroundColor: THEME.colors.primary,
      borderWidth: 2,
      borderColor: THEME.colors.borderDark,
      borderRadius: THEME.borderRadius,
      ...THEME.pixelShadow,
      padding: THEME.spacing.lg,
      alignItems: 'center',
      marginBottom: THEME.spacing.xl,
    },
    yearPickerTitle: {
      fontSize: THEME.fontSize.lg,
      fontWeight: '900',
      color: THEME.colors.onPrimary,
      marginBottom: THEME.spacing.md,
    },
    yearPickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: THEME.spacing.lg,
    },
    yearArrowBtn: {
      width: 40,
      height: 40,
      borderRadius: THEME.borderRadius,
      borderWidth: 2,
      borderColor: THEME.colors.borderDark,
      backgroundColor: THEME.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    yearArrowBtnDisabled: {
      opacity: 0.4,
    },
    yearArrowText: {
      fontSize: THEME.fontSize.md,
      fontWeight: '900',
      color: THEME.colors.textPrimary,
    },
    yearDisplay: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 6,
      paddingHorizontal: THEME.spacing.lg,
    },
    yearText: {
      fontSize: THEME.fontSize.xxl,
      fontWeight: '900',
      fontFamily: THEME.fontFamily.pixel,
      color: THEME.colors.onPrimary,
      letterSpacing: 2,
    },
    yearSubLabel: {
      fontSize: THEME.fontSize.md,
      fontWeight: '800',
      color: THEME.colors.onPrimary,
    },
    yearRangeHint: {
      fontSize: 10,
      fontWeight: '700',
      color: THEME.colors.onPrimary,
      marginTop: THEME.spacing.sm,
      opacity: 0.8,
    },

    // 通用卡片
    card: {
      backgroundColor: THEME.colors.surface,
      borderWidth: 2,
      borderColor: THEME.colors.borderDark,
      borderRadius: THEME.borderRadius,
      ...THEME.pixelShadow,
      padding: THEME.spacing.lg,
      marginBottom: THEME.spacing.xl,
      alignItems: 'center',
    },
    cardTitle: {
      fontSize: THEME.fontSize.lg,
      fontWeight: '900',
      color: THEME.colors.textPrimary,
      textAlign: 'center',
      marginBottom: 4,
    },
    cardSubTitle: {
      fontSize: THEME.fontSize.sm,
      color: THEME.colors.textSecondary,
      marginBottom: THEME.spacing.md,
      textAlign: 'center',
    },

    // 通用列表
    listWrap: {
      alignSelf: 'stretch',
      marginTop: THEME.spacing.sm,
      gap: THEME.spacing.sm,
    },
    listRow: {
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
      width: 26,
      height: 26,
      borderRadius: THEME.borderRadius,
      borderWidth: 2,
      borderColor: THEME.colors.borderDark,
      backgroundColor: THEME.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rankingBadgeText: {
      fontSize: THEME.fontSize.xs,
      fontWeight: '900',
      fontFamily: THEME.fontFamily.pixel,
      color: THEME.colors.surface,
    },
    listInfo: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    listName: {
      fontSize: THEME.fontSize.sm,
      fontWeight: '800',
      color: THEME.colors.textPrimary,
    },
    listMeta: {
      fontSize: 10,
      fontWeight: '700',
      color: THEME.colors.textSecondary,
    },
    listValue: {
      fontSize: THEME.fontSize.sm,
      fontWeight: '900',
      fontFamily: THEME.fontFamily.pixel,
      color: THEME.colors.dangerDark,
    },

    // 回本 TOP3
    recovProgressBar: {
      flex: 1,
      minWidth: 80,
    },
    recovRight: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 2,
    },
    recovValue: {
      fontSize: THEME.fontSize.md,
      fontWeight: '900',
      fontFamily: THEME.fontFamily.pixel,
      color: THEME.colors.success,
    },
    recovUnit: {
      fontSize: 10,
      fontWeight: '700',
      color: THEME.colors.textSecondary,
    },

    // 售出资产
    soldRight: {
      alignItems: 'flex-end',
      gap: 2,
    },
    soldRevenue: {
      fontSize: THEME.fontSize.sm,
      fontWeight: '900',
      color: THEME.colors.textPrimary,
    },
    soldProfit: {
      fontSize: 10,
      fontWeight: '900',
      fontFamily: THEME.fontFamily.pixel,
    },

    // 订阅支出
    subBreakdownWrap: {
      alignSelf: 'stretch',
      marginTop: THEME.spacing.sm,
      gap: THEME.spacing.md,
    },
    subBarRow: {
      alignSelf: 'stretch',
      gap: 6,
    },
    subBarHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    subBarLabel: {
      fontSize: THEME.fontSize.xs,
      fontWeight: '800',
      color: THEME.colors.textPrimary,
    },
    subBarValue: {
      fontSize: THEME.fontSize.sm,
      fontWeight: '900',
      fontFamily: THEME.fontFamily.pixel,
      color: THEME.colors.primaryDark,
    },
    subBarTrack: {
      height: 14,
      backgroundColor: THEME.colors.background,
      borderWidth: 1.5,
      borderColor: THEME.colors.border,
      borderRadius: THEME.borderRadius,
      overflow: 'hidden',
    },
    subBarFill: {
      height: '100%',
      borderRadius: 2,
    },
    subDailyHintRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
      paddingVertical: THEME.spacing.xs,
      backgroundColor: THEME.colors.surfaceMuted,
      borderWidth: 1.5,
      borderColor: THEME.colors.border,
      borderRadius: THEME.borderRadius,
    },
    subDailyHintLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: THEME.colors.textSecondary,
    },
    subDailyHintValue: {
      fontSize: THEME.fontSize.xs,
      fontWeight: '900',
      color: THEME.colors.textPrimary,
    },

    // 沉睡卡包
    dormantRight: {
      alignItems: 'flex-end',
      gap: 2,
    },
    dormantValue: {
      fontSize: THEME.fontSize.sm,
      fontWeight: '900',
      fontFamily: THEME.fontFamily.pixel,
      color: THEME.colors.warning,
    },
    dormantUnit: {
      fontSize: 10,
      fontWeight: '700',
      color: THEME.colors.textSecondary,
    },

    // 净资产曲线
    netWorthChart: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      alignSelf: 'stretch',
      height: 150,
      marginTop: THEME.spacing.sm,
      marginBottom: THEME.spacing.md,
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
      alignItems: 'center',
      alignSelf: 'stretch',
      paddingVertical: THEME.spacing.sm,
      paddingHorizontal: THEME.spacing.md,
      backgroundColor: THEME.colors.background,
      borderWidth: 1.5,
      borderColor: THEME.colors.border,
      borderRadius: THEME.borderRadius,
      gap: THEME.spacing.xs,
    },
    netWorthDeltaBlock: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    netWorthDeltaLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: THEME.colors.textSecondary,
    },
    netWorthDeltaValue: {
      fontSize: THEME.fontSize.xs,
      fontWeight: '900',
      fontFamily: THEME.fontFamily.pixel,
      color: THEME.colors.textPrimary,
    },
    netWorthDeltaArrow: {
      width: 20,
      alignItems: 'center',
    },
    netWorthDeltaArrowText: {
      fontSize: THEME.fontSize.md,
      fontWeight: '900',
      color: THEME.colors.textSecondary,
    },
    netWorthDeltaDivider: {
      width: 1.5,
      height: 28,
      backgroundColor: THEME.colors.border,
    },
    netWorthPctHint: {
      fontSize: 10,
      fontWeight: '800',
      color: THEME.colors.textSecondary,
      textAlign: 'center',
      marginTop: THEME.spacing.xs,
    },

    // 年度最佳资产
    bestAssetWrap: {
      alignSelf: 'stretch',
      marginTop: THEME.spacing.sm,
      gap: THEME.spacing.md,
    },
    bestAssetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: THEME.spacing.md,
      paddingVertical: THEME.spacing.md,
      paddingHorizontal: THEME.spacing.md,
      backgroundColor: THEME.colors.background,
      borderWidth: 2,
      borderColor: THEME.colors.borderDark,
      borderRadius: THEME.borderRadius,
    },
    bestAssetMeta: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    bestAssetName: {
      fontSize: THEME.fontSize.md,
      fontWeight: '900',
      color: THEME.colors.textPrimary,
    },
    bestAssetHint: {
      fontSize: 10,
      fontWeight: '700',
      color: THEME.colors.textSecondary,
    },
    bestAssetScoreWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: THEME.spacing.sm,
    },
    bestAssetScore: {
      fontSize: THEME.fontSize.xxl,
      fontWeight: '900',
      fontFamily: THEME.fontFamily.pixel,
      color: THEME.colors.highlight,
    },
    bestAssetScoreUnit: {
      fontSize: 10,
      fontWeight: '700',
      color: THEME.colors.textSecondary,
    },
    bestAssetProgress: {
      alignSelf: 'stretch',
    },
    healthBreakdownRow: {
      flexDirection: 'row',
      alignSelf: 'stretch',
      gap: THEME.spacing.sm,
    },
    healthBreakdownBlock: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: THEME.spacing.xs,
      backgroundColor: THEME.colors.surfaceMuted,
      borderWidth: 1.5,
      borderColor: THEME.colors.border,
      borderRadius: THEME.borderRadius,
      gap: 2,
    },
    healthBreakdownLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: THEME.colors.textSecondary,
    },
    healthBreakdownValue: {
      fontSize: THEME.fontSize.sm,
      fontWeight: '900',
      fontFamily: THEME.fontFamily.pixel,
      color: THEME.colors.primaryDark,
    },

    // 分享按钮
    shareBtn: {
      alignSelf: 'stretch',
      marginTop: THEME.spacing.sm,
    },
  });
