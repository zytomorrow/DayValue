/**
 * PixelAlertRoot - 挂载在 App 根部，渲染全局像素风弹窗。
 *
 * 用法：
 *   <PixelAlertRoot />
 *
 * 配合 utils/pixelAlert 的 showPixelAlert 等函数使用。
 */
import React, { useEffect, useState } from 'react';
import { PixelAlert } from './PixelAlert';
import { dismissPixelAlert, getPixelAlertState, subscribePixelAlert } from '../utils/pixelAlert';

export function PixelAlertRoot() {
  const [state, setState] = useState(getPixelAlertState());

  useEffect(() => subscribePixelAlert(setState), []);

  return (
    <PixelAlert
      visible={state.visible}
      title={state.title}
      message={state.message}
      buttons={state.buttons}
      onDismiss={dismissPixelAlert}
    />
  );
}
