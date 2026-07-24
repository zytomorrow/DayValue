/**
 * SearchBar - 像素风搜索框
 *
 * 用于列表页内联搜索，支持清除按钮与受控文本。
 */
import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { THEME } from '../utils/constants';
import { useTheme } from '../contexts/ThemeContext';

interface SearchBarProps {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
}

export function SearchBar({
  value,
  onChange,
  placeholder = '搜索...',
  style,
}: SearchBarProps) {
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.icon}>🔍</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={THEME.colors.textLight}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
        returnKeyType="search"
      />
      {value.length > 0 ? (
        <TouchableOpacity
          style={styles.clearBtn}
          onPress={() => onChange('')}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.clearIcon}>×</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surface,
    borderWidth: 2,
    borderColor: THEME.colors.borderDark,
    borderRadius: THEME.borderRadius,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: 0,
    marginBottom: 4,
  },
  icon: {
    fontSize: 13,
    marginRight: THEME.spacing.xs,
  },
  input: {
    flex: 1,
    paddingVertical: 5,
    fontSize: THEME.fontSize.sm,
    color: THEME.colors.textPrimary,
  },
  clearBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: THEME.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearIcon: {
    fontSize: 13,
    fontWeight: '900',
    color: THEME.colors.textSecondary,
    lineHeight: 13,
  },
});
