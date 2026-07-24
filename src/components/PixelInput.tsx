import React, { useMemo } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  type ViewStyle,
  type KeyboardTypeOptions,
} from 'react-native';
import { THEME } from '../utils/constants';
import { useTheme } from '../contexts/ThemeContext';

interface PixelInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  editable?: boolean;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  style?: ViewStyle;
}

export function PixelInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  multiline = false,
  editable = true,
  secureTextEntry = false,
  autoCapitalize = 'sentences',
  autoCorrect = true,
  style,
}: PixelInputProps) {
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={THEME.colors.textLight}
        keyboardType={keyboardType}
        multiline={multiline}
        editable={editable}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        style={[
          styles.input,
          multiline && styles.multiline,
          !editable && styles.disabled,
        ]}
      />
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  container: {
    marginBottom: THEME.spacing.md,
  },
  label: {
    fontSize: THEME.fontSize.sm,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.xs,
  },
  input: {
    ...THEME.pixelBorder,
    backgroundColor: THEME.colors.surface,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm + 2,
    fontSize: THEME.fontSize.md,
    color: THEME.colors.textPrimary,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  disabled: {
    backgroundColor: THEME.colors.border,
  },
});
