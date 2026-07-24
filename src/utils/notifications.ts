/**
 * 本地推送通知工具
 *
 * 基于 expo-notifications 调度本地通知，用于在到期前主动提醒用户：
 *  - 保修即将到期
 *  - 订阅即将续费
 *  - 储值卡长期未使用（沉睡）
 *  - 保养计划即将到期
 *
 * 注意：expo-notifications 是原生模块，若运行在未链接该模块的构建中，
 * 顶层 import 会在应用启动时抛错导致闪退。因此这里采用延迟 require +
 * try/catch，缺失原生模块时所有通知 API 安全降级为空操作。
 */
import { Platform } from 'react-native';
import type { PermissionResponse } from 'expo-modules-core';
import type { OneTimeItem, Subscription, StoredCard, MaintenancePlan } from '../types';
import {
  calculateWarrantyInfo,
  calculateSubscriptionNextRenewalDate,
  calculateDaysSince,
  calculateDaysUntil,
} from './calculations';

/** 通知偏好 key（与 AppPreferences 配合） */
export const NOTIFICATION_ENABLED_KEY = 'notification_enabled';

/** Android 通知渠道 id，所有到期提醒统一走该渠道。 */
const REMINDERS_CHANNEL_ID = 'reminders';

/** 单次调度通知的上限，避免超出系统调度配额。 */
const MAX_SCHEDULED_NOTIFICATIONS = 30;

/** 默认提醒触发时刻（本地 09:00），避免深夜打扰。 */
const TRIGGER_HOUR = 9;

/** expo-notifications 原生模块类型（仅用于类型推导） */
type NotificationsModule = typeof import('expo-notifications');

let notificationsModule: NotificationsModule | null | undefined;

/**
 * 延迟加载 expo-notifications 模块。
 * 原生模块缺失时返回 null，调用方需做 null 守卫。
 */
function getNotifications(): NotificationsModule | null {
  if (notificationsModule !== undefined) {
    return notificationsModule;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    notificationsModule = require('expo-notifications');
  } catch {
    notificationsModule = null;
  }
  return notificationsModule ?? null;
}

/**
 * 配置通知处理器（在 App.tsx 顶层调用一次）。
 * 决定应用在前台时收到通知的展示行为。
 * 原生模块不可用时安全跳过。
 */
export function configureNotifications(): void {
  const Notifications = getNotifications();
  if (!Notifications) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // 配置失败不阻塞应用。
  }
}

/**
 * 请求通知权限，返回是否授权。
 * Android 上会先创建「到期提醒」渠道（HIGH 重要性）。
 */
export async function requestNotificationPermissionsAsync(): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) return false;

  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync(REMINDERS_CHANNEL_ID, {
        name: '到期提醒',
        importance: Notifications.AndroidImportance.HIGH,
      });
    } catch {
      // 渠道创建失败不阻塞权限请求。
    }
  }

  try {
    const settings = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    // expo-notifications 的 NotificationPermissionsStatus 在当前版本未正确继承
    // expo-modules-core 的 PermissionResponse（status/granted 在类型上不可见），
    // 运行时实际存在，这里用结构化类型读取 granted。
    return Boolean((settings as PermissionResponse).granted);
  } catch {
    return false;
  }
}

/**
 * 调度未来到期提醒通知（保修到期、订阅续费、沉睡卡、保养计划）。
 * 调用前会先清空所有已调度通知，保证幂等。
 */
export async function scheduleReminderNotificationsAsync(params: {
  items: OneTimeItem[];
  subscriptions: Subscription[];
  storedCards: StoredCard[];
  maintenancePlans: MaintenancePlan[];
  /** 提前提醒天数：仅调度到期日落在 [0, advanceDays] 区间内的项。 */
  advanceDays: number;
}): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;

  await cancelAllScheduledNotificationsAsync();

  const { items, subscriptions, storedCards, maintenancePlans, advanceDays } = params;
  const candidates: Array<{ title: string; body: string; triggerDate: Date }> = [];

  // 1. 保修到期提醒
  for (const item of items) {
    if (item.status === 'archived') continue;
    const warranty = calculateWarrantyInfo(item);
    if (!warranty.expiryDate) continue;
    const remaining = warranty.remainingDays;
    if (remaining == null || remaining < 0 || remaining > advanceDays) continue;
    candidates.push({
      title: '保修即将到期',
      body: `「${item.name}」的保修将于 ${warranty.expiryDate} 到期（剩余 ${remaining} 天）`,
      triggerDate: buildTriggerDate(warranty.expiryDate),
    });
  }

  // 2. 订阅续费提醒
  for (const sub of subscriptions) {
    if (sub.status !== 'active') continue;
    const nextDate = calculateSubscriptionNextRenewalDate(sub);
    if (!nextDate) continue;
    const remaining = calculateDaysUntil(nextDate);
    if (remaining < 0 || remaining > advanceDays) continue;
    candidates.push({
      title: '订阅即将续费',
      body: `「${sub.name}」将于 ${nextDate} 扣款 ¥${sub.cycle_price}`,
      triggerDate: buildTriggerDate(nextDate),
    });
  }

  // 3. 沉睡卡提醒：距上次更新超过 reminder_days 的卡
  for (const card of storedCards) {
    if (card.status !== 'active') continue;
    const daysSince = calculateDaysSince(card.last_updated_date);
    if (daysSince <= card.reminder_days) continue;
    candidates.push({
      title: '储值卡长期未使用',
      body: `「${card.name}」已 ${daysSince} 天未使用，余额 ¥${card.current_balance}`,
      triggerDate: buildNearFutureDate(),
    });
  }

  // 4. 保养计划到期提醒
  for (const plan of maintenancePlans) {
    if (!plan.next_due_date) continue;
    const remaining = calculateDaysUntil(plan.next_due_date);
    if (remaining < 0 || remaining > advanceDays) continue;
    candidates.push({
      title: '保养计划到期',
      body: `「${plan.title}」计划到期日为 ${plan.next_due_date}`,
      triggerDate: buildTriggerDate(plan.next_due_date),
    });
  }

  const limited = candidates.slice(0, MAX_SCHEDULED_NOTIFICATIONS);
  for (const candidate of limited) {
    await scheduleOne(candidate.title, candidate.body, candidate.triggerDate);
  }
}

/** 取消所有已调度的提醒通知。 */
export async function cancelAllScheduledNotificationsAsync(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // 忽略
  }
}

/** 获取已调度通知数量。 */
export async function getScheduledNotificationCountAsync(): Promise<number> {
  const Notifications = getNotifications();
  if (!Notifications) return 0;
  try {
    const list = await Notifications.getAllScheduledNotificationsAsync();
    return list.length;
  } catch {
    return 0;
  }
}

/**
 * 将 YYYY-MM-DD 转为「当天 09:00」的 Date。
 * 若该时刻已过，则顺延到次日同一时刻，确保通知可触发。
 */
function buildTriggerDate(dateString: string): Date {
  const [y, m, d] = dateString.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1, TRIGGER_HOUR, 0, 0, 0);
  if (date.getTime() <= Date.now()) {
    date.setDate(date.getDate() + 1);
  }
  return date;
}

/** 构造一个最近的未来触发时刻（次日 09:00），用于无具体到期日的提醒。 */
function buildNearFutureDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(TRIGGER_HOUR, 0, 0, 0);
  return date;
}

/** 调度单条本地通知。 */
async function scheduleOne(
  title: string,
  body: string,
  triggerDate: Date,
): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId: REMINDERS_CHANNEL_ID,
      },
    });
  } catch {
    // 单条调度失败不影响其他通知。
  }
}
