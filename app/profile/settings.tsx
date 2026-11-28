/**
 * 설정 — 내 몸 탭 오른쪽 위 톱니에서 들어온다(11/27 배치 점검).
 * 내 몸 탭에는 몸 · 기록만 남기고, 가끔 만지는 것(구독 · 알림 · 화면 · AI 동의 · 계정)을 여기로 모았다.
 * 예전엔 내 몸 탭 아래로 9개 묶음이 이어져 로그아웃까지 화면 여러 장을 내려야 했다.
 */
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { chooseTheme, colors, themed, useThemePref, useThemeMode, type ThemePref } from '../../src/theme';
import { Segmented, haptic, setHapticsEnabled, useHapticsEnabled, PressableScale, PRESS_SCALE } from '../../src/ui';
import { Screen, TopBar, Body, useSafeBack } from '../../src/components/ui';
import { showAlert } from '../../src/utils/alert';
import { webSwitch } from '../../src/ui/webSwitch';
import { NudgeSettings } from '../../src/components/NudgeSettings';
import { useAppStore } from '../../src/stores/appStore';
import { useAuthStore } from '../../src/stores/authStore';
import { logoutUser, deleteUserAccount } from '../../src/services/session';
import { askAiConsent, hasAiConsent, revokeAiConsent } from '../../src/services/aiConsent';
import { requireLatestOtaNow } from '../../src/services/appConfig';
import { useEntitlement } from '../../src/hooks/useEntitlement';
import { ProBadge } from '../../src/components/ProLock';
import { SUB_STATUS_LABEL } from '../../src/utils/subscription';
import { PRO_NAME } from '../../src/config/entitlements';
import { manageSubscriptionUrl } from '../../src/services/billingService';

