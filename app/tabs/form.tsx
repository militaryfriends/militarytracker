import { memo, useCallback, useMemo, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, themed, useThemeMode } from '../../src/theme';
import { WorkoutSwitch } from '../../src/components/WorkoutSwitch';
import {
  EX, Exercise, Part, PART_LABEL, PART_ORDER, EQUIP_LABEL, LEVEL_LABEL,
} from '../../src/data/exercises';
import { formByExId } from '../../src/data/formCheck';
import { useMediaItems, useMediaEntry } from '../../src/stores/mediaStore';
import ExerciseMedia from '../../src/components/ExerciseMedia';
import { PressableScale, PRESS_SCALE } from '../../src/ui';
import { TabFade } from '../../src/components/TabBar';

type Filter = Part | '전체' | '영상';

const FILTERS: { key: Filter; label: string }[] = [
  { key: '전체', label: '전체' },
  { key: '영상', label: '영상 있음' },
  ...PART_ORDER.map((p) => ({ key: p as Filter, label: PART_LABEL[p] })),
];

export default function FormScreen() {
  useThemeMode();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('전체');
  const [q, setQ] = useState('');
  // 영상 목록은 버킷 매니페스트에서 온다 — 앱 실행 중에 갱신될 수 있다
  const media = useMediaItems();

  const list = useMemo(() => {
    // 공백을 무시하고 비교 — "벤치 프레스" 로 "벤치프레스" 를 찾는다
    const keyword = q.replace(/\s+/g, '');
    return EX.filter((e) => {
      if (filter === '영상' && !media[e.id]?.video) return false;
      if (filter !== '전체' && filter !== '영상' && e.part !== filter) return false;
      if (keyword && !(e.n.replace(/\s+/g, '').includes(keyword) || e.g.replace(/\s+/g, '').includes(keyword))) return false;
      return true;
    });
  }, [filter, q, media]);

  const open = useCallback((id: string) => router.push(`/exercise/${id}`), [router]);

  // 인라인 엘리먼트로 두면 검색어를 칠 때마다 헤더가 리마운트된다
  const Header = useCallback(
    () => (
      <Text style={s.descTxt}>
        전 종목에 자주 하는 실수와 교정 포인트가 있습니다.
      </Text>
    ),
    [list.length]
  );

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.topbar}>
        <Text style={s.title} accessibilityRole="header">운동</Text>
      </View>
      <WorkoutSwitch value="form" />

      <View style={s.searchWrap}>
        <TextInput
          style={s.search}
          placeholder="종목 검색 (예: 벤치, 광배)"
          placeholderTextColor={colors.placeholder}
          value={q}
          onChangeText={setQ}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="종목 검색"
        />
        {q.length > 0 && (
          <PressableScale style={s.clear} onPress={() => setQ('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="검색어 지우기">
            <Text style={s.clearTxt}>✕</Text>
          </PressableScale>
        )}
      </View>

      <View style={s.pillWrap}>
        {FILTERS.map((f) => (
          <PressableScale
            key={String(f.key)}
            style={[s.pill, filter === f.key && s.pillActive]}
            onPress={() => setFilter(f.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: filter === f.key }}
            accessibilityLabel={f.label}
          >
            <Text style={[s.pillTxt, filter === f.key && s.pillTxtActive]}>{f.label}</Text>
          </PressableScale>
        ))}
      </View>

      <FlatList
        data={list}
        keyExtractor={(e) => e.id}
        numColumns={2}
        columnWrapperStyle={s.row}
        contentContainerStyle={s.listInner}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={7}
        // removeClippedSubviews 는 numColumns 와 함께 쓰면 안드로이드에서
        // 빠르게 스크롤할 때 셀이 빈 칸으로 남는 문제가 있어 쓰지 않는다
        ListHeaderComponent={Header}
        ListEmptyComponent={<Text style={s.empty}>검색 결과가 없습니다.</Text>}
        renderItem={({ item }) => <Card ex={item} onPress={open} />}
      />
      <TabFade />
    </SafeAreaView>
  );
}

