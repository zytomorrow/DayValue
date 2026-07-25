/**
 * AccessoryPreview - 配件紧凑预览
 *
 * 用于在 ItemCard / SubscriptionCard 底部展示该实体的配件清单，
 * 默认折叠为一行汇总，展开后显示每个配件明细。
 * 仅展示在用 + 损坏的配件（丢失不计入）。
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { THEME } from '../utils/constants';
import { useTheme } from '../contexts/ThemeContext';
import { formatCurrency } from '../utils/formatters';
import type { Accessory } from '../types';

interface AccessoryPreviewProps {
  accessories: Accessory[];
}

export function AccessoryPreview({ accessories }: AccessoryPreviewProps) {
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);
  const [expanded, setExpanded] = useState(false);

  // 仅在用 + 损坏的配件计入展示（与详情页口径一致）
  const visible = useMemo(
    () => accessories.filter(a => a.status !== 'lost'),
    [accessories],
  );

  if (visible.length === 0) return null;

  const totalCount = visible.reduce((s, a) => s + a.quantity, 0);
  const totalCost = visible.reduce((s, a) => s + a.quantity * a.unit_price, 0);

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.summaryRow}
        onPress={() => setExpanded(v => !v)}
        hitSlop={6}
      >
        <Text style={styles.summaryLabel}>
          🔌 配件 · {visible.length} 项 · {totalCount} 件
        </Text>
        <Text style={styles.summaryCost}>{formatCurrency(totalCost)}</Text>
        <Text style={styles.toggle}>{expanded ? '▲' : '▼'}</Text>
      </Pressable>

      {expanded && (
        <View style={styles.list}>
          {visible.map((acc, index) => {
            const lineTotal = acc.quantity * acc.unit_price;
            const isDamaged = acc.status === 'damaged';
            return (
              <View
                key={`acc-${acc.id}-${index}`}
                style={[styles.row, index > 0 && styles.rowDivider]}
              >
                <Text style={styles.bullet}>└</Text>
                <Text
                  style={[styles.name, isDamaged && styles.nameDamaged]}
                  numberOfLines={1}
                >
                  {acc.name}
                  {acc.quantity > 1 ? ` ×${acc.quantity}` : ''}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {acc.unit_price > 0 ? formatCurrency(acc.unit_price) : '—'}
                  {lineTotal > 0 && acc.quantity > 1 ? ` · 小计 ${formatCurrency(lineTotal)}` : ''}
                  {isDamaged ? ' · 损坏' : ''}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  wrap: {
    marginTop: THEME.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
    paddingTop: THEME.spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.xs,
  },
  summaryLabel: {
    flex: 1,
    fontSize: THEME.fontSize.xs,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  summaryCost: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '900',
    color: THEME.colors.warning,
    fontFamily: THEME.fontFamily.pixel,
  },
  toggle: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    fontWeight: '900',
  },
  list: {
    marginTop: THEME.spacing.xs,
    backgroundColor: THEME.colors.background,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 4,
  },
  rowDivider: {
    borderTopWidth: 0.5,
    borderTopColor: THEME.colors.border,
  },
  bullet: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    fontWeight: '900',
  },
  name: {
    flex: 1,
    fontSize: THEME.fontSize.xs,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    minWidth: 0,
  },
  nameDamaged: {
    color: THEME.colors.warning,
  },
  meta: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    maxWidth: 130,
  },
});
