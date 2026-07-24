/**
 * CalendarScreen —— 资产生命周期日历视图
 *
 * 月历展示当月所有到期事件：保修到期、订阅续费、保养计划到期、沉睡卡包提醒。
 * 周一开头，7 列网格；点击有事件的日期会在下方列表展示该日全部事件。
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type {
  RootStackParamList,
  OneTimeItem,
  Subscription,
  StoredCard,
  MaintenancePlan,
} from '../types';
import {
  getAllOneTimeItems,
  getAllSubscriptions,
  getAllStoredCards,
  getAllActiveMaintenancePlans,
} from '../database';
import {
  calculateSubscriptionNextRenewalDate,
  calculateDaysUntil,
} from '../utils/calculations';
import { formatCurrency, getTodayString } from '../utils/formatters';
import { THEME } from '../utils/constants';
import { useTheme } from '../contexts/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Calendar'>;

/** 事件类型 */
type CalendarEventType = 'purchase' | 'warranty' | 'subscription' | 'maintenance' | 'stored_card';

interface CalendarEvent {
  type: CalendarEventType;
  date: string;
  title: string;
  subtitle?: string;
  entityId: number;
  entityType: 'item' | 'subscription' | 'stored_card';
}

/** 周一开头的星期标签 */
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

const EVENT_META: Record<CalendarEventType, { emoji: string; color: string; label: string }> = {
  purchase: { emoji: '🛒', color: THEME.colors.success, label: '购入' },
  warranty: { emoji: '🔧', color: THEME.colors.danger, label: '保修到期' },
  subscription: { emoji: '🔁', color: THEME.colors.accent, label: '订阅续费' },
  maintenance: { emoji: '🛠️', color: THEME.colors.warning, label: '保养到期' },
  stored_card: { emoji: '💤', color: THEME.colors.primary, label: '沉睡卡提醒' },
};

/** 解析 YYYY-MM-DD 为本地日期，避免 UTC 偏移。 */
function parseISODate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

/** 格式化 Date 为 YYYY-MM-DD。 */
function formatISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 在指定年月内，订阅是否产生扣款？返回该扣款日（YYYY-MM-DD），否则 null。 */
function getSubscriptionBillingDateInMonth(
  sub: Pick<Subscription, 'start_date' | 'billing_cycle' | 'status'>,
  year: number,
  month: number, // 1-12
): string | null {
  if (sub.status !== 'active') return null;
  const startDate = parseISODate(sub.start_date);
  const startMonthIndex = startDate.getFullYear() * 12 + startDate.getMonth();
  const targetMonthIndex = year * 12 + (month - 1);
  if (targetMonthIndex < startMonthIndex) return null;

  const stepMonths =
    sub.billing_cycle === 'monthly'
      ? 1
      : sub.billing_cycle === 'quarterly'
        ? 3
        : 12;
  if ((targetMonthIndex - startMonthIndex) % stepMonths !== 0) return null;

  // 扣款日 = start_date 的日号；若超出该月最后一天则夹紧到月末
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  const day = Math.min(startDate.getDate(), lastDayOfMonth);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 沉睡卡包提醒日 = last_updated_date + reminder_days。 */
function getStoredCardReminderDate(card: StoredCard): string | null {
  if (card.status !== 'active') return null;
  const base = parseISODate(card.last_updated_date);
  base.setDate(base.getDate() + card.reminder_days);
  return formatISODate(base);
}

/** 给定年月，构造该月全部事件。 */
function buildMonthEvents(params: {
  items: OneTimeItem[];
  subscriptions: Subscription[];
  storedCards: StoredCard[];
  maintenancePlans: MaintenancePlan[];
  year: number;
  month: number; // 1-12
}): CalendarEvent[] {
  const { items, subscriptions, storedCards, maintenancePlans, year, month } = params;
  const events: CalendarEvent[] = [];

  // 资产购入日
  for (const item of items) {
    if (!item.buy_date) continue;
    const buy = parseISODate(item.buy_date);
    if (buy.getFullYear() !== year || buy.getMonth() + 1 !== month) continue;
    events.push({
      type: 'purchase',
      date: item.buy_date,
      title: item.name,
      subtitle: `购入 · ${formatCurrency(item.total_price)}`,
      entityId: item.id,
      entityType: 'item',
    });
  }

  // 保修到期日
  for (const item of items) {
    if (item.status === 'archived') continue;
    if (!item.warranty_expiry_date) continue;
    const expiry = parseISODate(item.warranty_expiry_date);
    if (expiry.getFullYear() !== year || expiry.getMonth() + 1 !== month) continue;
    events.push({
      type: 'warranty',
      date: item.warranty_expiry_date,
      title: item.name,
      subtitle: '保修到期',
      entityId: item.id,
      entityType: 'item',
    });
  }

  // 订阅续费日
  for (const sub of subscriptions) {
    const billingDate = getSubscriptionBillingDateInMonth(sub, year, month);
    if (!billingDate) continue;
    events.push({
      type: 'subscription',
      date: billingDate,
      title: sub.name,
      subtitle: `${formatCurrency(sub.cycle_price)} · ${sub.billing_cycle === 'monthly' ? '月付' : sub.billing_cycle === 'quarterly' ? '季付' : '年付'}`,
      entityId: sub.id,
      entityType: 'subscription',
    });
  }

  // 保养计划到期日
  for (const plan of maintenancePlans) {
    if (plan.enabled !== 1) continue;
    if (!plan.next_due_date) continue;
    const due = parseISODate(plan.next_due_date);
    if (due.getFullYear() !== year || due.getMonth() + 1 !== month) continue;
    events.push({
      type: 'maintenance',
      date: plan.next_due_date,
      title: plan.title,
      subtitle: '保养到期',
      entityId: plan.item_id,
      entityType: 'item',
    });
  }

  // 沉睡卡包提醒日
  for (const card of storedCards) {
    const reminderDate = getStoredCardReminderDate(card);
    if (!reminderDate) continue;
    const parsed = parseISODate(reminderDate);
    if (parsed.getFullYear() !== year || parsed.getMonth() + 1 !== month) continue;
    events.push({
      type: 'stored_card',
      date: reminderDate,
      title: card.name,
      subtitle: '建议尽快消费',
      entityId: card.id,
      entityType: 'stored_card',
    });
  }

  return events;
}

/** 构造月历网格单元格序列（固定 6 行 = 42 格，避免月切换时高度抖动）。 */
function buildCalendarCells(year: number, month: number): Array<number | null> {
  const firstDay = new Date(year, month - 1, 1);
  // 周一开头：把 JS 的周日(0)~周六(6) 映射到 周一(0)~周日(6)
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: Array<number | null> = [];
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day);
  }
  // 末尾补齐到固定 6 行（42 格），保证月历高度恒定
  while (cells.length < 42) {
    cells.push(null);
  }
  return cells;
}

