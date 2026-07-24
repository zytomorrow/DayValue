/**
 * ServiceProgressBar - 像素风服役进度条
 * 用方块刻度直观展示资产已服役进度（激活天数 / 预期使用天数）。
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { THEME } from '../utils/constants';
import { useTheme } from '../contexts/ThemeContext';

interface ServiceProgressBarProps {
  /** 进度 0~1 */
  progress: number;
  /** 右侧文案，例如 "365 / 730 天" */
  valueText?: string;
  /** 已超出预期服役期时变色提示 */
  overService?: boolean;
  /** 左侧标签 */
  label?: string;
  style?: StyleProp<ViewStyle>;
}

const BLOCK_COUNT = 10;

export function ServiceProgressBar({
  progress,
  valueText,
  overService = false,
  label = '服役',
  style,
}: ServiceProgressBarProps) {
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);
  const clamped = Math.min(Math.max(progress, 0), 1);
  const filled = Math.round(clamped * BLOCK_COUNT);
  const fillColor = overService ? THEME.colors.danger : THEME.colors.success;

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.bar}>
        {Array.from({ length: BLOCK_COUNT }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.block,
              index < filled
                ? { backgroundColor: fillColor }
                : styles.blockEmpty,
            ]}
          />
        ))}
      </View>
      {valueText ? (
        <Text
          style={[styles.value, overService && { color: THEME.colors.dangerDark }]}
          numberOfLines={1}
        >
          {valueText}
        </Text>
      ) : null}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
  },
  label: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textSecondary,
    width: 42,
  },
  bar: {
    flexDirection: 'row',
    gap: 2,
    flex: 1,
  },
  block: {
    flex: 1,
    height: 8,
    borderRadius: 1,
    borderWidth: 1,
    borderColor: THEME.colors.borderDark,
  },
  blockEmpty: {
    backgroundColor: THEME.colors.background,
  },
  value: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    minWidth: 64,
    textAlign: 'right',
  },
});
