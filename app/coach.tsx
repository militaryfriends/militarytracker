/**
 * AI 코치 — 전용 화면.
 *
 * MY 탭 안에 있던 채팅을 분리했다. 페이지 스크롤 안의 채팅은 대화가 길어질수록
 * 로그아웃 버튼을 밀어내고, iOS 에서는 맨 아래 입력창이 키보드 뒤로 숨었다.
 * 여기서는 inverted FlatList + KeyboardAvoidingView 로 메신저처럼 동작한다.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, themed, useThemeMode } from '../src/theme';
import { Screen, TopBar, useSafeBack } from '../src/components/ui';
import { ProLock } from '../src/components/ProLock';
import { MealCard, WarningCard } from '../src/components/CoachCards';
import { useAppStore } from '../src/stores/appStore';
import { useAuthStore } from '../src/stores/authStore';
import { useEntitlement } from '../src/hooks/useEntitlement';
import { PART_LABEL, PART_ORDER, exById } from '../src/data/exercises';
import { calcBodyStats, GOAL_LABEL } from '../src/utils/body';
import { setsByPart } from '../src/utils/stats';
import {
  askCoach, AIUnavailable, SubscriptionRequired, QuotaExceeded, CoachQuota, CoachMessage,
} from '../src/services/aiService';

/** 처음 화면의 빠른 질문 — 누르면 바로 보낸다 */
const QUICK = ['지금 뭐 먹어야 해?', '운동 후에 뭐 먹을까?', '오늘 운동 뭐 하지?'];

const WELCOME: CoachMessage = {
  role: 'assistant',
  content: '안녕하세요, AI 코치입니다.\n"지금 뭐 먹어야 해?"처럼 물어보면 한 끼를 g 단위로 짜 드립니다. 루틴 조정 · 대체 운동도 물어보세요.',
};

