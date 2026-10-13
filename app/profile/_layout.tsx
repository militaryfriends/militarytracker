import { Stack } from 'expo-router';
import { colors, useThemeMode } from '../../src/theme';

export default function ProfileLayout() {
  useThemeMode();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
  );
}
