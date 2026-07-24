/**
 * AccessorySection - 通用配件管理区块
 *
 * 可挂在物品 / 订阅 / 储值卡详情页，自管理配件列表的加载、增删改查与状态切换。
 * 通过 entityType + entityId 区分归属。
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import type { Accessory, AccessoryEntityType, AccessoryStatus } from '../types';
import {
  createAccessory,
  deleteAccessory,
  deleteAccessoriesByEntity,
  getAccessoriesByEntity,
  updateAccessory,
} from '../database';
import { formatCurrency, formatDate, getTodayString } from '../utils/formatters';
import { THEME } from '../utils/constants';
import { useTheme } from '../contexts/ThemeContext';
import { BrutalButton, DatePickerField, PixelInput } from '.';
import { alertConfirm, alertError } from '../utils/pixelAlert';

interface AccessorySectionProps {
  entityType: AccessoryEntityType;
  entityId: number;
  /** 空态文案中的实体描述，例如「资产」「订阅」「储值卡」 */
  entityLabel?: string;
}

export function AccessorySection({
  entityType,
  entityId,
  entityLabel = '资产',
}: AccessorySectionProps) {
  const db = useSQLiteContext();
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);

  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [buyDate, setBuyDate] = useState(getTodayString());
  const [status, setStatus] = useState<AccessoryStatus>('in_use');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await getAccessoriesByEntity(db, entityType, entityId);
      setAccessories(list);
    } catch (error) {
      console.error('加载配件失败', error);
    }
  }, [db, entityType, entityId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /** 配件总成本（在用+损坏的，不含丢失的） */
  const totalCost = useMemo(() => {
    return accessories
      .filter(a => a.status !== 'lost')
      .reduce((sum, a) => sum + a.quantity * a.unit_price, 0);
  }, [accessories]);

  function openAdd() {
    setEditingId(null);
    setName('');
    setQuantity('1');
    setUnitPrice('');
    setBuyDate(getTodayString());
    setStatus('in_use');
    setNotes('');
    setModalVisible(true);
  }

  function openEdit(acc: Accessory) {
    setEditingId(acc.id);
    setName(acc.name);
    setQuantity(String(acc.quantity));
    setUnitPrice(acc.unit_price > 0 ? String(acc.unit_price) : '');
    setBuyDate(acc.buy_date ?? getTodayString());
    setStatus(acc.status);
    setNotes(acc.notes ?? '');
    setModalVisible(true);
  }

  async function handleSave() {
    if (busy) return;
    if (!name.trim()) {
      alertError('提示', '请输入配件名称');
      return;
    }
    const qtyNum = parseInt(quantity, 10);
    if (Number.isNaN(qtyNum) || qtyNum < 1) {
      alertError('提示', '数量必须为 ≥1 的整数');
      return;
    }
    const priceNum = parseFloat(unitPrice);
    if (unitPrice.trim() !== '' && (Number.isNaN(priceNum) || priceNum < 0)) {
      alertError('提示', '请输入有效的单价（≥ 0）');
      return;
    }

    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        quantity: qtyNum,
        unit_price: unitPrice.trim() === '' ? 0 : priceNum,
        buy_date: buyDate || null,
        status,
        notes: notes.trim() ? notes.trim() : null,
      };
      if (editingId !== null) {
        await updateAccessory(db, editingId, payload);
      } else {
        await createAccessory(db, { ...payload, entity_type: entityType, item_id: entityId });
      }
      setModalVisible(false);
      await load();
    } catch (error) {
      alertError('错误', error instanceof Error ? error.message : '保存配件失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleCycleStatus(acc: Accessory) {
    // 在用 → 损坏 → 丢失 → 在用
    const next: AccessoryStatus =
      acc.status === 'in_use' ? 'damaged'
      : acc.status === 'damaged' ? 'lost'
      : 'in_use';
    try {
      await updateAccessory(db, acc.id, { status: next });
      await load();
    } catch (error) {
      alertError('错误', error instanceof Error ? error.message : '更新状态失败');
    }
  }

  function handleDelete(accId: number) {
    alertConfirm('删除配件', '确定要删除这个配件吗？', async () => {
      try {
        await deleteAccessory(db, accId);
        await load();
      } catch (error) {
        alertError('错误', error instanceof Error ? error.message : '删除失败');
      }
    }, { confirmText: '删除', destructive: true });
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>🔌 配件列表</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.75}>
          <Text style={styles.addBtnText}>+ 新增</Text>
        </TouchableOpacity>
      </View>
      {accessories.length > 0 && (
        <Text style={styles.summary}>
          共 {accessories.length} 项 · 在用成本 {formatCurrency(totalCost)}
        </Text>
      )}
      {accessories.length === 0 ? (
        <Text style={styles.empty}>
          还没有配件记录。为该{entityLabel}添加配件可以更准确地核算持有成本。
        </Text>
      ) : (
        <View style={styles.list}>
          {accessories.map(acc => {
            const isLost = acc.status === 'lost';
            const isDamaged = acc.status === 'damaged';
            const lineTotal = acc.quantity * acc.unit_price;
            return (
              <View
                key={acc.id}
                style={[
                  styles.row,
                  isLost && styles.rowLost,
                  isDamaged && styles.rowDamaged,
                ]}
              >
                <View style={styles.rowMain}>
                  <View style={styles.rowHeader}>
                    <Text
                      style={[styles.rowName, isLost && styles.rowNameDim]}
                      numberOfLines={1}
                    >
                      {acc.name}
                      {acc.quantity > 1 ? ` ×${acc.quantity}` : ''}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.statusBadge,
                        isLost
                          ? styles.statusLost
                          : isDamaged
                            ? styles.statusDamaged
                            : styles.statusInUse,
                      ]}
                      onPress={() => handleCycleStatus(acc)}
                      activeOpacity={0.6}
                    >
                      <Text style={styles.statusText}>
                        {isLost ? '丢失' : isDamaged ? '损坏' : '在用'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.rowMeta}>
                    单价 {acc.unit_price > 0 ? formatCurrency(acc.unit_price) : '—'}
                    {lineTotal > 0 && acc.quantity > 1 ? ` · 小计 ${formatCurrency(lineTotal)}` : ''}
                    {acc.buy_date ? ` · 购于 ${formatDate(acc.buy_date)}` : ''}
                  </Text>
                  {acc.notes ? (
                    <Text style={styles.rowNotes} numberOfLines={2}>
                      {acc.notes}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.rowActions}>
                  <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(acc)} activeOpacity={0.6}>
                    <Text style={styles.editBtnText}>编辑</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(acc.id)} activeOpacity={0.6}>
                    <Text style={styles.deleteBtnText}>×</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              {editingId !== null ? '编辑配件' : '新增配件'}
            </Text>
            <Text style={styles.modalDesc}>
              记录配件信息（手柄、遥控器、充电线等），便于核算真实持有成本。
            </Text>
            <PixelInput
              label="名称"
              value={name}
              onChangeText={setName}
              placeholder="例如：手柄 / 充电器 / 收纳盒"
            />
            <PixelInput
              label="数量"
              value={quantity}
              onChangeText={setQuantity}
              placeholder="1"
              keyboardType="decimal-pad"
            />
            <PixelInput
              label="单价（可选）"
              value={unitPrice}
              onChangeText={setUnitPrice}
              placeholder="0"
              keyboardType="decimal-pad"
            />
            <DatePickerField
              label="购买日期（可选）"
              value={buyDate}
              onChange={setBuyDate}
            />
            <Text style={styles.fieldLabel}>状态</Text>
            <View style={styles.statusPicker}>
              {(['in_use', 'damaged', 'lost'] as AccessoryStatus[]).map(s => {
                const active = status === s;
                const label = s === 'in_use' ? '在用' : s === 'damaged' ? '损坏' : '丢失';
                return (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.statusPickerItem,
                      active && (
                        s === 'in_use'
                          ? styles.statusInUse
                          : s === 'damaged'
                            ? styles.statusDamaged
                            : styles.statusLost
                      ),
                    ]}
                    onPress={() => setStatus(s)}
                    activeOpacity={0.6}
                  >
                    <Text
                      style={[
                        styles.statusPickerText,
                        active && styles.statusPickerTextActive,
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
              value={notes}
              onChangeText={setNotes}
              placeholder="例如：第二个手柄 / 已划痕"
              multiline
            />
            <View style={styles.modalActions}>
              <BrutalButton
                title={editingId !== null ? '保存修改' : '添加配件'}
                onPress={handleSave}
                loading={busy}
                variant="primary"
                size="md"
                style={styles.modalBtn}
              />
              <BrutalButton
                title="取消"
                onPress={() => setModalVisible(false)}
                variant="outline"
                size="md"
                style={styles.modalBtn}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  card: {
    backgroundColor: THEME.colors.surface,
    ...THEME.pixelBorder,
    ...THEME.pixelShadow,
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: THEME.spacing.xs,
  },
  title: {
    fontSize: THEME.fontSize.md,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  addBtn: {
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    borderWidth: 1.5,
    borderColor: THEME.colors.primary,
    borderRadius: 4,
    backgroundColor: THEME.colors.primaryLight + '20',
  },
  addBtnText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '800',
    color: THEME.colors.primaryDark,
  },
  summary: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.sm,
  },
  empty: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
  },
  list: {
    gap: THEME.spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.sm,
    backgroundColor: THEME.colors.background,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: 4,
  },
  rowLost: {
    borderWidth: 1,
    borderColor: THEME.colors.danger,
    backgroundColor: THEME.colors.dangerBg,
    opacity: 0.75,
  },
  rowDamaged: {
    borderWidth: 1.5,
    borderColor: THEME.colors.warning,
    backgroundColor: THEME.colors.warningBg,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
    gap: THEME.spacing.xs,
  },
  rowName: {
    flex: 1,
    fontSize: THEME.fontSize.sm,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginRight: THEME.spacing.sm,
  },
  rowNameDim: {
    textDecorationLine: 'line-through',
    color: THEME.colors.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 1,
  },
  statusInUse: {
    backgroundColor: THEME.colors.successBg,
    borderColor: THEME.colors.success,
  },
  statusDamaged: {
    backgroundColor: THEME.colors.warningBg,
    borderColor: THEME.colors.warning,
  },
  statusLost: {
    backgroundColor: THEME.colors.dangerBg,
    borderColor: THEME.colors.danger,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  rowMeta: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
  },
  rowNotes: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    marginTop: 2,
    fontStyle: 'italic',
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: THEME.spacing.sm,
    gap: THEME.spacing.xs,
  },
  editBtn: {
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    borderWidth: 1.5,
    borderColor: THEME.colors.primary,
    borderRadius: 4,
    backgroundColor: THEME.colors.primaryLight + '20',
  },
  editBtnText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '800',
    color: THEME.colors.primaryDark,
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    fontSize: 16,
    fontWeight: '900',
    color: THEME.colors.dangerDark,
    lineHeight: 18,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: THEME.spacing.lg,
  },
  modal: {
    backgroundColor: THEME.colors.surface,
    ...THEME.pixelBorder,
    ...THEME.pixelShadow,
    padding: THEME.spacing.lg,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: THEME.fontSize.lg,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
    marginBottom: THEME.spacing.xs,
  },
  modalDesc: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textSecondary,
    lineHeight: 16,
    marginBottom: THEME.spacing.md,
  },
  fieldLabel: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: THEME.spacing.xs,
    marginTop: THEME.spacing.xs,
  },
  statusPicker: {
    flexDirection: 'row',
    gap: THEME.spacing.xs,
    marginBottom: THEME.spacing.md,
  },
  statusPickerItem: {
    flex: 1,
    paddingVertical: THEME.spacing.sm,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.background,
    alignItems: 'center',
  },
  statusPickerText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  statusPickerTextActive: {
    color: THEME.colors.textPrimary,
  },
  modalActions: {
    flexDirection: 'row',
    gap: THEME.spacing.sm,
    marginTop: THEME.spacing.sm,
  },
  modalBtn: {
    flex: 1,
  },
});
