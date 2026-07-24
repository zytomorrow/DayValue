import React, { useMemo } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { THEME } from '../utils/constants';
import { useTheme } from '../contexts/ThemeContext';

type EntityCoverProps = {
  imageUri?: string | null;
  icon: string;
  size?: number;
  iconSize?: number;
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  iconStyle?: StyleProp<TextStyle>;
};

export function EntityCover({
  imageUri,
  icon,
  size = 44,
  iconSize = 22,
  backgroundColor = THEME.colors.surface,
  style,
  imageStyle,
  iconStyle,
}: EntityCoverProps) {
  const { themeId } = useTheme();
  const styles = useMemo(() => createStyles(), [themeId]);
  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          backgroundColor,
        },
        style,
      ]}
    >
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={[
            styles.image,
            {
              width: size,
              height: size,
            },
            imageStyle,
          ]}
        />
      ) : (
        <Text style={[styles.icon, { fontSize: iconSize }, iconStyle]}>{icon}</Text>
      )}
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  container: {
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: THEME.colors.borderDark,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  image: {
    resizeMode: 'cover',
  },
  icon: {
    textAlign: 'center',
  },
});
