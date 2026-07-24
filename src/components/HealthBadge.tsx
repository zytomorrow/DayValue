/**
 * HealthBadge - 资产健康度徽章
 * 综合服役进度、保修状态、资产状态给出 0-100 评分与等级徽章。
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { THEME } from '../utils/constants';
import { useTheme } from '../contexts/ThemeContext';
import type { HealthGrade } from '../utils/calculations';

interface HealthBadgeProps {
  grade: HealthGrade;
  score?: number;
  /** 紧凑模式：仅显示等级字母（用于卡片角落） */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

const GRADE_META: Record<
  HealthGrade,
  { label: string; short: string; bg: string; text: string; emoji: string }
> = {
  excellent: {
    label: '优秀',
    short: 'A',
    bg: THEME.colors.success,
    text: THEME.colors.onPrimary,
    emoji: '💪',
  },
  good: {
    label: '良好',
    short: 'B',
    bg: THEME.colors.accent,
    text: THEME.colors.onPrimary,
    emoji: '✓',
  },
  fair: {
    label: '一般',
    short: 'C',
    bg: THEME.colors.warning,
    text: THEME.colors.borderDark,
    emoji: '~',
  },
  poor: {
    label: '堪忧',
    short: 'D',
    bg: THEME.colors.danger,
    text: THEME.colors.onPrimary,
    emoji: '!',
  },
  unknown: {
    label: '未评估',
    short: '?',
    bg: THEME.colors.border,
    text: THEME.colors.textSecondary,
    emoji: '?',
  },
};

export function HealthBadge({
  grade,
  score,
  compact = false,
  style,
}: HealthBadgeProps) {
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);
  const meta = GRADE_META[grade];

  if (compact) {
    return (
      <View
        style={[
          styles.compact,
          { backgroundColor: meta.bg },
          style,
        ]}
      >
        <Text style={[styles.compactText, { color: meta.text }]}>
          {meta.short}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: meta.bg },
        style,
      ]}
    >
      <Text style={styles.emoji}>{meta.emoji}</Text>
      <Text style={[styles.label, { color: meta.text }]}>
        {meta.label}
        {typeof score === 'number' && grade !== 'unknown' ? ` ${score}` : ''}
      </Text>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: THEME.colors.borderDark,
    gap: 4,
    alignSelf: 'flex-start',
  },
  emoji: {
    fontSize: 11,
  },
  label: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '800',
  },
  compact: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: THEME.colors.borderDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactText: {
    fontSize: 11,
    fontWeight: '900',
  },
});
