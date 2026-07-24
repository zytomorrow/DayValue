/**
 * ShareCard - 像素风分享卡片
 * 用于生成可分享的图片：总览 / 买断资产 / 订阅 三种变体。
 * 固定宽度，独立排版，保证截图稳定且美观。
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { THEME } from '../utils/constants';
import { formatCurrency, formatDate, getTodayString } from '../utils/formatters';

export type ShareCardData =
  | {
      kind: 'summary';
      assetDailyCost: number;
      assetCount: number;
      realizedProfit: number;
      subscriptionDailyCost: number;
      installmentDailyDebt: number;
      storedPrincipal: number;
      storedCardCount: number;
    }
  | {
      kind: 'item';
      name: string;
      categoryIcon: string;
      categoryName: string;
      dailyCost: number;
      totalPrice: number;
      buyDate: string;
      activeDays: number;
      realizedProfit: number | null;
      statusLabel: string;
    }
  | {
      kind: 'subscription';
      name: string;
      categoryIcon: string;
      categoryName: string;
      dailyCost: number;
      cyclePrice: number;
      cycleLabel: string;
      startDate: string;
    };

const CARD_WIDTH = 320;

export function ShareCard({ data }: { data: ShareCardData }) {
  return (
    <View style={styles.card}>
      <View style={styles.headerBar}>
        <Text style={styles.brand}>DayValue</Text>
        <Text style={styles.tagline}>让每一分钱都看得见</Text>
      </View>

      <View style={styles.body}>
        {data.kind === 'summary' ? (
          <SummaryBody data={data} />
        ) : (
          <SingleBody data={data} />
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>{formatDate(getTodayString())}</Text>
        <Text style={styles.footerBrand}>DayValue</Text>
      </View>
    </View>
  );
}

function SummaryBody({ data }: { data: Extract<ShareCardData, { kind: 'summary' }> }) {
  return (
    <>
      <View style={styles.heroBlock}>
        <Text style={styles.heroLabel}>今日日均成本</Text>
        <Text style={styles.heroValue}>{formatCurrency(data.assetDailyCost)}</Text>
        <Text style={styles.heroUnit}>/ 天</Text>
      </View>

      <View style={styles.statsGrid}>
        <StatCell
          label="在用资产"
          value={`${data.assetCount} 件`}
          accent={THEME.colors.primaryDark}
        />
        <StatCell
          label="累计已盈利"
          value={formatCurrency(data.realizedProfit)}
          accent={THEME.colors.success}
        />
        <StatCell
          label="订阅日均"
          value={formatCurrency(data.subscriptionDailyCost)}
          accent={THEME.colors.accent}
        />
        <StatCell
          label="分期日供"
          value={formatCurrency(data.installmentDailyDebt)}
          accent={THEME.colors.dangerDark}
        />
        <StatCell
          label="沉睡本金"
          value={formatCurrency(data.storedPrincipal)}
          accent={THEME.colors.warning}
        />
        <StatCell
          label="在用卡包"
          value={`${data.storedCardCount} 张`}
          accent={THEME.colors.textPrimary}
        />
      </View>
    </>
  );
}

function SingleBody({
  data,
}: {
  data: Extract<ShareCardData, { kind: 'item' }> | Extract<ShareCardData, { kind: 'subscription' }>;
}) {
  const heroLabel = data.kind === 'item' ? '日均成本' : '日均成本';
  return (
    <>
      <View style={styles.singleHeader}>
        <View style={styles.singleIconWrap}>
          <Text style={styles.singleIcon}>{data.categoryIcon}</Text>
        </View>
        <View style={styles.singleMeta}>
          <Text style={styles.singleName} numberOfLines={2}>
            {data.name}
          </Text>
          <Text style={styles.singleCategory} numberOfLines={1}>
            {data.categoryName}
            {data.kind === 'item' ? ` · ${data.statusLabel}` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.heroBlock}>
        <Text style={styles.heroLabel}>{heroLabel}</Text>
        <Text style={styles.heroValue}>{formatCurrency(data.dailyCost)}</Text>
        <Text style={styles.heroUnit}>/ 天</Text>
      </View>

      <View style={styles.statsGrid}>
        {data.kind === 'item' ? (
          <>
            <StatCell
              label="总金额"
              value={formatCurrency(data.totalPrice)}
              accent={THEME.colors.primaryDark}
            />
            <StatCell
              label="已用天数"
              value={`${data.activeDays} 天`}
              accent={THEME.colors.accent}
            />
            <StatCell
              label="购买日期"
              value={formatDate(data.buyDate)}
              accent={THEME.colors.textPrimary}
              small
            />
            {data.realizedProfit !== null && (
              <StatCell
                label="已盈利"
                value={formatCurrency(data.realizedProfit)}
                accent={THEME.colors.success}
              />
            )}
          </>
        ) : (
          <>
            <StatCell
              label={data.cycleLabel}
              value={formatCurrency(data.cyclePrice)}
              accent={THEME.colors.primaryDark}
            />
            <StatCell
              label="开始日期"
              value={formatDate(data.startDate)}
              accent={THEME.colors.textPrimary}
              small
            />
          </>
        )}
      </View>
    </>
  );
}

function StatCell({
  label,
  value,
  accent,
  small,
}: {
  label: string;
  value: string;
  accent: string;
  small?: boolean;
}) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.statValue, small && styles.statValueSmall, { color: accent }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: THEME.colors.surface,
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    borderRadius: THEME.borderRadius,
    overflow: 'hidden',
  },
  headerBar: {
    backgroundColor: THEME.colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 2,
    borderBottomColor: THEME.colors.borderDark,
  },
  brand: {
    fontFamily: THEME.fontFamily.pixel,
    fontSize: 11,
    color: THEME.colors.surface,
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.primaryLight,
  },
  body: {
    padding: 16,
    gap: 14,
    backgroundColor: THEME.colors.background,
  },
  heroBlock: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  heroLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    marginBottom: 6,
  },
  heroValue: {
    fontFamily: THEME.fontFamily.pixel,
    fontSize: 22,
    color: THEME.colors.primaryDark,
    letterSpacing: 1,
  },
  heroUnit: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statCell: {
    flexGrow: 1,
    minWidth: '46%',
    backgroundColor: THEME.colors.surface,
    borderWidth: 1.5,
    borderColor: THEME.colors.borderDark,
    borderRadius: THEME.borderRadius,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '900',
  },
  statValueSmall: {
    fontSize: 12,
  },
  singleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  singleIconWrap: {
    width: 44,
    height: 44,
    borderRadius: THEME.borderRadius,
    borderWidth: 1.5,
    borderColor: THEME.colors.borderDark,
    backgroundColor: THEME.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  singleIcon: {
    fontSize: 22,
  },
  singleMeta: {
    flex: 1,
    minWidth: 0,
  },
  singleName: {
    fontSize: 16,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  singleCategory: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: THEME.colors.surface,
    borderTopWidth: 1.5,
    borderColor: THEME.colors.border,
  },
  footerText: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  footerBrand: {
    fontFamily: THEME.fontFamily.pixel,
    fontSize: 9,
    color: THEME.colors.primaryDark,
    letterSpacing: 1,
  },
});
