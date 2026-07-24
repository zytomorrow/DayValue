/**
 * PixelPieChart - 纯 React Native 实现的占比可视化组件
 *
 * 用于替换 react-native-chart-kit 的 PieChart，彻底避免对
 * react-native-svg 原生模块的依赖。原生模块缺失时顶层 import
 * 会直接让 App 闪退，因此这里用纯 View + Text 实现。
 *
 * 视觉：水平条形占比图，每行 = 一个分类，
 * 彩色条按比例填充，右侧显示数值与百分比。
 * 相比饼图更易读、性能更好、零原生依赖。
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { THEME } from '../utils/constants';

export interface PieSlice {
  /** 数值（>0 才会绘制） */
  value: number;
  /** 扇形/条形颜色 */
  color: string;
  /** 图例标签 */
  name: string;
}

interface PixelPieChartProps {
  data: PieSlice[];
  /** 容器宽度（条形图按容器宽度比例填充） */
  width?: number;
  /** 数值格式化函数，默认原样显示 */
  formatValue?: (value: number) => string;
  style?: ViewStyle;
}

export function PixelPieChart({
  data,
  width = 280,
  formatValue,
  style,
}: PixelPieChartProps) {
  const total = useMemo(
    () => data.reduce((sum, item) => sum + Math.max(0, item.value), 0),
    [data],
  );

  const fmt = formatValue ?? ((v: number) => String(Math.round(v * 100) / 100));

  if (total <= 0 || data.length === 0) {
    return (
      <View style={[styles.placeholder, { width }, style]}>
        <Text style={styles.placeholderText}>暂无数据</Text>
      </View>
    );
  }

  const items = data
    .filter(item => item.value > 0)
    .map(item => ({
      ...item,
      ratio: item.value / total,
    }));

  return (
    <View style={[styles.container, { width }, style]}>
      {items.map((item, index) => {
        const percent = (item.ratio * 100).toFixed(1);
        return (
          <View key={index} style={styles.row}>
            <View style={styles.labelRow}>
              <View style={[styles.colorDot, { backgroundColor: item.color }]} />
              <Text style={styles.label} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.value}>
                {fmt(item.value)} · {percent}%
              </Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${Math.max(2, item.ratio * 100)}%`,
                    backgroundColor: item.color,
                  },
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    paddingVertical: THEME.spacing.xs,
  },
  placeholder: {
    padding: THEME.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.colors.background,
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    borderRadius: 4,
  },
  placeholderText: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
  },
  row: {
    marginBottom: THEME.spacing.sm,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: THEME.colors.borderDark,
    marginRight: THEME.spacing.xs,
  },
  label: {
    flex: 1,
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textPrimary,
    fontWeight: '600',
  },
  value: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  barTrack: {
    height: 14,
    backgroundColor: THEME.colors.surfaceMuted,
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
  },
});
