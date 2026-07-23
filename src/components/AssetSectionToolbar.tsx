import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { THEME } from '../utils/constants';

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

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
    marginBottom: THEME.spacing.md,
  },
  title: {
    minWidth: 64,
    fontSize: THEME.fontSize.lg,
    fontWeight: '800',
    color: THEME.colors.textSecondary,
  },
  iconButton: {
    width: 38,
    height: 38,
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
    minHeight: 38,
    paddingHorizontal: THEME.spacing.md,
    borderRadius: THEME.borderRadius,
    borderWidth: 1.5,
    borderColor: THEME.colors.borderDark,
    backgroundColor: THEME.colors.surface,
    justifyContent: 'center',
  },
  sortText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  iconText: {
    fontSize: 18,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  iconTextActive: {
    color: THEME.colors.primaryDark,
  },
  stackIcon: {
    width: 18,
    height: 18,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  stackLayer: {
    borderWidth: 1.5,
    borderColor: THEME.colors.primary,
    borderRadius: 2,
  },
  stackLayerTop: {
    width: 12,
    height: 7,
    marginBottom: -2,
    backgroundColor: THEME.colors.surface,
  },
  stackLayerBottom: {
    width: 16,
    height: 9,
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
