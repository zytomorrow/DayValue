import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type {
  Accessory,
  MaintenanceLog,
  MaintenancePlan,
  RootStackParamList,
  OneTimeItem,
  Subscription,
  StoredCard,
} from '../types';
import {
  getAllOneTimeItems,
  getAllSubscriptions,
  getAllStoredCards,
  getAllMaintenanceLogs,
  getAllActiveMaintenancePlans,
  getAllAccessories,
  getPreference,
  setPreference,
  redeemOneTimeItem,
} from '../database';
import { generateSuggestions, type Suggestion } from '../utils/suggestions';
import {
  calculateDailyCost,
  calculateSubscriptionDailyCost,
  calculateDailyDebt,
  calculateStoredPrincipal,
  calculateRealizedProfit,
  calculateOneTimeItemActiveDays,
  calculateNetAssetValue,
  calculateWarrantyInfo,
  calculateSubscriptionNextRenewalDate,
  calculateDaysUntil,
  calculateDaysSince,
  calculateMonthlySpendingTrend,
  collectExpiryReminders,
  collectSubscriptionRenewalReminders,
  isProfitableSale,
  type WarrantyStatus,
} from '../utils/calculations';
import { formatCurrency } from '../utils/formatters';
import { THEME } from '../utils/constants';
import { useCategories } from '../contexts/CategoriesContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  ItemCard,
  SubscriptionCard,
  EmptyState,
  BrutalButton,
  StoredCardCard,
  AppBottomSheet,
  AssetCategorySheet,
  AssetSectionToolbar,
  AssetGroupedList,
  DashboardHeroHeader,
  ShareModal,
  SearchBar,
} from '../components';
import type { AssetStatusCounts, ShareCardData, ShareItemEntry, ShareAccessoryEntry } from '../components';
import { alertConfirm, alertError, alertSuccess } from '../utils/pixelAlert';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

type TabKey = 'assets' | 'debts' | 'stored_cards';
type ItemSortField = 'buy_date' | 'total_price';
type DebtSortField = 'daily_cost' | 'date';
type StoredCardSortField = 'principal' | 'last_updated_date';
type SortDirection = 'desc' | 'asc';
type LayoutMode = 'list' | 'grid';

type DashboardChrome = {
  backgroundColor: string;
  borderColor: string;
  subtitleColor?: string;
  costColor?: string;
  hintColor?: string;
};

type SortSheetConfig = {
  title: string;
  fields: { value: string; label: string }[];
  currentField: string;
  currentDirection: SortDirection;
  onSelectField: (value: string) => void;
  onSelectDirection: (value: SortDirection) => void;
};

type SectionToolbarProps = {
  title: string;
  sortSummary: string;
  layoutMode: LayoutMode;
  onPressSort: () => void;
  onToggleLayout: () => void;
};

const ASSET_SORT_FIELD_KEY = 'asset_sort_field';
const ASSET_SORT_DIRECTION_KEY = 'asset_sort_direction';
const ASSET_LAYOUT_MODE_KEY = 'asset_layout_mode';
const ASSET_GROUPED_KEY = 'asset_grouped';
const DEBT_SORT_FIELD_KEY = 'debt_sort_field';
const DEBT_SORT_DIRECTION_KEY = 'debt_sort_direction';
const DEBT_LAYOUT_MODE_KEY = 'debt_layout_mode';
const STORED_CARD_SORT_FIELD_KEY = 'stored_card_sort_field';
const STORED_CARD_SORT_DIRECTION_KEY = 'stored_card_sort_direction';
const STORED_CARD_LAYOUT_MODE_KEY = 'stored_card_layout_mode';
/** 与 SettingsScreen 中的 REMINDER_ENABLED_KEY 保持一致 */
const REMINDER_ENABLED_KEY = 'reminder_enabled';
/** 与 SettingsScreen 中的 MONTHLY_BUDGET_KEY 保持一致 */
const MONTHLY_BUDGET_KEY = 'monthly_budget';

function chunkItems<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

function compareValues(primaryDiff: number, fallbackDiff: number): number {
  if (primaryDiff !== 0) return primaryDiff;
  return fallbackDiff;
}

function sortOneTimeItems(
  items: OneTimeItem[],
  field: ItemSortField,
  direction: SortDirection,
): OneTimeItem[] {
  const factor = direction === 'asc' ? 1 : -1;

  return [...items].sort((a, b) => {
    if (field === 'total_price') {
      return compareValues(
        (a.total_price - b.total_price) * factor,
        (a.id - b.id) * -1,
      );
    }

    return compareValues(
      a.buy_date.localeCompare(b.buy_date) * factor,
      (a.id - b.id) * -1,
    );
  });
}

function sortDebtItems(
  items: OneTimeItem[],
  field: DebtSortField,
  direction: SortDirection,
): OneTimeItem[] {
  const factor = direction === 'asc' ? 1 : -1;

  return [...items].sort((a, b) => {
    if (field === 'daily_cost') {
      return compareValues(
        (calculateDailyDebt(a.monthly_payment ?? 0) - calculateDailyDebt(b.monthly_payment ?? 0)) * factor,
        (a.id - b.id) * -1,
      );
    }

    return compareValues(
      a.buy_date.localeCompare(b.buy_date) * factor,
      (a.id - b.id) * -1,
    );
  });
}

function sortSubscriptions(
  items: Subscription[],
  field: DebtSortField,
  direction: SortDirection,
): Subscription[] {
  const factor = direction === 'asc' ? 1 : -1;

  return [...items].sort((a, b) => {
    if (field === 'daily_cost') {
      return compareValues(
        (
          calculateSubscriptionDailyCost(a.cycle_price, a.billing_cycle) -
          calculateSubscriptionDailyCost(b.cycle_price, b.billing_cycle)
        ) * factor,
        (a.id - b.id) * -1,
      );
    }

    return compareValues(
      a.start_date.localeCompare(b.start_date) * factor,
      (a.id - b.id) * -1,
    );
  });
}

function sortStoredCards(
  items: StoredCard[],
  field: StoredCardSortField,
  direction: SortDirection,
): StoredCard[] {
  const factor = direction === 'asc' ? 1 : -1;

  return [...items].sort((a, b) => {
    if (field === 'principal') {
      return compareValues(
        (
          calculateStoredPrincipal(a.actual_paid, a.face_value, a.current_balance) -
          calculateStoredPrincipal(b.actual_paid, b.face_value, b.current_balance)
        ) * factor,
        (a.id - b.id) * -1,
      );
    }

    return compareValues(
      a.last_updated_date.localeCompare(b.last_updated_date) * factor,
      (a.id - b.id) * -1,
    );
  });
}

function getSortSummary(label: string, direction: SortDirection): string {
  return `${label} ${direction === 'desc' ? '↓' : '↑'}`;
}

function SectionToolbar({
  title,
  sortSummary,
  layoutMode,
  onPressSort,
  onToggleLayout,
}: SectionToolbarProps) {
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);
  return (
    <View style={styles.sectionToolbar}>
      <Text style={styles.sectionToolbarTitle} numberOfLines={1}>
        {title}
      </Text>
      <TouchableOpacity
        style={styles.sortTriggerButton}
        onPress={onPressSort}
        activeOpacity={0.75}
      >
        <Text style={styles.sortTriggerText} numberOfLines={1}>
          {sortSummary}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.layoutIconButton}
        onPress={onToggleLayout}
        activeOpacity={0.75}
      >
        <Text style={styles.layoutIconText}>{layoutMode === 'list' ? '⊞' : '≡'}</Text>
      </TouchableOpacity>
    </View>
  );
}

