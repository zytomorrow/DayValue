/**
 * ShareModal - 分享预览弹窗
 * 展示 ShareCard 预览，支持调起系统分享或保存至相册。
 */
import React, { useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';
import { THEME } from '../utils/constants';
import { useTheme } from '../contexts/ThemeContext';
import { BrutalButton } from './BrutalButton';
import { ShareCard, type ShareCardData } from './ShareCard';
import { captureAndShareView, captureAndSaveToGallery } from '../utils/share';
import { alertError, alertSuccess } from '../utils/pixelAlert';

interface ShareModalProps {
  visible: boolean;
  data: ShareCardData | null;
  onClose: () => void;
}

type Action = 'share' | 'save';

export function ShareModal({ visible, data, onClose }: ShareModalProps) {
  const shotRef = useRef<ViewShotRef>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);

  async function runCapture(action: Action) {
    if (!shotRef.current || busy) return;
    // 截图前回到顶部，确保整张卡片内容已完整渲染。
    scrollRef.current?.scrollTo({ y: 0, animated: false });
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

  const title =
    data?.kind === 'summary'
      ? '分享资产总览'
      : data?.kind === 'item'
        ? '分享资产卡片'
        : '分享订阅卡片';

  const isBusy = busy !== null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.overlay}
        onPress={onClose}
        activeOpacity={1}
      >
        <TouchableOpacity
          style={styles.sheet}
          onPress={() => {}}
          activeOpacity={1}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.previewWrap}>
            {data && (
              <ScrollView
                ref={scrollRef}
                style={styles.previewScroll}
                contentContainerStyle={styles.previewContent}
                showsVerticalScrollIndicator
                bounces
              >
                <ViewShot
                  ref={shotRef}
                  options={{ format: 'png', quality: 1, result: 'tmpfile' }}
                  style={styles.shot}
                >
                  <ShareCard data={data} />
                </ViewShot>
              </ScrollView>
            )}
          </View>

          <View style={styles.actions}>
            <BrutalButton
              title={busy === 'share' ? '生成中...' : '📤 分享图片'}
              onPress={() => runCapture('share')}
              variant="primary"
              size="md"
              loading={busy === 'share'}
              disabled={isBusy || !data}
              style={styles.actionBtn}
            />
            <BrutalButton
              title={busy === 'save' ? '保存中...' : '💾 保存至相册'}
              onPress={() => runCapture('save')}
              variant="accent"
              size="md"
              loading={busy === 'save'}
              disabled={isBusy || !data}
              style={styles.actionBtn}
            />
            <BrutalButton
              title="关闭"
              onPress={onClose}
              variant="outline"
              size="md"
              disabled={isBusy}
              style={styles.actionBtn}
            />
          </View>

          {isBusy && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color={THEME.colors.primary} />
            </View>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const createStyles = () => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
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
    maxHeight: '60%',
    paddingVertical: 16,
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
  actions: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
    backgroundColor: THEME.colors.surface,
  },
  actionBtn: {
    width: '100%',
  },
  loadingOverlay: {
    position: 'absolute',
    bottom: 14,
    right: 24,
  },
});
