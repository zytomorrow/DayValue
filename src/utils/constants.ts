import type { CategoryInfo } from '../types';

export const CATEGORIES: CategoryInfo[] = [
  { id: 'digital', name: '数码设备', icon: '📱' },
  { id: 'computer', name: '电脑办公', icon: '💻' },
  { id: 'home', name: '家电家居', icon: '🏠' },
  { id: 'transport', name: '出行装备', icon: '🚗' },
  { id: 'clothing', name: '穿戴配件', icon: '⌚' },
  { id: 'entertainment', name: '影音游戏', icon: '🎮' },
  { id: 'software', name: '软件服务', icon: '💿' },
  { id: 'education', name: '学习设备', icon: '🎓' },
  { id: 'sports', name: '运动器材', icon: '🏋️' },
  { id: 'other', name: '其他资产', icon: '📦' },
];

export function getCategoryInfo(categoryId: string): CategoryInfo {
  return CATEGORIES.find(category => category.id === categoryId) ?? CATEGORIES[CATEGORIES.length - 1];
}

// ============================================================
// 主题系统
// ============================================================

/** 主题配色板类型 */
export interface ThemeColors {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  accent: string;
  accentLight: string;
  highlight: string;
  highlightMuted: string;
  danger: string;
  dangerDark: string;
  warning: string;
  success: string;
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  textLight: string;
  border: string;
  borderDark: string;
  /** 状态栏样式：light=浅色图标(深色背景)，dark=深色图标(浅色背景) */
  statusBar: 'light' | 'dark';
  /** 浅色文字色（用于深色按钮文字、徽章文字等） */
  onPrimary: string;
  /** 柔和的提示背景色（替代硬编码的 #FFF5F5 等） */
  surfaceMuted: string;
  /** 危险色浅底（替代 #FFE5E5） */
  dangerBg: string;
  /** 警告色浅底（替代 #FFFBEA） */
  warningBg: string;
  /** 成功色浅底（替代 #E8F8F5） */
  successBg: string;
  /** 像素阴影色 */
  shadowColor: string;
}

export interface ThemeShape {
  id: ThemeId;
  name: string;
  emoji: string;
  description: string;
  colors: ThemeColors;
  spacing: typeof SPACING;
  fontSize: typeof FONT_SIZE;
  borderRadius: number;
  pixelBorder: {
    borderWidth: number;
    borderColor: string;
    borderRadius: number;
  };
  pixelShadow: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };
  fontFamily: {
    pixel: 'PressStart2P_400Regular';
  };
  /** 图表色板：用于统计页饼图、折线图等 */
  chartPalette: string[];
}

export type ThemeId =
  | 'pixel-purple'
  | 'ocean-blue'
  | 'forest-green'
  | 'sunset-orange'
  | 'midnight-dark';

const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

const FONT_SIZE = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;

const FONT_FAMILY = {
  pixel: 'PressStart2P_400Regular' as const,
};

// ============================================================
// 主题预设定义
// ============================================================

