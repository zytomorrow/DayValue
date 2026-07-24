/**
 * ShareCard - 像素风分享卡片
 * 用于生成可分享的图片：总览 / 买断资产 / 订阅 三种变体。
 * 固定宽度，独立排版，保证截图稳定且美观。
 */
import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { THEME } from '../utils/constants';
import { useTheme } from '../contexts/ThemeContext';
import { formatCurrency, formatDate, getTodayString } from '../utils/formatters';

export type ShareItemEntry = {
  name: string;
  icon: string;
  imageUri?: string | null;
  dailyCost: number;
  extra: string;
};

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
      topAssets: ShareItemEntry[];
      topSubscriptions: ShareItemEntry[];
      topStoredCards: ShareItemEntry[];
    }
  | {
      kind: 'annual';
      year: number;
      purchasedCount: number;
      purchasedTotal: number;
      soldCount: number;
      soldProfit: number;
      soldRevenue: number;
      subscriptionTotal: number;
      maintenanceTotal: number;
      dormantPrincipal: number;
      dormantCount: number;
      netWorthDelta: number | null;
      netWorthFirst: number | null;
      netWorthLast: number | null;
      bestAssetName: string | null;
      bestAssetScore: number | null;
    }
  | {
      kind: 'item';
      name: string;
      categoryIcon: string;
      imageUri?: string | null;
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
      imageUri?: string | null;
      categoryName: string;
      dailyCost: number;
      cyclePrice: number;
      cycleLabel: string;
      startDate: string;
    };

const CARD_WIDTH = 320;

