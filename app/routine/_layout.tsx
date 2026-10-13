import { Stack } from 'expo-router';
import { colors, useThemeMode } from '../../src/theme';

export default function RoutineLayout() {
  useThemeMode();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}
    />
  );
}