const THEME_PRESETS: Record<ThemeId, ThemeShape> = {
  'pixel-purple': {
    id: 'pixel-purple',
    name: '像素紫晶',
    emoji: '🟣',
    description: '复古像素 + 紫水晶主调，原版默认配色',
    colors: {
      primary: '#6C5CE7',
      primaryLight: '#A29BFE',
      primaryDark: '#4834D4',
      accent: '#00CEC9',
      accentLight: '#81ECEC',
      highlight: '#FFD93D',
      highlightMuted: '#FFF3CD',
      danger: '#FF7675',
      dangerDark: '#D63031',
      warning: '#FDCB6E',
      success: '#00B894',
      background: '#F0F3FA',
      surface: '#FFFFFF',
      textPrimary: '#2D3436',
      textSecondary: '#636E72',
      textLight: '#B2BEC3',
      border: '#DFE6E9',
      borderDark: '#2D3436',
      statusBar: 'light',
      onPrimary: '#FFFFFF',
      surfaceMuted: '#F5F6FA',
      dangerBg: '#FFF5F5',
      warningBg: '#FFFBEA',
      successBg: '#E8F8F5',
      shadowColor: '#2D3436',
    },
    spacing: SPACING,
    fontSize: FONT_SIZE,
    borderRadius: 6,
    pixelBorder: {
      borderWidth: 2,
      borderColor: '#2D3436',
      borderRadius: 6,
    },
    pixelShadow: {
      shadowColor: '#2D3436',
      shadowOffset: { width: 2, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 0,
      elevation: 3,
    },
    fontFamily: FONT_FAMILY,
    chartPalette: [
      '#6C5CE7', '#00CEC9', '#0984E3', '#00B894', '#FDCB6E',
      '#E17055', '#D63031', '#A29BFE', '#81ECEC', '#74B9FF',
    ],
  },

  'ocean-blue': {
    id: 'ocean-blue',
    name: '深海蔚蓝',
    emoji: '🔵',
    description: '清爽海蓝主调，适合长时间阅读与数据浏览',
    colors: {
      primary: '#0984E3',
      primaryLight: '#74B9FF',
      primaryDark: '#0652A8',
      accent: '#00CEC9',
      accentLight: '#81ECEC',
      highlight: '#FFD93D',
      highlightMuted: '#FFF3CD',
      danger: '#FF7675',
      dangerDark: '#D63031',
      warning: '#FDCB6E',
      success: '#00B894',
      background: '#EAF4FB',
      surface: '#FFFFFF',
      textPrimary: '#1E3A5F',
      textSecondary: '#5A7A9A',
      textLight: '#A8BFD4',
      border: '#D0E1F0',
      borderDark: '#1E3A5F',
      statusBar: 'light',
      onPrimary: '#FFFFFF',
      surfaceMuted: '#EAF4FB',
      dangerBg: '#FFF5F5',
      warningBg: '#FFFBEA',
      successBg: '#E8F8F5',
      shadowColor: '#1E3A5F',
    },
    spacing: SPACING,
    fontSize: FONT_SIZE,
    borderRadius: 6,
    pixelBorder: {
      borderWidth: 2,
      borderColor: '#1E3A5F',
      borderRadius: 6,
    },
    pixelShadow: {
      shadowColor: '#1E3A5F',
      shadowOffset: { width: 2, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 0,
      elevation: 3,
    },
    fontFamily: FONT_FAMILY,
    chartPalette: [
      '#0984E3', '#00CEC9', '#6C5CE7', '#00B894', '#FDCB6E',
      '#E17055', '#D63031', '#74B9FF', '#81ECEC', '#A29BFE',
    ],
  },

  'forest-green': {
    id: 'forest-green',
    name: '森林墨绿',
    emoji: '🟢',
    description: '自然清新配色，护眼且传达资产稳健增长感',
    colors: {
      primary: '#00B894',
      primaryLight: '#55EFC4',
      primaryDark: '#00866B',
      accent: '#FDCB6E',
      accentLight: '#FFEAA7',
      highlight: '#FFD93D',
      highlightMuted: '#FFF3CD',
      danger: '#FF7675',
      dangerDark: '#D63031',
      warning: '#E17055',
      success: '#00B894',
      background: '#EFF7F2',
      surface: '#FFFFFF',
      textPrimary: '#1B4332',
      textSecondary: '#52796F',
      textLight: '#A8C0B5',
      border: '#D0E5D8',
      borderDark: '#1B4332',
      statusBar: 'light',
      onPrimary: '#FFFFFF',
      surfaceMuted: '#EFF7F2',
      dangerBg: '#FFF5F5',
      warningBg: '#FFF8E8',
      successBg: '#E0F5EC',
      shadowColor: '#1B4332',
    },
    spacing: SPACING,
    fontSize: FONT_SIZE,
    borderRadius: 6,
    pixelBorder: {
      borderWidth: 2,
      borderColor: '#1B4332',
      borderRadius: 6,
    },
    pixelShadow: {
      shadowColor: '#1B4332',
      shadowOffset: { width: 2, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 0,
      elevation: 3,
    },
    fontFamily: FONT_FAMILY,
    chartPalette: [
      '#00B894', '#FDCB6E', '#0984E3', '#6C5CE7', '#E17055',
      '#D63031', '#55EFC4', '#74B9FF', '#A29BFE', '#81ECEC',
    ],
  },

  'sunset-orange': {
    id: 'sunset-orange',
    name: '日落橙焰',
    emoji: '🟠',
    description: '温暖橙红主调，传递活力与资产温度感',
    colors: {
      primary: '#E17055',
      primaryLight: '#FAB1A0',
      primaryDark: '#B85440',
      accent: '#6C5CE7',
      accentLight: '#A29BFE',
      highlight: '#FFD93D',
      highlightMuted: '#FFF3CD',
      danger: '#D63031',
      dangerDark: '#A82323',
      warning: '#FDCB6E',
      success: '#00B894',
      background: '#FFF6F0',
      surface: '#FFFFFF',
      textPrimary: '#3D2817',
      textSecondary: '#7A5C44',
      textLight: '#C4A886',
      border: '#F0DDD0',
      borderDark: '#3D2817',
      statusBar: 'light',
      onPrimary: '#FFFFFF',
      surfaceMuted: '#FFF6F0',
      dangerBg: '#FFEBE5',
      warningBg: '#FFF8E1',
      successBg: '#E8F8F0',
      shadowColor: '#3D2817',
    },
    spacing: SPACING,
    fontSize: FONT_SIZE,
    borderRadius: 6,
    pixelBorder: {
      borderWidth: 2,
      borderColor: '#3D2817',
      borderRadius: 6,
    },
    pixelShadow: {
      shadowColor: '#3D2817',
      shadowOffset: { width: 2, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 0,
      elevation: 3,
    },
    fontFamily: FONT_FAMILY,
    chartPalette: [
      '#E17055', '#6C5CE7', '#FDCB6E', '#00B894', '#0984E3',
      '#D63031', '#FAB1A0', '#A29BFE', '#74B9FF', '#81ECEC',
    ],
  },

  'midnight-dark': {
    id: 'midnight-dark',
    name: '午夜暗黑',
    emoji: '🌙',
    description: '深色护眼模式，深夜浏览不刺眼',
    colors: {
      primary: '#A29BFE',
      primaryLight: '#C4BFFC',
      primaryDark: '#6C5CE7',
      accent: '#00CEC9',
      accentLight: '#81ECEC',
      highlight: '#FFD93D',
      highlightMuted: '#7A6520',
      danger: '#FF7675',
      dangerDark: '#FFA3A2',
      warning: '#FDCB6E',
      success: '#55EFC4',
      background: '#1A1A2E',
      surface: '#252540',
      textPrimary: '#F0F0FA',
      textSecondary: '#A0A0C0',
      textLight: '#6B6B8A',
      border: '#3A3A55',
      borderDark: '#7A7AA0',
      statusBar: 'light',
      onPrimary: '#1A1A2E',
      surfaceMuted: '#2A2A45',
      dangerBg: '#3A2025',
      warningBg: '#3A3015',
      successBg: '#1A3A2E',
      shadowColor: '#000000',
    },
    spacing: SPACING,
    fontSize: FONT_SIZE,
    borderRadius: 6,
    pixelBorder: {
      borderWidth: 2,
      borderColor: '#7A7AA0',
      borderRadius: 6,
    },
    pixelShadow: {
      shadowColor: '#000000',
      shadowOffset: { width: 2, height: 2 },
      shadowOpacity: 0.4,
      shadowRadius: 0,
      elevation: 4,
    },
    fontFamily: FONT_FAMILY,
    chartPalette: [
      '#A29BFE', '#00CEC9', '#74B9FF', '#55EFC4', '#FDCB6E',
      '#FF7675', '#A29BFE', '#81ECEC', '#FAB1A0', '#D63031',
    ],
  },
};

/** 所有可用主题的列表（用于设置页选择器） */
export const THEME_LIST: ThemeShape[] = [
  THEME_PRESETS['pixel-purple'],
  THEME_PRESETS['ocean-blue'],
  THEME_PRESETS['forest-green'],
  THEME_PRESETS['sunset-orange'],
  THEME_PRESETS['midnight-dark'],
];

export function getThemeById(id: ThemeId): ThemeShape {
  return THEME_PRESETS[id] ?? THEME_PRESETS['pixel-purple'];
}

export const DEFAULT_THEME_ID: ThemeId = 'pixel-purple';

// ============================================================
// 可变 THEME 单例
// ------------------------------------------------------------
// THEME 在模块加载时初始化为默认主题，后续可通过 applyTheme() 切换。
// 注意：StyleSheet.create 在模块加载时只执行一次，会捕获当时的颜色。
// 因此需要在组件内通过 useTheme() + useMemo 重建样式才能动态切换。
// ============================================================

export const THEME: ThemeShape = cloneTheme(THEME_PRESETS[DEFAULT_THEME_ID]);

function cloneTheme(theme: ThemeShape): ThemeShape {
  return {
    ...theme,
    colors: { ...theme.colors },
    pixelBorder: { ...theme.pixelBorder },
    pixelShadow: { ...theme.pixelShadow },
    spacing: theme.spacing,
    fontSize: theme.fontSize,
    fontFamily: theme.fontFamily,
    chartPalette: [...theme.chartPalette],
  };
}

/**
 * 切换全局主题：原地修改 THEME 对象的所有颜色与样式属性。
 * 调用后所有引用 THEME 的代码都会读到新值，但已通过 StyleSheet.create
 * 创建的样式对象不会更新，需配合 useTheme() hook + useMemo 重建。
 */
export function applyTheme(themeId: ThemeId): void {
  const next = THEME_PRESETS[themeId] ?? THEME_PRESETS[DEFAULT_THEME_ID];
  // 原地修改 colors，保持 THEME 引用不变
  Object.assign(THEME.colors, next.colors);
  Object.assign(THEME.pixelBorder, next.pixelBorder);
  Object.assign(THEME.pixelShadow, next.pixelShadow);
  THEME.id = next.id;
  THEME.name = next.name;
  THEME.emoji = next.emoji;
  THEME.description = next.description;
  // chartPalette 需要替换长度可能不同的数组
  THEME.chartPalette.length = 0;
  THEME.chartPalette.push(...next.chartPalette);
  THEME.borderRadius = next.borderRadius;
}
