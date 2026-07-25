/**
 * ShareModal - 分享预览弹窗
 * 展示 ShareCard 预览或任意完整页面内容，支持调起系统分享或保存至相册。
 *
 * 当传入 `content` 时（用于年度报告等完整页面导出），会在 ViewShot 中渲染该节点；
 * 否则使用 `data` 渲染 ShareCard。
 *
 * 注意：遮罩层使用 Pressable 作为独立背景，弹层 sheet 为纯 View，
 * 避免外层 Touchable 拦截手势导致预览 ScrollView 概率性划不动。
 */
import React, { useRef, useState, useMemo, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import { THEME } from '../utils/constants';
import { useTheme } from '../contexts/ThemeContext';
import { BrutalButton } from './BrutalButton';
import { ShareCard, type ShareCardData } from './ShareCard';
import { captureAndShareView, captureAndSaveToGallery } from '../utils/share';
import { alertError, alertSuccess } from '../utils/pixelAlert';

interface ShareModalProps {
  visible: boolean;
  /** ShareCard 数据；当传入 content 时此项忽略 */
  data?: ShareCardData | null;
  /** 自定义完整页面内容（如年度报告），优先于 data */
  content?: ReactNode;
  /** 自定义标题；不传则按 data.kind 推导 */
  title?: string;
  onClose: () => void;
}

type Action = 'share' | 'save';

/**
 * react-native-view-shot@4.x 的 ViewShot 组件实例类型。
 * v4 不再导出 ViewShotRef，这里用 InstanceType 推导组件实例。
 */
type ViewShotInstance = InstanceType<typeof ViewShot>;

export function ShareModal({ visible, data, content, title, onClose }: ShareModalProps) {
  const shotRef = useRef<ViewShotInstance>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);

  const hasCustomContent = content !== undefined && content !== null;

  async function runCapture(action: Action) {
    if (!shotRef.current || busy) return;
    // 截图前回到顶部，确保整张内容已完整渲染。
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    // 等待滚动完成后的重新渲染，避免截到滚动中间状态或阻塞手势。
    // requestAnimationFrame 等待一帧布局，额外延时给图片等异步资源留出渲染时间。
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    await new Promise<void>(resolve => setTimeout(resolve, 150));
    setBusy(action);
    try {
      if (action === 'share') {
        await captureAndShareView(shotRef);
      } else {
        await captureAndSaveToGallery(shotRef);
        alertSuccess('已保存', '分享卡片已保存到相册的 DayValue 相册。');
      }
    } catch (error) {
      alertError(
        action === 'share' ? '分享失败' : '保存失败',
        error instanceof Error ? error.message : '请稍后重试',
      );
    } finally {
      setBusy(null);
    }
  }

  const resolvedTitle =
    title ??
    (data?.kind === 'summary'
      ? '分享资产总览'
      : data?.kind === 'annual'
        ? '分享年度报告'
        : data?.kind === 'item'
          ? '分享资产卡片'
          : '分享订阅卡片');

  const isBusy = busy !== null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* 独立背景层：点击关闭，不包裹 sheet 以免拦截内部手势 */}
        <Pressable style={styles.backdrop} onPress={onClose} />
        {/* 弹层：纯 View，不拦截 ScrollView 的滑动手势 */}
        <View style={styles.sheet} pointerEvents="box-none">
          <View style={styles.sheetInner}>
            <View style={styles.header}>
              <Text style={styles.title}>{resolvedTitle}</Text>
              <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.previewWrap}>
              {(hasCustomContent || data) && (
                <ScrollView
                  ref={scrollRef}
                  style={styles.previewScroll}
                  contentContainerStyle={styles.previewContent}
                  showsVerticalScrollIndicator
                  bounces
                  // 关键：让 ScrollView 自身接管手势，不被外层阻断
                  nestedScrollEnabled
                >
                  <ViewShot
                    ref={shotRef}
                    options={{ format: 'png', quality: 1, result: 'tmpfile' }}
                    style={styles.shot}
                  >
                    {hasCustomContent ? content : data ? <ShareCard data={data} /> : null}
                  </ViewShot>
                </ScrollView>
              )}
            </View>

            <View style={styles.actions}>
              <View style={styles.actionCell}>
                <BrutalButton
                  title={busy === 'share' ? '...' : '📤'}
                  onPress={() => runCapture('share')}
                  variant="primary"
                  size="sm"
                  loading={busy === 'share'}
                  disabled={isBusy || (!hasCustomContent && !data)}
                  style={styles.actionBtn}
                />
                <Text style={styles.actionLabel}>分享</Text>
              </View>
              <View style={styles.actionCell}>
                <BrutalButton
                  title={busy === 'save' ? '...' : '💾'}
                  onPress={() => runCapture('save')}
                  variant="accent"
                  size="sm"
                  loading={busy === 'save'}
                  disabled={isBusy || (!hasCustomContent && !data)}
                  style={styles.actionBtn}
                />
                <Text style={styles.actionLabel}>保存</Text>
              </View>
              <View style={styles.actionCell}>
                <BrutalButton
                  title="✕"
                  onPress={onClose}
                  variant="outline"
                  size="sm"
                  disabled={isBusy}
                  style={styles.actionBtn}
                />
                <Text style={styles.actionLabel}>关闭</Text>
              </View>
            </View>

            {isBusy && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator color={THEME.colors.primary} />
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = () => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  // 独立背景层：铺满 overlay，位于 sheet 之下
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  // sheet 容器：不设背景，仅负责定位，pointerEvents box-none 让背景可点
  sheet: {
    width: '100%',
    maxWidth: 360,
  },
  sheetInner: {
    backgroundColor: THEME.colors.surface,
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    borderRadius: THEME.borderRadius,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: THEME.colors.primary,
    borderBottomWidth: 2,
    borderBottomColor: THEME.colors.borderDark,
  },
  title: {
    fontFamily: THEME.fontFamily.pixel,
    fontSize: 10,
    color: THEME.colors.surface,
    letterSpacing: 1,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: THEME.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    fontSize: 14,
    fontWeight: '900',
    color: THEME.colors.surface,
  },
  previewWrap: {
    // 操作按钮已压缩为单行，预览区扩大到 72% 高度
    maxHeight: '72%',
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: THEME.colors.background,
  },
  previewScroll: {
    width: '100%',
  },
  previewContent: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 4,
    paddingBottom: 20,
  },
  shot: {
    // 给截图容器一个固定宽度，避免预览与截图尺寸不一致
    width: 320,
    alignSelf: 'center',
  },
  // 操作按钮：水平排列、等宽、紧凑高度，最大化预览区
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: THEME.colors.surface,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
  },
  actionCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  actionBtn: {
    width: '100%',
  },
  actionLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    letterSpacing: 0.5,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
});