const THEME_OPTIONS = [
  { value: 'system', label: '시스템' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
] as const satisfies readonly { value: ThemePref; label: string }[];

export default function SettingsScreen() {
  useThemeMode();
  const themePref = useThemePref();
  const hapticsOn = useHapticsEnabled();
  const router = useRouter();
  const goBack = useSafeBack('/tabs/my');
  const user = useAuthStore((s) => s.user);
  const bodyProject = useAppStore((s) => s.project);
  const pendingCount = useAppStore((s) => s.pendingLogs.filter((l) => l.userId === user?.uid).length);
  const resetAll = useAppStore((s) => s.resetAll);
  const { pro, sub, left } = useEntitlement();
  const manageUrl = manageSubscriptionUrl(sub.source, sub.productId);

  function handleLogout() {
    const doLogout = async () => {
      try {
        await logoutUser();
      } catch {
        showAlert('오류', '로그아웃에 실패했습니다. 네트워크를 확인해주세요.');
        return;
      }
      resetAll();
      router.replace('/auth/login');
    };
    if (pendingCount > 0) {
      // 아직 서버에 못 올린 기록이 있다 — 로그아웃해도 기기에 남지만, 알고 나가게 한다
      showAlert(
        '동기화되지 않은 기록',
        `서버에 아직 올라가지 않은 운동 기록 ${pendingCount}건이 있습니다. 다시 로그인하면 자동으로 올라갑니다. 로그아웃할까요?`,
        [{ text: '취소', style: 'cancel' }, { text: '로그아웃', onPress: doLogout }]
      );
      return;
    }
    doLogout();
  }

  // 가입할 때와 같은 흐름을 처음부터 — 중간에 닫으면 아무것도 바뀌지 않는다
  function restartOnboarding() {
    const running = bodyProject?.status === 'active';
    showAlert(
      '온보딩 다시 하기',
      `원하는 체형부터 다시 골라요. 끝까지 진행하면 루틴이 새로 정해지고, 운동 기록과 체중 기록은 그대로 남아요.${running ? ' 새 프로젝트를 시작하면 지금 진행 중인 프로젝트는 끝나요.' : ''}`,
      [
        { text: '취소', style: 'cancel' },
        { text: '처음부터 하기', onPress: () => router.push('/project/new?restart=1') },
      ]
    );
  }

  function confirmDelete() {
    showAlert(
      '계정 삭제',
      '운동 기록·체중·플랜이 모두 삭제되며 되돌릴 수 없습니다. 진행할까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              // 서버(Admin SDK)가 지운다 — 재로그인 요구 없음
              await deleteUserAccount();
              resetAll();
              router.replace('/auth/login');
            } catch {
              showAlert('삭제 실패', '계정 삭제에 실패했습니다. 네트워크를 확인하고 잠시 후 다시 시도해주세요.');
            }
          },
        },
      ]
    );
  }

  function confirmOtaNow() {
    const uid = user?.uid;
    if (!uid) return;
    showAlert('코드푸시 모두 적용', '맥에서 eas update 가 다 끝났나요? 지금 앱을 쓰는 모든 사람에게 새 버전을 바로 적용합니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '모두 적용',
        onPress: () => {
          requireLatestOtaNow(uid)
            .then(() => showAlert('적용했습니다', '켜져 있는 앱은 곧 새 코드를 받아 다시 열립니다. 이 기기도 새 코드가 있으면 바로 다시 열립니다.'))
            .catch(() => showAlert('저장하지 못했습니다', '네트워크를 확인하고 다시 시도해주세요.'));
        },
      },
    ]);
  }

  return (
    <Screen>
      <TopBar title="설정" onBack={goBack} meta={user?.role === 'admin' ? 'ADMIN' : undefined} />
      <Body>
        {/* 구독 */}
        <Text style={[s.sectionLabel, s.first]}>구독</Text>
        <PressableScale scaleTo={PRESS_SCALE.card} style={s.subRow} onPress={() => router.push('/subscribe')} accessibilityRole="button">
          <View style={{ flex: 1 }}>
            <View style={s.subHead}>
              <Text style={s.subTitle}>{pro ? PRO_NAME : '무료 플랜'}</Text>
              {pro && <ProBadge />}
            </View>
            <Text style={s.subSub}>
              {pro
                ? `${SUB_STATUS_LABEL[sub.status]}${left !== null ? ` · ${left}일 남음` : ''}`
                : 'AI 개인화 · 식단 · 루틴 추천은 구독 기능입니다'}
            </Text>
          </View>
          <Text style={s.subChev}>›</Text>
        </PressableScale>
        {manageUrl ? (
          <PressableScale scaleTo={PRESS_SCALE.card} style={s.subRow} onPress={() => Linking.openURL(manageUrl)}
            accessibilityRole="link" accessibilityLabel="구독 관리 · 해지">
            <View style={{ flex: 1 }}>
              <Text style={s.subTitle}>구독 관리 · 해지</Text>
              <Text style={s.subSub}>{sub.source === 'ios' ? 'App Store' : 'Google Play'} 구독 화면에서 해지 · 결제 수단을 바꿉니다</Text>
            </View>
            <Text style={s.subChev}>›</Text>
          </PressableScale>
        ) : null}

        {/* 결석 알림 — 쉴수록 세지는 알림(11/27) */}
        <Text style={s.sectionLabel}>알림</Text>
        <NudgeSettings />

        {/* 화면 · 진동 */}
        <Text style={s.sectionLabel}>화면</Text>
        <View style={s.card}>
          <Text style={s.setTitle}>모드</Text>
          <Segmented<ThemePref>
            label="화면 모드"
            options={THEME_OPTIONS}
            value={themePref}
            onChange={chooseTheme}
          />
          <Text style={s.setHint}>
            {themePref === 'system' ? '기기 설정을 따라 바뀝니다.' : '기기 설정과 상관없이 이 모드로 봅니다.'}
          </Text>
          <View style={s.setRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.setTitle}>누를 때 진동</Text>
              <Text style={s.setSub}>버튼 · 세트 체크 · 기록 갱신. 휴식 끝 알림은 항상 울립니다.</Text>
            </View>
            <Switch
              value={hapticsOn}
              onValueChange={(v) => {
                setHapticsEnabled(v);
                if (v) haptic.tap();
              }}
              // 모노: 켜면 글자색 판 위에 바탕색 손잡이 (iOS 기본 흰 손잡이는 다크에서 흰 판에 묻힌다)
              trackColor={{ false: colors.panel3, true: colors.ink }}
              thumbColor={hapticsOn ? colors.bg : '#FFFFFF'}
              {...webSwitch(colors.bg)}
              ios_backgroundColor={colors.panel3}
              accessibilityLabel="누를 때 진동"
            />
          </View>
        </View>

        {/* AI 데이터 */}
        <Text style={s.sectionLabel}>AI 데이터</Text>
        <View style={s.card}>
          <AiConsentRow />
        </View>

        {/* 계정 */}
        <Text style={s.sectionLabel}>계정</Text>
        <PressableScale scaleTo={PRESS_SCALE.card} style={s.subRow} onPress={restartOnboarding} accessibilityRole="button"
          accessibilityLabel="온보딩 처음부터 다시 하기">
          <View style={{ flex: 1 }}>
            <Text style={s.subTitle}>온보딩 처음부터 다시 하기</Text>
            <Text style={s.subSub}>성별 · 키부터 몸 계산 · 프로젝트까지 다시 해요</Text>
          </View>
          <Text style={s.subChev}>›</Text>
        </PressableScale>

        {user?.role === 'admin' ? (
          <>
            <Text style={s.sectionLabel}>관리자</Text>
            <PressableScale scaleTo={PRESS_SCALE.card} style={s.subRow} onPress={() => router.push('/profile/waitlist')}
              accessibilityRole="button" accessibilityLabel="대기자 명단 등록">
              <View style={{ flex: 1 }}>
                <Text style={s.subTitle}>대기자 명단 등록</Text>
                <Text style={s.subSub}>Tally CSV → 3개월 · 1개월 무료(결제 수단 등록 뒤) · iOS 혜택 코드</Text>
              </View>
              <Text style={s.subChev}>›</Text>
            </PressableScale>
            <PressableScale scaleTo={PRESS_SCALE.card} style={s.subRow} onPress={confirmOtaNow}
              accessibilityRole="button" accessibilityLabel="방금 올린 코드푸시 모두 적용">
              <View style={{ flex: 1 }}>
                <Text style={s.subTitle}>방금 올린 코드푸시 모두 적용</Text>
                <Text style={s.subSub}>eas update 가 끝난 뒤 누르면, 켜져 있는 앱까지 새 코드를 받아 저절로 다시 열립니다(운동 중이면 끝난 뒤)</Text>
              </View>
              <Text style={s.subChev}>›</Text>
            </PressableScale>
          </>
        ) : null}

        <PressableScale style={s.logoutBtn} onPress={handleLogout} accessibilityRole="button">
          <Text style={s.logoutTxt}>로그아웃</Text>
        </PressableScale>
        <PressableScale style={s.deleteBtn} onPress={confirmDelete} accessibilityRole="button">
          <Text style={s.deleteTxt}>계정 삭제</Text>
        </PressableScale>
      </Body>
    </Screen>
  );
}

