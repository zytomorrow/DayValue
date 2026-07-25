import React, { useCallback, useRef, useState, useMemo } from 'react';
import {
  Animated,
  LayoutAnimation,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Accessory, AccessoryStatus, MaintenanceLog, MaintenancePlan, OneTimeItem, RootStackParamList } from '../types';
import {
  createAccessory,
  createMaintenanceLog,
  createMaintenancePlan,
  deleteAccessory,
  deleteAccessoriesByItem,
  deleteMaintenanceLog,
  deleteMaintenanceLogsByItem,
  deleteMaintenancePlan,
  deleteMaintenancePlansByItem,
  deleteOneTimeItem,
  getAccessoriesByItem,
  getMaintenanceLogsByItem,
  getMaintenancePlansByItem,
  getOneTimeItemById,
  markMaintenancePlanDone,
  pauseOneTimeItem,
  redeemOneTimeItem,
  resumeOneTimeItem,
  sellOneTimeItem,
  updateAccessory,
} from '../database';
import {
  calculateAccessoryTotalCost,
  calculateAssetHealth,
  calculateDailyCost,
  calculateDailyDebt,
  calculateDepreciatedValue,
  calculateIRR,
  calculateInstallmentPremium,
  calculateOneTimeItemActiveDays,
  calculateRealizedProfit,
  calculateServiceProgress,
  calculateWarrantyInfo,
  isProfitableSale,
} from '../utils/calculations';
import { formatCurrency, formatDate, getTodayString } from '../utils/formatters';
import { THEME } from '../utils/constants';
import { useCategories } from '../contexts/CategoriesContext';
import { useTheme } from '../contexts/ThemeContext';
import { BrutalButton, DatePickerField, EntityCover, HealthBadge, PixelInput, ServiceProgressBar, ShareModal, StatusBadge } from '../components';
import type { ShareCardData } from '../components';
import { deleteEntityImageAsync } from '../utils/entityImages';
import { alertConfirm, alertError, alertSuccess } from '../utils/pixelAlert';

type Props = NativeStackScreenProps<RootStackParamList, 'ItemDetail'>;

