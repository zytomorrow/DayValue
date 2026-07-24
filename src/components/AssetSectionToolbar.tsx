import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { THEME } from '../utils/constants';
import { useTheme } from '../contexts/ThemeContext';

interface AssetSectionToolbarProps {
  title: string;
  sortSummary: string;
  layoutMode: 'list' | 'grid';
  grouped: boolean;
  onPressSort: () => void;
  onToggleLayout: () => void;
  onToggleGrouped: () => void;
}

export function AssetSectionToolbar({
  title,
  sortSummary,
  layoutMode,
  grouped,
  onPressSort,
  onToggleLayout,
  onToggleGrouped,
}: AssetSectionToolbarProps) {
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);
  return (
    <View style={styles.toolbar}>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <TouchableOpacity
        style={[styles.iconButton, grouped && styles.iconButtonActive]}
        onPress={onToggleGrouped}
        activeOpacity={0.76}
        accessibilityLabel="切换分组"
      >
        <View style={styles.stackIcon}>
          <View style={[styles.stackLayer, styles.stackLayerTop, grouped && styles.stackLayerTopActive]} />
          <View style={[styles.stackLayer, styles.stackLayerBottom, grouped && styles.stackLayerBottomActive]} />
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.sortButton}
        onPress={onPressSort}
        activeOpacity={0.76}
      >
        <Text style={styles.sortText} numberOfLines={1}>
          {sortSummary}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.iconButton}
        onPress={onToggleLayout}
        activeOpacity={0.76}
        accessibilityLabel="切换布局"
      >
        <Text style={styles.iconText}>{layoutMode === 'list' ? '⊞' : '≡'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  title: {
    minWidth: 56,
    fontSize: THEME.fontSize.md,
    fontWeight: '800',
    color: THEME.colors.textSecondary,
  },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: THEME.borderRadius,
    borderWidth: 1.5,
    borderColor: THEME.colors.borderDark,
    backgroundColor: THEME.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButtonActive: {
    backgroundColor: THEME.colors.primaryLight + '40',
    borderColor: THEME.colors.primaryDark,
  },
  sortButton: {
    flex: 1,
    minHeight: 30,
    paddingHorizontal: THEME.spacing.sm,
    borderRadius: THEME.borderRadius,
    borderWidth: 1.5,
    borderColor: THEME.colors.borderDark,
    backgroundColor: THEME.colors.surface,
    justifyContent: 'center',
  },
  sortText: {
    fontSize: THEME.fontSize.xs,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  iconText: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  iconTextActive: {
    color: THEME.colors.primaryDark,
  },
  stackIcon: {
    width: 15,
    height: 15,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  stackLayer: {
    borderWidth: 1.5,
    borderColor: THEME.colors.primary,
    borderRadius: 2,
  },
  stackLayerTop: {
    width: 10,
    height: 6,
    marginBottom: -2,
    backgroundColor: THEME.colors.surface,
  },
  stackLayerBottom: {
    width: 13,
    height: 7,
    backgroundColor: THEME.colors.primary,
  },
  stackLayerTopActive: {
    borderColor: THEME.colors.primaryDark,
    backgroundColor: THEME.colors.primaryLight,
  },
  stackLayerBottomActive: {
    borderColor: THEME.colors.primaryDark,
    backgroundColor: THEME.colors.primaryDark,
  },
});
