/**
 * CabinetScreen - 数字陈列柜
 * 以网格形式陈列全部资产（买断 / 订阅 / 卡包）的封面，弱化数字、强化视觉收藏感。
 */
import React, { useCallback, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { OneTimeItem, RootStackParamList, StoredCard, Subscription } from '../types';
import {
  getAllOneTimeItems,
  getAllStoredCards,
  getAllSubscriptions,
} from '../database';
import {
  calculateDailyCost,
  calculateDailyDebt,
  calculateOneTimeItemActiveDays,
  calculateSubscriptionDailyCost,
} from '../utils/calculations';
import { formatCurrency } from '../utils/formatters';
import { THEME } from '../utils/constants';
import { useCategories } from '../contexts/CategoriesContext';
import { EmptyState, EntityCover } from '../components';

type Props = NativeStackScreenProps<RootStackParamList, 'Cabinet'>;

type CabinetEntry = {
  key: string;
  name: string;
  icon: string;
  imageUri: string | null;
  subtitle: string;
  onPress: () => void;
};

const COLUMNS = 3;

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

export function CabinetScreen({ navigation }: Props) {
  const db = useSQLiteContext();
  const { getCategoryInfo } = useCategories();

  const [items, setItems] = useState<OneTimeItem[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [storedCards, setStoredCards] = useState<StoredCard[]>([]);

  const loadData = useCallback(async () => {
    try {
      const [nextItems, nextSubscriptions, nextStoredCards] = await Promise.all([
        getAllOneTimeItems(db),
        getAllSubscriptions(db),
        getAllStoredCards(db),
      ]);
      setItems(nextItems);
      setSubscriptions(nextSubscriptions);
      setStoredCards(nextStoredCards);
    } catch (error) {
      console.error('加载陈列柜数据失败', error);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const itemEntries: CabinetEntry[] = items.map(item => {
    const cat = getCategoryInfo('item', item.category ?? 'other');
    const activeDays = calculateOneTimeItemActiveDays(item);
    const archivedReason =
      item.archived_reason ?? (item.salvage_value > 0 ? 'sold' : 'paused');
    const isSold = item.status === 'archived' && archivedReason === 'sold';
    const isUnredeemed = item.status === 'unredeemed';
    const subtitle = isSold
      ? `已售 ${formatCurrency(item.salvage_value)}`
      : isUnredeemed
        ? `日供 ${formatCurrency(calculateDailyDebt(item.monthly_payment ?? 0))}`
        : `日均 ${formatCurrency(calculateDailyCost(item.total_price, 0, activeDays))}`;
    return {
      key: `item-${item.id}`,
      name: item.name,
      icon: item.icon ?? cat.icon,
      imageUri: item.image_uri ?? null,
      subtitle,
      onPress: () => navigation.navigate('ItemDetail', { itemId: item.id }),
    };
  });

  const subscriptionEntries: CabinetEntry[] = subscriptions.map(sub => {
    const cat = getCategoryInfo('subscription', sub.category ?? 'other');
    const subtitle = `${formatCurrency(
      calculateSubscriptionDailyCost(sub.cycle_price, sub.billing_cycle),
    )}/天`;
    return {
      key: `sub-${sub.id}`,
      name: sub.name,
      icon: sub.icon ?? cat.icon,
      imageUri: sub.image_uri ?? null,
      subtitle,
      onPress: () => navigation.navigate('SubscriptionDetail', { subscriptionId: sub.id }),
    };
  });

  const cardEntries: CabinetEntry[] = storedCards.map(card => {
    const cat = getCategoryInfo('stored_card', card.category ?? 'other');
    const subtitle =
      card.card_type === 'amount'
        ? `余 ${formatCurrency(card.current_balance)}`
        : `余 ${Math.round(card.current_balance)} 次`;
    return {
      key: `card-${card.id}`,
      name: card.name,
      icon: card.icon ?? cat.icon,
      imageUri: card.image_uri ?? null,
      subtitle,
      onPress: () => navigation.navigate('AddEditStoredCard', { storedCardId: card.id }),
    };
  });

  const hasContent =
    itemEntries.length > 0 ||
    subscriptionEntries.length > 0 ||
    cardEntries.length > 0;

  const renderItemRows = (entries: CabinetEntry[]) =>
    chunk(entries, COLUMNS).map((row, rowIndex) => (
      <View key={`row-${rowIndex}`} style={styles.gridRow}>
        {row.map(entry => (
          <TouchableOpacity
            key={entry.key}
            style={styles.tile}
            onPress={entry.onPress}
            activeOpacity={0.75}
          >
            <EntityCover
              imageUri={entry.imageUri}
              icon={entry.icon}
              size={84}
              iconSize={40}
              style={styles.tileCover}
            />
            <Text style={styles.tileName} numberOfLines={1}>
              {entry.name}
            </Text>
            <Text style={styles.tileSubtitle} numberOfLines={1}>
              {entry.subtitle}
            </Text>
          </TouchableOpacity>
        ))}
        {row.length < COLUMNS &&
          Array.from({ length: COLUMNS - row.length }).map((_, i) => (
            <View key={`placeholder-${i}`} style={styles.tilePlaceholder} />
          ))}
      </View>
    ));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {!hasContent && <EmptyState message="陈列柜还是空的，先去添加一些资产吧" icon="🗄️" />}

      {itemEntries.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>买断资产 · {itemEntries.length}</Text>
          {renderItemRows(itemEntries)}
        </View>
      )}

      {subscriptionEntries.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>持续订阅 · {subscriptionEntries.length}</Text>
          {renderItemRows(subscriptionEntries)}
        </View>
      )}

      {cardEntries.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>沉睡卡包 · {cardEntries.length}</Text>
          {renderItemRows(cardEntries)}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  content: {
    padding: THEME.spacing.lg,
    paddingBottom: 40,
  },
  section: {
    marginBottom: THEME.spacing.xl,
  },
  sectionTitle: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '800',
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.md,
  },
  gridRow: {
    flexDirection: 'row',
    gap: THEME.spacing.md,
    marginBottom: THEME.spacing.md,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: THEME.colors.surface,
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    borderRadius: THEME.borderRadius,
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.xs,
    ...THEME.pixelShadow,
  },
  tileCover: {
    marginBottom: THEME.spacing.xs,
  },
  tileName: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    textAlign: 'center',
  },
  tileSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  tilePlaceholder: {
    flex: 1,
  },
});
