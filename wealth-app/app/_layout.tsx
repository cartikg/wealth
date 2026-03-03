// app/_layout.tsx
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { colors } from '../lib/theme';

const modalOpts = { presentation: 'modal' as const, headerStyle: { backgroundColor: colors.surface2 } };

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { fontSize: 18, color: colors.text },
          contentStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false, animation: 'none' }} />

        {/* Modals */}
        <Stack.Screen name="modals/add-transaction" options={{ ...modalOpts, title: 'Add Transaction' }} />
        <Stack.Screen name="modals/edit-transaction" options={{ ...modalOpts, title: 'Edit Transaction' }} />
        <Stack.Screen name="modals/scan-receipt" options={{ ...modalOpts, title: 'Scan Receipt' }} />
        <Stack.Screen name="modals/receipt-detail" options={{ ...modalOpts, title: 'Receipt' }} />
        <Stack.Screen name="modals/connect-bank" options={{ ...modalOpts, title: 'Connect Bank' }} />
        <Stack.Screen name="modals/settings" options={{ ...modalOpts, title: 'Settings' }} />
        <Stack.Screen name="modals/add-account" options={{ ...modalOpts, title: 'Add Account' }} />
        <Stack.Screen name="modals/add-mortgage" options={{ ...modalOpts, title: 'Add Mortgage' }} />
        <Stack.Screen name="modals/add-debt" options={{ ...modalOpts, title: 'Add Debt' }} />
        <Stack.Screen name="modals/add-holding" options={{ ...modalOpts, title: 'Add Holding' }} />
        <Stack.Screen name="modals/add-disposal" options={{ ...modalOpts, title: 'Record Disposal' }} />
        <Stack.Screen name="modals/add-recurring" options={{ ...modalOpts, title: 'Add Recurring' }} />
        <Stack.Screen name="modals/retirement-settings" options={{ ...modalOpts, title: 'Retirement Settings' }} />
        <Stack.Screen name="modals/report-viewer" options={{ ...modalOpts, title: 'Wealth Report' }} />
        <Stack.Screen name="modals/scenario-compare" options={{ ...modalOpts, title: 'Scenario Comparison' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
