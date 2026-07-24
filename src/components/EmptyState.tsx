import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { THEME } from '../utils/constants';
import { useTheme } from '../contexts/ThemeContext';

interface EmptyStateProps {
  message?: string;
  icon?: string;
}

export function EmptyState({
  message = '还没有记录，点击下方按钮添加吧！',
  icon = '📭',
}: EmptyStateProps) {
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  icon: {
    fontSize: 48,
    marginBottom: THEME.spacing.lg,
  },
  message: {
    fontSize: THEME.fontSize.md,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: THEME.spacing.xl,
  },
});
