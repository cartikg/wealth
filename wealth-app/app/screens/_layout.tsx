// app/screens/_layout.tsx
import { Stack } from 'expo-router';
import { colors } from '../../lib/theme';

export default function ScreensLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontSize: 18, color: colors.text },
        contentStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
      }}
    />
  );
}