/** AI 데이터 전송 동의 — 켜면 동의 안내, 끄면 철회(다음 AI 사용 때 다시 묻는다) */
function AiConsentRow() {
  useThemeMode();
  const [on, setOn] = useState(false);
  // 로그인 복원이 끝난 뒤에 다시 읽는다 — 이 화면을 바로 열면(웹 새로고침) 계정을 알기 전이라 꺼진 것으로 보였다
  const uid = useAuthStore((st) => st.user?.uid);
  useEffect(() => { hasAiConsent().then(setOn); }, [uid]);
  return (
    <View style={s.consentRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.setTitle}>AI 기능 데이터 전송 동의</Text>
        <Text style={s.setSub}>AI 플랜 · 식단 · 코치 · 체크인 리포트에 신체 · 운동 정보와 질문을 Anthropic(미국)으로 보냅니다. 끄면 AI 없이 기본 구성으로 씁니다.</Text>
      </View>
      <Switch
        value={on}
        onValueChange={(v) => {
          if (v) askAiConsent().then(setOn);
          else revokeAiConsent().then(() => setOn(false));
        }}
        trackColor={{ false: colors.panel3, true: colors.ink }}
        thumbColor={on ? colors.bg : '#FFFFFF'}
        {...webSwitch(colors.bg)}
        ios_backgroundColor={colors.panel3}
        accessibilityLabel="AI 기능 데이터 전송 동의"
      />
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  sectionLabel: {
    fontSize: 10, fontWeight: '800', color: colors.muted,
    letterSpacing: 2, marginBottom: 10, marginTop: 18,
  },
  first: { marginTop: 6 },
  card: {
    backgroundColor: colors.panel, borderRadius: 22, padding: 18,
    borderWidth: 1, borderColor: colors.line, marginBottom: 4,
  },
  setTitle: { fontSize: 14, fontWeight: '700', color: colors.ink, marginBottom: 10 },
  setHint: { fontSize: 11.5, color: colors.muted, marginTop: 8 },
  setRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderTopWidth: 1, borderTopColor: colors.line, marginTop: 16, paddingTop: 14,
  },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  setSub: { fontSize: 11.5, color: colors.muted, lineHeight: 17, marginTop: -6 },

  subRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.panel, borderRadius: 20, padding: 16,
    borderWidth: 1, borderColor: colors.line, marginBottom: 12,
  },
  subHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  subSub: { fontSize: 11.5, color: colors.muted, marginTop: 4, lineHeight: 18 },
  subChev: { fontSize: 20, color: colors.muted },

  logoutBtn: {
    borderWidth: 1, borderColor: colors.line2, marginTop: 22,
    borderRadius: 14, paddingVertical: 14, alignItems: 'center',
  },
  logoutTxt: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  deleteBtn: { paddingVertical: 16, alignItems: 'center' },
  deleteTxt: { color: colors.wrong, fontSize: 12.5, fontWeight: '600' },
}));
