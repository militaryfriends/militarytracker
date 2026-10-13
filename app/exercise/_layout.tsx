import { Stack } from 'expo-router';
import { colors, useThemeMode } from '../../src/theme';

export default function ExerciseLayout() {
  useThemeMode();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
  );
}
