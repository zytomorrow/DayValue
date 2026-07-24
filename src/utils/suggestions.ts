/**
 * 智能建议流 —— 基于规则引擎生成个性化建议。
 *
 * 规则覆盖：分期提前结清、沉睡卡包消费、订阅省钱对比、保修即将到期、
 * 超期服役资产、健康度堪忧、维修黑洞、保养计划到期。
 *
 * 返回最多 10 条建议，按优先级 high > medium > low 排序。
 */
import type { OneTimeItem, Subscription, StoredCard, MaintenanceLog, MaintenancePlan } from '../types';
import {
  calculateIRR,
  calculateDailyCost,
  calculateOneTimeItemActiveDays,
  calculateStoredPrincipal,
  calculateDaysSince,
  calculateWarrantyInfo,
  calculateSubscriptionDailyCost,
  calculateSubscriptionNextRenewalDate,
  calculateServiceProgress,
  calculateAssetHealth,
  calculateDepreciatedValue,
  calculateRemainingInstallmentDebt,
} from './calculations';

export type SuggestionPriority = 'high' | 'medium' | 'low';
export type SuggestionCategory =
  | 'debt'
  | 'subscription'
  | 'stored_card'
  | 'warranty'
  | 'maintenance'
  | 'depreciation'
  | 'health';

export interface Suggestion {
  id: string;
  title: string;
  description: string;
  priority: SuggestionPriority;
  category: SuggestionCategory;
  emoji: string;
  /** 建议的金额影响（正数=可省/可赚，负数=潜在损失，null=不适用） */
  impact?: number | null;
  /** 关联实体 ID（用于点击跳转） */
  entityId?: number;
  entityType?: 'item' | 'subscription' | 'stored_card';
}

/** IRR 阈值：高于此值建议提前结清分期。 */
const IRR_EARLY_REDEEM_THRESHOLD = 15;

/** 保养计划提前预警窗口（天）。 */
const MAINTENANCE_PLAN_WARNING_DAYS = 7;

/** 建议最大条数。 */
const MAX_SUGGESTIONS = 10;