export function ItemDetailScreen({ route, navigation }: Props) {
  const db = useSQLiteContext();
  const { getCategoryInfo } = useCategories();
  const { itemId } = route.params;
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);
  const [item, setItem] = useState<OneTimeItem | null>(null);

  const [pauseModalVisible, setPauseModalVisible] = useState(false);
  const [pauseDate, setPauseDate] = useState(getTodayString());
  const [resumeModalVisible, setResumeModalVisible] = useState(false);
  const [resumeDate, setResumeDate] = useState(getTodayString());
  const [sellModalVisible, setSellModalVisible] = useState(false);
  const [sellDate, setSellDate] = useState(getTodayString());
  const [sellPrice, setSellPrice] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);

  const [redeemModalVisible, setRedeemModalVisible] = useState(false);
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [healthExpanded, setHealthExpanded] = useState(false);
  const [shareData, setShareData] = useState<ShareCardData | null>(null);
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLog[]>([]);
  const [maintModalVisible, setMaintModalVisible] = useState(false);
  const [maintDate, setMaintDate] = useState(getTodayString());
  const [maintCost, setMaintCost] = useState('');
  const [maintTitle, setMaintTitle] = useState('');
  const [maintDescription, setMaintDescription] = useState('');
  const [maintBusy, setMaintBusy] = useState(false);
  const [maintenancePlans, setMaintenancePlans] = useState<MaintenancePlan[]>([]);
  const [planModalVisible, setPlanModalVisible] = useState(false);
  const [planTitle, setPlanTitle] = useState('');
  const [planInterval, setPlanInterval] = useState('');
  const [planLastDate, setPlanLastDate] = useState(getTodayString());
  const [planBusy, setPlanBusy] = useState(false);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [accModalVisible, setAccModalVisible] = useState(false);
  const [accEditingId, setAccEditingId] = useState<number | null>(null);
  const [accName, setAccName] = useState('');
  const [accQuantity, setAccQuantity] = useState('1');
  const [accUnitPrice, setAccUnitPrice] = useState('');
  const [accBuyDate, setAccBuyDate] = useState(getTodayString());
  const [accStatus, setAccStatus] = useState<AccessoryStatus>('in_use');
  const [accNotes, setAccNotes] = useState('');
  const [accBusy, setAccBusy] = useState(false);
  const redeemScale = useRef(new Animated.Value(0.9)).current;
  const redeemShakeX = useRef(new Animated.Value(0)).current;
  const redeemColor = useRef(new Animated.Value(0)).current;

  const redeemTextColor = redeemColor.interpolate({
    inputRange: [0, 1],
    outputRange: [THEME.colors.textPrimary, THEME.colors.success],
  });

  const loadItem = useCallback(async () => {
    try {
      const [data, logs, plans, accs] = await Promise.all([
        getOneTimeItemById(db, itemId),
        getMaintenanceLogsByItem(db, itemId),
        getMaintenancePlansByItem(db, itemId),
        getAccessoriesByItem(db, itemId),
      ]);
      setItem(data);
      setMaintenanceLogs(logs);
      setMaintenancePlans(plans);
      setAccessories(accs);
      if (data) {
        navigation.setOptions({ title: data.name });
      }
    } catch (error) {
      console.error('加载物品详情失败', error);
    }
  }, [db, itemId, navigation]);

  useFocusEffect(
    useCallback(() => {
      void loadItem();
    }, [loadItem]),
  );

  async function handleDelete() {
    alertConfirm('确认删除', `确定要删除“${item?.name}”吗？此操作不可撤销。`, async () => {
      await deleteEntityImageAsync(item?.image_uri);
      await deleteMaintenanceLogsByItem(db, itemId);
      await deleteMaintenancePlansByItem(db, itemId);
      await deleteAccessoriesByItem(db, itemId);
      await deleteOneTimeItem(db, itemId);
      navigation.goBack();
    }, { confirmText: '删除', destructive: true });
  }

  function startRedeemAnimation() {
    setRedeemBusy(true);
    setRedeemModalVisible(true);
    redeemScale.setValue(0.9);
    redeemShakeX.setValue(0);
    redeemColor.setValue(0);

    Animated.parallel([
      Animated.sequence([
        Animated.timing(redeemScale, {
          toValue: 1.25,
          duration: 320,
          useNativeDriver: true,
        }),
        Animated.timing(redeemScale, {
          toValue: 1.05,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(redeemScale, {
          toValue: 1.15,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(redeemScale, {
          toValue: 1.0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.delay(500),
      ]),
      Animated.sequence([
        Animated.timing(redeemShakeX, { toValue: -10, duration: 70, useNativeDriver: true }),
        Animated.timing(redeemShakeX, { toValue: 10, duration: 70, useNativeDriver: true }),
        Animated.timing(redeemShakeX, { toValue: -8, duration: 70, useNativeDriver: true }),
        Animated.timing(redeemShakeX, { toValue: 8, duration: 70, useNativeDriver: true }),
        Animated.timing(redeemShakeX, { toValue: -6, duration: 70, useNativeDriver: true }),
        Animated.timing(redeemShakeX, { toValue: 6, duration: 70, useNativeDriver: true }),
        Animated.timing(redeemShakeX, { toValue: 0, duration: 90, useNativeDriver: true }),
        Animated.delay(990),
      ]),
      Animated.sequence([
        Animated.timing(redeemColor, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.delay(600),
      ]),
    ]).start(async ({ finished }) => {
      if (!finished) return;
      try {
        await redeemOneTimeItem(db, itemId);
        setRedeemModalVisible(false);
        setRedeemBusy(false);
        navigation.goBack();
      } catch {
        setRedeemModalVisible(false);
        setRedeemBusy(false);
        alertError('错误', '赎身失败，请重试');
      }
    });
  }

  function handleRedeem() {
    if (redeemBusy) return;
    alertConfirm('赎身确认', '赎身后物品将进入「买断资产」轨道，解锁日均成本正向反馈。', startRedeemAnimation, { confirmText: '确认赎身' });
  }

  async function handlePause() {
    if (!item || statusBusy) return;
    if (pauseDate > getTodayString()) {
      alertError('提示', '停用日期不能晚于今天');
      return;
    }
    setStatusBusy(true);
    try {
      await pauseOneTimeItem(db, itemId, pauseDate);
      setPauseModalVisible(false);
      await loadItem();
    } catch (error) {
      alertError('错误', error instanceof Error ? error.message : '停用失败，请重试');
    } finally {
      setStatusBusy(false);
    }
  }

  async function handleResume() {
    if (!item || statusBusy) return;
    if (resumeDate > getTodayString()) {
      alertError('提示', '恢复日期不能晚于今天');
      return;
    }
    setStatusBusy(true);
    try {
      await resumeOneTimeItem(db, itemId, resumeDate);
      setResumeModalVisible(false);
      await loadItem();
    } catch (error) {
      alertError('错误', error instanceof Error ? error.message : '恢复失败，请重试');
    } finally {
      setStatusBusy(false);
    }
  }

  async function handleSell() {
    if (!item || statusBusy) return;
    if (sellDate > getTodayString()) {
      alertError('提示', '售出日期不能晚于今天');
      return;
    }

    const priceNum = parseFloat(sellPrice);
    if (Number.isNaN(priceNum) || priceNum < 0) {
      alertError('提示', '请输入有效的卖出价（≥ 0）');
      return;
    }

    setStatusBusy(true);
    try {
      await sellOneTimeItem(db, itemId, sellDate, priceNum);
      setSellModalVisible(false);
      setSellPrice('');
      await loadItem();
    } catch (error) {
      alertError('错误', error instanceof Error ? error.message : '售出失败，请重试');
    } finally {
      setStatusBusy(false);
    }
  }

  async function handleAddMaintenance() {
    if (!item || maintBusy) return;
    if (!maintTitle.trim()) {
      alertError('提示', '请输入维修标题');
      return;
    }
    const costNum = parseFloat(maintCost);
    if (Number.isNaN(costNum) || costNum < 0) {
      alertError('提示', '请输入有效的维修成本（≥ 0）');
      return;
    }
    if (maintDate > getTodayString()) {
      alertError('提示', '维修日期不能晚于今天');
      return;
    }

    setMaintBusy(true);
    try {
      await createMaintenanceLog(db, {
        item_id: itemId,
        log_date: maintDate,
        cost: costNum,
        title: maintTitle.trim(),
        description: maintDescription.trim() ? maintDescription.trim() : null,
      });
      setMaintModalVisible(false);
      setMaintTitle('');
      setMaintCost('');
      setMaintDescription('');
      await loadItem();
    } catch (error) {
      alertError('错误', error instanceof Error ? error.message : '保存维修记录失败');
    } finally {
      setMaintBusy(false);
    }
  }

  async function handleDeleteMaintenance(logId: number) {
    alertConfirm('删除维修记录', '确定要删除这条维修记录吗？', async () => {
      try {
        await deleteMaintenanceLog(db, logId);
        await loadItem();
      } catch (error) {
        alertError('错误', error instanceof Error ? error.message : '删除失败');
      }
    }, { confirmText: '删除', destructive: true });
  }

  async function handleAddPlan() {
    if (!item || planBusy) return;
    if (!planTitle.trim()) {
      alertError('提示', '请输入保养标题');
      return;
    }
    const intervalNum = parseInt(planInterval, 10);
    if (!Number.isFinite(intervalNum) || intervalNum <= 0) {
      alertError('提示', '请输入有效的间隔天数（> 0）');
      return;
    }
    if (planLastDate && planLastDate > getTodayString()) {
      alertError('提示', '上次完成日期不能晚于今天');
      return;
    }

    setPlanBusy(true);
    try {
      await createMaintenancePlan(db, {
        item_id: itemId,
        title: planTitle.trim(),
        interval_days: intervalNum,
        last_done_date: planLastDate || null,
      });
      setPlanModalVisible(false);
      setPlanTitle('');
      setPlanInterval('');
      setPlanLastDate(getTodayString());
      await loadItem();
    } catch (error) {
      alertError('错误', error instanceof Error ? error.message : '保存保养计划失败');
    } finally {
      setPlanBusy(false);
    }
  }

  async function handleCompletePlan(planId: number) {
    if (planBusy) return;
    setPlanBusy(true);
    try {
      await markMaintenancePlanDone(db, planId, getTodayString());
      await loadItem();
    } catch (error) {
      alertError('错误', error instanceof Error ? error.message : '更新失败');
    } finally {
      setPlanBusy(false);
    }
  }

  async function handleDeletePlan(planId: number) {
    alertConfirm('删除保养计划', '确定要删除这条保养计划吗？', async () => {
      try {
        await deleteMaintenancePlan(db, planId);
        await loadItem();
      } catch (error) {
        alertError('错误', error instanceof Error ? error.message : '删除失败');
      }
    }, { confirmText: '删除', destructive: true });
  }

  /** 配件总成本（在用+损坏的，不含丢失的） */
  const accessoryTotalCost = useMemo(() => {
    return accessories
      .filter(a => a.status !== 'lost')
      .reduce((sum, a) => sum + a.quantity * a.unit_price, 0);
  }, [accessories]);

  function openAddAccessoryModal() {
    setAccEditingId(null);
    setAccName('');
    setAccQuantity('1');
    setAccUnitPrice('');
    setAccBuyDate(getTodayString());
    setAccStatus('in_use');
    setAccNotes('');
    setAccModalVisible(true);
  }

  function openEditAccessoryModal(acc: Accessory) {
    setAccEditingId(acc.id);
    setAccName(acc.name);
    setAccQuantity(String(acc.quantity));
    setAccUnitPrice(acc.unit_price > 0 ? String(acc.unit_price) : '');
    setAccBuyDate(acc.buy_date ?? getTodayString());
    setAccStatus(acc.status);
    setAccNotes(acc.notes ?? '');
    setAccModalVisible(true);
  }

  async function handleSaveAccessory() {
    if (!item || accBusy) return;
    if (!accName.trim()) {
      alertError('提示', '请输入配件名称');
      return;
    }
    const qtyNum = parseInt(accQuantity, 10);
    if (Number.isNaN(qtyNum) || qtyNum < 1) {
      alertError('提示', '数量必须为 ≥1 的整数');
      return;
    }
    const priceNum = parseFloat(accUnitPrice);
    if (accUnitPrice.trim() !== '' && (Number.isNaN(priceNum) || priceNum < 0)) {
      alertError('提示', '请输入有效的单价（≥ 0）');
      return;
    }

    setAccBusy(true);
    try {
      if (accEditingId !== null) {
        await updateAccessory(db, accEditingId, {
          name: accName.trim(),
          quantity: qtyNum,
          unit_price: accUnitPrice.trim() === '' ? 0 : priceNum,
          buy_date: accBuyDate || null,
          status: accStatus,
          notes: accNotes.trim() ? accNotes.trim() : null,
        });
      } else {
        await createAccessory(db, {
          item_id: itemId,
          name: accName.trim(),
          quantity: qtyNum,
          unit_price: accUnitPrice.trim() === '' ? 0 : priceNum,
          buy_date: accBuyDate || null,
          status: accStatus,
          notes: accNotes.trim() ? accNotes.trim() : null,
        });
      }
      setAccModalVisible(false);
      await loadItem();
    } catch (error) {
      alertError('错误', error instanceof Error ? error.message : '保存配件失败');
    } finally {
      setAccBusy(false);
    }
  }

  async function handleCycleAccessoryStatus(acc: Accessory) {
    // 在用 → 损坏 → 丢失 → 在用 循环切换
    const nextStatus: AccessoryStatus =
      acc.status === 'in_use' ? 'damaged'
      : acc.status === 'damaged' ? 'lost'
      : 'in_use';
    try {
      await updateAccessory(db, acc.id, { status: nextStatus });
      await loadItem();
    } catch (error) {
      alertError('错误', error instanceof Error ? error.message : '更新状态失败');
    }
  }

  async function handleDeleteAccessory(accId: number) {
    alertConfirm('删除配件', '确定要删除这个配件吗？', async () => {
      try {
        await deleteAccessory(db, accId);
        await loadItem();
      } catch (error) {
        alertError('错误', error instanceof Error ? error.message : '删除失败');
      }
    }, { confirmText: '删除', destructive: true });
  }

  if (!item) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>加载中...</Text>
      </View>
    );
  }

  const category = getCategoryInfo('item', item.category ?? 'other');
  const icon = item.icon ?? category.icon;
  const imageUri = item.image_uri ?? null;

  const isUnredeemed = item.status === 'unredeemed';
  const isActive = item.status === 'active';
  const isArchived = item.status === 'archived';
  const archivedReason = item.archived_reason ?? (item.salvage_value > 0 ? 'sold' : 'paused');
  const isSold = isArchived && archivedReason === 'sold';
  const isPaused = isArchived && archivedReason !== 'sold';

  const activeDays = calculateOneTimeItemActiveDays(item);
  // 配件成本并入主件总价：日均 / 盈利 / 折旧都基于合并后的总价计算
  const accessoryCost = calculateAccessoryTotalCost(accessories);
  const effectiveTotalPrice = item.total_price + accessoryCost;
  const dailyCost = calculateDailyCost(effectiveTotalPrice, isSold ? item.salvage_value : 0, activeDays);
  const dailyDebt = calculateDailyDebt(item.monthly_payment ?? 0);
  const realizedProfit = isSold ? calculateRealizedProfit(effectiveTotalPrice, item.salvage_value) : 0;
  const isProfitableSold = isSold && isProfitableSale(effectiveTotalPrice, item.salvage_value);

  const serviceProgress = calculateServiceProgress(item, activeDays);
  const depreciatedValue = calculateDepreciatedValue(item, activeDays);
  const hasExpectedLife = serviceProgress.expectedDays !== null;

  const warrantyInfo = calculateWarrantyInfo(item);
  const assetHealth = calculateAssetHealth(item, serviceProgress);

  const installmentPremium = isUnredeemed
    ? calculateInstallmentPremium(
        item.total_price,
        item.down_payment ?? 0,
        item.monthly_payment ?? 0,
        item.installment_months ?? 0,
      )
    : 0;
  const installmentIRR = isUnredeemed
    ? calculateIRR(
        item.total_price,
        item.down_payment ?? 0,
        item.monthly_payment ?? 0,
        item.installment_months ?? 0,
      )
    : 0;

  const highlightLabel = isUnredeemed ? '影子日供' : isProfitableSold ? '已盈利' : '日均成本';
  const highlightValue = isUnredeemed
    ? dailyDebt
    : isProfitableSold
      ? realizedProfit
      : dailyCost;

  /** 根据各项维度得分生成针对性的健康度提升建议 */
  const healthTip = (() => {
    const { service, warranty, status } = assetHealth.breakdown;
    const tips: string[] = [];
    if (service < 30) {
      if (serviceProgress.expectedDays === null) {
        tips.push('可在编辑中设置「预期使用天数」，让健康度评估更精确');
      } else if (serviceProgress.overService) {
        tips.push(`已超期服役 ${activeDays - (serviceProgress.expectedDays ?? 0)} 天，可考虑是否需要更换或保养`);
      } else {
        tips.push(`已使用 ${activeDays} / ${serviceProgress.expectedDays} 天，接近寿命终点`);
      }
    }
    if (warranty < 18) {
      if (warrantyInfo.status === 'none') {
        tips.push('可在编辑中填写「保修到期日」，便于跟踪售后');
      } else if (warrantyInfo.status === 'expired') {
        tips.push(`已过保 ${Math.abs(warrantyInfo.remainingDays ?? 0)} 天，维修需自理`);
      } else if (warrantyInfo.status === 'expiring') {
        tips.push(`保修将在 ${warrantyInfo.remainingDays} 天内到期，可考虑提前送检`);
      }
    }
    if (status < 20) {
      tips.push('资产已停用，可考虑恢复使用或售出释放成本');
    }
    if (tips.length === 0) {
      return '各项指标均处于健康状态，继续保持良好的使用习惯即可';
    }
    return tips.join('；');
  })();

  function toggleHealthExpanded() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHealthExpanded(prev => !prev);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <EntityCover
            imageUri={imageUri}
            icon={icon}
            size={52}
            iconSize={28}
            backgroundColor={THEME.colors.primaryLight + '30'}
            style={styles.iconBox}
          />
          <View style={styles.headerInfo}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.categoryText}>{category.name}</Text>
          </View>
          <StatusBadge
            status={item.status}
            labelOverride={
              isArchived ? (isSold ? '已售出' : '已停用') : undefined
            }
          />
        </View>
        {assetHealth.grade !== 'unknown' && (
          <View style={styles.healthSection}>
            <TouchableOpacity
              style={styles.healthRow}
              onPress={toggleHealthExpanded}
              activeOpacity={0.7}
            >
              <Text style={styles.healthRowLabel}>健康度</Text>
              <HealthBadge grade={assetHealth.grade} score={assetHealth.score} />
              <Text
                style={styles.healthRowHint}
                numberOfLines={healthExpanded ? 0 : 1}
              >
                服役 {assetHealth.breakdown.service} · 保修 {assetHealth.breakdown.warranty} · 状态 {assetHealth.breakdown.status}
              </Text>
              <Text style={styles.healthChevron}>
                {healthExpanded ? '收起 ▲' : '详情 ▼'}
              </Text>
            </TouchableOpacity>

            {healthExpanded && (
              <View style={styles.healthDetails}>
                <View style={styles.healthBreakdownRow}>
                  <View style={styles.healthBreakdownHeader}>
                    <Text style={styles.healthBreakdownLabel}>🛠️ 服役进度</Text>
                    <Text style={styles.healthBreakdownScore}>
                      {assetHealth.breakdown.service} / 50
                    </Text>
                  </View>
                  <View style={styles.healthBarTrack}>
                    <View
                      style={[
                        styles.healthBarFill,
                        {
                          width: `${Math.max((assetHealth.breakdown.service / 50) * 100, 2)}%`,
                          backgroundColor: THEME.colors.primary,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.healthBreakdownHint}>
                    {serviceProgress.expectedDays === null
                      ? '未设置预期寿命，按默认中等偏高评估'
                      : serviceProgress.overService
                        ? `已超期服役 ${activeDays - (serviceProgress.expectedDays ?? 0)} 天，已回本仍在用`
                        : `当前进度 ${Math.round((serviceProgress.progress ?? 0) * 100)}%，越接近寿命终点分数越低`}
                  </Text>
                </View>

                <View style={styles.healthBreakdownRow}>
                  <View style={styles.healthBreakdownHeader}>
                    <Text style={styles.healthBreakdownLabel}>🛡️ 保修状态</Text>
                    <Text style={styles.healthBreakdownScore}>
                      {assetHealth.breakdown.warranty} / 30
                    </Text>
                  </View>
                  <View style={styles.healthBarTrack}>
                    <View
                      style={[
                        styles.healthBarFill,
                        {
                          width: `${Math.max((assetHealth.breakdown.warranty / 30) * 100, 2)}%`,
                          backgroundColor:
                            warrantyInfo.status === 'active'
                              ? THEME.colors.success
                              : warrantyInfo.status === 'expiring'
                                ? THEME.colors.warning
                                : THEME.colors.danger,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.healthBreakdownHint}>
                    {warrantyInfo.status === 'none'
                      ? '未设置保修期，按默认低分评估'
                      : warrantyInfo.status === 'active'
                        ? warrantyInfo.remainingDays !== null
                          ? `在保修期内，剩余 ${warrantyInfo.remainingDays} 天`
                          : '在保修期内'
                        : warrantyInfo.status === 'expiring'
                          ? `即将过保，剩余 ${warrantyInfo.remainingDays} 天`
                          : `已过保 ${Math.abs(warrantyInfo.remainingDays ?? 0)} 天`}
                  </Text>
                </View>

                <View style={styles.healthBreakdownRow}>
                  <View style={styles.healthBreakdownHeader}>
                    <Text style={styles.healthBreakdownLabel}>📦 资产状态</Text>
                    <Text style={styles.healthBreakdownScore}>
                      {assetHealth.breakdown.status} / 20
                    </Text>
                  </View>
                  <View style={styles.healthBarTrack}>
                    <View
                      style={[
                        styles.healthBarFill,
                        {
                          width: `${Math.max((assetHealth.breakdown.status / 20) * 100, 2)}%`,
                          backgroundColor:
                            item.status === 'active'
                              ? THEME.colors.success
                              : THEME.colors.warning,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.healthBreakdownHint}>
                    {item.status === 'active'
                      ? '资产在用中，状态分满分'
                      : '资产已停用，状态分扣半'}
                  </Text>
                </View>

                <View style={styles.healthTipBox}>
                  <Text style={styles.healthTipTitle}>💡 提升建议</Text>
                  <Text style={styles.healthTipText}>{healthTip}</Text>
                </View>
              </View>
            )}
          </View>
        )}
      </View>

      <View
        style={[
          styles.highlightCard,
          isUnredeemed && { backgroundColor: THEME.colors.danger },
        ]}
      >
        <Text style={styles.highlightLabel}>{highlightLabel}</Text>
        <Text style={styles.highlightValue}>{formatCurrency(highlightValue)}</Text>
        {!isUnredeemed && (
          <Text style={styles.highlightSub}>激活 {activeDays} 天</Text>
        )}
      </View>

      <View style={styles.card}>
        <InfoRow label="主件金额" value={formatCurrency(item.total_price)} />
        {accessoryCost > 0 && (
          <InfoRow label="配件金额" value={formatCurrency(accessoryCost)} />
        )}
        {accessoryCost > 0 && (
          <InfoRow label="合计投入" value={formatCurrency(effectiveTotalPrice)} />
        )}
        <InfoRow label="购买日期" value={formatDate(item.buy_date)} />

        {item.is_installment === 1 && (
          <>
            <InfoRow label="分期月数" value={`${item.installment_months ?? 0} 个月`} />
            <InfoRow label="月供" value={formatCurrency(item.monthly_payment ?? 0)} />
          </>
        )}

        {!isUnredeemed && (
          <>
            <InfoRow label="激活天数" value={`${activeDays} 天`} />
            {hasExpectedLife && (
              <InfoRow
                label="预期使用天数"
                value={`${serviceProgress.expectedDays} 天`}
              />
            )}
            {!isSold && (
              <InfoRow label="折旧现值" value={formatCurrency(depreciatedValue)} />
            )}
            {isSold && <InfoRow label="卖出价" value={formatCurrency(item.salvage_value)} />}
            {isProfitableSold && (
              <InfoRow label="盈利金额" value={formatCurrency(realizedProfit)} />
            )}
            {warrantyInfo.status !== 'none' && warrantyInfo.expiryDate && (
              <InfoRow
                label="保修到期"
                value={`${formatDate(warrantyInfo.expiryDate)}${
                  warrantyInfo.remainingDays !== null
                    ? warrantyInfo.remainingDays >= 0
                      ? ` · 剩 ${warrantyInfo.remainingDays} 天`
                      : ` · 已过保 ${Math.abs(warrantyInfo.remainingDays)} 天`
                    : ''
                }`}
              />
            )}
            {item.purchase_channel && (
              <InfoRow label="购买渠道" value={item.purchase_channel} />
            )}
            {item.serial_number && (
              <InfoRow label="序列号" value={item.serial_number} />
            )}
            {maintenanceLogs.length > 0 && (
              <InfoRow
                label="累计维修成本"
                value={formatCurrency(
                  maintenanceLogs.reduce((sum, log) => sum + log.cost, 0),
                )}
              />
            )}
            {accessories.length > 0 && (
              <InfoRow
                label="配件总成本"
                value={`${formatCurrency(accessoryTotalCost)} · ${accessories.length} 项`}
              />
            )}
          </>
        )}

        {item.notes && (
          <View style={infoStyles.notesRow}>
            <Text style={infoStyles.label}>备注</Text>
            <Text style={infoStyles.notesValue}>{item.notes}</Text>
          </View>
        )}

        {isPaused && (
          <InfoRow
            label="停用日期"
            value={item.end_date ? formatDate(item.end_date) : '-'}
          />
        )}

        {isSold && (
          <InfoRow
            label="售出日期"
            value={item.end_date ? formatDate(item.end_date) : '-'}
          />
        )}
      </View>

      {hasExpectedLife && !isUnredeemed && (
        <View style={styles.serviceCard}>
          <Text style={styles.serviceTitle}>服役进度</Text>
          <ServiceProgressBar
            progress={serviceProgress.progress ?? 0}
            overService={serviceProgress.overService}
            valueText={`${activeDays} / ${serviceProgress.expectedDays} 天`}
          />
          {serviceProgress.overService ? (
            <Text style={styles.serviceHint}>
              已超出预期服役期 {activeDays - (serviceProgress.expectedDays ?? 0)} 天，回本进行中
            </Text>
          ) : (
            <Text style={styles.serviceHint}>
              剩余预期 {(serviceProgress.expectedDays ?? 0) - activeDays} 天 ·
              现值约为买入价的 {Math.round((serviceProgress.progress ?? 0) * 100)}%
            </Text>
          )}
        </View>
      )}

      {hasExpectedLife && !isUnredeemed && (
        <View style={styles.depHistoryCard}>
          <Text style={styles.depHistoryTitle}>📉 折旧衰减曲线</Text>
          <Text style={styles.depHistorySubTitle}>
            从买入到预期寿命终点的价值衰减 · 当前 {formatCurrency(depreciatedValue)}
          </Text>
          <View style={styles.depHistoryChart}>
            {(() => {
              const expected = serviceProgress.expectedDays ?? 1;
              const totalSteps = 10;
              const currentStep = Math.min(
                Math.floor((activeDays / expected) * totalSteps),
                totalSteps,
              );
              return Array.from({ length: totalSteps + 1 }, (_, step) => {
                const progress = step / totalSteps;
                const sampleActiveDays = Math.floor(progress * expected);
                const sampleValue = calculateDepreciatedValue(item, sampleActiveDays);
                const heightPct =
                  item.total_price > 0
                    ? Math.max((sampleValue / item.total_price) * 100, 4)
                    : 4;
                const isPast = step < currentStep;
                const isCurrent = step === currentStep;
                return (
                  <View key={`dep-${step}`} style={styles.depHistoryBarColumn}>
                    <View style={styles.depHistoryBarTrack}>
                      <View
                        style={[
                          styles.depHistoryBarFill,
                          {
                            height: `${heightPct}%`,
                            backgroundColor: isCurrent
                              ? THEME.colors.primary
                              : isPast
                                ? THEME.colors.primaryLight
                                : THEME.colors.border,
                            borderWidth: isCurrent ? 1.5 : 0,
                            borderColor: isCurrent ? THEME.colors.primaryDark : 'transparent',
                          },
                        ]}
                      />
                    </View>
                    {step % 2 === 0 && (
                      <Text style={styles.depHistoryBarLabel}>
                        {Math.round(progress * 100)}%
                      </Text>
                    )}
                  </View>
                );
              });
            })()}
          </View>
          <View style={styles.depHistoryLegendRow}>
            <View style={styles.depHistoryLegendItem}>
              <View style={[styles.trendDot, { backgroundColor: THEME.colors.primaryLight }]} />
              <Text style={styles.depHistoryLegendText}>已折旧</Text>
            </View>
            <View style={styles.depHistoryLegendItem}>
              <View style={[styles.trendDot, { backgroundColor: THEME.colors.primary }]} />
              <Text style={styles.depHistoryLegendText}>当前位置</Text>
            </View>
            <View style={styles.depHistoryLegendItem}>
              <View style={[styles.trendDot, { backgroundColor: THEME.colors.border }]} />
              <Text style={styles.depHistoryLegendText}>预期衰减</Text>
            </View>
          </View>
          <Text style={styles.depHistoryHint}>
            {serviceProgress.overService
              ? `资产已超出预期寿命，理论上价值已归零；当前仍在使用 = 净回本 ${formatCurrency(depreciatedValue)}`
              : `按线性折旧估算，到预期寿命终点（${serviceProgress.expectedDays} 天）时价值将归零`}
          </Text>
        </View>
      )}

      {(warrantyInfo.status === 'expiring' || warrantyInfo.status === 'expired') &&
        warrantyInfo.expiryDate && (
          <View
            style={[
              styles.warrantyCard,
              warrantyInfo.status === 'expired'
                ? { borderColor: THEME.colors.dangerDark, backgroundColor: THEME.colors.dangerBg }
                : { borderColor: THEME.colors.warning, backgroundColor: THEME.colors.warningBg },
            ]}
          >
            <Text style={styles.warrantyTitle}>
              {warrantyInfo.status === 'expired' ? '🛠️ 已过保' : '⏳ 保修即将到期'}
            </Text>
            <Text style={styles.warrantyHint}>
              保修到期日：{formatDate(warrantyInfo.expiryDate)}
              {warrantyInfo.remainingDays !== null
                ? warrantyInfo.remainingDays >= 0
                  ? `，剩余 ${warrantyInfo.remainingDays} 天`
                  : `，已过保 ${Math.abs(warrantyInfo.remainingDays)} 天`
                : ''}
              。过保后维修需自理，建议关注备件与官方售后。
            </Text>
          </View>
        )}

      {isUnredeemed && installmentPremium > 0 && (
        <View style={styles.bloodCard}>
          <Text style={styles.bloodTitle}>🩸 分期血本警示</Text>
          <View style={styles.bloodRow}>
            <View style={styles.bloodItem}>
              <Text style={styles.bloodLabel}>额外多花</Text>
              <Text style={styles.bloodValue}>{formatCurrency(installmentPremium)}</Text>
            </View>
            <View style={styles.bloodDivider} />
            <View style={styles.bloodItem}>
              <Text style={styles.bloodLabel}>真实年化利率</Text>
              <Text style={styles.bloodValue}>{installmentIRR.toFixed(1)}%</Text>
            </View>
          </View>
          <Text style={styles.bloodHint}>
            相比全款购买，选择分期会让你承担额外成本。
          </Text>
        </View>
      )}

      {!isUnredeemed && (
        <View style={styles.maintCard}>
          <View style={styles.maintHeader}>
            <Text style={styles.maintTitle}>🧰 维修 / 保养记录</Text>
            <TouchableOpacity
              style={styles.maintAddBtn}
              onPress={() => {
                setMaintDate(getTodayString());
                setMaintTitle('');
                setMaintCost('');
                setMaintDescription('');
                setMaintModalVisible(true);
              }}
              activeOpacity={0.75}
            >
              <Text style={styles.maintAddBtnText}>+ 新增</Text>
            </TouchableOpacity>
          </View>
          {maintenanceLogs.length > 0 && (
            <View style={styles.maintSummaryRow}>
              <Text style={styles.maintSummaryLabel}>累计维修</Text>
              <Text style={styles.maintSummaryValue}>
                {maintenanceLogs.length} 次 · {formatCurrency(maintenanceLogs.reduce((sum, log) => sum + log.cost, 0))}
              </Text>
              <Text style={styles.maintSummarySep}>|</Text>
              <Text style={styles.maintSummaryLabel}>真实持有成本</Text>
              <Text style={[styles.maintSummaryValue, { color: THEME.colors.dangerDark }]}>
                {formatCurrency(item.total_price + maintenanceLogs.reduce((sum, log) => sum + log.cost, 0))}
              </Text>
            </View>
          )}
          {maintenanceLogs.length === 0 ? (
            <Text style={styles.maintEmpty}>
              还没有维修记录。记录每次维修可帮助回顾真实持有成本。
            </Text>
          ) : (
            <View style={styles.maintList}>
              {maintenanceLogs.map(log => (
                <View key={log.id} style={styles.maintRow}>
                  <View style={styles.maintRowMain}>
                    <View style={styles.maintRowHeader}>
                      <Text style={styles.maintRowTitle} numberOfLines={1}>
                        {log.title}
                      </Text>
                      <Text style={styles.maintRowCost}>
                        {formatCurrency(log.cost)}
                      </Text>
                    </View>
                    <Text style={styles.maintRowMeta}>
                      {formatDate(log.log_date)}
                      {log.description ? ` · ${log.description}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.maintRowDelete}
                    onPress={() => handleDeleteMaintenance(log.id)}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.maintRowDeleteText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {!isUnredeemed && (
        <View style={styles.planCard}>
          <View style={styles.planHeader}>
            <Text style={styles.planTitle}>🔁 保养计划</Text>
            <TouchableOpacity
              style={styles.planAddBtn}
              onPress={() => {
                setPlanTitle('');
                setPlanInterval('');
                setPlanLastDate(getTodayString());
                setPlanModalVisible(true);
              }}
              activeOpacity={0.75}
            >
              <Text style={styles.planAddBtnText}>+ 新增</Text>
            </TouchableOpacity>
          </View>
          {maintenancePlans.length === 0 ? (
            <Text style={styles.planEmpty}>
              还没有保养计划。设定周期性保养可以提醒你按时维护资产。
            </Text>
          ) : (
            <View style={styles.planList}>
              {maintenancePlans.map(plan => {
                const today = getTodayString();
                const isDue =
                  plan.enabled === 1 &&
                  plan.next_due_date !== null &&
                  plan.next_due_date <= today;
                return (
                  <View
                    key={plan.id}
                    style={[
                      styles.planRow,
                      isDue && styles.planRowOverdue,
                    ]}
                  >
                    <View style={styles.planRowMain}>
                      <View style={styles.planRowHeader}>
                        <Text style={styles.planRowTitle} numberOfLines={1}>
                          {plan.title}
                        </Text>
                        <View
                          style={[
                            styles.planStatusBadge,
                            isDue ? styles.planStatusOverdue : styles.planStatusOk,
                          ]}
                        >
                          <Text style={styles.planStatusText}>
                            {plan.enabled === 1 ? (isDue ? '到期' : '正常') : '停用'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.planRowMeta}>
                        间隔 {plan.interval_days} 天 · 上次{' '}
                        {plan.last_done_date ? formatDate(plan.last_done_date) : '—'} · 下次{' '}
                        {plan.next_due_date ? formatDate(plan.next_due_date) : '—'}
                      </Text>
                    </View>
                    <View style={styles.planRowActions}>
                      <TouchableOpacity
                        style={styles.planDoneBtn}
                        onPress={() => handleCompletePlan(plan.id)}
                        disabled={planBusy}
                        activeOpacity={0.6}
                      >
                        <Text style={styles.planDoneBtnText}>完成</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.planDeleteBtn}
                        onPress={() => handleDeletePlan(plan.id)}
                        activeOpacity={0.6}
                      >
                        <Text style={styles.planDeleteBtnText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      <View style={styles.accessoryCard}>
        <View style={styles.accessoryHeader}>
          <Text style={styles.accessoryTitle}>🔌 配件列表</Text>
          <TouchableOpacity
            style={styles.accessoryAddBtn}
            onPress={openAddAccessoryModal}
            activeOpacity={0.75}
          >
            <Text style={styles.accessoryAddBtnText}>+ 新增</Text>
          </TouchableOpacity>
        </View>
        {accessories.length > 0 && (
          <Text style={styles.accessorySummary}>
            共 {accessories.length} 项 · 在用成本 {formatCurrency(accessoryTotalCost)}
          </Text>
        )}
        {accessories.length === 0 ? (
          <Text style={styles.accessoryEmpty}>
            还没有配件记录。添加配件可以更准确地计算资产总成本（手柄、充电器、键鼠等）。
          </Text>
        ) : (
          <View style={styles.accessoryList}>
            {accessories.map(acc => {
              const isLost = acc.status === 'lost';
              const isDamaged = acc.status === 'damaged';
              const lineTotal = acc.quantity * acc.unit_price;
              return (
                <View
                  key={acc.id}
                  style={[
                    styles.accessoryRow,
                    isLost && styles.accessoryRowLost,
                    isDamaged && styles.accessoryRowDamaged,
                  ]}
                >
                  <View style={styles.accessoryRowMain}>
                    <View style={styles.accessoryRowHeader}>
                      <Text
                        style={[
                          styles.accessoryRowName,
                          isLost && styles.accessoryRowNameDim,
                        ]}
                        numberOfLines={1}
                      >
                        {acc.name}
                        {acc.quantity > 1 ? ` ×${acc.quantity}` : ''}
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.accessoryStatusBadge,
                          isLost
                            ? styles.accessoryStatusLost
                            : isDamaged
                              ? styles.accessoryStatusDamaged
                              : styles.accessoryStatusInUse,
                        ]}
                        onPress={() => handleCycleAccessoryStatus(acc)}
                        activeOpacity={0.6}
                      >
                        <Text style={styles.accessoryStatusText}>
                          {isLost ? '丢失' : isDamaged ? '损坏' : '在用'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.accessoryRowMeta}>
                      单价 {acc.unit_price > 0 ? formatCurrency(acc.unit_price) : '—'}
                      {lineTotal > 0 && acc.quantity > 1 ? ` · 小计 ${formatCurrency(lineTotal)}` : ''}
                      {acc.buy_date ? ` · 购于 ${formatDate(acc.buy_date)}` : ''}
                    </Text>
                    {acc.notes ? (
                      <Text style={styles.accessoryRowNotes} numberOfLines={2}>
                        {acc.notes}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.accessoryRowActions}>
                    <TouchableOpacity
                      style={styles.accessoryEditBtn}
                      onPress={() => openEditAccessoryModal(acc)}
                      activeOpacity={0.6}
                    >
                      <Text style={styles.accessoryEditBtnText}>编辑</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.accessoryDeleteBtn}
                      onPress={() => handleDeleteAccessory(acc.id)}
                      activeOpacity={0.6}
                    >
                      <Text style={styles.accessoryDeleteBtnText}>×</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <BrutalButton
          title="📤 分享卡片"
          onPress={() => {
            const safeDailyCost = Number.isFinite(dailyCost) ? dailyCost : 0;
            const statusLabel = isUnredeemed
              ? '分期中'
              : isSold
                ? '已售出'
                : isPaused
                  ? '已停用'
                  : '在用';
            setShareData({
              kind: 'item',
              name: item.name,
              categoryIcon: icon,
              imageUri: imageUri,
              categoryName: category.name,
              dailyCost: safeDailyCost,
              totalPrice: effectiveTotalPrice,
              buyDate: item.buy_date,
              activeDays,
              realizedProfit: isProfitableSold ? realizedProfit : null,
              statusLabel,
              accessories: accessories.map(acc => ({
                name: acc.name,
                quantity: acc.quantity,
                unitPrice: acc.unit_price,
                status: acc.status,
              })),
            });
          }}
          variant="outline"
          size="md"
          style={styles.actionBtn}
        />

        <BrutalButton
          title="编辑"
          onPress={() => navigation.navigate('AddEditItem', { itemId: item.id })}
          variant="primary"
          size="md"
          style={styles.actionBtn}
        />

        {isUnredeemed && (
          <BrutalButton
            title="赎身 / 结清"
            onPress={handleRedeem}
            variant="accent"
            size="md"
            disabled={redeemBusy}
            style={styles.actionBtn}
          />
        )}

        {isActive && (
          <>
            <BrutalButton
              title="停用"
              onPress={() => {
                setPauseDate(getTodayString());
                setPauseModalVisible(true);
              }}
              variant="accent"
              size="md"
              style={styles.actionBtn}
            />
            <BrutalButton
              title="售出"
              onPress={() => {
                setSellDate(getTodayString());
                setSellPrice('');
                setSellModalVisible(true);
              }}
              variant="danger"
              size="md"
              style={styles.actionBtn}
            />
          </>
        )}

        {isPaused && (
          <BrutalButton
            title="恢复使用"
            onPress={() => {
              setResumeDate(getTodayString());
              setResumeModalVisible(true);
            }}
            variant="success"
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

      <Modal
        visible={redeemModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.redeemOverlay}>
          <Animated.View
            style={[
              styles.redeemBox,
              { transform: [{ translateX: redeemShakeX }, { scale: redeemScale }] },
            ]}
          >
            <Animated.Text style={[styles.redeemText, { color: redeemTextColor }]}>
              🔓 链锁破裂，赎身成功
            </Animated.Text>
          </Animated.View>
        </View>
      </Modal>

      <Modal visible={pauseModalVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>停用资产</Text>
            <Text style={styles.modalDesc}>
              停用后将暂停“激活天数”累计，并从首页“今日日均成本”统计中移除；之后可随时恢复使用。
            </Text>
            <DatePickerField
              label="停用日期"
              value={pauseDate}
              onChange={setPauseDate}
            />
            <View style={styles.modalActions}>
              <BrutalButton
                title="确认停用"
                onPress={handlePause}
                loading={statusBusy}
                variant="accent"
                size="md"
                style={styles.modalBtn}
              />
              <BrutalButton
                title="取消"
                onPress={() => setPauseModalVisible(false)}
                variant="outline"
                size="md"
                style={styles.modalBtn}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={resumeModalVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>恢复使用</Text>
            <Text style={styles.modalDesc}>
              恢复后将从所选日期开始继续累计“激活天数”，并重新计入首页统计。
            </Text>
            <DatePickerField
              label="恢复日期"
              value={resumeDate}
              onChange={setResumeDate}
            />
            <View style={styles.modalActions}>
              <BrutalButton
                title="确认恢复"
                onPress={handleResume}
                loading={statusBusy}
                variant="success"
                size="md"
                style={styles.modalBtn}
              />
              <BrutalButton
                title="取消"
                onPress={() => setResumeModalVisible(false)}
                variant="outline"
                size="md"
                style={styles.modalBtn}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={sellModalVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>售出资产</Text>
            <Text style={styles.modalDesc}>
              售出后不可恢复，将记录卖出日期与卖出价。若卖出价高于买入价，会按“已盈利”展示，不再显示负日均成本。
            </Text>
            <DatePickerField
              label="售出日期"
              value={sellDate}
              onChange={setSellDate}
            />
            <PixelInput
              label="卖出价 (¥)"
              value={sellPrice}
              onChangeText={setSellPrice}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />
            <View style={styles.modalActions}>
              <BrutalButton
                title="确认售出"
                onPress={handleSell}
                loading={statusBusy}
                variant="danger"
                size="md"
                style={styles.modalBtn}
              />
              <BrutalButton
                title="取消"
                onPress={() => setSellModalVisible(false)}
                variant="outline"
                size="md"
                style={styles.modalBtn}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={maintModalVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>新增维修 / 保养记录</Text>
            <Text style={styles.modalDesc}>
              记录每次维修或保养的成本，便于回看资产的真实持有开销。
            </Text>
            <PixelInput
              label="标题"
              value={maintTitle}
              onChangeText={setMaintTitle}
              placeholder="例如：换电池 / 屏幕维修"
            />
            <DatePickerField
              label="维修日期"
              value={maintDate}
              onChange={setMaintDate}
            />
            <PixelInput
              label="成本 (¥)"
              value={maintCost}
              onChangeText={setMaintCost}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />
            <PixelInput
              label="备注（可选）"
              value={maintDescription}
              onChangeText={setMaintDescription}
              placeholder="例如：官方售后 / 自费维修..."
              multiline
              style={styles.maintDescInput}
            />
            <View style={styles.modalActions}>
              <BrutalButton
                title="保存记录"
                onPress={handleAddMaintenance}
                loading={maintBusy}
                variant="primary"
                size="md"
                style={styles.modalBtn}
              />
              <BrutalButton
                title="取消"
                onPress={() => setMaintModalVisible(false)}
                variant="outline"
                size="md"
                style={styles.modalBtn}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={planModalVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>新增保养计划</Text>
            <Text style={styles.modalDesc}>
              设置周期性保养计划，到期会高亮提醒。点击"完成"会自动更新下次到期日。
            </Text>
            <PixelInput
              label="标题"
              value={planTitle}
              onChangeText={setPlanTitle}
              placeholder="例如：换机油 / 滤芯清洁"
            />
            <PixelInput
              label="间隔天数"
              value={planInterval}
              onChangeText={setPlanInterval}
              placeholder="例如：90"
              keyboardType="decimal-pad"
            />
            <DatePickerField
              label="上次完成日"
              value={planLastDate}
              onChange={setPlanLastDate}
            />
            <View style={styles.modalActions}>
              <BrutalButton
                title="保存计划"
                onPress={handleAddPlan}
                loading={planBusy}
                variant="primary"
                size="md"
                style={styles.modalBtn}
              />
              <BrutalButton
                title="取消"
                onPress={() => setPlanModalVisible(false)}
                variant="outline"
                size="md"
                style={styles.modalBtn}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={accModalVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              {accEditingId !== null ? '编辑配件' : '新增配件'}
            </Text>
            <Text style={styles.modalDesc}>
              记录资产的配件信息（手柄、遥控器、充电线等），便于核算真实持有成本。
            </Text>
            <PixelInput
              label="名称"
              value={accName}
              onChangeText={setAccName}
              placeholder="例如：手柄 / 充电器 / 收纳盒"
            />
            <PixelInput
              label="数量"
              value={accQuantity}
              onChangeText={setAccQuantity}
              placeholder="1"
              keyboardType="decimal-pad"
            />
            <PixelInput
              label="单价（可选）"
              value={accUnitPrice}
              onChangeText={setAccUnitPrice}
              placeholder="0"
              keyboardType="decimal-pad"
            />
            <DatePickerField
              label="购买日期（可选）"
              value={accBuyDate}
              onChange={setAccBuyDate}
            />
            <Text style={styles.modalFieldLabel}>状态</Text>
            <View style={styles.accessoryStatusPicker}>
              {(['in_use', 'damaged', 'lost'] as AccessoryStatus[]).map(s => {
                const active = accStatus === s;
                const label = s === 'in_use' ? '在用' : s === 'damaged' ? '损坏' : '丢失';
                return (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.accessoryStatusPickerItem,
                      active && (
                        s === 'in_use'
                          ? styles.accessoryStatusInUse
                          : s === 'damaged'
                            ? styles.accessoryStatusDamaged
                            : styles.accessoryStatusLost
                      ),
                    ]}
                    onPress={() => setAccStatus(s)}
                    activeOpacity={0.6}
                  >
                    <Text
                      style={[
                        styles.accessoryStatusPickerText,
                        active && styles.accessoryStatusPickerTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <PixelInput
              label="备注（可选）"
              value={accNotes}
              onChangeText={setAccNotes}
              placeholder="例如：第二个手柄 / 已划痕"
              multiline
              style={styles.maintDescInput}
            />
            <View style={styles.modalActions}>
              <BrutalButton
                title={accEditingId !== null ? '保存修改' : '添加配件'}
                onPress={handleSaveAccessory}
                loading={accBusy}
                variant="primary"
                size="md"
                style={styles.modalBtn}
              />
              <BrutalButton
                title="取消"
                onPress={() => setAccModalVisible(false)}
                variant="outline"
                size="md"
                style={styles.modalBtn}
              />
            </View>
          </View>
        </View>
      </Modal>

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
  notesRow: {
    paddingVertical: THEME.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  notesValue: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textPrimary,
    marginTop: THEME.spacing.xs,
    lineHeight: 20,
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
    backgroundColor: THEME.colors.primaryLight + '30',
    borderWidth: 1.5,
    borderColor: THEME.colors.borderDark,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: THEME.spacing.md,
  },
  headerInfo: {
    flex: 1,
  },
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
    backgroundColor: THEME.colors.primary,
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
  bloodCard: {
    borderWidth: 2,
    borderColor: THEME.colors.danger,
    borderRadius: THEME.borderRadius,
    backgroundColor: THEME.colors.dangerBg,
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.lg,
  },
  bloodTitle: {
    fontSize: THEME.fontSize.md,
    fontWeight: '900',
    color: THEME.colors.dangerDark,
    marginBottom: THEME.spacing.md,
  },
  bloodRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: THEME.spacing.md,
  },
  bloodItem: {
    flex: 1,
  },
  bloodLabel: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textSecondary,
    marginBottom: 4,
  },
  bloodValue: {
    fontSize: THEME.fontSize.lg,
    fontWeight: '800',
    color: THEME.colors.dangerDark,
  },
  bloodDivider: {
    width: 1,
    backgroundColor: THEME.colors.danger,
    marginHorizontal: THEME.spacing.md,
  },
  bloodHint: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
  },
  actions: {
    gap: THEME.spacing.md,
  },
  actionBtn: {
    width: '100%',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  redeemOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: THEME.spacing.xl,
  },
  redeemBox: {
    backgroundColor: THEME.colors.surface,
    ...THEME.pixelBorder,
    ...THEME.pixelShadow,
    paddingVertical: THEME.spacing.xl,
    paddingHorizontal: THEME.spacing.xl,
    alignItems: 'center',
  },
  redeemText: {
    fontSize: THEME.fontSize.lg,
    fontWeight: '900',
    textAlign: 'center',
  },
  modal: {
    width: '88%',
    backgroundColor: THEME.colors.surface,
    ...THEME.pixelBorder,
    ...THEME.pixelShadow,
    padding: THEME.spacing.xl,
  },
  modalTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: THEME.spacing.sm,
  },
  modalDesc: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.lg,
    lineHeight: 20,
  },
  modalActions: {
    gap: THEME.spacing.sm,
  },
  modalBtn: {
    width: '100%',
  },
  serviceCard: {
    marginTop: THEME.spacing.md,
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius,
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    backgroundColor: THEME.colors.surface,
  },
  serviceTitle: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: THEME.spacing.sm,
  },
  serviceHint: {
    marginTop: THEME.spacing.sm,
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
  },
  depHistoryCard: {
    marginTop: THEME.spacing.md,
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius,
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    backgroundColor: THEME.colors.surface,
  },
  depHistoryTitle: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
    marginBottom: 2,
  },
  depHistorySubTitle: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.md,
  },
  depHistoryChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 110,
    paddingHorizontal: 2,
    marginBottom: THEME.spacing.xs,
  },
  depHistoryBarColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
    marginHorizontal: 1,
    gap: 4,
  },
  depHistoryBarTrack: {
    width: '85%',
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: THEME.colors.background,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  depHistoryBarFill: {
    width: '100%',
    borderRadius: 2,
  },
  depHistoryBarLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  depHistoryLegendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: THEME.spacing.md,
    marginBottom: THEME.spacing.xs,
  },
  depHistoryLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trendDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: THEME.colors.borderDark,
  },
  depHistoryLegendText: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  depHistoryHint: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textSecondary,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: THEME.spacing.xs,
  },
  healthSection: {
    marginTop: THEME.spacing.md,
    paddingTop: THEME.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
  },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
    flexWrap: 'wrap',
  },
  healthRowLabel: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textSecondary,
    fontWeight: '700',
  },
  healthRowHint: {
    fontSize: 10,
    color: THEME.colors.textLight,
    flex: 1,
    minWidth: 120,
  },
  healthChevron: {
    fontSize: 10,
    fontWeight: '900',
    color: THEME.colors.primary,
    marginLeft: 'auto',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderWidth: 1.5,
    borderColor: THEME.colors.primary,
    borderRadius: 4,
    backgroundColor: THEME.colors.primaryLight + '20',
    overflow: 'hidden',
  },
  healthDetails: {
    marginTop: THEME.spacing.sm,
    gap: THEME.spacing.sm,
  },
  healthBreakdownRow: {
    backgroundColor: THEME.colors.background,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    borderRadius: 4,
    padding: THEME.spacing.sm,
  },
  healthBreakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  healthBreakdownLabel: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  healthBreakdownScore: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '900',
    color: THEME.colors.textSecondary,
    fontFamily: THEME.fontFamily.pixel,
  },
  healthBarTrack: {
    height: 6,
    backgroundColor: THEME.colors.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  healthBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  healthBreakdownHint: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    lineHeight: 14,
  },
  healthTipBox: {
    marginTop: THEME.spacing.xs,
    padding: THEME.spacing.sm,
    backgroundColor: THEME.colors.primaryLight + '18',
    borderLeftWidth: 3,
    borderLeftColor: THEME.colors.primary,
    borderRadius: 4,
  },
  healthTipTitle: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '900',
    color: THEME.colors.primaryDark,
    marginBottom: 4,
  },
  healthTipText: {
    fontSize: 10,
    color: THEME.colors.textPrimary,
    lineHeight: 15,
  },
  warrantyCard: {
    marginTop: THEME.spacing.md,
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius,
    borderWidth: 2,
  },
  warrantyTitle: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: THEME.spacing.xs,
  },
  warrantyHint: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textPrimary,
    lineHeight: 18,
  },
  maintCard: {
    backgroundColor: THEME.colors.surface,
    ...THEME.pixelBorder,
    ...THEME.pixelShadow,
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.lg,
  },
  maintHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: THEME.spacing.sm,
  },
  maintTitle: {
    fontSize: THEME.fontSize.md,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  maintAddBtn: {
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    borderWidth: 1.5,
    borderColor: THEME.colors.primary,
    borderRadius: 4,
    backgroundColor: THEME.colors.primaryLight + '20',
  },
  maintAddBtnText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '800',
    color: THEME.colors.primaryDark,
  },
  maintSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    paddingVertical: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.md,
    backgroundColor: THEME.colors.background,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    borderRadius: THEME.borderRadius,
    marginBottom: THEME.spacing.sm,
  },
  maintSummaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  maintSummaryValue: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  maintSummarySep: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '900',
    color: THEME.colors.textLight,
    marginHorizontal: 4,
  },
  maintEmpty: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
  },
  maintList: {
    gap: THEME.spacing.xs,
  },
  maintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.sm,
    backgroundColor: THEME.colors.background,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: 4,
  },
  maintRowMain: {
    flex: 1,
    minWidth: 0,
  },
  maintRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  maintRowTitle: {
    flex: 1,
    fontSize: THEME.fontSize.sm,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginRight: THEME.spacing.sm,
  },
  maintRowCost: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '800',
    color: THEME.colors.dangerDark,
  },
  maintRowMeta: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
  },
  maintRowDelete: {
    width: 28,
    height: 28,
    marginLeft: THEME.spacing.sm,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  maintRowDeleteText: {
    fontSize: 16,
    fontWeight: '900',
    color: THEME.colors.dangerDark,
    lineHeight: 18,
  },
  maintDescInput: {
    marginBottom: THEME.spacing.md,
  },
  modalFieldLabel: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: THEME.spacing.xs,
    marginTop: THEME.spacing.xs,
  },
  planCard: {
    backgroundColor: THEME.colors.surface,
    ...THEME.pixelBorder,
    ...THEME.pixelShadow,
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.lg,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: THEME.spacing.sm,
  },
  planTitle: {
    fontSize: THEME.fontSize.md,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  planAddBtn: {
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    borderWidth: 1.5,
    borderColor: THEME.colors.primary,
    borderRadius: 4,
    backgroundColor: THEME.colors.primaryLight + '20',
  },
  planAddBtnText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '800',
    color: THEME.colors.primaryDark,
  },
  planEmpty: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
  },
  planList: {
    gap: THEME.spacing.xs,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.sm,
    backgroundColor: THEME.colors.background,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: 4,
  },
  planRowOverdue: {
    borderWidth: 2,
    borderColor: THEME.colors.danger,
    backgroundColor: THEME.colors.dangerBg,
  },
  planRowMain: {
    flex: 1,
    minWidth: 0,
  },
  planRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
    gap: THEME.spacing.xs,
  },
  planRowTitle: {
    flex: 1,
    fontSize: THEME.fontSize.sm,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginRight: THEME.spacing.sm,
  },
  planStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 1,
  },
  planStatusOk: {
    backgroundColor: THEME.colors.successBg,
    borderColor: THEME.colors.success,
  },
  planStatusOverdue: {
    backgroundColor: THEME.colors.dangerBg,
    borderColor: THEME.colors.danger,
  },
  planStatusText: {
    fontSize: 10,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  planRowMeta: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
  },
  planRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: THEME.spacing.sm,
    gap: THEME.spacing.xs,
  },
  planDoneBtn: {
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    borderWidth: 1.5,
    borderColor: THEME.colors.success,
    borderRadius: 4,
    backgroundColor: THEME.colors.successBg,
  },
  planDoneBtnText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '800',
    color: THEME.colors.success,
  },
  planDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planDeleteBtnText: {
    fontSize: 16,
    fontWeight: '900',
    color: THEME.colors.dangerDark,
    lineHeight: 18,
  },
  accessoryCard: {
    backgroundColor: THEME.colors.surface,
    ...THEME.pixelBorder,
    ...THEME.pixelShadow,
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.lg,
  },
  accessoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: THEME.spacing.xs,
  },
  accessoryTitle: {
    fontSize: THEME.fontSize.md,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  accessoryAddBtn: {
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    borderWidth: 1.5,
    borderColor: THEME.colors.primary,
    borderRadius: 4,
    backgroundColor: THEME.colors.primaryLight + '20',
  },
  accessoryAddBtnText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '800',
    color: THEME.colors.primaryDark,
  },
  accessorySummary: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.sm,
  },
  accessoryEmpty: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
  },
  accessoryList: {
    gap: THEME.spacing.xs,
  },
  accessoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.sm,
    backgroundColor: THEME.colors.background,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: 4,
  },
  accessoryRowLost: {
    borderWidth: 1,
    borderColor: THEME.colors.danger,
    backgroundColor: THEME.colors.dangerBg,
    opacity: 0.75,
  },
  accessoryRowDamaged: {
    borderWidth: 1.5,
    borderColor: THEME.colors.warning,
    backgroundColor: THEME.colors.warningBg,
  },
  accessoryRowMain: {
    flex: 1,
    minWidth: 0,
  },
  accessoryRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
    gap: THEME.spacing.xs,
  },
  accessoryRowName: {
    flex: 1,
    fontSize: THEME.fontSize.sm,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginRight: THEME.spacing.sm,
  },
  accessoryRowNameDim: {
    textDecorationLine: 'line-through',
    color: THEME.colors.textSecondary,
  },
  accessoryStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 1,
  },
  accessoryStatusInUse: {
    backgroundColor: THEME.colors.successBg,
    borderColor: THEME.colors.success,
  },
  accessoryStatusDamaged: {
    backgroundColor: THEME.colors.warningBg,
    borderColor: THEME.colors.warning,
  },
  accessoryStatusLost: {
    backgroundColor: THEME.colors.dangerBg,
    borderColor: THEME.colors.danger,
  },
  accessoryStatusText: {
    fontSize: 10,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  accessoryRowMeta: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
  },
  accessoryRowNotes: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    marginTop: 2,
    fontStyle: 'italic',
  },
  accessoryRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: THEME.spacing.sm,
    gap: THEME.spacing.xs,
  },
  accessoryEditBtn: {
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    borderWidth: 1.5,
    borderColor: THEME.colors.primary,
    borderRadius: 4,
    backgroundColor: THEME.colors.primaryLight + '20',
  },
  accessoryEditBtnText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '800',
    color: THEME.colors.primaryDark,
  },
  accessoryDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accessoryDeleteBtnText: {
    fontSize: 16,
    fontWeight: '900',
    color: THEME.colors.dangerDark,
    lineHeight: 18,
  },
  accessoryStatusPicker: {
    flexDirection: 'row',
    gap: THEME.spacing.xs,
    marginBottom: THEME.spacing.md,
  },
  accessoryStatusPickerItem: {
    flex: 1,
    paddingVertical: THEME.spacing.sm,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.background,
    alignItems: 'center',
  },
  accessoryStatusPickerText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  accessoryStatusPickerTextActive: {
    color: THEME.colors.textPrimary,
  },
});
