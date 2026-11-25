/**
 * 운동 탭의 두 갈래 — 내 플랜(/tabs/plan) · 종목과 자세(/tabs/form). 두 화면 맨 위에 같은 자리로 둔다.
 * 종목과 자세는 탭에 따로 없다(떠 있는 탭에서는 둘 다 '운동').
 */
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Segmented } from '../ui';
import { EX } from '../data/exercises';

type Side = 'plan' | 'form';

export function WorkoutSwitch({ value }: { value: Side }) {
  const router = useRouter();
  const options = [
    { value: 'plan', label: '내 플랜' },
    { value: 'form', label: '종목과 자세' },
  ] as const satisfies readonly { value: Side; label: string }[];
  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
      <Segmented<Side> options={options} value={value} label="운동 보기"
        onChange={(v) => router.navigate(v === 'plan' ? '/tabs/plan' : '/tabs/form')} />
    </View>
  );
}
