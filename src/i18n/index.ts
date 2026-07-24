import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from './zh-CN.json';
import enUS from './en-US.json';

export type AppLanguage = 'zh-CN' | 'en-US';
export const SUPPORTED_LANGUAGES: { id: AppLanguage; name: string; nativeName: string }[] = [
  { id: 'zh-CN', name: '简体中文', nativeName: '简体中文' },
  { id: 'en-US', name: 'English', nativeName: 'English' },
];

function detectInitialLanguage(): AppLanguage {
  try {
    // 延迟 require，避免 expo-localization 原生模块未链接时
    // 在 import 阶段抛错导致整个应用启动闪退。
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getLocales } = require('expo-localization');
    const locales = getLocales();
    const lang = locales[0]?.languageCode ?? 'zh';
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
