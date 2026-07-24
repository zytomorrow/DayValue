import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SQLiteProvider } from 'expo-sqlite';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { useFonts, PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import './src/i18n';
import { initDB } from './src/database';
import { CategoriesProvider } from './src/contexts/CategoriesContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { CustomSplashScreen, PixelAlertRoot } from './src/components';
import {
  DashboardScreen,
  SettingsScreen,
  BackupScreen,
  CabinetScreen,
  AddEditItemScreen,
  AddEditSubscriptionScreen,
  AddEditStoredCardScreen,
  ItemDetailScreen,
  SubscriptionDetailScreen,
  CategoriesScreen,
  StatisticsScreen,
  AboutScreen,
  CalendarScreen,
  AnnualReportScreen,
} from './src/screens';
import type { RootStackParamList } from './src/types';
import { THEME } from './src/utils/constants';
import { configureNotifications, requestNotificationPermissionsAsync } from './src/utils/notifications';

// 阻止原生 Splash 自动隐藏，必须在模块顶部同步调用。
SplashScreen.preventAutoHideAsync().catch(() => {
  // 开发模式下可能重复初始化，忽略即可。
});

// 配置本地通知展示行为（前台收到时弹出提醒并播放声音）。
configureNotifications();

const Stack = createNativeStackNavigator<RootStackParamList>();

function LoadingFallback() {
  return (
    <View style={loadingStyles.loading}>
      <ActivityIndicator size="large" color={THEME.colors.primary} />
    </View>
  );
}

function AppNavigator() {
  const { theme } = useTheme();

  const screenOptions: NativeStackNavigationOptions = {
    headerStyle: {
      backgroundColor: theme.colors.primary,
    },
    headerTintColor: theme.colors.onPrimary,
    headerTitleStyle: {
      fontWeight: '700',
      fontSize: theme.fontSize.lg,
    },
    statusBarStyle: theme.colors.statusBar,
    statusBarBackgroundColor: theme.colors.primary,
    statusBarAnimation: 'fade',
    contentStyle: {
      backgroundColor: theme.colors.background,
    },
  };

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{
            headerShown: false,
            statusBarStyle: theme.colors.statusBar,
            statusBarBackgroundColor: 'transparent',
            statusBarTranslucent: true,
          }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: '设置' }}
        />
        <Stack.Screen
          name="Backup"
          component={BackupScreen}
          options={{ title: '备份与恢复' }}
        />
        <Stack.Screen
          name="Cabinet"
          component={CabinetScreen}
          options={{ title: '数字陈列柜' }}
        />
        <Stack.Screen
          name="AddEditItem"
          component={AddEditItemScreen}
          options={{ title: '添加物品' }}
        />
        <Stack.Screen
          name="AddEditSubscription"
          component={AddEditSubscriptionScreen}
          options={{ title: '添加订阅' }}
        />
        <Stack.Screen
          name="ItemDetail"
          component={ItemDetailScreen}
          options={{ title: '物品详情' }}
        />
        <Stack.Screen
          name="SubscriptionDetail"
          component={SubscriptionDetailScreen}
          options={{ title: '订阅详情' }}
        />
        <Stack.Screen
          name="Categories"
          component={CategoriesScreen}
          options={{ title: '分类管理' }}
        />
        <Stack.Screen
          name="Statistics"
          component={StatisticsScreen}
          options={{ title: '统计' }}
        />
        <Stack.Screen
          name="AddEditStoredCard"
          component={AddEditStoredCardScreen}
          options={{ title: '新增储值卡' }}
        />
        <Stack.Screen
          name="About"
          component={AboutScreen}
          options={{ title: '关于' }}
        />
        <Stack.Screen
          name="Calendar"
          component={CalendarScreen}
          options={{ title: '资产生命周期日历' }}
        />
        <Stack.Screen
          name="AnnualReport"
          component={AnnualReportScreen}
          options={{ title: '年度资产回顾' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({ PressStart2P_400Regular });
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    if (!fontsLoaded) return;
    // 静默请求通知权限，失败不阻塞启动。
    requestNotificationPermissionsAsync().catch(() => {
      // 忽略：权限请求失败不影响应用正常使用。
    });
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return <LoadingFallback />;
  }

  return (
    <>
      <React.Suspense fallback={<LoadingFallback />}>
        <SQLiteProvider databaseName="dayvalue.db" onInit={initDB}>
          <ThemeProvider>
            <CategoriesProvider>
              <SafeAreaProvider>
                <AppNavigator />
              </SafeAreaProvider>
            </CategoriesProvider>
          </ThemeProvider>
        </SQLiteProvider>
      </React.Suspense>

      {/* 像素风全局弹窗，叠在导航之上。 */}
      <PixelAlertRoot />

      {/* CRT TV Off 过渡动画覆盖层，absoluteFill 叠在导航之上。 */}
      {!splashDone && (
        <CustomSplashScreen onAnimationEnd={() => setSplashDone(true)} />
      )}
    </>
  );
}

const loadingStyles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: THEME.colors.background,
  },
});
