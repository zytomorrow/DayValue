/**
 * PixelAlert - 像素风弹出提示框
 *
 * 替代系统 Alert.alert，提供与应用一致的粗野/像素风格：
 * - 2px 纯黑边框 + 右下硬阴影
 * - 标题使用像素字体
 * - 按钮使用 BrutalButton 风格
 *
 * 用法（推荐通过全局 showPixelAlert 函数调用，零改动替换 Alert.alert）：
 *   showPixelAlert('标题', '消息', [{ text: '确定' }])
 *
 * 或作为受控组件：
 *   <PixelAlert visible title="标题" message="消息" buttons={[...]} onDismiss={...} />
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { THEME } from '../utils/constants';

/** 单个按钮配置（与 RN Alert.alert 的 AlertButton 对齐）。 */
export interface PixelAlertButton {
  text: string;
  onPress?: () => void;
  /** default：主按钮；cancel：次要按钮（描边）；destructive：危险（红色）。 */
  style?: 'default' | 'cancel' | 'destructive';
}

export interface PixelAlertProps {
  visible: boolean;
  title?: string;
  message?: string;
  buttons?: PixelAlertButton[];
  onDismiss?: () => void;
}

export function PixelAlert({
  visible,
  title,
  message,
  buttons,
  onDismiss,
}: PixelAlertProps) {
  const [mounted, setMounted] = useState(visible);
  const overlayOpacity = useState(new Animated.Value(0))[0];
  const cardScale = useState(new Animated.Value(0.9))[0];

  useEffect(() => {
    if (visible) {
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
  }, [cardScale, mounted, overlayOpacity, visible]);

  const handleButtonPress = useCallback(
    (btn: PixelAlertButton) => {
      onDismiss?.();
      // 在弹窗关闭后再触发回调，避免回调里立即弹新弹窗时动画错乱。
      btn.onPress?.();
    },
    [onDismiss],
  );

  if (!mounted) return null;

  const safeButtons = buttons && buttons.length > 0 ? buttons : [{ text: '好的' }];

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onDismiss}>
      <View style={styles.root}>
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
        </Animated.View>

        <Animated.View
          style={[styles.cardWrap, { transform: [{ scale: cardScale }] }]}
        >
          <View style={styles.cardShadow} pointerEvents="none" />
          <View style={styles.card}>
            {title ? (
              <View style={styles.titleBar}>
                <Text style={styles.title}>{title}</Text>
              </View>
            ) : null}

            {message ? (
              <ScrollView style={styles.messageScroll} contentContainerStyle={styles.messageContent}>
                <Text style={styles.message}>{message}</Text>
              </ScrollView>
            ) : null}

            <View style={styles.buttonRow}>
              {safeButtons.map((btn, index) => {
                const variant = btn.style === 'destructive' ? 'danger' : btn.style === 'cancel' ? 'outline' : 'primary';
                return (
                  <Pressable
                    key={`${btn.text}-${index}`}
                    style={[
                      styles.button,
                      styles[`button_${variant}` as keyof typeof styles] as object,
                      safeButtons.length === 1 && styles.buttonFull,
                    ]}
                    onPress={() => handleButtonPress(btn)}
                    android_ripple={{ color: 'rgba(255,255,255,0.18)', radius: 0 }}
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        styles[`buttonText_${variant}` as keyof typeof styles] as object,
                      ]}
                    >
                      {btn.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    width: '86%',
    maxWidth: 380,
    paddingRight: 5,
    paddingBottom: 5,
  },
  cardShadow: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: 0,
    bottom: 0,
    backgroundColor: THEME.colors.borderDark,
    borderRadius: THEME.borderRadius,
  },
  card: {
    backgroundColor: THEME.colors.surface,
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    borderRadius: THEME.borderRadius,
    overflow: 'hidden',
  },
  titleBar: {
    backgroundColor: THEME.colors.primary,
    borderBottomWidth: 2,
    borderBottomColor: THEME.colors.borderDark,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.md,
  },
  title: {
    fontFamily: THEME.fontFamily.pixel,
    fontSize: 11,
    lineHeight: 16,
    color: THEME.colors.onPrimary,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  messageScroll: {
    maxHeight: 280,
  },
  messageContent: {
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: THEME.spacing.lg,
  },
  message: {
    fontSize: THEME.fontSize.sm,
    lineHeight: 20,
    color: THEME.colors.textPrimary,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: THEME.spacing.sm,
    padding: THEME.spacing.md,
    borderTopWidth: 2,
    borderTopColor: THEME.colors.borderDark,
    backgroundColor: THEME.colors.background,
  },
  button: {
    flex: 1,
    minWidth: 90,
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    borderRadius: THEME.borderRadius,
    paddingVertical: THEME.spacing.sm + 2,
    paddingHorizontal: THEME.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonFull: {
    flexBasis: '100%',
  },
  button_primary: {
    backgroundColor: THEME.colors.primary,
  },
  button_outline: {
    backgroundColor: THEME.colors.surface,
  },
  button_danger: {
    backgroundColor: THEME.colors.danger,
  },
  buttonText: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  buttonText_primary: {
    color: THEME.colors.onPrimary,
  },
  buttonText_outline: {
    color: THEME.colors.textPrimary,
  },
  buttonText_danger: {
    color: THEME.colors.onPrimary,
  },
});
