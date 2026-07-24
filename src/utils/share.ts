/**
 * share.ts - 截图分享与保存工具
 * 把 React 视图渲染成图片，支持调起系统分享或保存至相册。
 *
 * 注意：react-native-view-shot@4.x 不再导出 ViewShotRef 类型，
 * 截图组件的实例类型由默认导出 ViewShot 推导。这里用一个只携带
 * capture() 方法的最小接口作为 ref 形状，避免引入 v5 才有的类型。
 */
import type ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import type { RefObject } from 'react';

/** ViewShot 实例的最小可用形状：仅需 capture() 方法。 */
type ViewShotInstance = InstanceType<typeof ViewShot>;

const SHARE_DIR = `${FileSystem.cacheDirectory}share/`;

async function ensureShareDir(): Promise<string> {
  const info = await FileSystem.getInfoAsync(SHARE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(SHARE_DIR, { intermediates: true });
  }
  return SHARE_DIR;
}

async function captureToTempFile(
  viewRef: RefObject<ViewShotInstance | null>,
): Promise<string> {
  if (!viewRef.current) {
    throw new Error('无法获取分享内容，请稍后重试。');
  }

  let uri: string;
  try {
    // v4 类型定义中 capture 为可选方法，运行时必然存在，这里显式判空以满足 TS。
    const capture = viewRef.current.capture;
    if (!capture) {
      throw new Error('截图组件未就绪');
    }
    uri = await capture.call(viewRef.current);
  } catch (error) {
    throw new Error(
      `截图失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // 复制到独立缓存目录，便于稳定分享/保存。
  const dir = await ensureShareDir();
  const fileName = `dayvalue-${Date.now()}.png`;
  const targetUri = `${dir}${fileName}`;
  if (uri !== targetUri) {
    await FileSystem.copyAsync({ from: uri, to: targetUri });
  }
  return targetUri;
}

/**
 * 截取指定视图并调起系统分享。
 */
export async function captureAndShareView(
  viewRef: RefObject<ViewShotInstance | null>,
): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('当前设备不支持系统分享。');
  }

  const targetUri = await captureToTempFile(viewRef);

  await Sharing.shareAsync(targetUri, {
    mimeType: 'image/png',
    dialogTitle: '分享 DayValue',
    UTI: 'public.image',
  });

  return true;
}

/**
 * 截取指定视图并保存到系统相册。
 * 会先请求相册写入权限，Android 上自动落入 DayValue 相册。
 */
export async function captureAndSaveToGallery(
  viewRef: RefObject<ViewShotInstance | null>,
): Promise<string> {
  const targetUri = await captureToTempFile(viewRef);

  const perm = await MediaLibrary.requestPermissionsAsync();
  if (!perm.granted) {
    throw new Error('未授予相册写入权限，无法保存。请到设置中开启权限后重试。');
  }

  const asset = await MediaLibrary.createAssetAsync(targetUri);
  try {
    const albums = await MediaLibrary.getAlbumAsync('DayValue');
    if (albums) {
      await MediaLibrary.addAssetsToAlbumAsync([asset], albums, false);
    } else {
      await MediaLibrary.createAlbumAsync('DayValue', asset, false);
    }
  } catch {
    // 即使归类失败，资产已保存到相册，忽略分类错误。
  }

  return asset.uri;
}
