/**
 * 내 몸 맞추기(보고 직접 고르기) — 키 · 체중 · 허리만으로는 알 수 없는 체형을 눈으로 보고 맞춘다.
 *
 * 체지방 · 근육 좌표(엔진)는 건드리지 않는다. 여기서 고르는 건 **그림에만** 쓰는 체형 축이다
 * (배 집중 · 하체 집중 · 근육이 붙은 곳 · 어깨 · 골반 → profile.bodyShape, avatar3d/morph.ts shapeAt).
 * 그래서 체지방률 · 칼로리 · 기간은 저장해도 바뀌지 않는다 — 화면에 그렇게 적는다.
 * 고르는 즉시 위의 3D 몸이 바뀐다(저장 전 미리보기). MY 탭 '내 몸' 카드에서 연다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/Text';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, themed, useThemeMode } from '../../src/theme';
import { Segmented, PressableScale } from '../../src/ui';
import { Screen, TopBar, PrimaryBtn, EmptyState, useSafeBack } from '../../src/components/ui';
import { useAppStore } from '../../src/stores/appStore';
import { useAuthStore } from '../../src/stores/authStore';
import { saveProfile } from '../../src/services/authService';
import { withTimeout } from '../../src/services/workoutService';
import { showAlert } from '../../src/utils/alert';
import { AvatarView } from '../../src/components/body/AvatarView';
import { has3D } from '../../src/components/body/avatar3d/Avatar3D';
import { shapeAt } from '../../src/components/body/avatar3d/morph';
import { DEFAULT_YAW, joinYawGroup } from '../../src/components/body/avatar3d/stage';
import { useNowBody } from '../../src/components/body/nowBody';
import { kg, pct0 } from '../../src/components/body/format';
import type { BodyShape, UserProfile } from '../../src/types';
import { useScreenSize } from '../../src/ui/screenSize';

type Key = keyof BodyShape;
interface Group { key: Key; title: string; hint: string; options: readonly { label: string; v: number }[] }

/** 고르는 칸 — 값은 모프 세기(morph.ts Shape). 가운데 '보통'이 0 */
const GROUPS: readonly Group[] = [
  {
    key: 'belly', title: '배', hint: '옆에서 봤을 때 나온 정도',
    options: [{ label: '납작', v: -0.4 }, { label: '보통', v: 0 }, { label: '살짝', v: 0.35 }, { label: '나옴', v: 0.7 }, { label: '많이', v: 1 }],
  },
  {
    key: 'lower', title: '엉덩이 · 허벅지', hint: '상체에 비해 굵은 정도',
    options: [{ label: '가는 편', v: -0.4 }, { label: '보통', v: 0 }, { label: '굵은 편', v: 0.5 }, { label: '많이', v: 1 }],
  },
  {
    key: 'musBias', title: '근육이 붙은 곳', hint: '',
    options: [{ label: '하체 위주', v: -0.8 }, { label: '고르게', v: 0 }, { label: '상체 위주', v: 0.8 }],
  },
  {
    key: 'shoulder', title: '어깨', hint: '',
    options: [{ label: '좁은 편', v: -0.8 }, { label: '보통', v: 0 }, { label: '넓은 편', v: 0.8 }],
  },
  {
    key: 'pelvis', title: '골반', hint: '',
    options: [{ label: '좁은 편', v: -0.8 }, { label: '보통', v: 0 }, { label: '넓은 편', v: 0.8 }],
  },
];

/** 보는 각도 — 배 · 엉덩이는 옆에서, 어깨 · 골반은 정면에서 차이가 잘 보인다 */
type ViewKey = 'q' | 'front' | 'side';
const VIEWS = [
  { value: 'q', label: '비스듬히' },
  { value: 'front', label: '정면' },
  { value: 'side', label: '옆' },
] as const satisfies readonly { value: ViewKey; label: string }[];
const YAW: Record<ViewKey, number> = { q: DEFAULT_YAW, front: 0, side: Math.PI / 2 };
/** 칸을 고르면 그 차이가 잘 보이는 각도로 돌린다 */
const BEST_VIEW: Record<Key, ViewKey> = { belly: 'side', lower: 'side', musBias: 'q', shoulder: 'front', pelvis: 'front' };
const YAW_GROUP = 'fit';

/** 저장값에 가장 가까운 칸 */
const nearest = (g: Group, v: number) => g.options.reduce((a, b) => (Math.abs(b.v - v) < Math.abs(a.v - v) ? b : a));