export function DashboardScreen({ navigation }: Props) {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { itemCategories, getCategoryInfo } = useCategories();
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);

  function renderGridRows<T>(
    items: T[],
    keyPrefix: string,
    renderCard: (item: T) => React.ReactElement,
  ) {
    return chunkItems(items, 2).map((rowItems, rowIndex) => (
      <View key={`${keyPrefix}-${rowIndex}`} style={styles.gridRow}>
        {rowItems.map(item => renderCard(item))}
        {rowItems.length === 1 && <View style={styles.gridCardPlaceholder} />}
      </View>
    ));
  }

  const [activeTab, setActiveTab] = useState<TabKey>('assets');
  const [items, setItems] = useState<OneTimeItem[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [storedCards, setStoredCards] = useState<StoredCard[]>([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLog[]>([]);
  const [maintenancePlans, setMaintenancePlans] = useState<MaintenancePlan[]>([]);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [helpModalVisible, setHelpModalVisible] = useState(false);
  const [shareData, setShareData] = useState<ShareCardData | null>(null);
  const [sortSheetTarget, setSortSheetTarget] = useState<TabKey | null>(null);
  const [selectedAssetCategoryId, setSelectedAssetCategoryId] = useState<string | null>(null);
  const [assetFilterSheetVisible, setAssetFilterSheetVisible] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showArchivedCards, setShowArchivedCards] = useState(false);
  const [assetSearch, setAssetSearch] = useState('');
  const [debtSearch, setDebtSearch] = useState('');
  const [storedCardSearch, setStoredCardSearch] = useState('');
  const [warrantyFilter, setWarrantyFilter] = useState<WarrantyStatus | null>(null);
  // 资产 Tab 工具区（搜索/保修筛选/排序布局）默认折叠，点击展开
  const [assetToolsExpanded, setAssetToolsExpanded] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [monthlyBudget, setMonthlyBudget] = useState<number | null>(null);

  const [itemSortField, setItemSortField] = useState<ItemSortField>('buy_date');
  const [itemSortDirection, setItemSortDirection] = useState<SortDirection>('desc');
  const [assetLayoutMode, setAssetLayoutMode] = useState<LayoutMode>('list');
  const [assetGrouped, setAssetGrouped] = useState(false);

  const [debtSortField, setDebtSortField] = useState<DebtSortField>('daily_cost');
  const [debtSortDirection, setDebtSortDirection] = useState<SortDirection>('desc');
  const [debtLayoutMode, setDebtLayoutMode] = useState<LayoutMode>('list');

  const [storedCardSortField, setStoredCardSortField] = useState<StoredCardSortField>('principal');
  const [storedCardSortDirection, setStoredCardSortDirection] = useState<SortDirection>('desc');
  const [storedCardLayoutMode, setStoredCardLayoutMode] = useState<LayoutMode>('list');

  const loadData = useCallback(async () => {
    try {
      const [nextItems, nextSubscriptions, nextStoredCards, nextLogs, nextPlans, nextAccessories] = await Promise.all([
        getAllOneTimeItems(db),
        getAllSubscriptions(db),
        getAllStoredCards(db),
        getAllMaintenanceLogs(db),
        getAllActiveMaintenancePlans(db),
        getAllAccessories(db),
      ]);
      setItems(nextItems);
      setSubscriptions(nextSubscriptions);
      setStoredCards(nextStoredCards);
      setMaintenanceLogs(nextLogs);
      setMaintenancePlans(nextPlans);
      setAccessories(nextAccessories);
    } catch (error) {
      console.error('加载首页数据失败', error);
    }
  }, [db]);

  const loadPreferences = useCallback(async () => {
    try {
      const [
        assetFieldValue,
        assetDirectionValue,
        assetLayoutValue,
        assetGroupedValue,
        debtFieldValue,
        debtDirectionValue,
        debtLayoutValue,
        storedFieldValue,
        storedDirectionValue,
        storedLayoutValue,
        reminderEnabledValue,
        monthlyBudgetValue,
      ] = await Promise.all([
        getPreference(db, ASSET_SORT_FIELD_KEY),
        getPreference(db, ASSET_SORT_DIRECTION_KEY),
        getPreference(db, ASSET_LAYOUT_MODE_KEY),
        getPreference(db, ASSET_GROUPED_KEY),
        getPreference(db, DEBT_SORT_FIELD_KEY),
        getPreference(db, DEBT_SORT_DIRECTION_KEY),
        getPreference(db, DEBT_LAYOUT_MODE_KEY),
        getPreference(db, STORED_CARD_SORT_FIELD_KEY),
        getPreference(db, STORED_CARD_SORT_DIRECTION_KEY),
        getPreference(db, STORED_CARD_LAYOUT_MODE_KEY),
        getPreference(db, REMINDER_ENABLED_KEY),
        getPreference(db, MONTHLY_BUDGET_KEY),
      ]);

      if (assetFieldValue === 'buy_date' || assetFieldValue === 'total_price') {
        setItemSortField(assetFieldValue);
      }
      if (assetDirectionValue === 'asc' || assetDirectionValue === 'desc') {
        setItemSortDirection(assetDirectionValue);
      }
      if (assetLayoutValue === 'list' || assetLayoutValue === 'grid') {
        setAssetLayoutMode(assetLayoutValue);
      }
      setAssetGrouped(assetGroupedValue === '1');

      if (debtFieldValue === 'daily_cost' || debtFieldValue === 'date') {
        setDebtSortField(debtFieldValue);
      }
      if (debtDirectionValue === 'asc' || debtDirectionValue === 'desc') {
        setDebtSortDirection(debtDirectionValue);
      }
      if (debtLayoutValue === 'list' || debtLayoutValue === 'grid') {
        setDebtLayoutMode(debtLayoutValue);
      }

      if (storedFieldValue === 'principal' || storedFieldValue === 'last_updated_date') {
        setStoredCardSortField(storedFieldValue);
      }
      if (storedDirectionValue === 'asc' || storedDirectionValue === 'desc') {
        setStoredCardSortDirection(storedDirectionValue);
      }
      if (storedLayoutValue === 'list' || storedLayoutValue === 'grid') {
        setStoredCardLayoutMode(storedLayoutValue);
      }
      if (reminderEnabledValue !== null) {
        setReminderEnabled(reminderEnabledValue === '1');
      }
      const budgetNum = parseFloat(monthlyBudgetValue ?? '');
      setMonthlyBudget(Number.isFinite(budgetNum) && budgetNum > 0 ? budgetNum : null);
    } catch (error) {
      console.error('加载首页偏好失败', error);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
      void loadPreferences();
      return () => {
        setSelectedAssetCategoryId(null);
        setAssetFilterSheetVisible(false);
      };
    }, [loadData, loadPreferences]),
  );

  useEffect(() => {
    if (
      selectedAssetCategoryId !== null &&
      !itemCategories.some(category => category.id === selectedAssetCategoryId)
    ) {
      setSelectedAssetCategoryId(null);
    }
  }, [itemCategories, selectedAssetCategoryId]);

  const persistPreference = useCallback((key: string, value: string) => {
    void setPreference(db, key, value).catch(error => {
      console.error('保存首页偏好失败', error);
    });
  }, [db]);

  const updateItemSortField = useCallback((nextField: ItemSortField) => {
    setItemSortField(nextField);
    persistPreference(ASSET_SORT_FIELD_KEY, nextField);
  }, [persistPreference]);

  const updateItemSortDirection = useCallback((nextDirection: SortDirection) => {
    setItemSortDirection(nextDirection);
    persistPreference(ASSET_SORT_DIRECTION_KEY, nextDirection);
  }, [persistPreference]);

  const updateAssetLayoutMode = useCallback((nextMode: LayoutMode) => {
    setAssetLayoutMode(nextMode);
    persistPreference(ASSET_LAYOUT_MODE_KEY, nextMode);
  }, [persistPreference]);

  const updateAssetGrouped = useCallback((nextGrouped: boolean) => {
    setAssetGrouped(nextGrouped);
    persistPreference(ASSET_GROUPED_KEY, nextGrouped ? '1' : '0');
  }, [persistPreference]);

  const updateDebtSortField = useCallback((nextField: DebtSortField) => {
    setDebtSortField(nextField);
    persistPreference(DEBT_SORT_FIELD_KEY, nextField);
  }, [persistPreference]);

  const updateDebtSortDirection = useCallback((nextDirection: SortDirection) => {
    setDebtSortDirection(nextDirection);
    persistPreference(DEBT_SORT_DIRECTION_KEY, nextDirection);
  }, [persistPreference]);

  const updateDebtLayoutMode = useCallback((nextMode: LayoutMode) => {
    setDebtLayoutMode(nextMode);
    persistPreference(DEBT_LAYOUT_MODE_KEY, nextMode);
  }, [persistPreference]);

  const updateStoredCardSortField = useCallback((nextField: StoredCardSortField) => {
    setStoredCardSortField(nextField);
    persistPreference(STORED_CARD_SORT_FIELD_KEY, nextField);
  }, [persistPreference]);

  const updateStoredCardSortDirection = useCallback((nextDirection: SortDirection) => {
    setStoredCardSortDirection(nextDirection);
    persistPreference(STORED_CARD_SORT_DIRECTION_KEY, nextDirection);
  }, [persistPreference]);

  const updateStoredCardLayoutMode = useCallback((nextMode: LayoutMode) => {
    setStoredCardLayoutMode(nextMode);
    persistPreference(STORED_CARD_LAYOUT_MODE_KEY, nextMode);
  }, [persistPreference]);

  const toggleAssetLayoutMode = useCallback(() => {
    updateAssetLayoutMode(assetLayoutMode === 'list' ? 'grid' : 'list');
  }, [assetLayoutMode, updateAssetLayoutMode]);

  const toggleAssetGrouped = useCallback(() => {
    updateAssetGrouped(!assetGrouped);
  }, [assetGrouped, updateAssetGrouped]);

  const toggleDebtLayoutMode = useCallback(() => {
    updateDebtLayoutMode(debtLayoutMode === 'list' ? 'grid' : 'list');
  }, [debtLayoutMode, updateDebtLayoutMode]);

  const toggleStoredCardLayoutMode = useCallback(() => {
    updateStoredCardLayoutMode(storedCardLayoutMode === 'list' ? 'grid' : 'list');
  }, [storedCardLayoutMode, updateStoredCardLayoutMode]);

  const activeItems = useMemo(() => items.filter(item => item.status === 'active'), [items]);
  const archivedItems = useMemo(() => items.filter(item => item.status === 'archived'), [items]);
  const unredeemedItems = useMemo(() => items.filter(item => item.status === 'unredeemed'), [items]);
  const activeSubscriptions = useMemo(
    () => subscriptions.filter(subscription => subscription.status === 'active'),
    [subscriptions],
  );
  const activeStoredCards = useMemo(
    () => storedCards.filter(card => card.status === 'active'),
    [storedCards],
  );
  const archivedStoredCards = useMemo(
    () => storedCards.filter(card => card.status === 'archived'),
    [storedCards],
  );

  const sortedActiveItems = useMemo(
    () => sortOneTimeItems(activeItems, itemSortField, itemSortDirection),
    [activeItems, itemSortDirection, itemSortField],
  );
  const sortedArchivedItems = useMemo(
    () => sortOneTimeItems(archivedItems, itemSortField, itemSortDirection),
    [archivedItems, itemSortDirection, itemSortField],
  );
  const sortedDebtItems = useMemo(
    () => sortDebtItems(unredeemedItems, debtSortField, debtSortDirection),
    [debtSortDirection, debtSortField, unredeemedItems],
  );
  const sortedActiveSubscriptions = useMemo(
    () => sortSubscriptions(activeSubscriptions, debtSortField, debtSortDirection),
    [activeSubscriptions, debtSortDirection, debtSortField],
  );
  const sortedActiveStoredCards = useMemo(
    () => sortStoredCards(activeStoredCards, storedCardSortField, storedCardSortDirection),
    [activeStoredCards, storedCardSortDirection, storedCardSortField],
  );
  const sortedArchivedStoredCards = useMemo(
    () => sortStoredCards(archivedStoredCards, storedCardSortField, storedCardSortDirection),
    [archivedStoredCards, storedCardSortDirection, storedCardSortField],
  );

  const matchesSelectedAssetCategory = useCallback((item: OneTimeItem) => {
    if (selectedAssetCategoryId === null) {
      return true;
    }

    return (item.category ?? 'other') === selectedAssetCategoryId;
  }, [selectedAssetCategoryId]);

  const matchesAssetSearch = useCallback(
    (item: OneTimeItem) => {
      const query = assetSearch.trim().toLowerCase();
      if (!query) return true;
      return item.name.toLowerCase().includes(query);
    },
    [assetSearch],
  );

  const matchesWarrantyFilter = useCallback(
    (item: OneTimeItem) => {
      if (warrantyFilter === null) return true;
      // 已归档资产不参与保修筛选
      if (item.status === 'archived') return false;
      const info = calculateWarrantyInfo(item);
      return info.status === warrantyFilter;
    },
    [warrantyFilter],
  );

  const matchesDebtSearch = useCallback(
    (item: OneTimeItem | Subscription) => {
      const query = debtSearch.trim().toLowerCase();
      if (!query) return true;
      return item.name.toLowerCase().includes(query);
    },
    [debtSearch],
  );

  const matchesStoredCardSearch = useCallback(
    (card: StoredCard) => {
      const query = storedCardSearch.trim().toLowerCase();
      if (!query) return true;
      return card.name.toLowerCase().includes(query);
    },
    [storedCardSearch],
  );

  const selectedAssetCategory = useMemo(
    () =>
      selectedAssetCategoryId === null
        ? null
        : itemCategories.find(category => category.id === selectedAssetCategoryId) ?? null,
    [itemCategories, selectedAssetCategoryId],
  );

  const activeAssetCategoryCounts = useMemo(() => {
    const counts = new Map<string, number>();

    activeItems.forEach(item => {
      const categoryId = item.category ?? 'other';
      counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1);
    });

    return counts;
  }, [activeItems]);

  const activeAssetCategoriesForSheet = useMemo(
    () =>
      itemCategories
        .filter(category => {
          const count = activeAssetCategoryCounts.get(category.id) ?? 0;
          return count > 0 || category.id === selectedAssetCategoryId;
        })
        .map(category => ({
          ...category,
          count: activeAssetCategoryCounts.get(category.id) ?? 0,
        })),
    [activeAssetCategoryCounts, itemCategories, selectedAssetCategoryId],
  );

  const filteredActiveItems = useMemo(
    () => sortedActiveItems.filter(item => matchesSelectedAssetCategory(item) && matchesAssetSearch(item) && matchesWarrantyFilter(item)),
    [matchesSelectedAssetCategory, matchesAssetSearch, matchesWarrantyFilter, sortedActiveItems],
  );
  const filteredArchivedItems = useMemo(
    () => sortedArchivedItems.filter(item => matchesSelectedAssetCategory(item) && matchesAssetSearch(item) && matchesWarrantyFilter(item)),
    [matchesSelectedAssetCategory, matchesAssetSearch, matchesWarrantyFilter, sortedArchivedItems],
  );
  const filteredPausedItems = useMemo(
    () => filteredArchivedItems.filter(item => (item.archived_reason ?? (item.salvage_value > 0 ? 'sold' : 'paused')) !== 'sold'),
    [filteredArchivedItems],
  );
  const filteredSoldItems = useMemo(
    () => filteredArchivedItems.filter(item => (item.archived_reason ?? (item.salvage_value > 0 ? 'sold' : 'paused')) === 'sold'),
    [filteredArchivedItems],
  );

  const filteredTotalAssetDailyCost = useMemo(() => {
    return filteredActiveItems.reduce((sum, item) => {
      const activeDays = calculateOneTimeItemActiveDays(item);
      return sum + calculateDailyCost(item.total_price, 0, activeDays);
    }, 0);
  }, [filteredActiveItems]);

  const filteredDebtItems = useMemo(
    () => sortedDebtItems.filter(matchesDebtSearch),
    [matchesDebtSearch, sortedDebtItems],
  );
  const filteredActiveSubscriptions = useMemo(
    () => sortedActiveSubscriptions.filter(matchesDebtSearch),
    [matchesDebtSearch, sortedActiveSubscriptions],
  );
  const filteredActiveStoredCards = useMemo(
    () => sortedActiveStoredCards.filter(matchesStoredCardSearch),
    [matchesStoredCardSearch, sortedActiveStoredCards],
  );
  const filteredArchivedStoredCards = useMemo(
    () => sortedArchivedStoredCards.filter(matchesStoredCardSearch),
    [matchesStoredCardSearch, sortedArchivedStoredCards],
  );

  const filteredRealizedProfit = useMemo(() => {
    return filteredSoldItems.reduce((sum, item) => {
      if (!isProfitableSale(item.total_price, item.salvage_value)) {
        return sum;
      }
      return sum + calculateRealizedProfit(item.total_price, item.salvage_value);
    }, 0);
  }, [filteredSoldItems]);

  const totalSubscriptionCost = useMemo(() => {
    return activeSubscriptions.reduce(
      (sum, subscription) =>
        sum + calculateSubscriptionDailyCost(subscription.cycle_price, subscription.billing_cycle),
      0,
    );
  }, [activeSubscriptions]);

  const totalInstallmentDebt = useMemo(() => {
    return unredeemedItems.reduce(
      (sum, item) => sum + calculateDailyDebt(item.monthly_payment ?? 0),
      0,
    );
  }, [unredeemedItems]);

  const totalDebtDailyCost = totalInstallmentDebt + totalSubscriptionCost;

  const totalPrincipal = useMemo(() => {
    return activeStoredCards.reduce(
      (sum, card) =>
        sum + calculateStoredPrincipal(card.actual_paid, card.face_value, card.current_balance),
      0,
    );
  }, [activeStoredCards]);

  const netAssetValue = useMemo(
    () =>
      calculateNetAssetValue(items, activeStoredCards, card =>
        calculateStoredPrincipal(card.actual_paid, card.face_value, card.current_balance),
      ).netValue,
    [items, activeStoredCards],
  );

  const statusCounts = useMemo<AssetStatusCounts>(() => {
    let active = 0;
    let paused = 0;
    let sold = 0;
    for (const item of items) {
      if (item.status === 'active') {
        active += 1;
      } else if (item.status === 'archived') {
        const reason = item.archived_reason ?? (item.salvage_value > 0 ? 'sold' : 'paused');
        if (reason === 'sold') {
          sold += 1;
        } else {
          paused += 1;
        }
      }
    }
    return { active, paused, sold };
  }, [items]);

  const expiryReminders = useMemo(() => {
    const base = collectExpiryReminders(items);
    return {
      ...base,
      subscriptionRenewing: collectSubscriptionRenewalReminders(subscriptions),
    };
  }, [items, subscriptions]);
  const hasReminders =
    expiryReminders.warrantyExpiring.length > 0 ||
    expiryReminders.serviceExpiring.length > 0 ||
    expiryReminders.overService.length > 0 ||
    expiryReminders.subscriptionRenewing.length > 0;

  /** 沉睡卡包：自上次更新已超过卡片自身的 reminder_days 阈值 */
  const dormantStoredCards = useMemo(() => {
    return activeStoredCards
      .map(card => ({
        card,
        dormantDays: calculateDaysSince(card.last_updated_date),
      }))
      .filter(({ card, dormantDays }) => dormantDays > card.reminder_days)
      .sort((a, b) => b.dormantDays - a.dormantDays);
  }, [activeStoredCards]);
  const hasDormantCardReminders = reminderEnabled && dormantStoredCards.length > 0;

  /** 月度预算：基于本月已花费 vs 用户配置的预算 */
  const monthlyBudgetInfo = useMemo(() => {
    if (monthlyBudget === null || monthlyBudget <= 0) return null;
    const trend = calculateMonthlySpendingTrend(items, subscriptions, maintenanceLogs, 1);
    const currentMonth = trend[trend.length - 1];
    const spent = currentMonth?.total ?? 0;
    const ratio = monthlyBudget > 0 ? (spent / monthlyBudget) * 100 : 0;
    const remaining = monthlyBudget - spent;
    const status: 'safe' | 'warning' | 'over' =
      ratio >= 100 ? 'over' : ratio >= 80 ? 'warning' : 'safe';
    return { spent, budget: monthlyBudget, ratio, remaining, status, breakdown: currentMonth };
  }, [items, subscriptions, maintenanceLogs, monthlyBudget]);

  const suggestions = useMemo(
    () => generateSuggestions({ items, subscriptions, storedCards, maintenanceLogs, maintenancePlans }),
    [items, subscriptions, storedCards, maintenanceLogs, maintenancePlans],
  );

  const handlePressSuggestion = useCallback(
    (suggestion: Suggestion) => {
      if (!suggestion.entityId || !suggestion.entityType) return;
      if (suggestion.entityType === 'item') {
        navigation.navigate('ItemDetail', { itemId: suggestion.entityId });
      } else if (suggestion.entityType === 'subscription') {
        navigation.navigate('SubscriptionDetail', { subscriptionId: suggestion.entityId });
      } else if (suggestion.entityType === 'stored_card') {
        navigation.navigate('AddEditStoredCard', { storedCardId: suggestion.entityId });
      }
    },
    [navigation],
  );

  const renderSuggestionImpactLabel = useCallback((suggestion: Suggestion): string => {
    if (suggestion.impact === null || suggestion.impact === undefined) return '';
    if (suggestion.impact >= 0) {
      return `可省 ${formatCurrency(suggestion.impact)}`;
    }
    return `潜在损失 ${formatCurrency(Math.abs(suggestion.impact))}`;
  }, []);

  const assetSortSummary = useMemo(() => {
    return getSortSummary(
      itemSortField === 'buy_date' ? '按购买日期' : '按总金额',
      itemSortDirection,
    );
  }, [itemSortDirection, itemSortField]);

  const debtSortSummary = useMemo(() => {
    return getSortSummary(
      debtSortField === 'daily_cost' ? '按日消耗' : '按时间',
      debtSortDirection,
    );
  }, [debtSortDirection, debtSortField]);

  const storedCardSortSummary = useMemo(() => {
    return getSortSummary(
      storedCardSortField === 'principal' ? '按本金' : '按更新时间',
      storedCardSortDirection,
    );
  }, [storedCardSortDirection, storedCardSortField]);

  const isAssetFiltered = selectedAssetCategory !== null;
  const assetHeroSummary = useMemo(() => {
    if (selectedAssetCategory) {
      return `共 ${filteredActiveItems.length} 件${selectedAssetCategory.name}资产`;
    }

    if (filteredRealizedProfit > 0) {
      return `共 ${filteredActiveItems.length} 件在用资产 · 累计已盈利 ${formatCurrency(filteredRealizedProfit)}`;
    }

    return `共 ${filteredActiveItems.length} 件在用资产 · 数字越低越回本`;
  }, [filteredActiveItems.length, filteredRealizedProfit, selectedAssetCategory]);

  const summaryShareData = useMemo<ShareCardData>(
    () => {
      // 配件索引：按 entity_type:entityId 分组（仅含在用+损坏，不含丢失）
      // 用于在分享卡片 topAssets/topSubscriptions 中紧跟主件展示配件明细
      const accessoryByEntity = new Map<string, ShareAccessoryEntry[]>();
      for (const acc of accessories) {
        if (acc.status === 'lost') continue;
        const key = `${acc.entity_type}:${acc.item_id}`;
        const entry: ShareAccessoryEntry = {
          name: acc.name,
          quantity: acc.quantity,
          unitPrice: acc.unit_price,
          status: acc.status,
        };
        const existing = accessoryByEntity.get(key);
        if (existing) {
          existing.push(entry);
        } else {
          accessoryByEntity.set(key, [entry]);
        }
      }
      // 实体内配件按小计降序，让贵的排前面
      const sortAccessories = (list: ShareAccessoryEntry[] | undefined) => {
        if (!list || list.length === 0) return undefined;
        return [...list].sort(
          (a, b) => b.quantity * b.unitPrice - a.quantity * a.unitPrice,
        );
      };

      const topAssets: ShareItemEntry[] = [...filteredActiveItems]
        .map(item => {
          const activeDays = calculateOneTimeItemActiveDays(item);
          const cost = calculateDailyCost(item.total_price, 0, activeDays);
          const cat = getCategoryInfo('item', item.category ?? 'other');
          return {
            name: item.name,
            icon: item.icon ?? cat.icon,
            imageUri: item.image_uri,
            dailyCost: Number.isFinite(cost) ? cost : 0,
            extra: `${activeDays} 天`,
            accessories: sortAccessories(accessoryByEntity.get(`item:${item.id}`)),
          };
        })
        .sort((a, b) => b.dailyCost - a.dailyCost);

      const topSubscriptions: ShareItemEntry[] = sortedActiveSubscriptions.map(sub => {
        const cat = getCategoryInfo('subscription', sub.category ?? 'other');
        const cost = calculateSubscriptionDailyCost(sub.cycle_price, sub.billing_cycle);
        return {
          name: sub.name,
          icon: sub.icon ?? cat.icon,
          imageUri: sub.image_uri,
          dailyCost: Number.isFinite(cost) ? cost : 0,
          extra: sub.billing_cycle === 'monthly'
            ? '月付'
            : sub.billing_cycle === 'quarterly'
              ? '季付'
              : '年付',
          accessories: sortAccessories(accessoryByEntity.get(`subscription:${sub.id}`)),
        };
      }).sort((a, b) => b.dailyCost - a.dailyCost);

      const topStoredCards = sortedActiveStoredCards.map(card => {
        const cat = getCategoryInfo('stored_card', card.category ?? 'other');
        const cost = calculateStoredPrincipal(card.actual_paid, card.face_value, card.current_balance);
        return {
          name: card.name,
          icon: card.icon ?? cat.icon,
          imageUri: card.image_uri,
          dailyCost: Number.isFinite(cost) ? cost : 0,
          extra: card.card_type === 'amount'
            ? `${formatCurrency(card.current_balance)}`
            : `${Math.round(card.current_balance)} 次`,
        };
      }).sort((a, b) => b.dailyCost - a.dailyCost);

      return {
        kind: 'summary',
        assetDailyCost: filteredTotalAssetDailyCost,
        assetCount: filteredActiveItems.length,
        realizedProfit: filteredRealizedProfit,
        subscriptionDailyCost: totalSubscriptionCost,
        installmentDailyDebt: totalInstallmentDebt,
        storedPrincipal: totalPrincipal,
        storedCardCount: activeStoredCards.length,
        topAssets,
        topSubscriptions,
        topStoredCards,
      };
    },
    [
      filteredActiveItems,
      filteredTotalAssetDailyCost,
      filteredRealizedProfit,
      totalSubscriptionCost,
      totalInstallmentDebt,
      totalPrincipal,
      activeStoredCards.length,
      sortedActiveSubscriptions,
      sortedActiveStoredCards,
      getCategoryInfo,
      accessories,
    ],
  );

  const handleShareSummary = useCallback(() => {
    setShareData(summaryShareData);
  }, [summaryShareData]);

  const chrome = useMemo<DashboardChrome>(() => {
    if (activeTab === 'debts') {
      return {
        backgroundColor: THEME.colors.danger,
        borderColor: THEME.colors.dangerDark,
        subtitleColor: THEME.colors.danger,
      };
    }
    if (activeTab === 'stored_cards') {
      return {
        backgroundColor: THEME.colors.warning,
        borderColor: THEME.colors.warning,
        subtitleColor: THEME.colors.highlight,
        costColor: THEME.colors.highlight,
        hintColor: THEME.colors.highlight + 'CC',
      };
    }
    return {
      backgroundColor: THEME.colors.primary,
      borderColor: THEME.colors.borderDark,
    };
  }, [activeTab, themeId]);

  const sortSheetConfig = useMemo<SortSheetConfig | null>(() => {
    if (sortSheetTarget === 'assets') {
      return {
        title: '买断资产排序',
        fields: [
          { value: 'buy_date', label: '按购买日期' },
          { value: 'total_price', label: '按总金额' },
        ],
        currentField: itemSortField,
        currentDirection: itemSortDirection,
        onSelectField: value => updateItemSortField(value as ItemSortField),
        onSelectDirection: updateItemSortDirection,
      };
    }

    if (sortSheetTarget === 'debts') {
      return {
        title: '每日消耗排序',
        fields: [
          { value: 'daily_cost', label: '按日消耗' },
          { value: 'date', label: '按时间' },
        ],
        currentField: debtSortField,
        currentDirection: debtSortDirection,
        onSelectField: value => updateDebtSortField(value as DebtSortField),
        onSelectDirection: updateDebtSortDirection,
      };
    }

    if (sortSheetTarget === 'stored_cards') {
      return {
        title: '沉睡卡包排序',
        fields: [
          { value: 'principal', label: '按本金' },
          { value: 'last_updated_date', label: '按更新时间' },
        ],
        currentField: storedCardSortField,
        currentDirection: storedCardSortDirection,
        onSelectField: value => updateStoredCardSortField(value as StoredCardSortField),
        onSelectDirection: updateStoredCardSortDirection,
      };
    }

    return null;
  }, [
    debtSortDirection,
    debtSortField,
    itemSortDirection,
    itemSortField,
    sortSheetTarget,
    storedCardSortDirection,
    storedCardSortField,
    updateDebtSortDirection,
    updateDebtSortField,
    updateItemSortDirection,
    updateItemSortField,
    updateStoredCardSortDirection,
    updateStoredCardSortField,
  ]);

  // 配件索引：按 entity_type:item_id 分组，便于卡片按 id 快速取配件
  const accessoryIndex = useMemo(() => {
    const map = new Map<string, Accessory[]>();
    for (const acc of accessories) {
      const key = `${acc.entity_type}:${acc.item_id}`;
      const existing = map.get(key);
      if (existing) {
        existing.push(acc);
      } else {
        map.set(key, [acc]);
      }
    }
    return map;
  }, [accessories]);

  const renderAssetList = (data: OneTimeItem[]) => {
    if (assetLayoutMode === 'grid') {
      return renderGridRows(data, 'asset', item => (
        <ItemCard
          key={item.id}
          item={item}
          layout="grid"
          style={styles.gridCard}
          onPress={() => navigation.navigate('ItemDetail', { itemId: item.id })}
        />
      ));
    }

    return data.map(item => (
      <ItemCard
        key={item.id}
        item={item}
        accessories={accessoryIndex.get(`item:${item.id}`)}
        onPress={() => navigation.navigate('ItemDetail', { itemId: item.id })}
      />
    ));
  };

  const renderDebtItemList = (data: OneTimeItem[]) => {
    if (debtLayoutMode === 'grid') {
      return renderGridRows(data, 'debt-item', item => (
        <ItemCard
          key={item.id}
          item={item}
          layout="grid"
          style={styles.gridCard}
          onPress={() => navigation.navigate('ItemDetail', { itemId: item.id })}
        />
      ));
    }

    return data.map(item => (
      <ItemCard
        key={item.id}
        item={item}
        accessories={accessoryIndex.get(`item:${item.id}`)}
        onPress={() => navigation.navigate('ItemDetail', { itemId: item.id })}
      />
    ));
  };

  const renderSubscriptionList = (data: Subscription[]) => {
    if (debtLayoutMode === 'grid') {
      return renderGridRows(data, 'debt-sub', subscription => (
        <SubscriptionCard
          key={subscription.id}
          subscription={subscription}
          layout="grid"
          style={styles.gridCard}
          onPress={() => navigation.navigate('SubscriptionDetail', { subscriptionId: subscription.id })}
        />
      ));
    }

    return data.map(subscription => (
      <SubscriptionCard
        key={subscription.id}
        subscription={subscription}
        accessories={accessoryIndex.get(`subscription:${subscription.id}`)}
        onPress={() => navigation.navigate('SubscriptionDetail', { subscriptionId: subscription.id })}
      />
    ));
  };

  const renderStoredCardList = (data: StoredCard[]) => {
    if (storedCardLayoutMode === 'grid') {
      return renderGridRows(data, 'stored-card', card => (
        <StoredCardCard
          key={card.id}
          card={card}
          layout="grid"
          style={styles.gridCard}
          onPress={() => navigation.navigate('AddEditStoredCard', { storedCardId: card.id })}
          onDataChanged={loadData}
        />
      ));
    }

    return data.map(card => (
      <StoredCardCard
        key={card.id}
        card={card}
        onPress={() => navigation.navigate('AddEditStoredCard', { storedCardId: card.id })}
        onDataChanged={loadData}
      />
    ));
  };

  const renderAssetsTab = () => {
    const hasActiveAssets = filteredActiveItems.length > 0;
    const hasArchivedAssets = filteredArchivedItems.length > 0;
    const showHistoryFirst = !hasActiveAssets && hasArchivedAssets;
    const emptyMessage = isAssetFiltered ? '该分类下还没有买断资产记录' : '还没有买断资产记录';
    const hasAnyAsset = activeItems.length > 0 || archivedItems.length > 0;
    const isSearching = assetSearch.trim().length > 0;

    return (
      <>
      <View style={styles.stickyTools}>
        {hasAnyAsset && (
          <TouchableOpacity
            style={styles.toolCollapseTrigger}
            onPress={() => setAssetToolsExpanded(value => !value)}
            activeOpacity={0.7}
          >
            <Text style={styles.toolCollapseTitle} numberOfLines={1}>
              {assetSearch.trim()
                ? `🔍 "${assetSearch.trim()}"`
                : warrantyFilter
                  ? `过滤: ${warrantyFilter === 'active' ? '在保' : warrantyFilter === 'expiring' ? '临保' : warrantyFilter === 'expired' ? '过保' : '无保修'}`
                  : '搜索 / 保修筛选 / 排序布局'}
            </Text>
            <Text style={styles.toolCollapseSummary} numberOfLines={1}>
              {assetSortSummary} · {assetLayoutMode === 'list' ? '列表' : '网格'}{assetGrouped ? ' · 分组' : ''}
            </Text>
            <Text style={styles.toolCollapseArrow}>
              {assetToolsExpanded ? '▲' : '▼'}
            </Text>
          </TouchableOpacity>
        )}

        {hasAnyAsset && assetToolsExpanded && (
          <>
            <SearchBar
              value={assetSearch}
              onChange={setAssetSearch}
              placeholder="搜索资产名称..."
            />

            <View style={styles.warrantyFilterRow}>
              {(
                [
                  { value: null as WarrantyStatus | null, label: '全部' },
                  { value: 'active' as WarrantyStatus, label: '在保' },
                  { value: 'expiring' as WarrantyStatus, label: '临保' },
                  { value: 'expired' as WarrantyStatus, label: '过保' },
                  { value: 'none' as WarrantyStatus, label: '无保修' },
                ]
              ).map(opt => {
                const active = warrantyFilter === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.label}
                    style={[
                      styles.warrantyFilterChip,
                      active && styles.warrantyFilterChipActive,
                    ]}
                    onPress={() => setWarrantyFilter(opt.value)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.warrantyFilterChipText,
                        active && styles.warrantyFilterChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <AssetSectionToolbar
              title="在用资产"
              sortSummary={assetSortSummary}
              layoutMode={assetLayoutMode}
              grouped={assetGrouped}
              onPressSort={() => setSortSheetTarget('assets')}
              onToggleLayout={toggleAssetLayoutMode}
              onToggleGrouped={toggleAssetGrouped}
            />
          </>
        )}

        {!hasAnyAsset && (
          <View style={styles.toolCollapsePlaceholder} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {reminderEnabled && hasReminders && !isAssetFiltered && !isSearching && (
          <View style={styles.reminderCard}>
            <Text style={styles.reminderTitle}>⏰ 到期提醒</Text>
            {expiryReminders.warrantyExpiring.length > 0 && (
              <View style={styles.reminderSection}>
                <Text style={styles.reminderSectionLabel}>
                  🛠️ 保修即将到期 · {expiryReminders.warrantyExpiring.length}
                </Text>
                {expiryReminders.warrantyExpiring.slice(0, 3).map(item => {
                  const info = calculateWarrantyInfo(item);
                  return (
                    <TouchableOpacity
                      key={`w-${item.id}`}
                      style={styles.reminderRow}
                      onPress={() => navigation.navigate('ItemDetail', { itemId: item.id })}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.reminderRowName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.reminderRowMeta}>
                        剩 {info.remainingDays ?? 0} 天
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {expiryReminders.serviceExpiring.length > 0 && (
              <View style={styles.reminderSection}>
                <Text style={styles.reminderSectionLabel}>
                  ⏳ 服役寿命即将到期 · {expiryReminders.serviceExpiring.length}
                </Text>
                {expiryReminders.serviceExpiring.slice(0, 3).map(item => {
                  const activeDays = calculateOneTimeItemActiveDays(item);
                  const remaining =
                    (item.expected_life_days ?? 0) - activeDays;
                  return (
                    <TouchableOpacity
                      key={`s-${item.id}`}
                      style={styles.reminderRow}
                      onPress={() => navigation.navigate('ItemDetail', { itemId: item.id })}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.reminderRowName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.reminderRowMeta}>
                        剩 {remaining} 天
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {expiryReminders.overService.length > 0 && (
              <View style={styles.reminderSection}>
                <Text style={styles.reminderSectionLabel}>
                  💪 已超期服役（已回本） · {expiryReminders.overService.length}
                </Text>
                {expiryReminders.overService.slice(0, 3).map(item => {
                  const activeDays = calculateOneTimeItemActiveDays(item);
                  const overDays = activeDays - (item.expected_life_days ?? 0);
                  return (
                    <TouchableOpacity
                      key={`o-${item.id}`}
                      style={styles.reminderRow}
                      onPress={() => navigation.navigate('ItemDetail', { itemId: item.id })}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.reminderRowName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.reminderRowMeta}>
                        超期 {overDays} 天
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {expiryReminders.subscriptionRenewing.length > 0 && (
              <View style={styles.reminderSection}>
                <Text style={styles.reminderSectionLabel}>
                  💳 订阅即将续费 · {expiryReminders.subscriptionRenewing.length}
                </Text>
                {expiryReminders.subscriptionRenewing.slice(0, 3).map(sub => {
                  const nextDate = calculateSubscriptionNextRenewalDate(sub);
                  const remaining = nextDate ? calculateDaysUntil(nextDate) : 0;
                  return (
                    <TouchableOpacity
                      key={`r-${sub.id}`}
                      style={styles.reminderRow}
                      onPress={() => navigation.navigate('SubscriptionDetail', { subscriptionId: sub.id })}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.reminderRowName} numberOfLines={1}>
                        {sub.name}
                      </Text>
                      <Text style={styles.reminderRowMeta}>
                        {remaining === 0 ? '今日扣款' : `${remaining} 天后 · ${formatCurrency(sub.cycle_price)}`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {showHistoryFirst && (
          <TouchableOpacity
            style={styles.historyToggle}
            onPress={() => setShowArchived(value => !value)}
            activeOpacity={0.75}
          >
            <Text style={styles.historyToggleText}>
              {showArchived ? '收起' : '显示'}停用/售出 ({filteredArchivedItems.length})
            </Text>
          </TouchableOpacity>
        )}

        {hasActiveAssets &&
          (assetGrouped ? (
            <AssetGroupedList
              items={filteredActiveItems}
              categories={itemCategories}
              layoutMode={assetLayoutMode}
              onPressItem={itemId => navigation.navigate('ItemDetail', { itemId })}
            />
          ) : (
            renderAssetList(filteredActiveItems)
          ))}

        {hasAnyAsset && !hasActiveAssets && !hasArchivedAssets && isSearching && (
          <EmptyState message="没有匹配的搜索结果" icon="🔍" />
        )}

        {!hasAnyAsset && (
          <EmptyState message={emptyMessage} icon="🧾" />
        )}

        {hasActiveAssets && hasArchivedAssets && (
          <TouchableOpacity
            style={styles.historyToggle}
            onPress={() => setShowArchived(value => !value)}
            activeOpacity={0.75}
          >
            <Text style={styles.historyToggleText}>
              {showArchived ? '收起' : '显示'}停用/售出 ({filteredArchivedItems.length})
            </Text>
          </TouchableOpacity>
        )}

        {showArchived && filteredPausedItems.length > 0 && (
          <>
            <Text style={styles.subSectionTitle}>已停用 ({filteredPausedItems.length})</Text>
            {renderAssetList(filteredPausedItems)}
          </>
        )}

        {showArchived && filteredSoldItems.length > 0 && (
          <>
            <Text style={styles.subSectionTitle}>已售出 ({filteredSoldItems.length})</Text>
            {renderAssetList(filteredSoldItems)}
          </>
        )}
      </ScrollView>
      </>
    );
  };

  const renderDebtsTab = () => {
    const hasDebtContent = sortedDebtItems.length > 0 || sortedActiveSubscriptions.length > 0;
    const hasFilteredDebtContent = filteredDebtItems.length > 0 || filteredActiveSubscriptions.length > 0;
    const redeemableUnredeemedItems = unredeemedItems.filter(
      item => (item.down_payment ?? 0) >= item.total_price,
    );

    const handleBatchRedeem = () => {
      if (redeemableUnredeemedItems.length === 0) return;
      alertConfirm(
        '一键赎身',
        `检测到 ${redeemableUnredeemedItems.length} 件分期物品已付清（首付 ≥ 总价），是否将它们一次性转为「买断资产」？`,
        async () => {
          try {
            await Promise.all(
              redeemableUnredeemedItems.map(item => redeemOneTimeItem(db, item.id)),
            );
            await loadData();
            alertSuccess('赎身完成', `已成功赎身 ${redeemableUnredeemedItems.length} 件资产`);
          } catch (error) {
            alertError('错误', error instanceof Error ? error.message : '一键赎身失败');
          }
        },
        { confirmText: '一键赎身' },
      );
    };

    return (
      <>
      <View style={styles.stickyTools}>
        {hasDebtContent && (
          <SearchBar
            value={debtSearch}
            onChange={setDebtSearch}
            placeholder="搜索分期 / 订阅..."
          />
        )}
        {hasDebtContent && (
          <SectionToolbar
            title="分期物品"
            sortSummary={debtSortSummary}
            layoutMode={debtLayoutMode}
            onPressSort={() => setSortSheetTarget('debts')}
            onToggleLayout={toggleDebtLayoutMode}
          />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {redeemableUnredeemedItems.length > 0 && (
          <TouchableOpacity
            style={styles.batchRedeemBanner}
            onPress={handleBatchRedeem}
            activeOpacity={0.75}
          >
            <Text style={styles.batchRedeemBannerText}>
              ✅ {redeemableUnredeemedItems.length} 件已付清 · 一键赎身
            </Text>
            <Text style={styles.batchRedeemBannerArrow}>→</Text>
          </TouchableOpacity>
        )}

        {!hasDebtContent && (
          <EmptyState message="还没有每日消耗记录" icon="📉" />
        )}

        {hasDebtContent && !hasFilteredDebtContent && (
          <EmptyState message="没有匹配的搜索结果" icon="🔍" />
        )}

        {filteredDebtItems.length > 0 ? (
          renderDebtItemList(filteredDebtItems)
        ) : hasFilteredDebtContent ? (
          <Text style={styles.sectionEmptyHint}>暂无分期物品</Text>
        ) : null}

        <Text style={styles.subSectionTitle}>持续订阅</Text>
        {filteredActiveSubscriptions.length > 0 ? (
          renderSubscriptionList(filteredActiveSubscriptions)
        ) : hasFilteredDebtContent ? (
          <Text style={styles.sectionEmptyHint}>暂无持续订阅</Text>
        ) : null}
      </ScrollView>
      </>
    );
  };

  const renderStoredCardsTab = () => {
    const hasActiveCards = sortedActiveStoredCards.length > 0;
    const hasArchivedCards = archivedStoredCards.length > 0;
    const showHistoryFirst = !hasActiveCards && hasArchivedCards;
    const hasAnyCard = hasActiveCards || hasArchivedCards;
    const hasFilteredCardContent = filteredActiveStoredCards.length > 0 || filteredArchivedStoredCards.length > 0;
    const isStoredCardSearching = storedCardSearch.trim().length > 0;

    return (
      <>
      <View style={styles.stickyTools}>
        {hasAnyCard && (
          <SearchBar
            value={storedCardSearch}
            onChange={setStoredCardSearch}
            placeholder="搜索卡包..."
          />
        )}
        {hasAnyCard && (
          <SectionToolbar
            title="在用卡包"
            sortSummary={storedCardSortSummary}
            layoutMode={storedCardLayoutMode}
            onPressSort={() => setSortSheetTarget('stored_cards')}
            onToggleLayout={toggleStoredCardLayoutMode}
          />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {hasDormantCardReminders && !isStoredCardSearching && (
          <View style={styles.dormantCardBanner}>
            <Text style={styles.dormantCardBannerTitle}>
              💤 沉睡卡包提醒 · {dormantStoredCards.length} 张
            </Text>
            <Text style={styles.dormantCardBannerHint}>
              以下卡包已超过自定义提醒阈值，建议尽快使用或更新余额
            </Text>
            {dormantStoredCards.slice(0, 3).map(({ card, dormantDays }) => (
              <TouchableOpacity
                key={`dormant-${card.id}`}
                style={styles.dormantCardRow}
                onPress={() => navigation.navigate('AddEditStoredCard', { storedCardId: card.id })}
                activeOpacity={0.7}
              >
                <Text style={styles.dormantCardName} numberOfLines={1}>
                  {card.name}
                </Text>
                <Text style={styles.dormantCardMeta}>
                  已沉睡 {dormantDays} 天 · 超阈值 {dormantDays - card.reminder_days} 天
                </Text>
              </TouchableOpacity>
            ))}
            {dormantStoredCards.length > 3 && (
              <Text style={styles.dormantCardMore}>
                还有 {dormantStoredCards.length - 3} 张沉睡卡未展示
              </Text>
            )}
          </View>
        )}

        {showHistoryFirst && (
          <TouchableOpacity
            style={styles.historyToggle}
            onPress={() => setShowArchivedCards(value => !value)}
            activeOpacity={0.75}
          >
            <Text style={styles.historyToggleText}>
              {showArchivedCards ? '收起' : '显示'}已隐藏 ({archivedStoredCards.length})
            </Text>
          </TouchableOpacity>
        )}

        {hasAnyCard && !hasFilteredCardContent && (
          <EmptyState message="没有匹配的搜索结果" icon="🔍" />
        )}

        {hasFilteredCardContent && renderStoredCardList(filteredActiveStoredCards)}

        {!hasAnyCard && (
          <EmptyState message="还没有沉睡卡包记录" icon="💳" />
        )}

        {hasFilteredCardContent && filteredArchivedStoredCards.length > 0 && (
          <TouchableOpacity
            style={styles.historyToggle}
            onPress={() => setShowArchivedCards(value => !value)}
            activeOpacity={0.75}
          >
            <Text style={styles.historyToggleText}>
              {showArchivedCards ? '收起' : '显示'}已隐藏 ({filteredArchivedStoredCards.length})
            </Text>
          </TouchableOpacity>
        )}

        {showArchivedCards && filteredArchivedStoredCards.length > 0 && (
          <>
            <Text style={styles.subSectionTitle}>已隐藏 ({filteredArchivedStoredCards.length})</Text>
            {renderStoredCardList(filteredArchivedStoredCards)}
          </>
        )}
      </ScrollView>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <StatusBar style={THEME.colors.statusBar} translucent backgroundColor="transparent" animated />
      <View style={styles.container}>
        <DashboardHeroHeader
          activeTab={activeTab}
          topPadding={insets.top + 2}
          chrome={chrome}
          assetDailyCost={filteredTotalAssetDailyCost}
          assetSummary={assetHeroSummary}
          selectedAssetCategory={selectedAssetCategory}
          isAssetFiltered={isAssetFiltered}
          totalDebtDailyCost={totalDebtDailyCost}
          totalInstallmentDebt={totalInstallmentDebt}
          totalSubscriptionCost={totalSubscriptionCost}
          totalPrincipal={totalPrincipal}
          activeStoredCardCount={activeStoredCards.length}
          netAssetValue={netAssetValue}
          statusCounts={statusCounts}
          onPressStatistics={() => navigation.navigate('Statistics')}
          onPressSettings={() => navigation.navigate('Settings')}
          onPressHelp={() => setHelpModalVisible(true)}
          onPressShare={handleShareSummary}
          onPressCabinet={() => navigation.navigate('Cabinet')}
          onPressAnnualReport={() => navigation.navigate('AnnualReport')}
          onPressCalendar={() => navigation.navigate('Calendar')}
          onPressAssetFilterTrigger={() => setAssetFilterSheetVisible(true)}
          onClearAssetFilter={() => setSelectedAssetCategoryId(null)}
          onTabChange={setActiveTab}
        />

        {monthlyBudgetInfo && (
          <View
            style={[
              styles.budgetCard,
              monthlyBudgetInfo.status === 'over' && styles.budgetCardOver,
              monthlyBudgetInfo.status === 'warning' && styles.budgetCardWarning,
            ]}
          >
            <View style={styles.budgetHeader}>
              <Text style={styles.budgetTitle}>
                {monthlyBudgetInfo.status === 'over'
                  ? '🚨 本月已超支'
                  : monthlyBudgetInfo.status === 'warning'
                    ? '⚠️ 本月预算吃紧'
                    : '✅ 本月预算可控'}
              </Text>
              <Text style={styles.budgetRatio}>
                {monthlyBudgetInfo.ratio.toFixed(0)}%
              </Text>
            </View>
            <View style={styles.budgetBarTrack}>
              <View
                style={[
                  styles.budgetBarFill,
                  {
                    width: `${Math.min(monthlyBudgetInfo.ratio, 100)}%`,
                    backgroundColor:
                      monthlyBudgetInfo.status === 'over'
                        ? THEME.colors.danger
                        : monthlyBudgetInfo.status === 'warning'
                          ? THEME.colors.warning
                          : THEME.colors.success,
                  },
                ]}
              />
            </View>
            <View style={styles.budgetFooter}>
              <Text style={styles.budgetFooterLabel}>
                已花 {formatCurrency(monthlyBudgetInfo.spent)}
              </Text>
              <Text style={[styles.budgetFooterLabel, styles.budgetFooterValue]}>
                {monthlyBudgetInfo.remaining >= 0
                  ? `剩 ${formatCurrency(monthlyBudgetInfo.remaining)}`
                  : `超 ${formatCurrency(Math.abs(monthlyBudgetInfo.remaining))}`}
              </Text>
              <Text style={styles.budgetFooterLabel}>
                预算 {formatCurrency(monthlyBudgetInfo.budget)}
              </Text>
            </View>
          </View>
        )}

        {reminderEnabled && suggestions.length > 0 && (
          <View style={styles.suggestionSection}>
            <Text style={styles.suggestionSectionTitle}>💡 智能建议</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.suggestionScroll}
            >
              {suggestions.map(suggestion => {
                const impactLabel = renderSuggestionImpactLabel(suggestion);
                return (
                  <TouchableOpacity
                    key={suggestion.id}
                    style={[
                      styles.suggestionCard,
                      suggestion.priority === 'high' && styles.suggestionCardHigh,
                      suggestion.priority === 'medium' && styles.suggestionCardMedium,
                      suggestion.priority === 'low' && styles.suggestionCardLow,
                    ]}
                    onPress={() => handlePressSuggestion(suggestion)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.suggestionCardHeader}>
                      <Text style={styles.suggestionEmoji}>{suggestion.emoji}</Text>
                      <Text
                        style={[
                          styles.suggestionPriorityBadge,
                          suggestion.priority === 'high' && styles.suggestionPriorityHigh,
                          suggestion.priority === 'medium' && styles.suggestionPriorityMedium,
                          suggestion.priority === 'low' && styles.suggestionPriorityLow,
                        ]}
                      >
                        {suggestion.priority === 'high'
                          ? '高'
                          : suggestion.priority === 'medium'
                            ? '中'
                            : '低'}
                      </Text>
                    </View>
                    <Text style={styles.suggestionTitle} numberOfLines={1}>
                      {suggestion.title}
                    </Text>
                    <Text style={styles.suggestionDesc} numberOfLines={3}>
                      {suggestion.description}
                    </Text>
                    {impactLabel ? (
                      <Text
                        style={[
                          styles.suggestionImpact,
                          (suggestion.impact ?? 0) >= 0
                            ? styles.suggestionImpactPositive
                            : styles.suggestionImpactNegative,
                        ]}
                        numberOfLines={1}
                      >
                        {impactLabel}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {activeTab === 'assets' && renderAssetsTab()}
        {activeTab === 'debts' && renderDebtsTab()}
        {activeTab === 'stored_cards' && renderStoredCardsTab()}

        <TouchableOpacity
          style={styles.fab}
          activeOpacity={0.8}
          onPress={() => {
            if (activeTab === 'assets') {
              navigation.navigate('AddEditItem');
              return;
            }

            setAddModalVisible(true);
          }}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>

        <Modal visible={addModalVisible} transparent animationType="fade">
          <View style={styles.overlay}>
            <View style={styles.modal}>
              {activeTab === 'stored_cards' ? (
                <>
                  <Text style={styles.modalTitle}>新增沉睡卡包</Text>
                  <Text style={styles.modalDesc}>请选择卡片类型</Text>
                  <View style={styles.modalActions}>
                    <BrutalButton
                      title="储值卡"
                      onPress={() => {
                        setAddModalVisible(false);
                        navigation.navigate('AddEditStoredCard', { defaultCardType: 'amount' });
                      }}
                      variant="accent"
                      size="md"
                      style={styles.modalBtn}
                    />
                    <BrutalButton
                      title="计次卡"
                      onPress={() => {
                        setAddModalVisible(false);
                        navigation.navigate('AddEditStoredCard', { defaultCardType: 'count' });
                      }}
                      variant="primary"
                      size="md"
                      style={styles.modalBtn}
                    />
                    <BrutalButton
                      title="取消"
                      onPress={() => setAddModalVisible(false)}
                      variant="outline"
                      size="md"
                      style={styles.modalBtn}
                    />
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.modalTitle}>新增每日消耗</Text>
                  <Text style={styles.modalDesc}>请选择要新增的类型</Text>
                  <View style={styles.modalActions}>
                    <BrutalButton
                      title="新增分期物品"
                      onPress={() => {
                        setAddModalVisible(false);
                        navigation.navigate('AddEditItem', { defaultIsInstallment: true });
                      }}
                      variant="danger"
                      size="md"
                      style={styles.modalBtn}
                    />
                    <BrutalButton
                      title="新增周期订阅"
                      onPress={() => {
                        setAddModalVisible(false);
                        navigation.navigate('AddEditSubscription');
                      }}
                      variant="accent"
                      size="md"
                      style={styles.modalBtn}
                    />
                    <BrutalButton
                      title="取消"
                      onPress={() => setAddModalVisible(false)}
                      variant="outline"
                      size="md"
                      style={styles.modalBtn}
                    />
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>

        <AssetCategorySheet
          visible={assetFilterSheetVisible}
          selectedCategoryId={selectedAssetCategoryId}
          categories={activeAssetCategoriesForSheet}
          onClose={() => setAssetFilterSheetVisible(false)}
          onSelect={categoryId => {
            setSelectedAssetCategoryId(categoryId);
            setAssetFilterSheetVisible(false);
          }}
          onPressManageCategories={() => {
            setAssetFilterSheetVisible(false);
            navigation.navigate('Categories');
          }}
        />

        <AppBottomSheet
          visible={sortSheetConfig !== null}
          title={sortSheetConfig?.title}
          onClose={() => setSortSheetTarget(null)}
          footer={(
            <BrutalButton
              title="完成"
              onPress={() => setSortSheetTarget(null)}
              variant="primary"
              size="sm"
              style={styles.sheetCloseButton}
            />
          )}
        >
          <Text style={styles.sheetSectionTitle}>按什么排</Text>
          <View style={styles.sheetOptionRow}>
            {sortSheetConfig?.fields.map(option => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.sheetOptionChip,
                  sortSheetConfig?.currentField === option.value && styles.sheetOptionChipActive,
                ]}
                onPress={() => sortSheetConfig?.onSelectField(option.value)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.sheetOptionText,
                    sortSheetConfig?.currentField === option.value && styles.sheetOptionTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sheetSectionTitle}>顺序</Text>
          <View style={styles.sheetOptionRow}>
            <TouchableOpacity
              style={[
                styles.sheetOptionChip,
                sortSheetConfig?.currentDirection === 'desc' && styles.sheetOptionChipActive,
              ]}
              onPress={() => sortSheetConfig?.onSelectDirection('desc')}
              activeOpacity={0.75}
            >
              <Text
                style={[
                  styles.sheetOptionText,
                  sortSheetConfig?.currentDirection === 'desc' && styles.sheetOptionTextActive,
                ]}
              >
                降序
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.sheetOptionChip,
                sortSheetConfig?.currentDirection === 'asc' && styles.sheetOptionChipActive,
              ]}
              onPress={() => sortSheetConfig?.onSelectDirection('asc')}
              activeOpacity={0.75}
            >
              <Text
                style={[
                  styles.sheetOptionText,
                  sortSheetConfig?.currentDirection === 'asc' && styles.sheetOptionTextActive,
                ]}
              >
                升序
              </Text>
            </TouchableOpacity>
          </View>
        </AppBottomSheet>

        <Modal visible={helpModalVisible} transparent animationType="fade">
          <TouchableOpacity
            style={styles.overlay}
            onPress={() => setHelpModalVisible(false)}
            activeOpacity={1}
          >
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>这笔账怎么算？</Text>

              <View style={styles.helpSection}>
                <View style={[styles.helpTag, { backgroundColor: THEME.colors.primary }]}>
                  <Text style={styles.helpTagText}>买断资产</Text>
                </View>
                <Text style={styles.helpBody}>
                  一次性买下来的东西，越用越回本。首页统计的是在用资产的日均成本。
                </Text>
                <View style={styles.helpFormula}>
                  <Text style={styles.helpFormulaText}>
                    日均成本 = (买入价格 - 卖出价格) / 激活天数
                  </Text>
                </View>
              </View>

              <View style={styles.helpDivider} />

              <View style={styles.helpSection}>
                <View style={[styles.helpTag, { backgroundColor: THEME.colors.danger }]}>
                  <Text style={styles.helpTagText}>每日消耗</Text>
                </View>
                <Text style={styles.helpBody}>
                  分期和订阅都会构成每天的固定流失。它们的排序只在各自 section 内生效，不会混排。
                </Text>
                <View style={styles.helpFormula}>
                  <Text style={styles.helpFormulaText}>
                    分期日供 = 月供 / 30；订阅日均按周期价格折算
                  </Text>
                </View>
              </View>

              <View style={styles.helpDivider} />

              <View style={styles.helpSection}>
                <View style={[styles.helpTag, { backgroundColor: THEME.colors.warning }]}>
                  <Text style={styles.helpTagText}>沉睡卡包</Text>
                </View>
                <Text style={styles.helpBody}>
                  这里记录的是你已经付出去、却还躺在商家那里的余额或次数。越久不更新，越容易遗忘。
                </Text>
                <View style={styles.helpFormula}>
                  <Text style={styles.helpFormulaText}>
                    实际沉睡本金 = 当前剩余面值 × (实际支付 / 总面值)
                  </Text>
                </View>
              </View>

              <BrutalButton
                title="明白了"
                onPress={() => setHelpModalVisible(false)}
                variant="primary"
                size="sm"
                style={styles.helpCloseBtn}
              />
            </View>
          </TouchableOpacity>
        </Modal>

        <ShareModal
          visible={shareData !== null}
          data={shareData}
          onClose={() => setShareData(null)}
        />
      </View>
    </SafeAreaView>
  );
}

const createStyles = () => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  container: {
    flex: 1,
  },
  // 固定吸顶的搜索 + 筛选工具区，不随列表滚动
  stickyTools: {
    paddingHorizontal: THEME.spacing.lg,
    paddingTop: 2,
    paddingBottom: 0,
    backgroundColor: THEME.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  // 折叠态触发行：单行展示当前排序/布局摘要，点击展开三行工具
  toolCollapseTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: THEME.spacing.sm,
    marginBottom: 2,
    borderRadius: THEME.borderRadius,
    borderWidth: 1.5,
    borderColor: THEME.colors.borderDark,
    backgroundColor: THEME.colors.surface,
  },
  toolCollapseTitle: {
    flex: 1,
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    minWidth: 0,
  },
  toolCollapseSummary: {
    fontSize: 9,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    flexShrink: 0,
  },
  toolCollapseArrow: {
    fontSize: 8,
    fontWeight: '900',
    color: THEME.colors.primary,
    flexShrink: 0,
  },
  toolCollapsePlaceholder: {
    height: 2,
  },
  budgetCard: {
    marginHorizontal: THEME.spacing.lg,
    marginTop: THEME.spacing.md,
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.lg,
    backgroundColor: THEME.colors.surface,
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    borderRadius: THEME.borderRadius,
    ...THEME.pixelShadow,
  },
  budgetCardOver: {
    borderColor: THEME.colors.dangerDark,
    backgroundColor: THEME.colors.dangerBg,
  },
  budgetCardWarning: {
    borderColor: THEME.colors.warning,
    backgroundColor: THEME.colors.warningBg,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  budgetTitle: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  budgetRatio: {
    fontSize: THEME.fontSize.lg,
    fontWeight: '900',
    fontFamily: THEME.fontFamily.pixel,
    color: THEME.colors.primaryDark,
  },
  budgetBarTrack: {
    height: 12,
    backgroundColor: THEME.colors.background,
    borderWidth: 1.5,
    borderColor: THEME.colors.borderDark,
    borderRadius: 4,
    overflow: 'hidden',
  },
  budgetBarFill: {
    height: '100%',
    backgroundColor: THEME.colors.success,
    borderRadius: 2,
  },
  budgetFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  budgetFooterLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  budgetFooterValue: {
    color: THEME.colors.primaryDark,
    fontWeight: '900',
  },
  suggestionSection: {
    marginTop: THEME.spacing.md,
    marginBottom: THEME.spacing.xs,
  },
  quickAccessRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginHorizontal: THEME.spacing.lg,
    marginTop: THEME.spacing.md,
    marginBottom: THEME.spacing.sm,
    gap: THEME.spacing.sm,
  },
  quickAccessBtn: {
    flex: 1,
    maxWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.md,
    backgroundColor: THEME.colors.surface,
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    borderRadius: THEME.borderRadius,
    gap: 6,
    ...THEME.pixelShadow,
  },
  quickAccessEmoji: {
    fontSize: 16,
  },
  quickAccessLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    textAlign: 'center',
  },
  suggestionSectionTitle: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
    paddingHorizontal: THEME.spacing.lg,
    marginBottom: THEME.spacing.sm,
  },
  suggestionScroll: {
    paddingHorizontal: THEME.spacing.lg,
    gap: THEME.spacing.md,
    paddingRight: THEME.spacing.xl,
  },
  suggestionCard: {
    width: 220,
    padding: THEME.spacing.md,
    backgroundColor: THEME.colors.surface,
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    borderRadius: THEME.borderRadius,
    ...THEME.pixelShadow,
  },
  suggestionCardHigh: {
    borderColor: THEME.colors.dangerDark,
    backgroundColor: THEME.colors.dangerBg,
  },
  suggestionCardMedium: {
    borderColor: THEME.colors.warning,
    backgroundColor: THEME.colors.warningBg,
  },
  suggestionCardLow: {
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
  },
  suggestionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: THEME.spacing.xs,
  },
  suggestionEmoji: {
    fontSize: 20,
  },
  suggestionPriorityBadge: {
    fontSize: 10,
    fontWeight: '900',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  suggestionPriorityHigh: {
    color: THEME.colors.surface,
    backgroundColor: THEME.colors.dangerDark,
    borderColor: THEME.colors.dangerDark,
  },
  suggestionPriorityMedium: {
    color: THEME.colors.surface,
    backgroundColor: THEME.colors.warning,
    borderColor: THEME.colors.warning,
  },
  suggestionPriorityLow: {
    color: THEME.colors.textSecondary,
    backgroundColor: THEME.colors.background,
    borderColor: THEME.colors.border,
  },
  suggestionTitle: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
    marginBottom: 4,
  },
  suggestionDesc: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textSecondary,
    lineHeight: 16,
    marginBottom: THEME.spacing.xs,
  },
  suggestionImpact: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '900',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  suggestionImpactPositive: {
    color: THEME.colors.success,
    backgroundColor: THEME.colors.successBg,
  },
  suggestionImpactNegative: {
    color: THEME.colors.dangerDark,
    backgroundColor: THEME.colors.dangerBg,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: THEME.spacing.lg,
    paddingTop: THEME.spacing.md,
    gap: THEME.spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: THEME.spacing.sm + 2,
    borderRadius: THEME.borderRadius,
    borderWidth: 2,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
    alignItems: 'center',
  },
  tabActive: {
    borderColor: THEME.colors.borderDark,
    backgroundColor: THEME.colors.primaryLight + '30',
  },
  tabActiveDebt: {
    borderColor: THEME.colors.dangerDark,
    backgroundColor: 'rgba(231,76,60,0.2)',
  },
  tabActiveStored: {
    borderColor: THEME.colors.warning,
    backgroundColor: THEME.colors.warning + '33',
  },
  tabText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
  },
  tabTextActive: {
    color: THEME.colors.primary,
    fontWeight: '700',
  },
  tabTextActiveDebt: {
    color: THEME.colors.dangerDark,
    fontWeight: '700',
  },
  tabTextActiveStored: {
    color: THEME.colors.warning,
    fontWeight: '700',
  },
  list: {
    padding: THEME.spacing.lg,
    paddingBottom: 88,
  },
  sectionToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  sectionToolbarTitle: {
    width: 64,
    fontSize: THEME.fontSize.md,
    fontWeight: '800',
    color: THEME.colors.textSecondary,
  },
  sortTriggerButton: {
    flex: 1,
    minHeight: 30,
    paddingHorizontal: THEME.spacing.sm,
    borderRadius: THEME.borderRadius,
    borderWidth: 1.5,
    borderColor: THEME.colors.borderDark,
    backgroundColor: THEME.colors.surface,
    justifyContent: 'center',
  },
  sortTriggerText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  layoutIconButton: {
    width: 30,
    height: 30,
    borderRadius: THEME.borderRadius,
    borderWidth: 1.5,
    borderColor: THEME.colors.borderDark,
    backgroundColor: THEME.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  layoutIconText: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  historyToggle: {
    alignSelf: 'flex-start',
    paddingVertical: THEME.spacing.xs,
    marginBottom: THEME.spacing.sm,
  },
  historyToggleText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  subSectionTitle: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '800',
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.sm,
    marginTop: THEME.spacing.md,
  },
  sectionEmptyHint: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.md,
  },
  gridRow: {
    flexDirection: 'row',
    gap: THEME.spacing.md,
    marginBottom: THEME.spacing.md,
  },
  gridCard: {
    flex: 1,
  },
  gridCardPlaceholder: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    right: THEME.spacing.xl,
    bottom: THEME.spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 6,
    backgroundColor: THEME.colors.primary,
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    justifyContent: 'center',
    alignItems: 'center',
    ...THEME.pixelShadow,
  },
  fabText: {
    fontSize: 28,
    color: THEME.colors.onPrimary,
    fontWeight: '700',
    lineHeight: 32,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
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
  },
  modalActions: {
    gap: THEME.spacing.sm,
  },
  modalBtn: {
    width: '100%',
  },
  sheetSectionTitle: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.sm,
  },
  sheetOptionRow: {
    flexDirection: 'row',
    gap: THEME.spacing.sm,
    marginBottom: THEME.spacing.lg,
  },
  sheetOptionChip: {
    flex: 1,
    paddingVertical: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.sm,
    borderRadius: THEME.borderRadius,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.background,
    alignItems: 'center',
  },
  sheetOptionChipActive: {
    borderColor: THEME.colors.borderDark,
    backgroundColor: THEME.colors.primaryLight + '30',
  },
  sheetOptionText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  sheetOptionTextActive: {
    color: THEME.colors.primary,
  },
  sheetCloseButton: {
    width: '100%',
  },
  helpSection: {
    marginBottom: 4,
  },
  helpTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: THEME.spacing.xs,
  },
  helpTagText: {
    fontSize: 11,
    color: THEME.colors.onPrimary,
    fontWeight: '700',
  },
  helpBody: {
    fontSize: 12,
    color: THEME.colors.textPrimary,
    lineHeight: 18,
    marginBottom: THEME.spacing.sm,
  },
  helpFormula: {
    backgroundColor: THEME.colors.background,
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: THEME.colors.border,
  },
  helpFormulaText: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    fontStyle: 'italic',
  },
  helpDivider: {
    height: 1,
    backgroundColor: THEME.colors.border,
    marginVertical: THEME.spacing.md,
  },
  helpCloseBtn: {
    marginTop: THEME.spacing.md,
    width: '100%',
  },
  reminderCard: {
    backgroundColor: THEME.colors.warningBg,
    borderWidth: 2,
    borderColor: THEME.colors.warning,
    borderRadius: THEME.borderRadius,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.md,
    ...THEME.pixelShadow,
  },
  warrantyFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 2,
  },
  warrantyFilterChip: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
  },
  warrantyFilterChipActive: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primaryDark,
  },
  warrantyFilterChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.textSecondary,
  },
  warrantyFilterChipTextActive: {
    color: THEME.colors.surface,
  },
  batchRedeemBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: THEME.colors.success,
    borderWidth: 2,
    borderColor: THEME.colors.success,
    borderRadius: THEME.borderRadius,
    paddingVertical: THEME.spacing.md,
    paddingHorizontal: THEME.spacing.lg,
    marginBottom: THEME.spacing.md,
    ...THEME.pixelShadow,
  },
  batchRedeemBannerText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '900',
    color: THEME.colors.surface,
    flex: 1,
  },
  batchRedeemBannerArrow: {
    fontSize: THEME.fontSize.lg,
    fontWeight: '900',
    color: THEME.colors.surface,
    marginLeft: THEME.spacing.sm,
  },
  dormantCardBanner: {
    backgroundColor: THEME.colors.warningBg,
    borderWidth: 2,
    borderColor: THEME.colors.warning,
    borderRadius: THEME.borderRadius,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.md,
    ...THEME.pixelShadow,
  },
  dormantCardBannerTitle: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '900',
    color: THEME.colors.warning,
    marginBottom: 2,
  },
  dormantCardBannerHint: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.sm,
    lineHeight: 16,
  },
  dormantCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: THEME.spacing.sm,
    backgroundColor: THEME.colors.surface,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: 4,
  },
  dormantCardName: {
    flex: 1,
    fontSize: THEME.fontSize.xs,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginRight: THEME.spacing.sm,
  },
  dormantCardMeta: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '800',
    color: THEME.colors.dangerDark,
  },
  dormantCardMore: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  reminderTitle: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '900',
    color: THEME.colors.borderDark,
    marginBottom: THEME.spacing.sm,
  },
  reminderSection: {
    marginBottom: THEME.spacing.sm,
  },
  reminderSectionLabel: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: THEME.spacing.xs,
  },
  reminderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: THEME.spacing.sm,
    backgroundColor: THEME.colors.surface,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: 4,
  },
  reminderRowName: {
    flex: 1,
    fontSize: THEME.fontSize.xs,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginRight: THEME.spacing.sm,
  },
  reminderRowMeta: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '800',
    color: THEME.colors.dangerDark,
  },
});
