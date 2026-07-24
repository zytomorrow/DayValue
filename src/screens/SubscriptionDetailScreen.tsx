import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, Subscription } from '../types';
import {
  getSubscriptionById,
  deleteSubscription,
  archiveSubscription,
  deleteAccessoriesByEntity,
} from '../database';
import { calculateSubscriptionDailyCost } from '../utils/calculations';
import { formatCurrency, formatDate } from '../utils/formatters';
import { THEME } from '../utils/constants';
import { useCategories } from '../contexts/CategoriesContext';
import { useTheme } from '../contexts/ThemeContext';
import { AccessorySection, BrutalButton, EntityCover, ShareModal, StatusBadge } from '../components';
import type { ShareCardData } from '../components';
import { deleteEntityImageAsync } from '../utils/entityImages';
import { alertConfirm } from '../utils/pixelAlert';

type Props = NativeStackScreenProps<RootStackParamList, 'SubscriptionDetail'>;

export function SubscriptionDetailScreen({ route, navigation }: Props) {
  const db = useSQLiteContext();
  const { getCategoryInfo } = useCategories();
  const { subscriptionId } = route.params;
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [shareData, setShareData] = useState<ShareCardData | null>(null);

  const loadData = useCallback(async () => {
    try {
      const data = await getSubscriptionById(db, subscriptionId);
      setSub(data);
      if (data) {
        navigation.setOptions({ title: data.name });
      }
    } catch (error) {
      console.error('加载订阅详情失败', error);
    }
  }, [db, navigation, subscriptionId]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  async function handleDelete() {
    alertConfirm('确认删除', `确定要删除“${sub?.name}”吗？此操作不可撤销。`, async () => {
      await deleteEntityImageAsync(sub?.image_uri);
      await deleteAccessoriesByEntity(db, 'subscription', subscriptionId);
      await deleteSubscription(db, subscriptionId);
      navigation.goBack();
    }, { confirmText: '删除', destructive: true });
  }

  async function handleArchive() {
    alertConfirm('退订确认', '确认退订后将从「每日消耗」中移除。', async () => {
      await archiveSubscription(db, subscriptionId);
      await loadData();
    }, { confirmText: '确认退订', cancelText: '返回' });
  }

  if (!sub) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>加载中...</Text>
      </View>
    );
  }

  const category = getCategoryInfo('subscription', sub.category ?? 'other');
  const icon = sub.icon ?? category.icon;
  const imageUri = sub.image_uri ?? null;
  const dailyCost = calculateSubscriptionDailyCost(sub.cycle_price, sub.billing_cycle);
  const cycleLabel =
    sub.billing_cycle === 'monthly'
      ? '月付'
      : sub.billing_cycle === 'quarterly'
        ? '季付'
        : '年付';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <EntityCover
            imageUri={imageUri}
            icon={icon}
            size={52}
            iconSize={28}
            backgroundColor={THEME.colors.accentLight + '30'}
            style={styles.iconBox}
          />
          <View style={styles.headerInfo}>
            <Text style={styles.name}>{sub.name}</Text>
            <Text style={styles.categoryText}>{category.name}</Text>
          </View>
          <StatusBadge status={sub.status} type="subscription" />
        </View>
      </View>

      <View style={styles.highlightCard}>
        <Text style={styles.highlightLabel}>日均成本</Text>
        <Text style={styles.highlightValue}>{formatCurrency(dailyCost)}</Text>
        <Text style={styles.highlightSub}>
          {cycleLabel} {formatCurrency(sub.cycle_price)}
        </Text>
      </View>

      <View style={styles.card}>
        <InfoRow label="计费周期" value={cycleLabel} />
        <InfoRow label="周期金额" value={formatCurrency(sub.cycle_price)} />
        <InfoRow label="开始日期" value={formatDate(sub.start_date)} />
      </View>

      <AccessorySection
        entityType="subscription"
        entityId={sub.id}
        entityLabel="订阅"
      />

      <View style={styles.actions}>
        <BrutalButton
          title="📤 分享卡片"
          onPress={() => {
            setShareData({
              kind: 'subscription',
              name: sub.name,
              categoryIcon: icon,
              imageUri: imageUri,
              categoryName: category.name,
              dailyCost,
              cyclePrice: sub.cycle_price,
              cycleLabel,
              startDate: sub.start_date,
            });
          }}
          variant="outline"
          size="md"
          style={styles.actionBtn}
        />

        <BrutalButton
          title="编辑"
          onPress={() =>
            navigation.navigate('AddEditSubscription', { subscriptionId: sub.id })
          }
          variant="accent"
          size="md"
          style={styles.actionBtn}
        />

        {sub.status === 'active' && (
          <BrutalButton
            title="退订"
            onPress={handleArchive}
            variant="outline"
            size="md"
            style={styles.actionBtn}
          />
        )}

        <BrutalButton
          title="删除"
          onPress={handleDelete}
          variant="danger"
          size="md"
          style={styles.actionBtn}
        />
      </View>

      <ShareModal
        visible={shareData !== null}
        data={shareData}
        onClose={() => setShareData(null)}
      />
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={infoStyles.row}>
      <Text style={infoStyles.label}>{label}</Text>
      <Text style={infoStyles.value}>{value}</Text>
    </View>
  );
}

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: THEME.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  label: {
    fontSize: THEME.fontSize.md,
    color: THEME.colors.textSecondary,
  },
  value: {
    fontSize: THEME.fontSize.md,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
});

const createStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  content: {
    padding: THEME.spacing.xl,
    paddingBottom: 40,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: THEME.colors.background,
  },
  loadingText: {
    fontSize: THEME.fontSize.md,
    color: THEME.colors.textSecondary,
  },
  card: {
    backgroundColor: THEME.colors.surface,
    ...THEME.pixelBorder,
    ...THEME.pixelShadow,
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 6,
    backgroundColor: THEME.colors.accentLight + '30',
    borderWidth: 1.5,
    borderColor: THEME.colors.borderDark,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: THEME.spacing.md,
  },
  headerInfo: { flex: 1 },
  name: {
    fontSize: THEME.fontSize.xl,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  categoryText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  highlightCard: {
    backgroundColor: THEME.colors.accent,
    ...THEME.pixelBorder,
    ...THEME.pixelShadow,
    padding: THEME.spacing.xl,
    marginBottom: THEME.spacing.lg,
    alignItems: 'center',
  },
  highlightLabel: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.onPrimary + 'AA',
    marginBottom: 4,
  },
  highlightValue: {
    fontSize: 20,
    fontFamily: THEME.fontFamily.pixel,
    color: THEME.colors.onPrimary,
  },
  highlightSub: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.onPrimary + 'CC',
    marginTop: 4,
  },
  actions: {
    gap: THEME.spacing.md,
  },
  actionBtn: {
    width: '100%',
  },
});
