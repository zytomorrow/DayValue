/**
 * 计算使用天数
 * 公式：使用天数 = (endDate || 今天) - startDate + 1
 */
export function calculateDaysUsed(startDate: string, endDate: string | null): number {
  // 避免 new Date('YYYY-MM-DD') 按 UTC 解析导致的“日期偏移一天”
  const start = parseISODate(startDate);
  const end = endDate ? parseISODate(endDate) : new Date();

  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;

  return Math.max(diffDays, 1);
}

export interface ServiceProgress {
  /** 当前已激活天数 */
  activeDays: number;
  /** 预期使用天数（未设置时为 null） */
  expectedDays: number | null;
  /** 进度 0~1（未设置预期寿命时为 null） */
  progress: number | null;
  /** 是否已超出预期服役期 */
  overService: boolean;
}

/**
 * 计算资产的服役进度。
 * 进度 = 激活天数 / 预期使用天数，未设置预期寿命时返回 null（无法计算进度）。
 */
export function calculateServiceProgress(
  item: Pick<OneTimeItem, 'expected_life_days'>,
  activeDays: number,
): ServiceProgress {
  const expectedDays =
    typeof item.expected_life_days === 'number' && item.expected_life_days > 0
      ? item.expected_life_days
      : null;

  if (expectedDays === null) {
    return { activeDays, expectedDays: null, progress: null, overService: false };
  }

  const ratio = activeDays / expectedDays;
  return {
    activeDays,
    expectedDays,
    progress: Math.min(Math.max(ratio, 0), 1),
    overService: activeDays > expectedDays,
  };
}

/**
 * 计算资产当前的折旧现值（直线折旧到 0）。
 * - 已售出：返回卖出价（已实现的价值）
 * - 未设置预期寿命：返回买入价（视为未折旧）
 * - 已设置预期寿命：现值 = 买入价 × max(0, 1 - 激活天数/预期天数)
 */
export function calculateDepreciatedValue(
  item: Pick<
    OneTimeItem,
    'total_price' | 'salvage_value' | 'expected_life_days' | 'status' | 'archived_reason'
  >,
  activeDays: number,
): number {
  const archivedReason =
    item.archived_reason ?? (item.salvage_value > 0 ? 'sold' : 'paused');

  if (item.status === 'archived' && archivedReason === 'sold') {
    return item.salvage_value;
  }

  const expectedDays =
    typeof item.expected_life_days === 'number' && item.expected_life_days > 0
      ? item.expected_life_days
      : null;

  if (expectedDays === null) {
    return item.total_price;
  }

  const remaining = Math.max(0, 1 - activeDays / expectedDays);
  return Math.max(0, item.total_price * remaining);
}

// ===================== 保修状态 =====================

export type WarrantyStatus = 'none' | 'active' | 'expiring' | 'expired';

export interface WarrantyInfo {
  status: WarrantyStatus;
  /** 距保修到期剩余天数（已过期为负数；未设置保修为 null） */
  remainingDays: number | null;
  expiryDate: string | null;
}

/** 即将过期的提前预警天数。 */
export const WARRANTY_WARNING_DAYS = 30;

/**
 * 计算保修状态。
 * - 未设置保修期：status='none'
 * - 已过期：status='expired'
 * - 即将过期（剩余 ≤ 30 天）：status='expiring'
 * - 仍在保修期：status='active'
 */
export function calculateWarrantyInfo(
  item: Pick<OneTimeItem, 'warranty_expiry_date' | 'status'>,
): WarrantyInfo {
  const expiryDate = item.warranty_expiry_date ?? null;
  if (!expiryDate) {
    return { status: 'none', remainingDays: null, expiryDate: null };
  }

  // 已售出资产不再关注保修
  if (item.status === 'archived') {
    return { status: 'none', remainingDays: null, expiryDate: null };
  }

  const remainingDays = calculateDaysUntil(expiryDate);
  let status: WarrantyStatus;
  if (remainingDays < 0) {
    status = 'expired';
  } else if (remainingDays <= WARRANTY_WARNING_DAYS) {
    status = 'expiring';
  } else {
    status = 'active';
  }
  return { status, remainingDays, expiryDate };
}

