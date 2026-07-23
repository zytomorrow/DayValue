/**
 * 像素风 Alert 全局调度
 *
 * 在 App 根部挂载 <PixelAlertRoot /> 后，即可通过 showPixelAlert 弹出像素风提示框。
 * API 与 RN Alert.alert 兼容，便于无侵入替换：
 *
 *   import { showPixelAlert } from '../utils/pixelAlert';
 *   showPixelAlert('标题', '消息', [{ text: '确定' }]);
 *
 * 也提供便捷封装：
 *   - alertSuccess(title, message?)
 *   - alertError(title, message?)
 *   - alertConfirm(title, message, onConfirm, confirmText?)
 */
import type { PixelAlertButton } from '../components/PixelAlert';

interface AlertState {
  visible: boolean;
  title?: string;
  message?: string;
  buttons?: PixelAlertButton[];
}

type Listener = (state: AlertState) => void;

let currentState: AlertState = { visible: false };
const listeners = new Set<Listener>();

function setState(next: AlertState) {
  currentState = next;
  listeners.forEach(l => l(next));
}

/** 弹出像素风提示框，API 与 RN Alert.alert 兼容。 */
export function showPixelAlert(
  title?: string,
  message?: string,
  buttons?: PixelAlertButton[],
): void {
  setState({
    visible: true,
    title,
    message,
    buttons: buttons && buttons.length > 0 ? buttons : [{ text: '好的' }],
  });
}

/** 成功提示（单按钮“好的”）。 */
export function alertSuccess(title: string, message?: string): void {
  showPixelAlert(title, message, [{ text: '好的' }]);
}

/** 错误提示（单按钮“知道了”）。 */
export function alertError(title: string, message?: string): void {
  showPixelAlert(title, message, [{ text: '知道了' }]);
}

/** 确认弹窗（取消 / 确认）。 */
export function alertConfirm(
  title: string,
  message: string,
  onConfirm: () => void,
  options?: { confirmText?: string; cancelText?: string; destructive?: boolean },
): void {
  const confirmText = options?.confirmText ?? '确认';
  const cancelText = options?.cancelText ?? '取消';
  showPixelAlert(title, message, [
    { text: cancelText, style: 'cancel' },
    {
      text: confirmText,
      style: options?.destructive ? 'destructive' : 'default',
      onPress: onConfirm,
    },
  ]);
}

/** 订阅状态变化（供 PixelAlertRoot 使用）。返回取消订阅函数。 */
export function subscribePixelAlert(listener: Listener): () => void {
  listeners.add(listener);
  listener(currentState);
  return () => {
    listeners.delete(listener);
  };
}

/** 关闭当前弹窗。 */
export function dismissPixelAlert(): void {
  setState({ visible: false });
}

/** 供 PixelAlertRoot 读取的当前状态。 */
export function getPixelAlertState(): AlertState {
  return currentState;
}