const Card = memo(function Card({ ex, onPress }: { ex: Exercise; onPress: (id: string) => void }) {
  useThemeMode();
  const form = formByExId(ex.id);
  const video = !!useMediaEntry(ex.id)?.video;

  return (
    <PressableScale scaleTo={PRESS_SCALE.card} style={s.card} onPress={() => onPress(ex.id)}>
      {/* 그리드에서는 포스터만 — 영상 플레이어를 180개 만들지 않는다 */}
      <ExerciseMedia exId={ex.id} rounded={16} style={s.thumb} dim={0.4} />

      <View style={s.badgeRow}>
        {/* 회색 한 톤 글자 한 줄(검수 3 — 컬러 칩 · 기호를 뺐다) */}
        {video || form ? (
          <Text style={s.metaLine} numberOfLines={1}>
            {[video ? '영상' : null, form ? `실수 ${form.w.length} · 포인트 ${form.c.length}` : null].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>

      <Text style={s.name} numberOfLines={1}>{ex.n}</Text>
      <Text style={s.sub} numberOfLines={1}>{PART_LABEL[ex.part]} · {ex.g}</Text>
      <Text style={s.meta2} numberOfLines={1}>
        {ex.eq.map((q) => EQUIP_LABEL[q]).join('/')} · {LEVEL_LABEL[ex.lv]}
      </Text>
    </PressableScale>
  );
});

const s = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topbar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8,
  },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  metaLine: { fontSize: 11, color: colors.muted },

  searchWrap: { paddingHorizontal: 16, paddingBottom: 10, justifyContent: 'center' },
  search: {
    backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line2,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: colors.ink,
  },
  clear: { position: 'absolute', right: 28, padding: 6 },
  clearTxt: { color: colors.muted, fontSize: 13 },

  // 칩은 가로 스크롤 대신 줄바꿈으로 전부 노출한다.
  // 스크롤바를 전역 CSS 로 숨겨 둔 웹에서는 더 넘어가는지 알 방법이 없고,
  // ScrollView 기본값(flexShrink:1) 탓에 아래 리스트에 눌려 잘리기도 했다
  pillWrap: {
    flexDirection: 'row', flexWrap: 'wrap', flexShrink: 0,
    paddingHorizontal: 16, paddingBottom: 12, gap: 8,
  },
  pill: {
    backgroundColor: colors.panel2, borderRadius: 20,
    paddingHorizontal: 15, paddingVertical: 8, minHeight: 40, justifyContent: 'center',
    borderWidth: 1, borderColor: colors.line,
  },
  pillActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  pillTxt: { fontSize: 12.5, fontWeight: '600', color: colors.muted },
  pillTxtActive: { color: colors.bg },

  listInner: { paddingHorizontal: 16, paddingBottom: 132 },
  row: { gap: 10, marginBottom: 16 },
  descTxt: { fontSize: 12.5, color: colors.muted, lineHeight: 19, marginBottom: 14 },
  empty: { color: colors.muted, fontSize: 14, textAlign: 'center', marginTop: 40 },

  // 홀수 개일 때 마지막 카드가 전체 폭으로 늘어나지 않게
  card: { flex: 1, maxWidth: '48.5%' },
  thumb: { width: '100%', aspectRatio: 1 },
  badgeRow: { flexDirection: 'row', gap: 4, marginTop: 8, flexWrap: 'wrap' },
  vBadge: {
    backgroundColor: colors.inkSoft, borderRadius: 5,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 0.5, borderColor: colors.inkLine,
  },
  vBadgeTxt: { fontSize: 10, color: colors.ink, fontWeight: '700' },
  okBadge: {
    backgroundColor: colors.goodBg, borderRadius: 5,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 0.5, borderColor: colors.goodLine,
  },
  okBadgeTxt: { fontSize: 10, color: colors.good, fontWeight: '700' },
  errBadge: {
    backgroundColor: colors.wrongBg, borderRadius: 5,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 0.5, borderColor: colors.wrongLine,
  },
  errBadgeTxt: { fontSize: 10, color: colors.wrong, fontWeight: '700' },
  name: { fontSize: 13, fontWeight: '700', color: colors.ink, marginTop: 7 },
  sub: { fontSize: 10.5, color: colors.mid, marginTop: 2 },
  meta2: { fontSize: 10, color: colors.muted, marginTop: 2 },
}));
