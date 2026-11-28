/**
 * 루틴 둘러보기 (2026-11-28 개편)
 *  · 맨 위 검색: 부위 · 종목 · 루틴 이름(utils/routineSearch).
 *  · 분할 루틴(메인): 일주일 플랜을 통째로 바꾸는 루틴 — 5분할 · 푸시풀레그 · 상하체 · 3분할 · 4분할 · 전신 · 홈트.
 *  · 부위 집중: 운동하는 날 끝에 붙이거나 한 번만 하는 2~5동작 — 등 · 가슴 · 어깨 · 팔 · 하체 · 코어 · 홈트 · 조건 묶음으로 가로 줄.
 */
import { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../src/components/Text';
import ExerciseMedia from '../../src/components/ExerciseMedia';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, themed, useThemeMode } from '../../src/theme';
import { Screen, TopBar, Body, useSafeBack } from '../../src/components/ui';
import { FOCUS_GROUPS, FOCUS_ROUTINES, LEVEL_LABEL, ROUTINES, SPLIT_ROUTINES, recommendRoutine, routineExCount, type Routine } from '../../src/data/routines';
import { exByIds } from '../../src/data/exercises';
import { sessionMinutes } from '../../src/utils/prescription';
import { searchRoutines } from '../../src/utils/routineSearch';
import { useAppStore } from '../../src/stores/appStore';
import { useEntitlement } from '../../src/hooks/useEntitlement';
import { ProBadge } from '../../src/components/ProLock';
import { PressableScale, PRESS_SCALE } from '../../src/ui';

/** 루틴마다 대표 종목 하나 — 앞 루틴이 이미 쓴 종목이면 그다음(카드마다 다른 그림) */
/** 분할 루틴 보여 주는 순서 — 많이 찾는 것부터(5분할 · 푸시풀레그 · 상하체 · 3분할 …) */
const ORDER = ['bro5', 'ppl', 'upperlower', 'split3', 'split4', 'fullbody', 'ul2', 'ppl6', 'home3'];
const SPLIT_ORDER = [...SPLIT_ROUTINES].sort((a, b) => {
  const ia = ORDER.indexOf(a.id); const ib = ORDER.indexOf(b.id);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
});

/** 이 루틴(여러 세션이면 그중 하나라도)이 플랜에 붙어 있는지 */
const isAttached = (plan: { days: { addons?: { rid: string }[] }[] } | null, id: string) =>
  !!plan?.days.some((d) => d.addons?.some((a) => a.rid === id || a.rid.startsWith(`${id}/`)));

const coverOf: Map<string, string> = (() => {
  const used = new Set<string>();
  const m = new Map<string, string>();
  for (const r of ROUTINES) {
    const all = r.days.flatMap((d) => d.exIds);
    const pick = all.find((id) => !used.has(id)) ?? all[0];
    if (pick) { m.set(r.id, pick); used.add(pick); }
  }
  return m;
})();