const PRIORITY_RANK: Record<SuggestionPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function generateSuggestions(params: {
  items: OneTimeItem[];
  subscriptions: Subscription[];
  storedCards: StoredCard[];
  maintenanceLogs: MaintenanceLog[];
  maintenancePlans: MaintenancePlan[];
}): Suggestion[] {
  const { items, subscriptions, storedCards, maintenanceLogs, maintenancePlans } = params;
  const suggestions: Suggestion[] = [];

  // 1. 分期提前结清建议
  for (const item of items) {
    if (item.status !== 'unredeemed') continue;
    if (item.is_installment !== 1) continue;
    const months = item.installment_months ?? 0;
    const monthly = item.monthly_payment ?? 0;
    if (months <= 0 || monthly <= 0) continue;

    const irr = calculateIRR(item.total_price, item.down_payment, monthly, months);
    if (irr <= IRR_EARLY_REDEEM_THRESHOLD) continue;

    const remainingDebt = calculateRemainingInstallmentDebt(item);
    if (remainingDebt <= 0) continue;

    // 利息部分 ≈ 剩余债务 × (总溢价 / 总分期支出)
    const totalInstallmentPayment = monthly * months;
    const totalPremium = Math.max(
      0,
      item.down_payment + monthly * months - item.total_price,
    );
    const interestRatio = totalInstallmentPayment > 0 ? totalPremium / totalInstallmentPayment : 0;
    const interestPortion = remainingDebt * interestRatio;

    suggestions.push({
      id: `early-redeem-${item.id}`,
      title: '考虑提前结清分期',
      description: `「${item.name}」真实年化 ${irr.toFixed(1)}%，结清可省下剩余利息。`,
      priority: 'high',
      category: 'debt',
      emoji: '💸',
      impact: Math.max(interestPortion, 0),
      entityId: item.id,
      entityType: 'item',
    });
  }

  // 2. 沉睡卡包消费建议
  for (const card of storedCards) {
    if (card.status !== 'active') continue;
    const dormantDays = calculateDaysSince(card.last_updated_date);
    if (dormantDays <= card.reminder_days) continue;

    const principal = calculateStoredPrincipal(
      card.actual_paid,
      card.face_value,
      card.current_balance,
    );
    if (principal <= 0) continue;

    suggestions.push({
      id: `dormant-card-${card.id}`,
      title: '沉睡卡包尽快消费',
      description: `「${card.name}」已沉睡 ${dormantDays} 天，剩余本金闲置中。`,
      priority: 'medium',
      category: 'stored_card',
      emoji: '💤',
      impact: principal,
      entityId: card.id,
      entityType: 'stored_card',
    });
  }

  // 3. 订阅省钱对比（月付 → 年付）
  for (const sub of subscriptions) {
    if (sub.status !== 'active') continue;
    if (sub.billing_cycle !== 'monthly') continue;
    if (sub.cycle_price <= 0) continue;

    // 年付通常省 2 个月
    const savings = sub.cycle_price * 2;
    if (savings <= 0) continue;

    suggestions.push({
      id: `sub-yearly-${sub.id}`,
      title: '订阅换年付可省钱',
      description: `「${sub.name}」改年付预计可省 2 个月费用。`,
      priority: 'low',
      category: 'subscription',
      emoji: '🔁',
      impact: savings,
      entityId: sub.id,
      entityType: 'subscription',
    });
  }

  // 4. 保修即将到期
  for (const item of items) {
    if (item.status === 'archived') continue;
    const warranty = calculateWarrantyInfo(item);
    if (warranty.status !== 'expiring') continue;

    suggestions.push({
      id: `warranty-expiring-${item.id}`,
      title: '保修即将到期',
      description: `「${item.name}」剩 ${warranty.remainingDays ?? 0} 天保修，建议提前送检。`,
      priority: 'medium',
      category: 'warranty',
      emoji: '🔧',
      impact: null,
      entityId: item.id,
      entityType: 'item',
    });
  }

  // 5. 超期服役资产
  for (const item of items) {
    if (item.status !== 'active') continue;
    if (typeof item.expected_life_days !== 'number' || item.expected_life_days <= 0) continue;
    const activeDays = calculateOneTimeItemActiveDays(item);
    const progress = calculateServiceProgress(item, activeDays);
    if (!progress.overService) continue;

    suggestions.push({
      id: `over-service-${item.id}`,
      title: '资产已超期服役',
      description: `「${item.name}」已超预期寿命 ${activeDays - (item.expected_life_days ?? 0)} 天，可考虑更换。`,
      priority: 'low',
      category: 'depreciation',
      emoji: '⏳',
      impact: null,
      entityId: item.id,
      entityType: 'item',
    });
  }

  // 6. 健康度堪忧
  for (const item of items) {
    if (item.status !== 'active') continue;
    const activeDays = calculateOneTimeItemActiveDays(item);
    const progress = calculateServiceProgress(item, activeDays);
    const health = calculateAssetHealth(item, progress);
    if (health.grade !== 'poor') continue;

    suggestions.push({
      id: `health-poor-${item.id}`,
      title: '资产健康度堪忧',
      description: `「${item.name}」健康度评分 ${health.score}，建议保养或更换。`,
      priority: 'medium',
      category: 'health',
      emoji: '🩺',
      impact: null,
      entityId: item.id,
      entityType: 'item',
    });
  }

  // 7. 维修黑洞：维修总成本 > 折旧损失
  const maintenanceCostByItem = new Map<number, number>();
  for (const log of maintenanceLogs) {
    maintenanceCostByItem.set(
      log.item_id,
      (maintenanceCostByItem.get(log.item_id) ?? 0) + log.cost,
    );
  }
  for (const item of items) {
    if (item.status === 'archived') continue;
    const totalMaintenance = maintenanceCostByItem.get(item.id) ?? 0;
    if (totalMaintenance <= 0) continue;

    const activeDays = calculateOneTimeItemActiveDays(item);
    const depreciatedValue = calculateDepreciatedValue(item, activeDays);
    const depreciationLoss = Math.max(0, item.total_price - depreciatedValue);

    if (totalMaintenance <= depreciationLoss) continue;

    suggestions.push({
      id: `maintenance-hole-${item.id}`,
      title: '维修黑洞：建议更换',
      description: `「${item.name}」累计维修 ${totalMaintenance.toFixed(0)} 已超过折旧损失 ${depreciationLoss.toFixed(0)}。`,
      priority: 'high',
      category: 'maintenance',
      emoji: '🛠️',
      impact: -(totalMaintenance - depreciationLoss),
      entityId: item.id,
      entityType: 'item',
    });
  }

  // 8. 保养计划到期（next_due_date <= 今天 + 7）
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizonMs = MAINTENANCE_PLAN_WARNING_DAYS * 24 * 60 * 60 * 1000;
  for (const plan of maintenancePlans) {
    if (plan.enabled !== 1) continue;
    if (!plan.next_due_date) continue;
    const dueDate = parseISODate(plan.next_due_date);
    if (dueDate.getTime() > today.getTime() + horizonMs) continue;

    suggestions.push({
      id: `maint-plan-due-${plan.id}`,
      title: '保养计划即将到期',
      description: `「${plan.title}」下次保养日 ${plan.next_due_date}，建议尽快执行。`,
      priority: 'medium',
      category: 'maintenance',
      emoji: '🛠️',
      impact: null,
      entityId: plan.item_id,
      entityType: 'item',
    });
  }

  // 按优先级排序，限制最多 MAX_SUGGESTIONS 条
  suggestions.sort((a, b) => {
    const rankDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (rankDiff !== 0) return rankDiff;
    // 同优先级：影响金额大的靠前
    const aImpact = a.impact ?? 0;
    const bImpact = b.impact ?? 0;
    return bImpact - aImpact;
  });

  return suggestions.slice(0, MAX_SUGGESTIONS);
}

/** 解析 YYYY-MM-DD 为本地日期，避免 UTC 偏移。 */
function parseISODate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}