export function CalendarScreen({ navigation }: Props) {
  const db = useSQLiteContext();
  const { theme, themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);

  const [items, setItems] = useState<OneTimeItem[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [storedCards, setStoredCards] = useState<StoredCard[]>([]);
  const [maintenancePlans, setMaintenancePlans] = useState<MaintenancePlan[]>([]);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1); // 1-12
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());

  const load = useCallback(async () => {
    try {
      const [nextItems, nextSubscriptions, nextStoredCards, nextPlans] = await Promise.all([
        getAllOneTimeItems(db),
        getAllSubscriptions(db),
        getAllStoredCards(db),
        getAllActiveMaintenancePlans(db),
      ]);
      setItems(nextItems);
      setSubscriptions(nextSubscriptions);
      setStoredCards(nextStoredCards);
      setMaintenancePlans(nextPlans);
    } catch (error) {
      console.error('加载日历数据失败', error);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const monthEvents = useMemo(
    () => buildMonthEvents({ items, subscriptions, storedCards, maintenancePlans, year: viewYear, month: viewMonth }),
    [items, subscriptions, storedCards, maintenancePlans, viewYear, viewMonth],
  );

  /** 按日期分组：YYYY-MM-DD -> CalendarEvent[] */
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of monthEvents) {
      const list = map.get(event.date) ?? [];
      list.push(event);
      map.set(event.date, list);
    }
    return map;
  }, [monthEvents]);

  /** 按日期分组：day(1-31) -> Set<CalendarEventType>（用于网格点标记） */
  const eventTypesByDay = useMemo(() => {
    const map = new Map<number, Set<CalendarEventType>>();
    for (const event of monthEvents) {
      const day = parseISODate(event.date).getDate();
      const set = map.get(day) ?? new Set<CalendarEventType>();
      set.add(event.type);
      map.set(day, set);
    }
    return map;
  }, [monthEvents]);

  const calendarCells = useMemo(
    () => buildCalendarCells(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const monthLabel = useMemo(() => {
    return `${viewYear} 年 ${viewMonth} 月`;
  }, [viewYear, viewMonth]);

  /** 当月事件总数 */
  const monthEventCount = monthEvents.length;

  /** 当前选中的事件列表 */
  const selectedEvents = useMemo(() => {
    if (selectedDay === null) return [];
    const dateStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
    return eventsByDate.get(dateStr) ?? [];
  }, [selectedDay, viewYear, viewMonth, eventsByDate]);

  const todayString = useMemo(() => getTodayString(), []);

  const isViewingCurrentMonth = useMemo(() => {
    return viewYear === today.getFullYear() && viewMonth === today.getMonth() + 1;
  }, [viewYear, viewMonth, today]);

  // 时间范围限制：下限 = 最早一条记录所在月份，上限 = 当前月
  const minYearMonth = useMemo(() => {
    const candidates: number[] = [];
    const consider = (dateStr: string | null | undefined) => {
      if (!dateStr) return;
      const d = parseISODate(dateStr);
      if (Number.isNaN(d.getTime())) return;
      candidates.push(d.getFullYear() * 12 + d.getMonth());
    };
    for (const item of items) {
      consider(item.buy_date);
      consider(item.warranty_expiry_date);
    }
    for (const sub of subscriptions) consider(sub.start_date);
    for (const card of storedCards) consider(card.last_updated_date);
    for (const plan of maintenancePlans) consider(plan.next_due_date);
    const maxYearMonth = today.getFullYear() * 12 + today.getMonth();
    if (candidates.length === 0) return maxYearMonth;
    return Math.min(...candidates, maxYearMonth);
  }, [items, subscriptions, storedCards, maintenancePlans, today]);

  const maxYearMonth = today.getFullYear() * 12 + today.getMonth();
  const currentYearMonth = viewYear * 12 + (viewMonth - 1);
  const canGoPrev = currentYearMonth > minYearMonth;
  const canGoNext = currentYearMonth < maxYearMonth;

  const goToPrevMonth = useCallback(() => {
    if (!canGoPrev) return;
    setViewMonth(prev => {
      if (prev === 1) {
        setViewYear(y => y - 1);
        return 12;
      }
      return prev - 1;
    });
    setSelectedDay(null);
  }, [canGoPrev]);

  const goToNextMonth = useCallback(() => {
    if (!canGoNext) return;
    setViewMonth(prev => {
      if (prev === 12) {
        setViewYear(y => y + 1);
        return 1;
      }
      return prev + 1;
    });
    setSelectedDay(null);
  }, [canGoNext]);

  const goToToday = useCallback(() => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth() + 1);
    setSelectedDay(now.getDate());
  }, []);

  const handlePressEvent = useCallback((event: CalendarEvent) => {
    if (event.entityType === 'item') {
      navigation.navigate('ItemDetail', { itemId: event.entityId });
    } else if (event.entityType === 'subscription') {
      navigation.navigate('SubscriptionDetail', { subscriptionId: event.entityId });
    } else if (event.entityType === 'stored_card') {
      navigation.navigate('AddEditStoredCard', { storedCardId: event.entityId });
    }
  }, [navigation]);

  const handleSelectDay = useCallback((day: number) => {
    setSelectedDay(prev => (prev === day ? null : day));
  }, []);

  /** 计算距离今天还有多少天（仅用于事件列表展示）。 */
  const describeDistance = useCallback((dateStr: string): string => {
    const remaining = calculateDaysUntil(dateStr);
    if (remaining === 0) return '今天';
    if (remaining > 0) return `${remaining} 天后`;
    return `${Math.abs(remaining)} 天前`;
  }, []);

  /** 下一笔订阅续费日期（用于页眉提示）。 */
  const nextSubscriptionRenewal = useMemo(() => {
    let nearest: { date: string; sub: Subscription } | null = null;
    for (const sub of subscriptions) {
      const date = calculateSubscriptionNextRenewalDate(sub);
      if (!date) continue;
      if (!nearest || date < nearest.date) {
        nearest = { date, sub };
      }
    }
    return nearest;
  }, [subscriptions]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <StatusBar style={theme.colors.statusBar} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* 月份切换器 */}
        <View style={styles.monthSwitcher}>
          <TouchableOpacity
            style={[styles.monthNavButton, !canGoPrev && styles.monthNavButtonDisabled]}
            onPress={goToPrevMonth}
            disabled={!canGoPrev}
            activeOpacity={0.7}
          >
            <Text style={[styles.monthNavIcon, !canGoPrev && styles.monthNavIconDisabled]}>‹</Text>
          </TouchableOpacity>
          <View style={styles.monthLabelBox}>
            <Text style={styles.monthLabelText}>{monthLabel}</Text>
            <Text style={styles.monthSubLabel}>
              共 {monthEventCount} 个事件
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.monthNavButton, !canGoNext && styles.monthNavButtonDisabled]}
            onPress={goToNextMonth}
            disabled={!canGoNext}
            activeOpacity={0.7}
          >
            <Text style={[styles.monthNavIcon, !canGoNext && styles.monthNavIconDisabled]}>›</Text>
          </TouchableOpacity>
        </View>

        {!isViewingCurrentMonth && (
          <TouchableOpacity
            style={styles.todayLink}
            onPress={goToToday}
            activeOpacity={0.7}
          >
            <Text style={styles.todayLinkText}>回到今天</Text>
          </TouchableOpacity>
        )}

        {/* 图例 */}
        <View style={styles.legendRow}>
          {(Object.keys(EVENT_META) as CalendarEventType[]).map(type => {
            const meta = EVENT_META[type];
            return (
              <View key={type} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: meta.color }]} />
                <Text style={styles.legendText}>
                  {meta.emoji} {meta.label}
                </Text>
              </View>
            );
          })}
        </View>

        {/* 月历网格 */}
        <View style={styles.calendarCard}>
          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map(label => (
              <View key={label} style={styles.weekdayCell}>
                <Text style={styles.weekdayText}>{label}</Text>
              </View>
            ))}
          </View>
          <View style={styles.grid}>
            {calendarCells.map((day, idx) => {
              if (day === null) {
                return <View key={`empty-${idx}`} style={styles.dayCell} />;
              }
              const dateStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const eventTypes = eventTypesByDay.get(day);
              const hasEvents = !!eventTypes && eventTypes.size > 0;
              const isToday = isViewingCurrentMonth && day === today.getDate();
              const isSelected = selectedDay === day;

              return (
                <TouchableOpacity
                  key={`day-${day}`}
                  style={[
                    styles.dayCell,
                    isToday && styles.dayCellToday,
                    isSelected && styles.dayCellSelected,
                  ]}
                  onPress={() => handleSelectDay(day)}
                  activeOpacity={0.7}
                  disabled={!hasEvents}
                >
                  <Text
                    style={[
                      styles.dayNumber,
                      isToday && styles.dayNumberToday,
                      isSelected && styles.dayNumberSelected,
                      !hasEvents && styles.dayNumberEmpty,
                    ]}
                  >
                    {day}
                  </Text>
                  {hasEvents && (
                    <View style={styles.eventDotsRow}>
                      {Array.from(eventTypes!).map(type => (
                        <View
                          key={type}
                          style={[
                            styles.eventDot,
                            { backgroundColor: EVENT_META[type].color },
                          ]}
                        />
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 选中日期的事件列表 */}
        <View style={styles.eventListSection}>
          <Text style={styles.eventListTitle}>
            {selectedDay === null
              ? '点击日期查看当日事件'
              : `${viewMonth} 月 ${selectedDay} 日 · ${selectedEvents.length} 个事件`}
          </Text>

          {selectedEvents.length === 0 ? (
            <View style={styles.eventEmptyBox}>
              <Text style={styles.eventEmptyText}>
                {selectedDay === null ? '📊 选择有事件标记的日期查看详情' : '当日无事件'}
              </Text>
            </View>
          ) : (
            <View style={styles.eventList}>
              {selectedEvents.map((event, idx) => {
                const meta = EVENT_META[event.type];
                return (
                  <TouchableOpacity
                    key={`${event.type}-${event.entityId}-${idx}`}
                    style={[
                      styles.eventRow,
                      { borderLeftColor: meta.color },
                    ]}
                    onPress={() => handlePressEvent(event)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.eventEmoji}>{meta.emoji}</Text>
                    <View style={styles.eventInfo}>
                      <Text style={styles.eventTitle} numberOfLines={1}>
                        {event.title}
                      </Text>
                      {event.subtitle ? (
                        <Text style={styles.eventSubtitle} numberOfLines={1}>
                          {event.subtitle}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.eventDistance}>
                      {describeDistance(dateStrForEvent(event, viewYear, viewMonth, selectedDay ?? 0))}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* 页脚提示：今日距离下一笔订阅续费 */}
        {nextSubscriptionRenewal && (
          <View style={styles.footerHintBox}>
            <Text style={styles.footerHintText}>
              🔁 下一笔订阅续费：{nextSubscriptionRenewal.sub.name}
              {' · '}
              {nextSubscriptionRenewal.date}
              {' · '}
              {describeDistance(nextSubscriptionRenewal.date)}
              {' · '}
              {formatCurrency(nextSubscriptionRenewal.sub.cycle_price)}
            </Text>
          </View>
        )}

        <Text style={styles.todayBadge}>今日 · {todayString}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/** 计算事件所属日期字符串（用于“距今天”描述）。 */
function dateStrForEvent(
  event: CalendarEvent,
  viewYear: number,
  viewMonth: number,
  selectedDay: number,
): string {
  if (event.date) return event.date;
  return `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
}

const createStyles = () => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: THEME.spacing.lg,
    paddingBottom: 40,
  },
  monthSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: THEME.spacing.md,
    marginBottom: THEME.spacing.xs,
  },
  monthNavButton: {
    width: 44,
    height: 44,
    borderRadius: THEME.borderRadius,
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    backgroundColor: THEME.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...THEME.pixelShadow,
  },
  monthNavIcon: {
    fontSize: 24,
    fontWeight: '900',
    color: THEME.colors.primary,
    lineHeight: 26,
  },
  monthNavButtonDisabled: {
    backgroundColor: THEME.colors.surfaceMuted,
    borderColor: THEME.colors.border,
  },
  monthNavIconDisabled: {
    color: THEME.colors.textLight,
  },
  monthLabelBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: THEME.spacing.xs,
  },
  monthLabelText: {
    fontSize: THEME.fontSize.lg,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  monthSubLabel: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  todayLink: {
    alignSelf: 'center',
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.xs,
    backgroundColor: THEME.colors.primaryLight + '30',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: THEME.colors.primary,
    marginBottom: THEME.spacing.md,
  },
  todayLinkText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '800',
    color: THEME.colors.primaryDark,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: THEME.spacing.sm,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: THEME.colors.surface,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 9,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  calendarCard: {
    backgroundColor: THEME.colors.surface,
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    borderRadius: THEME.borderRadius,
    padding: THEME.spacing.sm,
    ...THEME.pixelShadow,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekdayCell: {
    flex: 1,
    paddingVertical: THEME.spacing.xs,
    alignItems: 'center',
  },
  weekdayText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '900',
    color: THEME.colors.textSecondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    paddingVertical: 4,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
  },
  dayCellToday: {
    backgroundColor: THEME.colors.primaryLight + '25',
    borderWidth: 1.5,
    borderColor: THEME.colors.primary,
  },
  dayCellSelected: {
    backgroundColor: THEME.colors.primary,
  },
  dayNumber: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  dayNumberToday: {
    color: THEME.colors.primaryDark,
    fontWeight: '900',
  },
  dayNumberSelected: {
    color: THEME.colors.onPrimary,
    fontWeight: '900',
  },
  dayNumberEmpty: {
    color: THEME.colors.textLight,
  },
  eventDotsRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 2,
    height: 6,
    alignItems: 'center',
  },
  eventDot: {
    width: 5,
    height: 5,
    borderRadius: 1,
  },
  eventListSection: {
    marginTop: THEME.spacing.md,
  },
  eventListTitle: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
    marginBottom: THEME.spacing.sm,
  },
  eventEmptyBox: {
    padding: THEME.spacing.md,
    backgroundColor: THEME.colors.surfaceMuted,
    borderRadius: THEME.borderRadius,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    alignItems: 'center',
  },
  eventEmptyText: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textSecondary,
    fontWeight: '700',
  },
  eventList: {
    gap: THEME.spacing.xs,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.md,
    backgroundColor: THEME.colors.surface,
    borderRadius: 4,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    gap: THEME.spacing.sm,
    ...THEME.pixelShadow,
  },
  eventEmoji: {
    fontSize: 18,
  },
  eventInfo: {
    flex: 1,
    minWidth: 0,
  },
  eventTitle: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  eventSubtitle: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  eventDistance: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '800',
    color: THEME.colors.primaryDark,
    fontFamily: THEME.fontFamily.pixel,
  },
  footerHintBox: {
    marginTop: THEME.spacing.lg,
    padding: THEME.spacing.md,
    backgroundColor: THEME.colors.accentLight + '30',
    borderRadius: THEME.borderRadius,
    borderWidth: 1.5,
    borderColor: THEME.colors.accent,
  },
  footerHintText: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textPrimary,
    lineHeight: 18,
    fontWeight: '700',
  },
  todayBadge: {
    marginTop: THEME.spacing.md,
    textAlign: 'center',
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textLight,
    fontWeight: '700',
  },
});