export default function RoutineListScreen() {
  useThemeMode();
  const router = useRouter();
  const goBack = useSafeBack();
  const { profile, plan } = useAppStore();
  const [q, setQ] = useState('');
  const { focus: focusParam } = useLocalSearchParams<{ focus?: string }>();

  // 추천은 구독 기능 — 구독 전에는 배지를 걸지 않는다
  const { can } = useEntitlement();
  const canReco = can('routine_reco');
  const recommendedId = canReco && profile
    ? recommendRoutine({ place: profile.env, days: profile.days, level: profile.level }).id
    : null;

  const splits = useMemo(() => searchRoutines(SPLIT_ORDER, q, false), [q]);
  const focus = useMemo(() => searchRoutines(FOCUS_ROUTINES, q), [q]);
  const searching = q.trim().length > 0;
  // 검색 중이거나 운동 탭의 '+ 부위 집중 루틴 붙이기'로 들어왔으면 부위 집중을 먼저
  const focusFirst = searching || focusParam === '1';
  const lv = (profile?.level ?? 2) as 1 | 2 | 3;

  const splitSection = splits.length > 0 ? (
    <>
      <SectionHead title="분할 루틴" desc="일주일 플랜을 통째로 바꿔요" />
      {splits.map((r) => (
        <SplitCard key={r.id} r={r} current={plan?.routineId === r.id} recommended={r.id === recommendedId}
          onPress={() => router.push(`/routine/${r.id}`)} />
      ))}
    </>
  ) : null;

  const focusSection = focus.length > 0 ? (
    <>
      <SectionHead title="부위 집중" desc="플랜은 그대로, 운동하는 날 끝에 붙이거나 한 번만 해요" />
      {searching ? (
        <View style={s.grid}>
          {focus.map((r) => (
            <FocusCard key={r.id} r={r} lv={lv} attached={isAttached(plan, r.id)} grid onPress={() => router.push(`/routine/${r.id}`)} />
          ))}
        </View>
      ) : (
        FOCUS_GROUPS.map((g) => {
          const list = focus.filter((r) => r.group === g);
          if (!list.length) return null;
          return (
            <View key={g} style={s.group}>
              <Text style={s.groupTitle}>{g}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row} style={s.rowScroll}>
                {list.map((r) => (
                  <FocusCard key={r.id} r={r} lv={lv} attached={isAttached(plan, r.id)} onPress={() => router.push(`/routine/${r.id}`)} />
                ))}
              </ScrollView>
            </View>
          );
        })
      )}
    </>
  ) : null;

  return (
    <Screen>
      <TopBar title="루틴" onBack={goBack} />
      <Body>
        <View style={s.search}>
          <Ionicons name="search" size={17} color={colors.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="부위 · 종목으로 찾기 (예: 삼두, 덤벨)"
            placeholderTextColor={colors.muted}
            style={s.searchInput}
            returnKeyType="search"
            accessibilityLabel="루틴 검색"
          />
          {searching ? (
            <PressableScale onPress={() => setQ('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="검색어 지우기">
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </PressableScale>
          ) : null}
        </View>

        {!canReco && !searching && (
          <PressableScale style={s.recoLock} onPress={() => router.push('/subscribe?f=routine_reco')}>
            <Text style={s.recoLockTxt}>내 조건에 맞는 루틴 추천받기</Text>
            <ProBadge />
          </PressableScale>
        )}

        {searching && !splits.length && !focus.length ? (
          <Text style={s.empty}>“{q.trim()}”에 맞는 루틴이 없어요. 부위나 종목 이름으로 찾아 보세요.</Text>
        ) : null}

        {focusFirst ? <>{focusSection}{splitSection}</> : <>{splitSection}{focusSection}</>}
        <View style={{ height: 24 }} />
      </Body>
    </Screen>
  );
}

function SectionHead({ title, desc }: { title: string; desc: string }) {
  useThemeMode();
  return (
    <View style={s.secHead}>
      <Text style={s.secTitle}>{title}</Text>
      <Text style={s.secDesc}>{desc}</Text>
    </View>
  );
}

function SplitCard({ r, current, recommended, onPress }: { r: Routine; current: boolean; recommended: boolean; onPress: () => void }) {
  useThemeMode();
  const cover = coverOf.get(r.id);
  return (
    <PressableScale scaleTo={PRESS_SCALE.card} style={[s.card, current && s.cardCurrent]} onPress={onPress}
      accessibilityRole="button" accessibilityLabel={`${r.name}, ${r.subtitle}`}>
      <View style={s.head}>
        {cover ? <ExerciseMedia exId={cover} rounded={14} style={s.cover} dim={0.15} /> : (
          <View style={s.shortBox}><Text style={s.short}>{r.short}</Text></View>
        )}
        <View style={{ flex: 1 }}>
          <View style={s.nameRow}>
            <Text style={s.name}>{r.name}</Text>
            {current && <View style={s.badge}><Text style={s.badgeTxt}>사용중</Text></View>}
            {!current && recommended && (
              <View style={s.badgeGhost}><Text style={s.badgeGhostTxt}>추천</Text></View>
            )}
          </View>
          <Text style={s.sub}>{r.subtitle}</Text>
        </View>
        <Text style={s.chev}>›</Text>
      </View>
      <Text style={s.desc} numberOfLines={2}>{r.desc}</Text>
      <View style={s.tagRow}>
        {r.tags.map((t) => (
          <View key={t} style={s.tag}><Text style={s.tagTxt}>{t}</Text></View>
        ))}
        <View style={s.tag}><Text style={s.tagTxt}>{routineExCount(r)}종목</Text></View>
      </View>
    </PressableScale>
  );
}

function FocusCard({ r, lv, attached, grid, onPress }: { r: Routine; lv: 1 | 2 | 3; attached: boolean; grid?: boolean; onPress: () => void }) {
  useThemeMode();
  // 대표 그림은 그 루틴의 첫 종목(무엇을 하는지 보이게 — 카드끼리 겹쳐도 괜찮다)
  const cover = r.days[0]?.exIds[0];
  const ex = exByIds(r.days[0]?.exIds ?? []);
  const home = r.place.length === 1 && r.place[0] === 'home';
  return (
    <PressableScale scaleTo={PRESS_SCALE.card} style={grid ? s.fGrid : s.fCard} onPress={onPress}
      accessibilityRole="button" accessibilityLabel={`${r.name}, ${ex.length}동작, ${LEVEL_LABEL[r.level]}${attached ? ', 붙어 있음' : ''}`}>
      <View style={s.fThumb}>
        {cover ? <ExerciseMedia exId={cover} rounded={0} dim={0.1} style={s.fThumbImg} /> : null}
        {attached ? (
          <View style={s.fOn}><Ionicons name="checkmark" size={12} color={colors.bg} /></View>
        ) : null}
      </View>
      <Text style={s.fName} numberOfLines={2}>{r.name}</Text>
      <Text style={s.fMeta}>
        {r.days.length > 1 ? `${r.days.length}세션` : `${ex.length}동작 · 약 ${sessionMinutes(ex, lv)}분`} · {LEVEL_LABEL[r.level]}{home ? ' · 집' : ''}
      </Text>
    </PressableScale>
  );
}

const s = themed(() => StyleSheet.create({
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.panel, borderRadius: 14,
    paddingHorizontal: 14, height: 46, borderWidth: 1, borderColor: colors.line, marginTop: 6,
  },
  // 웹 기본 초점 테두리는 빼고(바깥 칸이 이미 테두리) — outlineStyle 은 웹에서만 먹는다
  searchInput: { flex: 1, fontSize: 16, color: colors.ink, paddingVertical: 0, outlineStyle: 'none' } as never,
  empty: { fontSize: 13, color: colors.muted, lineHeight: 20, marginTop: 24, textAlign: 'center' },
  recoLock: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    backgroundColor: colors.panel2, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: colors.line2, marginTop: 12,
  },
  recoLockTxt: { fontSize: 13, fontWeight: '600', color: colors.mid, flexShrink: 1 },
  card: {
    backgroundColor: colors.panel, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: colors.line, marginBottom: 10,
  },
  cardCurrent: { borderColor: colors.line2, backgroundColor: colors.panel2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cover: { width: 64, height: 64, borderRadius: 14, overflow: 'hidden' },
  shortBox: {
    width: 52, height: 52, borderRadius: 14, backgroundColor: colors.panel3,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line2,
  },
  short: { fontSize: 11, fontWeight: '800', color: colors.mid, letterSpacing: 0.3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 16, fontWeight: '700', color: colors.ink },
  sub: { fontSize: 11.5, color: colors.muted, marginTop: 3 },
  chev: { fontSize: 22, color: colors.muted, marginLeft: 4 },
  badge: { backgroundColor: colors.ink, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeTxt: { fontSize: 10, fontWeight: '800', color: colors.bg },
  badgeGhost: { backgroundColor: colors.panel3, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeGhostTxt: { fontSize: 10, fontWeight: '800', color: colors.mid },
  desc: { fontSize: 12.5, color: colors.mid, lineHeight: 19, marginTop: 12 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  tag: { backgroundColor: colors.panel3, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  tagTxt: { fontSize: 10, color: colors.muted, fontWeight: '600' },

  secHead: { marginTop: 22, marginBottom: 12 },
  secTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  secDesc: { fontSize: 13, color: colors.mid, marginTop: 3, lineHeight: 19 },
  group: { marginBottom: 18 },
  groupTitle: { fontSize: 15, fontWeight: '800', color: colors.ink, marginBottom: 10 },
  // 가로 줄은 화면 끝까지 — Body 의 좌우 여백(16)만큼 밖으로 뺀다
  rowScroll: { marginHorizontal: -16 },
  row: { gap: 10, paddingHorizontal: 16 },
  fCard: { width: 136 },
  fGrid: { width: '48.5%', marginBottom: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  fThumb: {
    aspectRatio: 1, borderRadius: 14, backgroundColor: colors.panel2, overflow: 'hidden', marginBottom: 7,
  },
  fThumbImg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  fOn: {
    position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center',
  },
  fName: { fontSize: 13, fontWeight: '700', color: colors.ink, lineHeight: 18 },
  fMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
}));