/** 计算从今天到目标日期的剩余天数（目标已过为负数；同一天为 0）。 */
export function calculateDaysUntil(targetDate: string): number {
  const target = parseISODate(targetDate);
  const today = new Date();
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffMs = target.getTime() - now.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// ===================== 健康度评分 =====================

export type HealthGrade = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';

export interface AssetHealth {
  /** 0~100 综合评分 */
  score: number;
  grade: HealthGrade;
  /** 评分明细（用于调试/展示） */
  breakdown: {
    service: number;
    warranty: number;
    status: number;
  };
}

/**
 * 综合评估资产健康度（0-100）。
 * 维度权重：
 * - 服役进度 50%：未设置寿命默认满 80%；进度越接近 1.0 越低；超期则按回本进度加分
 * - 保修状态 30%：在保 100% / 即将过期 60% / 过期或无保修 30%
 * - 资产状态 20%：在用 100% / 停用 50% / 已售 100%（已变现）
 *
 * 注意：未设置预期寿命且无保修时返回 unknown。
 */
export function calculateAssetHealth(
  item: Pick<
    OneTimeItem,
    'expected_life_days' | 'warranty_expiry_date' | 'status' | 'archived_reason' | 'salvage_value'
  >,
  serviceProgress: ServiceProgress,
): AssetHealth {
  if (item.status === 'archived') {
    const archivedReason =
      item.archived_reason ?? ((item.salvage_value ?? 0) > 0 ? 'sold' : 'paused');
    // 已售出视为已变现，健康度视为满分；停用视为低分
    if (archivedReason === 'sold') {
      return { score: 100, grade: 'excellent', breakdown: { service: 50, warranty: 30, status: 20 } };
    }
    return { score: 35, grade: 'poor', breakdown: { service: 25, warranty: 0, status: 10 } };
  }

  // 服役进度分（50 分）
  let serviceScore: number;
  if (serviceProgress.expectedDays === null) {
    serviceScore = 40; // 未设置寿命：默认中等偏高
  } else if (serviceProgress.overService) {
    // 超期服役：按超期比例衰减，但保留一定基础分（已回本）
    const overRatio =
      serviceProgress.activeDays / Math.max(1, serviceProgress.expectedDays);
    serviceScore = Math.max(15, 50 - (overRatio - 1) * 30);
  } else {
    // 正常服役：进度越高分数越低（接近寿命终点）
    const progress = serviceProgress.progress ?? 0;
    serviceScore = 50 * (1 - progress * 0.7);
  }

  // 保修分（30 分）
  const warranty = calculateWarrantyInfo(item);
  let warrantyScore: number;
  if (warranty.status === 'none') {
    warrantyScore = 15; // 无保修记录
  } else if (warranty.status === 'active') {
    warrantyScore = 30;
  } else if (warranty.status === 'expiring') {
    warrantyScore = 18;
  } else {
    warrantyScore = 5; // 已过保
  }

  // 状态分（20 分）
  const statusScore = item.status === 'active' ? 20 : 10;

  const score = Math.round(serviceScore + warrantyScore + statusScore);
  let grade: HealthGrade;
  if (score >= 80) grade = 'excellent';
  else if (score >= 60) grade = 'good';
  else if (score >= 40) grade = 'fair';
  else grade = 'poor';

  // 未设置寿命且无保修时无法精确评估
  if (serviceProgress.expectedDays === null && warranty.status === 'none') {
    grade = 'unknown';
  }

  return {
    score,
    grade,
    breakdown: {
      service: Math.round(serviceScore),
      warranty: Math.round(warrantyScore),
      status: statusScore,
    },
  };
}

// ===================== 到期提醒 =====================

export interface ExpiryReminder {
  /** 保修即将到期的资产 */
  warrantyExpiring: OneTimeItem[];
  /** 服役寿命即将到期的资产 */
  serviceExpiring: OneTimeItem[];
  /** 已超出预期寿命仍在用的资产 */
  overService: OneTimeItem[];
  /** 订阅即将续费扣款 */
  subscriptionRenewing: Subscription[];
}

/**
 * 扫描资产列表，找出需要提醒的资产（保修/寿命即将到期或已超期）。
 */
export function collectExpiryReminders(items: OneTimeItem[]): ExpiryReminder {
  const warrantyExpiring: OneTimeItem[] = [];
  const serviceExpiring: OneTimeItem[] = [];
  const overService: OneTimeItem[] = [];

  for (const item of items) {
    if (item.status === 'archived') continue;

    // 保修提醒
    const warranty = calculateWarrantyInfo(item);
    if (warranty.status === 'expiring') {
      warrantyExpiring.push(item);
    }

    // 服役寿命提醒
    if (
      typeof item.expected_life_days === 'number' &&
      item.expected_life_days > 0
    ) {
      const activeDays = calculateOneTimeItemActiveDays(item);
      const progress = calculateServiceProgress(item, activeDays);
      if (progress.overService) {
        overService.push(item);
      } else {
        const remainingDays = item.expected_life_days - activeDays;
        if (remainingDays <= WARRANTY_WARNING_DAYS) {
          serviceExpiring.push(item);
        }
      }
    }
  }

  return {
    warrantyExpiring,
    serviceExpiring,
    overService,
    subscriptionRenewing: [],
  };
}

/**
 * 计算订阅的下次扣款日期。
 * 月付：start_date + N 个完整月 → 最近一次未来扣款日
 * 季付：每 3 个月
 * 年付：每 12 个月
 */
export function calculateSubscriptionNextRenewalDate(
  subscription: Pick<Subscription, 'start_date' | 'billing_cycle' | 'status'>,
): string | null {
  if (subscription.status !== 'active') return null;

  const startDate = parseISODate(subscription.start_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const stepMonths =
    subscription.billing_cycle === 'monthly'
      ? 1
      : subscription.billing_cycle === 'quarterly'
        ? 3
        : 12;

  // 从 start_date 开始按 stepMonths 步进，找到第一个 >= 今天的扣款日
  let cursor = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate(),
  );
  // 防止无限循环：最多遍历 1200 个月（100 年）
  let safetyCounter = 0;
  while (cursor < today && safetyCounter < 1200) {
    cursor = new Date(
      cursor.getFullYear(),
      cursor.getMonth() + stepMonths,
      cursor.getDate(),
    );
    safetyCounter += 1;
  }

  const y = cursor.getFullYear();
  const m = String(cursor.getMonth() + 1).padStart(2, '0');
  const d = String(cursor.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 收集订阅续费提醒：下次扣款日 ≤ 7 天内的活跃订阅。
 */
export const SUBSCRIPTION_RENEWAL_WARNING_DAYS = 7;

export function collectSubscriptionRenewalReminders(
  subscriptions: Subscription[],
): Subscription[] {
  const result: Subscription[] = [];
  for (const sub of subscriptions) {
    if (sub.status !== 'active') continue;
    const nextDate = calculateSubscriptionNextRenewalDate(sub);
    if (!nextDate) continue;
    const remaining = calculateDaysUntil(nextDate);
    if (remaining >= 0 && remaining <= SUBSCRIPTION_RENEWAL_WARNING_DAYS) {
      result.push(sub);
    }
  }
  return result;
}

/**
 * 计算分期物品的剩余待还本金（按月供 × 剩余期数估算）。
 * 用于净资产看板中扣减未结清的负债。
 */
export function calculateRemainingInstallmentDebt(
  item: Pick<
    OneTimeItem,
    'is_installment' | 'installment_months' | 'monthly_payment' | 'buy_date' | 'status'
  >,
): number {
  if (item.is_installment !== 1 || item.status !== 'unredeemed') return 0;
  const months = item.installment_months ?? 0;
  const monthly = item.monthly_payment ?? 0;
  if (months <= 0 || monthly <= 0) return 0;

  const monthsPaid = Math.min(
    Math.floor(calculateDaysUsed(item.buy_date, null) / 30),
    months,
  );
  return monthly * Math.max(0, months - monthsPaid);
}

export interface NetAssetValueBreakdown {
  /** 在用/停用资产的折旧现值合计（不含已售出） */
  assetValue: number;
  /** 沉睡卡包本金合计 */
  cardPrincipal: number;
  /** 未结清分期负债合计 */
  installmentDebt: number;
  /** 净资产 = 资产现值 + 卡包本金 - 分期负债 */
  netValue: number;
}

/**
 * 汇总个人净资产看板数据。
 */
export function calculateNetAssetValue(
  items: OneTimeItem[],
  storedCards: StoredCard[],
  storedPrincipalOf: (card: StoredCard) => number,
): NetAssetValueBreakdown {
  let assetValue = 0;
  let installmentDebt = 0;

  for (const item of items) {
    const archivedReason =
      item.archived_reason ?? (item.salvage_value > 0 ? 'sold' : 'paused');
    // 已售出资产已离手，不计入当前持有的净资产。
    if (item.status === 'archived' && archivedReason === 'sold') continue;

    const activeDays = calculateOneTimeItemActiveDays(item);
    assetValue += calculateDepreciatedValue(item, activeDays);
    installmentDebt += calculateRemainingInstallmentDebt(item);
  }

  const cardPrincipal = storedCards.reduce(
    (sum, card) => sum + storedPrincipalOf(card),
    0,
  );

  return {
    assetValue,
    cardPrincipal,
    installmentDebt,
    netValue: assetValue + cardPrincipal - installmentDebt,
  };
}

/**
 * 计算一次性物品的日均成本
 * 公式：日均成本 = (购买金额 - 卖出价) / 激活天数
 * 约定：未售出时卖出价 = 0
 */
export function calculateDailyCost(
  price: number,
  salvageValue: number,
  daysUsed: number,
): number {
  const effectiveCost = price - salvageValue;
  if (daysUsed <= 0) return effectiveCost;
  return effectiveCost / daysUsed;
}

/**
 * 计算已售出资产的已实现收益。
 * 返回值可以为正（盈利）、0（保本）或负（亏损）。
 */
export function calculateRealizedProfit(price: number, soldPrice: number): number {
  return soldPrice - price;
}

/** 判断卖出是否已经产生正收益。 */
export function isProfitableSale(price: number, soldPrice: number): boolean {
  return calculateRealizedProfit(price, soldPrice) > 0;
}

import type { BillingCycle, OneTimeItem, StoredCard, Subscription } from '../types';

/**
 * 计算一次性资产的“激活天数”（停用期间不增长）
 *
 * 约定：
 * - active_days：已累计激活天数（不含当前激活段）
 * - active_start_date：当前激活段起始日期（仅 active 时有效）
 */
export function calculateOneTimeItemActiveDays(
  item: Pick<OneTimeItem, 'status' | 'buy_date' | 'end_date' | 'active_days' | 'active_start_date'>,
): number {
  const baseDays = typeof item.active_days === 'number' ? item.active_days : 0;
  const startDate = item.active_start_date || item.buy_date;

  if (item.status === 'active') {
    return baseDays + calculateDaysUsed(startDate, null);
  }

  // archived：冻结激活天数；若历史数据未回填，则回退到旧口径
  if (baseDays > 0) return baseDays;
  if (item.end_date) return calculateDaysUsed(item.buy_date, item.end_date);
  return calculateDaysUsed(item.buy_date, null);
}

/**
 * 计算周期订阅的日均成本
 * monthly → cycle_price / 30
 * quarterly → cycle_price / 90
 * yearly  → cycle_price / 365
 */
export function calculateSubscriptionDailyCost(
  cyclePrice: number,
  billingCycle: BillingCycle,
): number {
  if (billingCycle === 'monthly') return cyclePrice / 30;
  if (billingCycle === 'quarterly') return cyclePrice / 90;
  return cyclePrice / 365;
}

/**
 * 计算分期物品的“每日债务”（每日消耗口径）
 * 公式：每日债务 = 月供 / 30
 */
export function calculateDailyDebt(monthlyPayment: number): number {
  return monthlyPayment / 30;
}

/**
 * 计算沉睡卡包的实际沉睡本金
 * 公式：实际沉睡本金 = (实际支付 / 总面值) × 当前剩余
 */
export function calculateStoredPrincipal(
  actualPaid: number,
  faceValue: number,
  currentBalance: number,
): number {
  if (faceValue <= 0) return 0;
  return (actualPaid / faceValue) * currentBalance;
}

function parseISODate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

/**
 * 计算距上次更新已过去的自然日
 * 同一天返回 0，昨天返回 1
 */
export function calculateDaysSince(dateString: string): number {
  const start = parseISODate(dateString);
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(diffDays, 0);
}

// ===================== 月度支出趋势 =====================

export interface MonthlySpendingBreakdown {
  /** YYYY-MM 月份键 */
  monthKey: string;
  /** 显示标签，例如 "2026-07" */
  label: string;
  /** 当月资产购置支出（非分期：全额；分期：首付） */
  purchases: number;
  /** 当月分期月供（处于分期还款期内的物品） */
  installments: number;
  /** 当月订阅续费支出 */
  subscriptions: number;
  /** 当月维修保养支出 */
  maintenance: number;
  /** 当月总支出 */
  total: number;
}

/**
 * 计算指定月份内的分期月供支出。
 * 给定物品的 buy_date、installment_months、monthly_payment，
 * 若该月落在 [buyMonth, buyMonth + months - 1] 区间内，则计入月供。
 */
function isMonthWithinInstallment(
  buyDateStr: string,
  months: number,
  year: number,
  month: number,
): boolean {
  const buyDate = parseISODate(buyDateStr);
  const buyMonthIndex = buyDate.getFullYear() * 12 + buyDate.getMonth();
  const targetMonthIndex = year * 12 + (month - 1);
  return (
    targetMonthIndex >= buyMonthIndex &&
    targetMonthIndex < buyMonthIndex + months
  );
}

/**
 * 计算订阅在指定月份内是否产生扣款。
 */
function isSubscriptionBilledInMonth(
  sub: Pick<Subscription, 'start_date' | 'billing_cycle' | 'status'>,
  year: number,
  month: number,
): boolean {
  if (sub.status !== 'active') return false;
  const startDate = parseISODate(sub.start_date);
  const startMonthIndex = startDate.getFullYear() * 12 + startDate.getMonth();
  const targetMonthIndex = year * 12 + (month - 1);
  if (targetMonthIndex < startMonthIndex) return false;

  const stepMonths =
    sub.billing_cycle === 'monthly' ? 1 : sub.billing_cycle === 'quarterly' ? 3 : 12;
  return (targetMonthIndex - startMonthIndex) % stepMonths === 0;
}

/**
 * 汇总最近 N 个月的支出趋势（包含本月）。
 *
 * 支出构成：
 * - purchases：当月新购入资产（非分期=全额，分期=首付）
 * - installments：当月仍在分期还款期内的月供
 * - subscriptions：当月产生扣款的订阅金额
 * - maintenance：当月发生的维修保养成本
 */
export function calculateMonthlySpendingTrend(
  items: OneTimeItem[],
  subscriptions: Subscription[],
  maintenanceLogs: Array<{ log_date: string; cost: number }>,
  monthsBack: number = 6,
): MonthlySpendingBreakdown[] {
  const today = new Date();
  const currentMonthIndex = today.getFullYear() * 12 + today.getMonth();

  const result: MonthlySpendingBreakdown[] = [];
  for (let offset = monthsBack - 1; offset >= 0; offset -= 1) {
    const monthIndex = currentMonthIndex - offset;
    const year = Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;

    let purchases = 0;
    let installments = 0;
    let subscriptionsCost = 0;
    let maintenance = 0;

    for (const item of items) {
      const buyDate = parseISODate(item.buy_date);
      // 当月购买的资产
      if (
        buyDate.getFullYear() === year &&
        buyDate.getMonth() + 1 === month
      ) {
        if (item.is_installment === 1) {
          purchases += item.down_payment ?? 0;
        } else {
          purchases += item.total_price;
        }
      }

      // 当月分期月供
      if (
        item.is_installment === 1 &&
        (item.installment_months ?? 0) > 0 &&
        (item.monthly_payment ?? 0) > 0 &&
        isMonthWithinInstallment(
          item.buy_date,
          item.installment_months ?? 0,
          year,
          month,
        )
      ) {
        installments += item.monthly_payment ?? 0;
      }
    }

    for (const sub of subscriptions) {
      if (isSubscriptionBilledInMonth(sub, year, month)) {
        subscriptionsCost += sub.cycle_price;
      }
    }

    for (const log of maintenanceLogs) {
      const logDate = parseISODate(log.log_date);
      if (
        logDate.getFullYear() === year &&
        logDate.getMonth() + 1 === month
      ) {
        maintenance += log.cost;
      }
    }

    result.push({
      monthKey,
      label: monthKey,
      purchases,
      installments,
      subscriptions: subscriptionsCost,
      maintenance,
      total: purchases + installments + subscriptionsCost + maintenance,
    });
  }

  return result;
}

/**
 * 计算分期的额外溢价（相比全款多花的饱额）
 * 公式：溢价 = 首付 + 月供 × 期数 - 总价
 */
export function calculateInstallmentPremium(
  totalPrice: number,
  downPayment: number,
  monthlyPayment: number,
  months: number,
): number {
  return Math.max(0, downPayment + monthlyPayment * months - totalPrice);
}

/**
 * 使用牵顿迭代法计算分期的真实年化利率 (IRR)
 * 返回百分比数字（如 18.5 代表 18.5%）
 * 若无溢价（免息分期）返回 0
 */
export function calculateIRR(
  totalPrice: number,
  downPayment: number,
  monthlyPayment: number,
  months: number,
): number {
  const principal = totalPrice - downPayment;
  if (principal <= 0 || monthlyPayment <= 0 || months <= 0) return 0;

  // 检查是否真实有溢价
  const premium = calculateInstallmentPremium(totalPrice, downPayment, monthlyPayment, months);
  if (premium <= 0) return 0;

  // 牵顿迭代法求月利率 r
  // f(r)  = principal * r / (1 - (1+r)^(-n)) - monthlyPayment
  // f'(r) = 导数（用商算近似）
  let r = 0.01; // 初始猜测：1% 月利
  for (let i = 0; i < 200; i++) {
    const pow = Math.pow(1 + r, months);
    const denominator = pow - 1;
    if (Math.abs(denominator) < 1e-12) break;

    // 实际计算公式： PMT = P * r * (1+r)^n / ((1+r)^n - 1)
    const f = (principal * r * pow) / denominator - monthlyPayment;
    // 导数近似
    const fprime =
      (principal * pow * (denominator - months * r)) / (denominator * denominator) +
      (principal * r * months * pow) / (denominator * (1 + r));

    if (Math.abs(fprime) < 1e-12) break;
    const rNext = r - f / fprime;
    if (Math.abs(rNext - r) < 1e-9) {
      r = rNext;
      break;
    }
    r = Math.max(rNext, 0.0001); // 防止负利率
  }

  // 月利转年化利率
  const annualRate = (Math.pow(1 + r, 12) - 1) * 100;
  return Math.round(annualRate * 100) / 100;
}
