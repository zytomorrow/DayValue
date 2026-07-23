/**
 * DatePickerField - 像素风日期选择器
 *
 * 不再依赖系统 DateTimePicker 的 spinner，改用自定义 Modal + 三列滚轮（年/月/日），
 * 视觉与应用整体粗野/像素风一致：2px 黑边框 + 硬阴影 + 选中项高亮条。
 *
 * 兼容 iOS / Android。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { THEME } from '../utils/constants';
import { formatDate } from '../utils/formatters';

interface DatePickerFieldProps {
  label: string;
  value: string; // 'YYYY-MM-DD'
  onChange: (dateStr: string) => void;
  style?: ViewStyle;
}

const ITEM_HEIGHT = 44;
const VISIBLE_COUNT = 5; // 单数，居中高亮
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_COUNT;

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_MIN = CURRENT_YEAR - 30;
const YEAR_MAX = CURRENT_YEAR + 10;
const YEARS = Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function buildDays(year: number, month: number): number[] {
  return Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1);
}

function parseValue(value: string): { year: number; month: number; day: number } {
  const now = new Date();
  const fallback = { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  if (!value) return fallback;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return fallback;
  return { year: y, month: m, day: d };
}

export function DatePickerField({ label, value, onChange, style }: DatePickerFieldProps) {
  const [show, setShow] = useState(false);

  const dateValue = useMemo(() => parseValue(value), [value]);

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={styles.field}
        onPress={() => setShow(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.fieldText}>{value ? formatDate(value) : '请选择日期'}</Text>
        <Text style={styles.icon}>📅</Text>
      </TouchableOpacity>

      <PixelDatePickerModal
        visible={show}
        initialYear={dateValue.year}
        initialMonth={dateValue.month}
        initialDay={dateValue.day}
        onConfirm={(y, m, d) => {
          const mm = String(m).padStart(2, '0');
          const dd = String(d).padStart(2, '0');
          onChange(`${y}-${mm}-${dd}`);
          setShow(false);
        }}
        onClose={() => setShow(false)}
      />
    </View>
  );
}

// ===================== 像素风日期选择 Modal =====================

interface ModalProps {
  visible: boolean;
  initialYear: number;
  initialMonth: number;
  initialDay: number;
  onConfirm: (year: number, month: number, day: number) => void;
  onClose: () => void;
}

function PixelDatePickerModal({
  visible,
  initialYear,
  initialMonth,
  initialDay,
  onConfirm,
  onClose,
}: ModalProps) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [day, setDay] = useState(initialDay);
  const [mounted, setMounted] = useState(visible);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.92)).current;

  // 切换年份/月份时，若当前 day 超出新月天数，自动钳制。
  const days = useMemo(() => buildDays(year, month), [year, month]);
  useEffect(() => {
    if (day > days.length) setDay(days.length);
  }, [days, day]);

  useEffect(() => {
    if (visible) {
      setYear(initialYear);
      setMonth(initialMonth);
      setDay(initialDay);
      setMounted(true);
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 150,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(cardScale, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.back(1.4)),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }
    if (!mounted) return;
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 120,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cardScale, {
        toValue: 0.92,
        duration: 120,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [cardScale, initialDay, initialMonth, initialYear, mounted, overlayOpacity, visible]);

  if (!mounted) return null;

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <View style={modalStyles.root}>
        <Animated.View style={[modalStyles.overlay, { opacity: overlayOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[modalStyles.cardWrap, { transform: [{ scale: cardScale }] }]}
        >
          <View style={modalStyles.cardShadow} pointerEvents="none" />
          <View style={modalStyles.card}>
            <View style={modalStyles.titleBar}>
              <Text style={modalStyles.title}>选择日期</Text>
            </View>

            <View style={modalStyles.pickerArea}>
              <View style={modalStyles.highlightBar} pointerEvents="none" />
              <WheelColumn
                data={YEARS}
                value={year}
                onChange={setYear}
                format={(v) => `${v}年`}
              />
              <WheelColumn
                data={MONTHS}
                value={month}
                onChange={setMonth}
                format={(v) => `${String(v).padStart(2, '0')}月`}
              />
              <WheelColumn
                data={days}
                value={day}
                onChange={setDay}
                format={(v) => `${String(v).padStart(2, '0')}日`}
              />
            </View>

            <View style={modalStyles.buttonRow}>
              <Pressable
                style={[modalStyles.button, modalStyles.buttonOutline]}
                onPress={onClose}
                android_ripple={{ color: 'rgba(0,0,0,0.08)', radius: 0 }}
              >
                <Text style={modalStyles.buttonOutlineText}>取消</Text>
              </Pressable>
              <Pressable
                style={[modalStyles.button, modalStyles.buttonPrimary]}
                onPress={() => onConfirm(year, month, day)}
                android_ripple={{ color: 'rgba(255,255,255,0.18)', radius: 0 }}
              >
                <Text style={modalStyles.buttonPrimaryText}>确定</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ===================== 滚轮列 =====================

interface WheelColumnProps<T extends number> {
  data: T[];
  value: T;
  onChange: (v: T) => void;
  format: (v: T) => string;
}

function WheelColumn<T extends number>({ data, value, onChange, format }: WheelColumnProps<T>) {
  const scrollRef = useRef<ScrollView>(null);
  const [layoutReady, setLayoutReady] = useState(false);

  const selectedIndex = Math.max(0, data.indexOf(value));

  // 滚动到选中项（初次渲染与 value 外部变更时）。
  useEffect(() => {
    if (!layoutReady) return;
    const y = selectedIndex * ITEM_HEIGHT;
    scrollRef.current?.scrollTo({ y, animated: false });
  }, [layoutReady, selectedIndex]);

  const snapToIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(data.length - 1, index));
      const y = clamped * ITEM_HEIGHT;
      scrollRef.current?.scrollTo({ y, animated: true });
      if (data[clamped] !== value) {
        onChange(data[clamped]);
      }
    },
    [data, onChange, value],
  );

  const handleScrollEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const y = e.nativeEvent.contentOffset.y;
      const index = Math.round(y / ITEM_HEIGHT);
      snapToIndex(index);
    },
    [snapToIndex],
  );

  const pad = Math.floor(VISIBLE_COUNT / 2);

  return (
    <View style={wheelStyles.column}>
      <ScrollView
        ref={scrollRef}
        onLayout={() => setLayoutReady(true)}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={wheelStyles.content}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        overScrollMode="never"
        bounces={Platform.OS === 'ios'}
      >
        <View style={{ height: ITEM_HEIGHT * pad }} />
        {data.map((item, index) => {
          const active = item === value;
          return (
            <TouchableOpacity
              key={String(item)}
              style={wheelStyles.item}
              onPress={() => snapToIndex(index)}
              activeOpacity={0.7}
            >
              <Text style={[wheelStyles.itemText, active && wheelStyles.itemTextActive]}>
                {format(item)}
              </Text>
            </TouchableOpacity>
          );
        })}
        <View style={{ height: ITEM_HEIGHT * pad }} />
      </ScrollView>
    </View>
  );
}

// ===================== 样式 =====================

const styles = StyleSheet.create({
  container: {
    marginBottom: THEME.spacing.md,
  },
  label: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.xs,
  },
  field: {
    ...THEME.pixelBorder,
    backgroundColor: THEME.colors.surface,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm + 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldText: {
    fontSize: THEME.fontSize.md,
    color: THEME.colors.textPrimary,
    fontWeight: '600',
  },
  icon: {
    fontSize: 18,
  },
});

const modalStyles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  cardWrap: {
    width: '90%',
    maxWidth: 400,
    paddingRight: 5,
    paddingBottom: 5,
  },
  cardShadow: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    borderRadius: THEME.borderRadius,
  },
  card: {
    backgroundColor: THEME.colors.surface,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: THEME.borderRadius,
    overflow: 'hidden',
  },
  titleBar: {
    backgroundColor: THEME.colors.primary,
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.md,
  },
  title: {
    fontFamily: THEME.fontFamily.pixel,
    fontSize: 11,
    lineHeight: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  pickerArea: {
    flexDirection: 'row',
    height: PICKER_HEIGHT,
    backgroundColor: THEME.colors.background,
  },
  highlightBar: {
    position: 'absolute',
    top: (PICKER_HEIGHT - ITEM_HEIGHT) / 2,
    left: THEME.spacing.sm,
    right: THEME.spacing.sm,
    height: ITEM_HEIGHT,
    backgroundColor: THEME.colors.primaryLight + '24',
    borderWidth: 2,
    borderColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: THEME.spacing.sm,
    padding: THEME.spacing.md,
    borderTopWidth: 2,
    borderTopColor: '#000000',
    backgroundColor: THEME.colors.background,
  },
  button: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: THEME.borderRadius,
    paddingVertical: THEME.spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonOutline: {
    backgroundColor: THEME.colors.surface,
  },
  buttonPrimary: {
    backgroundColor: THEME.colors.primary,
  },
  buttonOutlineText: {
    fontSize: THEME.fontSize.md,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  buttonPrimaryText: {
    fontSize: THEME.fontSize.md,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

const wheelStyles = StyleSheet.create({
  column: {
    flex: 1,
    height: PICKER_HEIGHT,
  },
  content: {
    paddingVertical: 0,
  },
  item: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemText: {
    fontSize: THEME.fontSize.md,
    color: THEME.colors.textLight,
    fontWeight: '600',
  },
  itemTextActive: {
    color: THEME.colors.primaryDark,
    fontWeight: '800',
    fontSize: THEME.fontSize.lg,
  },
});
