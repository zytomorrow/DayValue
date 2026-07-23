/**
 * AssetGroupedList - 按分类分组展示买断资产
 * 分组头含分类图标、名称、数量与日均成本小计，支持折叠/展开。
 */
import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { CategoryInfo, OneTimeItem } from '../types';
import {
  calculateDailyCost,
  calculateOneTimeItemActiveDays,
} from '../utils/calculations';
import { formatCurrency } from '../utils/formatters';
import { THEME } from '../utils/constants';
import { ItemCard } from './ItemCard';

type AssetLayout = 'list' | 'grid';

interface AssetGroupedListProps {
  items: OneTimeItem[];
  categories: CategoryInfo[];
  layoutMode: AssetLayout;
  onPressItem: (itemId: number) => void;
}

type AssetGroup = {
  category: CategoryInfo;
  items: OneTimeItem[];
  dailyCost: number;
};

function chunkItems<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

const OTHER_CATEGORY: CategoryInfo = {
  id: 'other',
  name: '其他资产',
  icon: '📦',
};

export function AssetGroupedList({
  items,
  categories,
  layoutMode,
  onPressItem,
}: AssetGroupedListProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const groups = useMemo<AssetGroup[]>(() => {
    const buckets = new Map<string, OneTimeItem[]>();

    items.forEach(item => {
      const categoryId = item.category ?? 'other';
      const list = buckets.get(categoryId);
      if (list) {
        list.push(item);
      } else {
        buckets.set(categoryId, [item]);
      }
    });

    const resolved: AssetGroup[] = [];
    buckets.forEach((groupItems, categoryId) => {
      const category =
        categories.find(candidate => candidate.id === categoryId) ??
        (categoryId === 'other' ? OTHER_CATEGORY : { ...OTHER_CATEGORY, id: categoryId, name: categoryId });

      const dailyCost = groupItems.reduce((sum, item) => {
        const activeDays = calculateOneTimeItemActiveDays(item);
        return sum + calculateDailyCost(item.total_price, 0, activeDays);
      }, 0);

      resolved.push({ category, items: groupItems, dailyCost });
    });

    // 按日均成本降序，让最"贵"的分组更显眼
    resolved.sort((a, b) => b.dailyCost - a.dailyCost || b.items.length - a.items.length);
    return resolved;
  }, [items, categories]);

  function toggleGroup(categoryId: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }

  function renderGroupItems(groupItems: OneTimeItem[], keyPrefix: string) {
    if (layoutMode === 'grid') {
      return chunkItems(groupItems, 2).map((rowItems, rowIndex) => (
        <View key={`${keyPrefix}-row-${rowIndex}`} style={styles.gridRow}>
          {rowItems.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              layout="grid"
              style={styles.gridCard}
              onPress={() => onPressItem(item.id)}
            />
          ))}
          {rowItems.length === 1 && <View style={styles.gridCardPlaceholder} />}
        </View>
      ));
    }

    return groupItems.map(item => (
      <ItemCard
        key={item.id}
        item={item}
        onPress={() => onPressItem(item.id)}
      />
    ));
  }

  if (groups.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      {groups.map(group => {
        const isCollapsed = collapsedGroups.has(group.category.id);
        return (
          <View key={group.category.id} style={styles.group}>
            <GroupHeader
              category={group.category}
              count={group.items.length}
              dailyCost={group.dailyCost}
              collapsed={isCollapsed}
              onToggle={() => toggleGroup(group.category.id)}
            />
            {!isCollapsed && (
              <View style={styles.groupBody}>{renderGroupItems(group.items, group.category.id)}</View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function GroupHeader({
  category,
  count,
  dailyCost,
  collapsed,
  onToggle,
}: {
  category: CategoryInfo;
  count: number;
  dailyCost: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.header}
      onPress={onToggle}
      activeOpacity={0.78}
    >
      <View style={styles.headerIconWrap}>
        <Text style={styles.headerIcon}>{category.icon}</Text>
      </View>
      <View style={styles.headerMeta}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {category.name}
        </Text>
        <Text style={styles.headerSub}>{count} 件资产</Text>
      </View>
      <View style={styles.headerRight}>
        <Text style={styles.headerCost}>{formatCurrency(dailyCost)}</Text>
        <Text style={styles.headerCostUnit}>/天</Text>
      </View>
      <Text style={[styles.headerChevron, collapsed && styles.headerChevronCollapsed]}>
        ▾
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: THEME.spacing.md,
  },
  group: {
    borderRadius: THEME.borderRadius,
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    backgroundColor: THEME.colors.surface,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.md,
    backgroundColor: THEME.colors.primaryLight + '22',
    borderBottomWidth: 1.5,
    borderBottomColor: THEME.colors.border,
  },
  headerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: THEME.borderRadius,
    borderWidth: 1.5,
    borderColor: THEME.colors.borderDark,
    backgroundColor: THEME.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: THEME.spacing.sm,
  },
  headerIcon: {
    fontSize: 18,
  },
  headerMeta: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: THEME.fontSize.md,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  headerSub: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginRight: THEME.spacing.sm,
  },
  headerCost: {
    fontSize: THEME.fontSize.md,
    fontWeight: '900',
    color: THEME.colors.primaryDark,
  },
  headerCostUnit: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    marginLeft: 2,
  },
  headerChevron: {
    fontSize: 14,
    fontWeight: '900',
    color: THEME.colors.textSecondary,
    transform: [{ rotate: '0deg' }],
  },
  headerChevronCollapsed: {
    transform: [{ rotate: '-90deg' }],
  },
  groupBody: {
    padding: THEME.spacing.md,
    gap: THEME.spacing.md,
  },
  gridRow: {
    flexDirection: 'row',
    gap: THEME.spacing.md,
  },
  gridCard: {
    flex: 1,
  },
  gridCardPlaceholder: {
    flex: 1,
  },
});
