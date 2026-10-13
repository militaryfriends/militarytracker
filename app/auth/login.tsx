/**
 * 로그인 — 브랜드 인트로 모션 (디자인 캔버스 "밀리터리트래커 로그인 모션").
 *
 * 화면 전체가 시계 하나(clock, ms)로 움직인다 — 시간표는 src/components/brand/intro.ts.
 *   · 인트로 중 화면을 누르면 건너뛴다. 로고를 누르면 다시 본다.
 *   · 동작 줄이기면 처음부터 완성된 화면. 두 번째부터(로그아웃 뒤)는 로고가 다 그려진 데서 시작한다.
 * 로그인 중에는 로고의 고리가 진행 표시가 되고, 성공하면 고리가 한 바퀴 완성된다.
 * 화면 이동은 세션(session.ts)이 사용자 문서를 받으면 라우팅 가드가 한다 — 여기서 기다리지 않는다.
 *
 * 테마와 상관없이 항상 다크(src/components/auth/palette.ts).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View,
  useWindowDimensions, type StyleProp, type TextInput, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  cancelAnimation, Easing, runOnJS, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue,
  withDelay, withSequence, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { signInWithEmail, resetPassword } from '../../src/services/authService';
import { showAlert } from '../../src/utils/alert';
import { BrandMark, type BrandPhase } from '../../src/components/brand/BrandMark';
import { INTRO, easeInOutQuart, easeOutQuart, seg } from '../../src/components/brand/intro';
import { AuthField } from '../../src/components/auth/AuthField';
import { D } from '../../src/components/auth/palette';
import { FONT, PressableScale, haptic } from '../../src/ui';

/** 이 실행에서 인트로를 이미 봤는지 — 두 번째부터는 짧게 */
let introSeen = false;

const LOGO = 132;   // 완성 후 로고 크기
const BIG = 240;    // 인트로 중 로고 크기 (크게 그려 두고 줄인다 — 줄이는 쪽이 선명하다)
const TOP_GAP = 36;
const WORD = 25;    // 워드마크 글자 크기

