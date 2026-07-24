/**
 * ErrorBoundary - 全局错误边界
 *
 * 捕获子树渲染期同步错误，避免整个应用闪退到黑屏。
 * 主要用途：
 *  - 数据库初始化失败时（SQLiteProvider 默认会 rethrow onInit 错误）
 *  - 任意组件渲染期 throw 时
 *  - useMemo / useState 初始化抛错时
 *
 * 错误信息会以像素风卡片展示，便于用户截图反馈。
 */
import React, { Component, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { THEME } from '../utils/constants';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary 捕获到错误:', error, info);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.emoji}>💥</Text>
          <Text style={styles.title}>应用遇到问题</Text>
          <Text style={styles.desc}>
            很抱歉，应用在启动或渲染时出现了错误。请截图反馈以下信息给开发者，便于定位修复。
          </Text>
          <View style={styles.errorBox}>
            <Text style={styles.errorName}>{error.name}: {error.message}</Text>
            {error.stack ? (
              <Text style={styles.errorStack}>{error.stack}</Text>
            ) : null}
          </View>
          <Text style={styles.hint}>
            可尝试卸载重装应用以重置本地数据库；如问题持续，请反馈以上错误信息。
          </Text>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  content: {
    padding: THEME.spacing.lg,
    alignItems: 'stretch',
  },
  emoji: {
    fontSize: 48,
    textAlign: 'center',
    marginVertical: THEME.spacing.md,
  },
  title: {
    fontSize: THEME.fontSize.lg,
    fontWeight: '900',
    color: THEME.colors.dangerDark,
    textAlign: 'center',
    marginBottom: THEME.spacing.sm,
  },
  desc: {
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginBottom: THEME.spacing.md,
    lineHeight: 20,
  },
  errorBox: {
    backgroundColor: THEME.colors.surface,
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    borderRadius: 4,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.md,
  },
  errorName: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '700',
    color: THEME.colors.dangerDark,
    marginBottom: THEME.spacing.xs,
  },
  errorStack: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    fontFamily: 'monospace',
    lineHeight: 14,
  },
  hint: {
    fontSize: THEME.fontSize.xs,
    color: THEME.colors.textLight,
    textAlign: 'center',
    lineHeight: 16,
  },
});
