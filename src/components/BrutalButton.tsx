/**
 * BrutalButton - 新粗野主义风格按钮
 * 特征：2px 纯黑边框 + 右下角 4px 偏移的纯黑实心硬阴影（无模糊）
 */
import React, { useMemo } from 'react';
import {
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { THEME } from '../utils/constants';
import { useTheme } from '../contexts/ThemeContext';

export interface BrutalButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'accent' | 'danger' | 'success' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

const SIZING = {
  sm: { pv:  7, ph: 14, fs: THEME.fontSize.sm },
  md: { pv: 12, ph: 22, fs: THEME.fontSize.md },
  lg: { pv: 16, ph: 28, fs: THEME.fontSize.lg },
};

export function BrutalButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  style,
}: BrutalButtonProps) {
  const s = SIZING[size];
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);
  const BG: Record<string, string> = {
    primary: THEME.colors.primary,
    accent:  THEME.colors.accent,
    danger:  THEME.colors.danger,
    success: THEME.colors.success,
    outline: THEME.colors.surface,
  };
  const FG: Record<string, string> = {
    primary: THEME.colors.onPrimary,
    accent:  THEME.colors.onPrimary,
    danger:  THEME.colors.onPrimary,
    success: THEME.colors.onPrimary,
    outline: THEME.colors.borderDark,
  };
  const bg = disabled ? THEME.colors.border : BG[variant];
  const fg = disabled ? THEME.colors.textSecondary : FG[variant];

  return (
    // paddingRight + paddingBottom 为硬阴影留出空间
    <View style={[styles.wrapper, style]}>
      {/* 硬阴影层：从 (4,4) 开始，延伸到包装容器的右下边缘 */}
      <View style={styles.shadow} pointerEvents="none" />

      {/* 实际按钮 */}
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.85}
        style={[
          styles.button,
          {
            backgroundColor: bg,
            paddingVertical: s.pv,
            paddingHorizontal: s.ph,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={fg} size="small" />
        ) : (
          <Text style={[styles.text, { color: fg, fontSize: s.fs }]}>{title}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  wrapper: {
    paddingRight: 4,
    paddingBottom: 4,
  } as ViewStyle,
  shadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 0,
    bottom: 0,
    backgroundColor: THEME.colors.borderDark,
    borderRadius: THEME.borderRadius,
  } as ViewStyle,
  button: {
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    borderRadius: THEME.borderRadius,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  text: {
    fontWeight: '700',
    letterSpacing: 0.3,
  } as TextStyle,
});