/**
 * 저장 모양 — 다섯 축을 전부 적는다(보통 = 0).
 * saveProfile 이 merge 로 쓰기 때문에 축을 빼고 보내면 서버에 옛 값이 남는다 — 되돌릴 때도 0 을 적어 덮는다.
 */
function full(sh: BodyShape | undefined): Required<BodyShape> {
  return { belly: sh?.belly ?? 0, lower: sh?.lower ?? 0, musBias: sh?.musBias ?? 0, shoulder: sh?.shoulder ?? 0, pelvis: sh?.pelvis ?? 0 };
}
const anyOf = (sh: BodyShape | undefined) => Object.values(full(sh)).some((v) => v !== 0);

export default function FitScreen() {
  useThemeMode();
  const router = useRouter();
  const back = useSafeBack('/tabs/my');
  const insets = useSafeAreaInsets();
  const { width, height } = useScreenSize();
  const user = useAuthStore((st) => st.user);
  const patchUser = useAuthStore((st) => st.patchUser);
  const profile = useAppStore((st) => st.profile);
  const setProfile = useAppStore((st) => st.setProfile);
  const now = useNowBody();
  const [sh, setShRaw] = useState<BodyShape>(profile?.bodyShape ?? {});
  // 화면을 새로 열면 저장소(프로필)가 한 박자 늦게 올라온다 — 그때 고른 칸이 '보통'으로 보이고 저장 버튼이 켜지던 문제(11/27).
  // 손대기 전이면 프로필이 올라온 값을 따라간다
  const touched = useRef(false);
  const setSh: typeof setShRaw = (v) => { touched.current = true; setShRaw(v); };
  const savedKey = JSON.stringify(profile?.bodyShape ?? {});
  useEffect(() => {
    if (!touched.current) setShRaw(profile?.bodyShape ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ViewKey>('q');
  // 뷰어와 같은 각도 묶음에 들어가 각도를 보낸다(손으로 돌리면 뷰어가 알아서 돈다 — 그때 버튼 표시는 그대로 둔다)
  const yaw = useRef<ReturnType<typeof joinYawGroup> | null>(null);
  useEffect(() => {
    const g = joinYawGroup(YAW_GROUP, {}, () => {});
    yaw.current = g;
    return () => g.leave();
  }, []);
  const turn = (v: ViewKey) => {
    setView(v);
    yaw.current?.emit(YAW[v]);
  };

  const preview = useMemo(() => (now ? shapeAt(now.sex, sh, now.coord, now.bfPct) ?? {} : {}), [now, sh]);

  if (!now || !profile) {
    return (
      <Screen>
        <TopBar title="내 몸 맞추기" onBack={back} />
        <EmptyState text={'먼저 내 몸을 계산해 주세요.\n키 · 체중을 넣으면 3D 몸이 만들어져요.'} />
      </Screen>
    );
  }

  const changed = JSON.stringify(full(sh)) !== JSON.stringify(full(profile.bodyShape));
  const anySet = anyOf(sh);
  // 살이 적은 몸에서는 배 · 하체 칸이 덜 먹는다(shapeAt) — 골라도 안 변하는 것처럼 보이지 않게 알려 준다
  const lean = now.coord.f < 1.6;
  // 배가 나왔다고 골랐는데 허리 값이 없으면: 그림이 아니라 숫자를 고칠 수 있는 길을 알려 준다
  const waistTip = (sh.belly ?? 0) >= 0.7 && now.accuracy === 'basic';

  function handleBack() {
    if (!changed) { back(); return; }
    showAlert('저장하지 않았어요', '고른 체형을 버리고 나갈까요?', [
      { text: '계속 고르기', style: 'cancel' },
      { text: '버리고 나가기', style: 'destructive', onPress: back },
    ]);
  }

  async function handleSave() {
    if (!user || !profile) return;
    const next: UserProfile = { ...profile, bodyShape: full(sh) };
    setSaving(true);
    try {
      await withTimeout(saveProfile(user.uid, next));
      setProfile(next);
      patchUser({ profile: next });
      back();
    } catch {
      showAlert('오류', '저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  }

  // 작은 화면에서도 고르는 칸이 두 묶음은 보이게 — 몸은 화면 높이의 1/3 까지만
  const avW = Math.round(Math.min(190, width * 0.46, (height * 0.3) / 1.5));

  return (
    <Screen>
      <TopBar title="내 몸 맞추기" onBack={handleBack}
        right={anySet ? (
          <PressableScale onPress={() => setSh({})} hitSlop={10} accessibilityRole="button" accessibilityLabel="전부 보통으로 되돌리기">
            <Text style={s.reset}>전부 보통으로</Text>
          </PressableScale>
        ) : undefined} />
      <View style={s.stage}>
        <AvatarView sex={now.sex} cell={now.cell} coord={now.coord} shape={preview} width={avW} badge="지금" live morphMs={260} yawGroup={YAW_GROUP}
          label={`지금 내 몸 미리보기, ${kg(now.weightKg)}kg, 체지방 약 ${pct0(now.bfPct)}%`} />
        <Text style={s.stageTxt}>{kg(now.weightKg)}kg · 체지방 약 {pct0(now.bfPct)}%</Text>
        {has3D(now.sex) ? (
          <View style={s.views}>
            <Segmented<ViewKey> options={VIEWS} value={view} onChange={turn} label="보는 각도" />
          </View>
        ) : null}
      </View>
      <ScrollView style={s.scroll} contentContainerStyle={s.inner} showsVerticalScrollIndicator={false}>
        <Text style={s.lead}>거울 속 내 몸과 가장 비슷한 칸을 고르세요. 고르면 위의 몸이 바로 바뀝니다.</Text>
        {GROUPS.map((g) => {
          const cur = nearest(g, sh[g.key] ?? 0);
          return (
            <View key={g.key} style={s.group}>
              <View style={s.groupHead}>
                <Text style={s.groupTitle} accessibilityRole="header">{g.title}</Text>
                {g.hint ? <Text style={s.groupHint}>{g.hint}</Text> : null}
              </View>
              <Segmented
                options={g.options.map((o) => ({ value: String(o.v), label: o.label }))}
                value={String(cur.v)}
                onChange={(v) => {
                  setSh((prev) => ({ ...prev, [g.key]: Number(v) }));
                  if (BEST_VIEW[g.key] !== view) turn(BEST_VIEW[g.key]);
                }}
                label={g.title}
              />
            </View>
          );
        })}
        {lean ? <Text style={s.note}>지금은 살이 적은 몸이라 배 · 하체 칸을 바꿔도 조금만 달라집니다.</Text> : null}
        {waistTip ? (
          <PressableScale style={s.tip} onPress={() => router.push('/profile/edit')} accessibilityRole="button">
            <Text style={s.tipTitle}>허리둘레를 넣으면 체지방 추정이 정확해져요</Text>
            <Text style={s.tipSub}>배가 나온 몸은 키 · 체중만으로는 체지방이 낮게 나옵니다. 내 정보에서 허리둘레 입력 ›</Text>
          </PressableScale>
        ) : null}
        <Text style={s.note}>여기서 고른 건 3D 몸의 모양에만 쓰입니다. 체지방률 · 하루 칼로리 · 예상 기간은 바뀌지 않아요.</Text>
      </ScrollView>
      <View style={[s.foot, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <PrimaryBtn label={changed ? '이 몸으로 저장' : '바뀐 것이 없어요'} onPress={handleSave} loading={saving} disabled={!changed} />
      </View>
    </Screen>
  );
}

const s = themed(() => StyleSheet.create({
  reset: { fontSize: 13, fontWeight: '700', color: colors.mid },
  stage: { alignItems: 'center', paddingTop: 4, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  stageTxt: { fontSize: 12, color: colors.muted, marginTop: 6, fontWeight: '600' },
  views: { alignSelf: 'stretch', marginHorizontal: 56, marginTop: 8 },
  scroll: { flex: 1 },
  inner: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24 },
  lead: { fontSize: 13.5, color: colors.mid, lineHeight: 20 },
  group: { marginTop: 18 },
  groupHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 },
  groupTitle: { fontSize: 14.5, fontWeight: '800', color: colors.ink },
  groupHint: { fontSize: 12, color: colors.muted },
  note: { fontSize: 12, color: colors.muted, lineHeight: 18, marginTop: 16 },
  tip: {
    marginTop: 16, backgroundColor: colors.panel2, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14,
    borderWidth: 1, borderColor: colors.line2,
  },
  tipTitle: { fontSize: 13, fontWeight: '800', color: colors.ink },
  tipSub: { fontSize: 12, color: colors.mid, lineHeight: 18, marginTop: 4 },
  foot: { paddingHorizontal: 18, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg },
}));