export function ShareCard({ data }: { data: ShareCardData }) {
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);
  return (
    <View style={styles.card}>
      <View style={styles.headerBar}>
        <Text style={styles.brand}>DayValue</Text>
        <Text style={styles.tagline}>让每一分钱都看得见</Text>
      </View>

      <View style={styles.body}>
        {data.kind === 'summary' ? (
          <SummaryBody data={data} />
        ) : data.kind === 'annual' ? (
          <AnnualBody data={data} />
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
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);
  return (
    <>
      <View style={styles.heroBlock}>
        <Text style={styles.heroLabel}>今日日均成本</Text>
        <Text style={styles.heroValue}>{formatCurrency(data.assetDailyCost)}</Text>
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

      {data.topAssets.length > 0 && (
        <EntryList
          title="日均成本 Top 资产"
          accent={THEME.colors.primary}
          entries={data.topAssets}
        />
      )}
      {data.topSubscriptions.length > 0 && (
        <EntryList
          title="订阅明细"
          accent={THEME.colors.accent}
          entries={data.topSubscriptions}
        />
      )}
      {data.topStoredCards.length > 0 && (
        <EntryList
          title="沉睡卡包"
          accent={THEME.colors.warning}
          entries={data.topStoredCards}
        />
      )}
    </>
  );
}

function EntryList({
  title,
  accent,
  entries,
}: {
  title: string;
  accent: string;
  entries: ShareItemEntry[];
}) {
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);
  return (
    <View style={styles.entryListWrap}>
      <View style={[styles.entryListHeader, { backgroundColor: accent }]}>
        <Text style={styles.entryListTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <View style={styles.entryListBody}>
        {entries.map((entry, index) => (
          <View
            key={`${entry.name}-${index}`}
            style={[styles.entryRow, index > 0 && styles.entryRowDivider]}
          >
            <EntryCover icon={entry.icon} imageUri={entry.imageUri} size={22} />
            <Text style={styles.entryName} numberOfLines={1}>
              {entry.name}
            </Text>
            <Text style={styles.entryExtra} numberOfLines={1}>
              {entry.extra}
            </Text>
            <Text style={[styles.entryCost, { color: accent }]}>
              {formatCurrency(entry.dailyCost)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function AnnualBody({ data }: { data: Extract<ShareCardData, { kind: 'annual' }> }) {
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);

  const delta = data.netWorthDelta;
  const deltaColor =
    delta === null
      ? THEME.colors.textSecondary
      : delta > 0
        ? THEME.colors.success
        : delta < 0
          ? THEME.colors.dangerDark
          : THEME.colors.textSecondary;

  return (
    <>
      <View style={styles.heroBlock}>
        <Text style={styles.heroLabel}>{data.year} 年度资产回顾</Text>
        <Text style={styles.heroValue}>{formatCurrency(data.purchasedTotal)}</Text>
        <Text style={styles.heroSubLabel}>年度购入总额</Text>
      </View>

      <View style={styles.statsGrid}>
        <StatCell
          label="购入资产"
          value={`${data.purchasedCount} 件`}
          accent={THEME.colors.primaryDark}
        />
        <StatCell
          label="售出资产"
          value={`${data.soldCount} 件`}
          accent={THEME.colors.accent}
        />
        <StatCell
          label="售出净盈亏"
          value={formatCurrency(data.soldProfit)}
          accent={THEME.colors.success}
        />
        <StatCell
          label="订阅预算"
          value={formatCurrency(data.subscriptionTotal)}
          accent={THEME.colors.primary}
        />
        <StatCell
          label="维修支出"
          value={formatCurrency(data.maintenanceTotal)}
          accent={THEME.colors.warning}
        />
        <StatCell
          label="沉睡本金"
          value={formatCurrency(data.dormantPrincipal)}
          accent={THEME.colors.dangerDark}
        />
      </View>

      {delta !== null && (data.netWorthFirst !== null || data.netWorthLast !== null) && (
        <View style={styles.annualNetWorthRow}>
          <View style={styles.annualNetWorthBlock}>
            <Text style={styles.annualNetWorthLabel}>年初净资产</Text>
            <Text style={styles.annualNetWorthValue}>
              {data.netWorthFirst !== null ? formatCurrency(data.netWorthFirst) : '—'}
            </Text>
          </View>
          <Text style={styles.annualNetWorthArrow}>→</Text>
          <View style={styles.annualNetWorthBlock}>
            <Text style={styles.annualNetWorthLabel}>年末净资产</Text>
            <Text style={styles.annualNetWorthValue}>
              {data.netWorthLast !== null ? formatCurrency(data.netWorthLast) : '—'}
            </Text>
          </View>
          <View style={styles.annualNetWorthDivider} />
          <View style={styles.annualNetWorthBlock}>
            <Text style={styles.annualNetWorthLabel}>年度变化</Text>
            <Text style={[styles.annualNetWorthValue, { color: deltaColor }]}>
              {delta > 0 ? '+' : ''}
              {formatCurrency(delta)}
            </Text>
          </View>
        </View>
      )}

      {data.bestAssetName && data.bestAssetScore !== null && (
        <View style={styles.annualBestAssetRow}>
          <Text style={styles.annualBestAssetIcon}>👑</Text>
          <View style={styles.annualBestAssetMeta}>
            <Text style={styles.annualBestAssetLabel} numberOfLines={1}>
              年度最佳资产
            </Text>
            <Text style={styles.annualBestAssetName} numberOfLines={1}>
              {data.bestAssetName}
            </Text>
          </View>
          <Text style={styles.annualBestAssetScore}>{data.bestAssetScore}</Text>
          <Text style={styles.annualBestAssetUnit}>分</Text>
        </View>
      )}
    </>
  );
}

function SingleBody({
  data,
}: {
  data: Extract<ShareCardData, { kind: 'item' }> | Extract<ShareCardData, { kind: 'subscription' }>;
}) {
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);
  const heroLabel = '日均成本';
  return (
    <>
      <View style={styles.singleHeader}>
        <View style={styles.singleIconWrap}>
          {data.imageUri ? (
            <Image source={{ uri: data.imageUri }} style={styles.singleImage} />
          ) : (
            <Text style={styles.singleIcon}>{data.categoryIcon}</Text>
          )}
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

function EntryCover({
  icon,
  imageUri,
  size,
}: {
  icon: string;
  imageUri?: string | null;
  size: number;
}) {
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);
  if (imageUri) {
    return (
      <View
        style={[
          styles.entryIconWrap,
          { width: size, height: size },
        ]}
      >
        <Image source={{ uri: imageUri }} style={{ width: size, height: size }} />
      </View>
    );
  }
  return (
    <Text style={[styles.entryIcon, { fontSize: Math.round(size * 0.8) }]}>
      {icon}
    </Text>
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
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);
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

const createStyles = () => StyleSheet.create({
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
  heroSubLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  annualNetWorthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: THEME.colors.surface,
    borderWidth: 1.5,
    borderColor: THEME.colors.borderDark,
    borderRadius: THEME.borderRadius,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  annualNetWorthBlock: {
    flex: 1,
    minWidth: 0,
  },
  annualNetWorthLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    marginBottom: 2,
  },
  annualNetWorthValue: {
    fontSize: 13,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  annualNetWorthArrow: {
    fontSize: 14,
    fontWeight: '900',
    color: THEME.colors.textLight,
  },
  annualNetWorthDivider: {
    width: 1.5,
    alignSelf: 'stretch',
    backgroundColor: THEME.colors.border,
    marginHorizontal: 2,
  },
  annualBestAssetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: THEME.colors.surface,
    borderWidth: 1.5,
    borderColor: THEME.colors.borderDark,
    borderRadius: THEME.borderRadius,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  annualBestAssetIcon: {
    fontSize: 22,
  },
  annualBestAssetMeta: {
    flex: 1,
    minWidth: 0,
  },
  annualBestAssetLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    marginBottom: 2,
  },
  annualBestAssetName: {
    fontSize: 14,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  annualBestAssetScore: {
    fontFamily: THEME.fontFamily.pixel,
    fontSize: 18,
    color: THEME.colors.primaryDark,
    letterSpacing: 1,
  },
  annualBestAssetUnit: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.textSecondary,
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
  entryListWrap: {
    borderWidth: 1.5,
    borderColor: THEME.colors.borderDark,
    borderRadius: THEME.borderRadius,
    overflow: 'hidden',
    backgroundColor: THEME.colors.surface,
  },
  entryListHeader: {
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  entryListTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: THEME.colors.surface,
    letterSpacing: 0.5,
  },
  entryListBody: {
    paddingVertical: 2,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 6,
  },
  entryRowDivider: {
    borderTopWidth: 1,
    borderColor: THEME.colors.border,
  },
  entryIcon: {
    fontSize: 16,
  },
  entryIconWrap: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: THEME.colors.borderDark,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  entryName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    minWidth: 0,
  },
  entryExtra: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    maxWidth: 70,
  },
  entryCost: {
    fontSize: 13,
    fontWeight: '900',
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
  singleImage: {
    width: 44,
    height: 44,
    resizeMode: 'cover',
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
