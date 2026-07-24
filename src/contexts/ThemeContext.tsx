/**
 * ThemeContext - 全局主题上下文
 *
 * 提供主题切换能力：
 * - 启动时从 AppPreferences 读取上次选择的主题
 * - 切换时通过 applyTheme() 原地修改 THEME 单例
 * - 通过 themeId state 触发整树重渲染
 * - 持久化用户选择
 *
 * 用法：
 *   const { themeId, setThemeId } = useTheme();
 *   const styles = useMemo(() => createStyles(), [themeId]);
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import {
  THEME,
  applyTheme,
  DEFAULT_THEME_ID,
  getThemeById,
  type ThemeId,
  type ThemeShape,
} from '../utils/constants';
import { getPreference, setPreference } from '../database';

const THEME_PREF_KEY = 'app_theme_id';

interface ThemeContextValue {
  /** 当前主题 ID */
  themeId: ThemeId;
  /** 当前主题对象（即全局 THEME 单例的引用） */
  theme: ThemeShape;
  /** 切换主题（同步切换 + 异步持久化） */
  setThemeId: (id: ThemeId) => void;
  /** 是否已从持久化加载完成 */
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [themeId, setThemeIdState] = useState<ThemeId>(DEFAULT_THEME_ID);
  const [ready, setReady] = useState(false);

  // 启动时从持久化读取主题
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const saved = await getPreference(db, THEME_PREF_KEY);
        if (!cancelled && saved && isValidThemeId(saved)) {
          applyTheme(saved);
          setThemeIdState(saved);
        }
      } catch (error) {
        console.error('加载主题偏好失败', error);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db]);

  const setThemeId = useCallback(
    (id: ThemeId) => {
      applyTheme(id);
      setThemeIdState(id);
      void setPreference(db, THEME_PREF_KEY, id).catch(error => {
        console.error('保存主题偏好失败', error);
      });
    },
    [db],
  );

  return (
    <ThemeContext.Provider value={{ themeId, theme: THEME, setThemeId, ready }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme 必须在 <ThemeProvider> 内部使用');
  }
  return ctx;
}

/** 便捷 hook：返回当前主题对象，等价于 useTheme().theme */
export function useThemeColors() {
  return useTheme().theme.colors;
}

function isValidThemeId(value: string): value is ThemeId {
  return (
    value === 'pixel-purple' ||
    value === 'ocean-blue' ||
    value === 'forest-green' ||
    value === 'sunset-orange' ||
    value === 'midnight-dark'
  );
}

export { THEME_PREF_KEY, getThemeById };