function Rise({ clock, i, style, children }: { clock: SharedValue<number>; i: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const a = useAnimatedStyle(() => {
    const p = easeOutQuart(seg(clock.value, INTRO.up.d + i * INTRO.up.step, INTRO.up.dur));
    return { opacity: p, transform: [{ translateY: 18 * (1 - p) }] };
  });
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

const errorMessage = (code: string) =>
  code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential'
    ? '이메일 또는 비밀번호가 올바르지 않습니다.'
    : code === 'auth/invalid-email'
    ? '올바른 이메일 형식이 아닙니다.'
    : code === 'auth/too-many-requests'
    ? '시도가 너무 많습니다. 잠시 후 다시 시도해주세요.'
    : code === 'auth/network-request-failed'
    ? '네트워크 연결을 확인해주세요.'
    : code === 'auth/user-disabled'
    ? '사용이 중지된 계정입니다.'
    : '로그인에 실패했습니다. 다시 시도해주세요.';

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const reduce = useReducedMotion();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<BrandPhase>('idle');
  const [msg, setMsg] = useState('');
  const [resetting, setResetting] = useState(false);
  const [run, setRun] = useState(0);
  const [startAt] = useState(() => (reduce ? INTRO.end : introSeen ? INTRO.short : 0));
  const [ready, setReady] = useState(startAt >= INTRO.up.d);
  const pwRef = useRef<TextInput>(null);

  const clock = useSharedValue(startAt);
  const shake = useSharedValue(0);
  const out = useSharedValue(0);

  const play = useCallback((from: number) => {
    cancelAnimation(clock);
    clock.value = from;
    clock.value = withTiming(INTRO.end, { duration: INTRO.end - from, easing: Easing.linear });
  }, [clock]);

  useEffect(() => {
    introSeen = true;
    if (startAt < INTRO.end) play(startAt);
  }, [play, startAt]);

  // 입력칸이 올라오기 시작하면 만질 수 있게
  useAnimatedReaction(
    () => clock.value >= INTRO.up.d,
    (now, prev) => {
      if (now !== prev) runOnJS(setReady)(now);
    }
  );

  const skip = () => {
    cancelAnimation(clock);
    clock.value = withTiming(INTRO.end, { duration: 260, easing: Easing.out(Easing.cubic) });
  };
  const replay = () => {
    if (phase !== 'idle') return;
    haptic.select();
    setMsg('');
    setRun((r) => r + 1);
    play(0);
  };

  // 로고 · 워드마크: 화면 가운데에서 시작해 위로 올라간다
  const headerTop = insets.top + TOP_GAP;
  const introCenter = winH * 0.43;
  const dyLogo = introCenter - (headerTop + LOGO / 2);
  const dyWord = introCenter + BIG / 2 + 22 - (headerTop + LOGO + 16);

  const logoStyle = useAnimatedStyle(() => {
    const p = easeInOutQuart(seg(clock.value, INTRO.rise.d, INTRO.rise.dur));
    const z = out.value;
    return {
      opacity: 1 - z,
      transform: [{ translateY: dyLogo * (1 - p) }, { scale: (LOGO / BIG + (1 - LOGO / BIG) * (1 - p)) * (1 + 5 * z) }],
    };
  }, [dyLogo]);
  const wordStyle = useAnimatedStyle(() => {
    const p = easeInOutQuart(seg(clock.value, INTRO.rise.d, INTRO.rise.dur));
    return { opacity: 1 - out.value, transform: [{ translateY: dyWord * (1 - p) }] };
  }, [dyWord]);
  // 넓게 벌어진 자간이 좁혀지며 나타난다 (가운데 정렬이 흔들리지 않게 왼쪽에도 같은 만큼)
  const trackStyle = useAnimatedStyle(() => {
    const p = easeOutQuart(seg(clock.value, INTRO.track.d, INTRO.track.dur));
    const ls = WORD * (0.24 + 0.48 * (1 - p));
    return { opacity: p, letterSpacing: ls, paddingLeft: ls };
  });
  const formStyle = useAnimatedStyle(() => ({
    opacity: 1 - out.value,
    transform: [{ translateX: shake.value }, { translateY: 16 * out.value }],
  }));

  const fail = (text: string) => {
    setMsg(text);
    haptic.error();
    shake.value = withSequence(
      withTiming(-9, { duration: 70 }), withTiming(8, { duration: 70 }), withTiming(-5, { duration: 70 }),
      withTiming(3, { duration: 70 }), withTiming(0, { duration: 70 })
    );
  };

  async function handleLogin() {
    if (phase !== 'idle') return;
    if (!email.trim() || !password) {
      fail('이메일과 비밀번호를 모두 입력해주세요.');
      return;
    }
    setMsg('');
    setPhase('loading');
    try {
      await signInWithEmail(email.trim(), password);
      // 고리가 한 바퀴 완성되고 화면이 걷힌다 — 이동은 라우팅 가드가 한다
      setPhase('success');
      haptic.success();
      out.value = withDelay(420, withTiming(1, { duration: 520, easing: Easing.in(Easing.cubic) }));
    } catch (e: any) {
      setPhase('idle');
      fail(errorMessage(e?.code ?? ''));
    }
  }

  async function handleReset() {
    const target = email.trim();
    if (!target) {
      showAlert('이메일 입력', '가입하신 이메일을 먼저 입력해주세요.');
      return;
    }
    if (resetting) return; // 연타로 메일이 여러 통 나가지 않게
    setResetting(true);
    try {
      await resetPassword(target);
      showAlert('메일 발송', `${target}으로 비밀번호 재설정 링크를 보냈습니다.\n메일함을 확인해주세요.`);
    } catch (e: any) {
      showAlert(
        '발송 실패',
        e?.code === 'auth/invalid-email' ? '올바른 이메일 형식이 아닙니다.' : '메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.'
      );
    } finally {
      setResetting(false);
    }
  }

  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    if (msg) setMsg('');
  };
  const busy = phase !== 'idle';

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: headerTop, paddingBottom: insets.bottom + 16 }]}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={ready}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.logoSlot}>
              <Animated.View style={[styles.logoBig, logoStyle]}>
                <Pressable onPress={replay} accessibilityRole="button" accessibilityLabel="인트로 다시 보기">
                  <BrandMark
                    key={run}
                    size={BIG}
                    clock={clock}
                    phase={phase}
                    still={reduce}
                    glintDelay={Math.max(0, INTRO.glint - (run ? 0 : startAt))}
                  />
                </Pressable>
              </Animated.View>
            </View>
            <Animated.View style={[styles.wordWrap, wordStyle]}>
              <Animated.Text style={[styles.word, trackStyle]} numberOfLines={1}>MILITARYTRACKER</Animated.Text>
            </Animated.View>
            <Rise clock={clock} i={0}>
              <Text style={styles.sub}>검증된 자세 가이드 위에서 기록하는{'\n'}가장 단순한 트레이닝 앱</Text>
            </Rise>
          </View>

          <Animated.View style={[styles.form, formStyle]}>
            <Rise clock={clock} i={1}>
              <AuthField
                label="이메일"
                value={email}
                onChangeText={edit(setEmail)}
                error={!!msg}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                onSubmitEditing={() => pwRef.current?.focus()}
                editable={!busy}
              />
            </Rise>
            <Rise clock={clock} i={2} style={styles.gap}>
              <AuthField
                ref={pwRef}
                label="비밀번호"
                value={password}
                onChangeText={edit(setPassword)}
                error={!!msg}
                secure
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={handleLogin}
                editable={!busy}
              />
            </Rise>
            <Text style={styles.msg} accessibilityRole="alert" accessibilityLiveRegion="polite">{msg}</Text>
            <Rise clock={clock} i={3}>
              <PressableScale
                style={[styles.btn, phase === 'loading' && styles.btnBusy]}
                onPress={handleLogin}
                disabled={phase === 'success'}
                accessibilityLabel="로그인"
                accessibilityState={{ busy }}
              >
                {phase === 'loading' ? (
                  <>
                    <ActivityIndicator color={D.bg} size="small" />
                    <Text style={styles.btnTxt}>확인 중</Text>
                  </>
                ) : phase === 'success' ? (
                  <Ionicons name="checkmark" size={22} color={D.bg} />
                ) : (
                  <Text style={styles.btnTxt}>로그인</Text>
                )}
              </PressableScale>
            </Rise>
            <Rise clock={clock} i={4} style={styles.center}>
              <PressableScale haptic={false} scaleTo={0.97} onPress={handleReset} style={styles.textBtn}>
                <Text style={styles.resetTxt}>비밀번호를 잊으셨나요?</Text>
              </PressableScale>
            </Rise>
          </Animated.View>

          <View style={styles.fill} />

          <Rise clock={clock} i={5} style={styles.footer}>
            <Text style={styles.footerTxt}>계정이 없으신가요?</Text>
            <PressableScale haptic="select" scaleTo={0.97} onPress={() => router.push('/auth/signup')} style={styles.textBtn} disabled={busy}>
              <Text style={styles.link}>회원가입</Text>
            </PressableScale>
          </Rise>
        </ScrollView>
      </KeyboardAvoidingView>

      {!ready ? (
        <Pressable style={StyleSheet.absoluteFill} onPress={skip} accessibilityRole="button" accessibilityLabel="인트로 건너뛰기" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: D.bg, overflow: 'hidden' },
  fill: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  header: { alignItems: 'center' },
  logoSlot: { width: LOGO, height: LOGO },
  logoBig: { position: 'absolute', left: (LOGO - BIG) / 2, top: (LOGO - BIG) / 2, width: BIG, height: BIG },
  wordWrap: { marginTop: 16, alignSelf: 'stretch', alignItems: 'center', pointerEvents: 'none' },
  word: { fontFamily: FONT.numSemi, fontSize: WORD, lineHeight: 30, color: D.ink, letterSpacing: WORD * 0.24 },
  sub: { marginTop: 10, fontSize: 13, lineHeight: 19, color: D.muted, textAlign: 'center' },
  form: { marginTop: 32 },
  gap: { marginTop: 12 },
  msg: { minHeight: 20, marginTop: 10, fontSize: 12.5, lineHeight: 18, color: D.wrong },
  btn: {
    marginTop: 12, height: 54, borderRadius: 12, backgroundColor: D.ink,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  btnBusy: { opacity: 0.85 },
  btnTxt: { color: D.bg, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  center: { alignItems: 'center', marginTop: 4 },
  textBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  resetTxt: { color: D.muted, fontSize: 13 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  footerTxt: { color: D.muted, fontSize: 13.5 },
  link: { color: D.ink, fontWeight: '700', fontSize: 13.5 },
});
