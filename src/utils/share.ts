/**
 * share.ts - 截图分享工具
 * 把 React 视图渲染成图片并调起系统分享面板。
 */
import type { ViewShotRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import type { RefObject } from 'react';

const SHARE_DIR = `${FileSystem.cacheDirectory}share/`;

async function ensureShareDir(): Promise<string> {
  const info = await FileSystem.getInfoAsync(SHARE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(SHARE_DIR, { intermediates: true });
  }
  return SHARE_DIR;
}

/**
 * 截取指定视图并调起系统分享。
 * @param viewRef ViewShot 组件的 ref（需已挂载且可见）
 * @returns 是否成功打开分享面板
 */
export async function captureAndShareView(
  viewRef: RefObject<ViewShotRef | null>,
): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('当前设备不支持系统分享。');
  }

  if (!viewRef.current) {
    throw new Error('无法获取分享内容，请稍后重试。');
  }

  let uri: string;
  try {
    uri = await viewRef.current.capture();
  } catch (error) {
    throw new Error(
      `截图失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // 复制到独立缓存目录，便于稳定分享。
  const dir = await ensureShareDir();
  const fileName = `dayvalue-${Date.now()}.png`;
  const targetUri = `${dir}${fileName}`;
  if (uri !== targetUri) {
    await FileSystem.copyAsync({ from: uri, to: targetUri });
  }

  await Sharing.shareAsync(targetUri, {
    mimeType: 'image/png',
    dialogTitle: '分享 DayValue',
    UTI: 'public.image',
  });

  return true;
}