export default function CoachScreen() {
  const mode = useThemeMode();
  const router = useRouter();
  const goBack = useSafeBack();
  const insets = useSafeAreaInsets();
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const profile = useAppStore((s) => s.profile);
  const plan = useAppStore((s) => s.plan);
  const logs = useAppStore((s) => s.logs);
  const weights = useAppStore((s) => s.weights);
  // 진행 중인 내 변화 프로젝트가 있으면 칼로리 · 단백질은 지금 단계 값(엔진)
  const bodyProject = useAppStore((s) => s.project);
  const chat = useAppStore((s) => s.chat);
  const chatBusy = useAppStore((s) => s.chatBusy);
  const addChat = useAppStore((s) => s.addChat);
  const setChatBusy = useAppStore((s) => s.setChatBusy);
  const clearChat = useAppStore((s) => s.clearChat);
  const { can } = useEntitlement();
  const canCoach = can('ai_coach');

  const [input, setInput] = useState('');
  // 남은 코치 대화 횟수 — 서버가 응답에 실어 준다. 실제 차단도 서버가 한다.
  const [quota, setQuota] = useState<CoachQuota | null>(null);
  const coachEmpty = !!quota && !quota.unlimited && quota.remaining <= 0;

  const context = useCallback((): string => {
    const st = calcBodyStats(profile, weights, bodyProject);
    const vol = setsByPart(logs, { weekOnly: true });
    const planTxt = plan
      ? plan.days.map((d) => `${d.name}: ${d.ids.map((id) => exById(id)?.n ?? '').join(', ')}`).join(' / ')
      : '없음';
    const logTxt = logs.length
      ? logs.slice(0, 3).map((l) => `${l.date} ${l.dayName} ${l.totalSets}세트`).join('; ')
      : '기록 없음';
    const body = st
      ? `BMI ${st.bmi} (${st.bodyType}), 목표 칼로리 ${st.kcal}kcal, 단백질 ${st.protein}g`
      : '신체 정보 없음';
    return [
      `사용자: ${profile?.sex === 'male' ? '남' : '여'} ${profile?.age ?? '-'}세, ${profile?.height ?? '-'}cm/${profile?.weight ?? '-'}kg, ${body}`,
      `목표: ${profile ? GOAL_LABEL[profile.goal] : '-'}`,
      `현재 플랜: ${planTxt}`,
      `최근 기록: ${logTxt}`,
      `이번 주 부위별 세트: ${PART_ORDER.map((p) => `${PART_LABEL[p]} ${vol[p]}`).join(', ')}`,
      // 내 변화 프로젝트 요약 한 단락 — 숫자는 엔진 값(서버 프롬프트 규칙: 바꾸거나 새로 만들지 않는다)
      ...(bodyProject && bodyProject.status === 'active'
        ? [`내 변화 프로젝트: ${bodyProject.name}(${bodyProject.months}개월, ${bodyProject.startedAt.slice(0, 10)} 시작). `
          + `목표 ${bodyProject.goal.name} 체지방 ${Math.round(bodyProject.goal.bfPct)}%, 예상 끝 체중 ${Math.round(bodyProject.end.weightKg * 10) / 10}kg. `
          + `단계: ${bodyProject.phases.map((x) => `${x.from}~${x.to}개월 ${x.phase === 'cut' ? '감량' : x.phase === 'gain' ? '린벌크' : '유지'}`).join(', ')}.`]
        : []),
    ].join('\n');
  }, [profile, weights, logs, plan, bodyProject]);

  async function send(preset?: string) {
    const text = (preset ?? input).trim();
    if (!text || chatBusy) return;
    if (!canCoach) {
      router.push('/subscribe?f=ai_coach');
      return;
    }
    if (coachEmpty) return;
    if (!preset) setInput('');
    addChat({ role: 'user', content: text });
    setChatBusy(true);
    try {
      const st = calcBodyStats(profile, weights, bodyProject);
      const { reply, meal, warning, quota: next } = await askCoach(
        [...chat, { role: 'user', content: text }], context(), st?.kcal,
      );
      addChat({ role: 'assistant', content: reply, meal, warning });
      if (next) setQuota(next);
    } catch (e) {
      if (e instanceof SubscriptionRequired) {
        router.push('/subscribe?f=ai_coach');
        return;
      }
      if (e instanceof QuotaExceeded) {
        setQuota({ used: e.limit, limit: e.limit, remaining: 0 });
        addChat({
          role: 'assistant',
          content: `오늘 코치 대화 ${e.limit}회를 모두 사용했습니다. 내일 다시 채워집니다.`,
        });
        return;
      }
      addChat({
        role: 'assistant',
        content: e instanceof AIUnavailable
          ? 'AI 코치 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.'
          : '오류가 발생했습니다. 다시 시도해주세요.',
      });
    } finally {
      setChatBusy(false);
    }
  }

  // inverted 목록: 최신이 index 0
  const data = useMemo(() => {
    const list = chat.length ? chat : [WELCOME];
    const withBusy = chatBusy ? [...list, { role: 'assistant' as const, content: '…' }] : list;
    return [...withBusy].reverse();
  }, [chat, chatBusy]);

  const quotaLabel = !canCoach
    ? undefined
    : isAdmin || quota?.unlimited
    ? '제한 없음'
    : quota
    ? `오늘 ${quota.remaining}/${quota.limit}회 남음`
    : 'COACH';

  return (
    <Screen>
      <TopBar
        title="AI 코치"
        meta={quotaLabel}
        onBack={goBack}
        right={chat.length ? (
          <TouchableOpacity activeOpacity={0.7} onPress={clearChat} hitSlop={10} accessibilityRole="button" accessibilityLabel="대화 지우기">
            <Text style={s.clearTxt}>지우기</Text>
          </TouchableOpacity>
        ) : undefined}
      />
      {!canCoach ? (
        <View style={s.lockWrap}><ProLock feature="ai_coach" /></View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <FlatList
            data={data}
            // 모드가 바뀌면 줄도 다시 그린다 (renderItem 안에서 색을 읽는다)
            extraData={mode}
            inverted
            keyExtractor={(_, i) => String(data.length - i)}
            contentContainerStyle={s.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) =>
              item.role === 'user' ? (
                <View style={s.msgU}><Text style={s.msgUTxt}>{item.content}</Text></View>
              ) : (
                <View>
                  <View style={s.msgA}><Text style={s.msgATxt}>{item.content}</Text></View>
                  {item.meal ? <MealCard meal={item.meal} /> : null}
                  {item.warning ? <WarningCard text={item.warning} /> : null}
                </View>
              )
            }
          />
          {!chat.length && !coachEmpty ? (
            <View style={s.quick}>
              {QUICK.map((q) => (
                <TouchableOpacity key={q} activeOpacity={0.7} style={s.chip} onPress={() => send(q)}
                  disabled={chatBusy} accessibilityRole="button" accessibilityLabel={q}>
                  <Text style={s.chipTxt}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          <View style={[s.inRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <TextInput
              style={[s.input, coachEmpty && s.inputOff]}
              placeholder={coachEmpty ? '오늘 질문을 다 썼어요 · 내일 다시 채워집니다' : '코치에게 질문하기'}
              placeholderTextColor={colors.placeholder}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => send()}
              returnKeyType="send"
              blurOnSubmit={false}
              editable={!coachEmpty && !chatBusy}
              multiline
              maxLength={1000}
              accessibilityLabel="코치에게 질문"
            />
            <TouchableOpacity activeOpacity={0.7}
              style={[s.send, (coachEmpty || !input.trim() || chatBusy) && s.sendOff]}
              onPress={() => send()}
              disabled={coachEmpty || !input.trim() || chatBusy}
              accessibilityRole="button"
              accessibilityLabel="보내기"
              accessibilityState={{ disabled: coachEmpty || !input.trim() || chatBusy }}
            >
              {chatBusy ? <ActivityIndicator color={colors.bg} size="small" /> : <Text style={s.sendTxt}>↑</Text>}
            </TouchableOpacity>
          </View>
          <Text style={s.notice}>통증·부상·질환 관련 판단은 의료 전문가와 상의하세요.</Text>
        </KeyboardAvoidingView>
      )}
    </Screen>
  );
}

const s = themed(() => StyleSheet.create({
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  chip: {
    borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.panel,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8,
  },
  chipTxt: { fontSize: 13, color: colors.ink, fontWeight: '600' },
  clearTxt: { fontSize: 12, color: colors.mid, fontWeight: '600' },
  lockWrap: { padding: 20 },
  list: { paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  msgU: {
    alignSelf: 'flex-end', maxWidth: '84%',
    backgroundColor: colors.ink, borderRadius: 16, borderBottomRightRadius: 4,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  msgUTxt: { color: colors.bg, fontSize: 14, fontWeight: '500', lineHeight: 20 },
  msgA: {
    alignSelf: 'flex-start', maxWidth: '88%',
    backgroundColor: colors.panel2, borderRadius: 16, borderBottomLeftRadius: 4,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  msgATxt: { color: colors.ink, fontSize: 14, lineHeight: 22 },
  inRow: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-end',
    paddingHorizontal: 16, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg,
  },
  input: {
    flex: 1, minHeight: 44, maxHeight: 120,
    backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line2,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 16, color: colors.ink,
  },
  inputOff: { opacity: 0.5 },
  send: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.ink,
    alignItems: 'center', justifyContent: 'center',
  },
  sendOff: { opacity: 0.4 },
  sendTxt: { color: colors.bg, fontSize: 20, fontWeight: '700' },
  notice: { fontSize: 11, color: colors.muted, textAlign: 'center', paddingVertical: 8 },
}));
