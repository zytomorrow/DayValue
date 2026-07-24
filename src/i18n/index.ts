import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';
import zhCN from './zh-CN.json';
import enUS from './en-US.json';

export type AppLanguage = 'zh-CN' | 'en-US';
export const SUPPORTED_LANGUAGES: { id: AppLanguage; name: string; nativeName: string }[] = [
  { id: 'zh-CN', name: '简体中文', nativeName: '简体中文' },
  { id: 'en-US', name: 'English', nativeName: 'English' },
];

/**
 * 检测系统初始语言。
 *
 * 不使用 expo-localization：该原生模块与当前 expo-modules-core 版本存在
 * NoSuchMethodError（getDirectConverter），会在原生模块注册阶段直接闪退，
 * 任何 JS 层的延迟加载都无法拦截。改用 React Native 内置的 I18nManager，
 * 零额外原生依赖，能稳定拿到系统首选 locale。
 */
function detectInitialLanguage(): AppLanguage {
  try {
    const localeIdentifier: string | undefined = I18nManager.getConstants().localeIdentifier;
    if (!localeIdentifier) return 'zh-CN';
    const lang = localeIdentifier.toLowerCase();
    return lang.startsWith('en') ? 'en-US' : 'zh-CN';
  } catch {
    return 'zh-CN';
  }
}

try {
  i18n.use(initReactI18next).init({
    resources: {
      'zh-CN': { translation: zhCN },
      'en-US': { translation: enUS },
    },
    lng: detectInitialLanguage(),
    fallbackLng: 'zh-CN',
    interpolation: { escapeValue: false },
  });
} catch (error) {
  // i18next / react-i18next 初始化失败时不应阻塞应用启动。
  // eslint-disable-next-line no-console
  console.warn('i18n 初始化失败，已跳过', error);
}

export default i18n;
export { detectInitialLanguage };
