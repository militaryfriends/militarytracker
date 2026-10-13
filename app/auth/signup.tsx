/**
 * 회원가입 — 로그인과 같은 다크 브랜드 화면(인트로는 없이 작은 로고만). 항상 다크(src/components/auth/palette.ts).
 */
import { useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View,
  type TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { signUpWithEmail } from '../../src/services/authService';
import { useAuthStore } from '../../src/stores/authStore';
import { showAlert } from '../../src/utils/alert';
import { LEGAL } from '../../src/config/entitlements';
import { BrandMark } from '../../src/components/brand/BrandMark';
import { Grain } from '../../src/components/brand/Grain';
import { AuthField } from '../../src/components/auth/AuthField';
import { D } from '../../src/components/auth/palette';
import { FONT, PressableScale, haptic } from '../../src/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const enter = (i: number) => FadeInDown.duration(420).delay(60 * i);

export default function SignupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // 건강(신체) 정보는 민감정보라 별도 동의가 필요하다 — 셋 다 필수
  const [agree, setAgree] = useState({ terms: false, privacy: false, health: false });
  const allAgreed = agree.terms && agree.privacy && agree.health;
  const emailRef = useRef<TextInput>(null);
  const pwRef = useRef<TextInput>(null);
  const pw2Ref = useRef<TextInput>(null);

  async function handleSignup() {
    if (!displayName.trim() || !email.trim() || !password || !confirmPassword) {
      showAlert('입력 오류', '모든 항목을 입력해주세요.');
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      showAlert('입력 오류', '올바른 이메일 형식이 아닙니다.');
      return;
    }
    if (!allAgreed) {
      showAlert('동의 필요', '이용약관·개인정보·건강정보 수집에 모두 동의해야 가입할 수 있습니다.');
      return;
    }
    if (password !== confirmPassword) {
      showAlert('비밀번호 오류', '비밀번호가 일치하지 않습니다.');
      return;
    }
    if (password.length < 6) {
      showAlert('비밀번호 오류', '비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    setLoading(true);
    try {
      const u = await signUpWithEmail(email.trim(), password, displayName.trim());
      // 구독(session.ts)이 문서를 받기 전에 온보딩으로 확실히 넘긴다 — 같은 값이 곧 구독으로도 들어온다
      useAuthStore.getState().setUser(u);
      haptic.success();
    } catch (e: any) {
      haptic.error();
      const msg =
        e.code === 'auth/email-already-in-use'
          ? '이미 사용 중인 이메일입니다.'
          : e.code === 'auth/invalid-email'
          ? '올바른 이메일 형식이 아닙니다.'
          : '회원가입에 실패했습니다. 다시 시도해주세요.';
      showAlert('회원가입 실패', msg);
    } finally {
      setLoading(false);
    }
  }

  const toLogin = () => (router.canGoBack() ? router.back() : router.replace('/auth/login'));

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Grain still={reduce} />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 16 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={enter(0)} style={styles.header}>
            <BrandMark size={88} still={reduce} glintDelay={900} />
            <Text style={styles.word}>MILITARYTRACKER</Text>
            <Text style={styles.sub}>계정을 만들고 시작하세요</Text>
          </Animated.View>

          <View style={styles.form}>
            <Animated.View entering={enter(1)}>
              <AuthField label="닉네임" value={displayName} onChangeText={setDisplayName} maxLength={20}
                returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} />
            </Animated.View>
            <Animated.View entering={enter(2)}>
              <AuthField ref={emailRef} label="이메일" value={email} onChangeText={setEmail}
                keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email"
                textContentType="emailAddress" returnKeyType="next" onSubmitEditing={() => pwRef.current?.focus()} />
            </Animated.View>
            <Animated.View entering={enter(3)}>
              <AuthField ref={pwRef} label="비밀번호 (6자 이상)" value={password} onChangeText={setPassword} secure
                autoComplete="new-password" textContentType="newPassword" returnKeyType="next"
                onSubmitEditing={() => pw2Ref.current?.focus()} />
            </Animated.View>
            <Animated.View entering={enter(4)}>
              <AuthField ref={pw2Ref} label="비밀번호 확인" value={confirmPassword} onChangeText={setConfirmPassword} secure
                error={!!confirmPassword && confirmPassword !== password}
                autoComplete="new-password" textContentType="newPassword" returnKeyType="done" />
            </Animated.View>

            <Animated.View entering={enter(5)} style={styles.agreeBox}>
              <Pressable
                style={styles.agreeAll}
                onPress={() => {
                  haptic.select();
                  setAgree(allAgreed ? { terms: false, privacy: false, health: false } : { terms: true, privacy: true, health: true });
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: allAgreed }}
              >
                <Text style={[styles.box, allAgreed && styles.boxOn]}>{allAgreed ? '✓' : ''}</Text>
                <Text style={styles.agreeAllTxt}>모두 동의합니다</Text>
              </Pressable>
              <Consent on={agree.terms} onToggle={() => setAgree((a) => ({ ...a, terms: !a.terms }))}
                label="[필수] 이용약관 동의" url={LEGAL.terms} />
              <Consent on={agree.privacy} onToggle={() => setAgree((a) => ({ ...a, privacy: !a.privacy }))}
                label="[필수] 개인정보 수집·이용 동의" url={LEGAL.privacy} />
              <Consent on={agree.health} onToggle={() => setAgree((a) => ({ ...a, health: !a.health }))}
                label="[필수] 건강정보(신체·운동 기록) 수집·이용 동의" url={LEGAL.privacy} />
            </Animated.View>

            <Animated.View entering={enter(6)}>
              <PressableScale
                style={styles.btn}
                onPress={handleSignup}
                disabled={loading || !allAgreed}
                accessibilityLabel="가입하기"
                accessibilityState={{ disabled: loading || !allAgreed, busy: loading }}
              >
                {loading ? <ActivityIndicator color={D.bg} /> : <Text style={styles.btnTxt}>가입하기</Text>}
              </PressableScale>
            </Animated.View>
          </View>

          <View style={styles.fill} />

          <View style={styles.footer}>
            <Text style={styles.footerTxt}>이미 계정이 있으신가요?</Text>
            <PressableScale haptic="select" scaleTo={0.97} onPress={toLogin} style={styles.textBtn}>
              <Text style={styles.link}>로그인</Text>
            </PressableScale>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Consent({ on, onToggle, label, url }: { on: boolean; onToggle: () => void; label: string; url: string }) {
  return (
    <View style={styles.consentRow}>
      <Pressable
        style={styles.consentMain}
        onPress={() => { haptic.select(); onToggle(); }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        accessibilityLabel={label}
      >
        <Text style={[styles.box, on && styles.boxOn]}>{on ? '✓' : ''}</Text>
        <Text style={styles.consentTxt}>{label}</Text>
      </Pressable>
      <Pressable onPress={() => Linking.openURL(url)} hitSlop={10} accessibilityRole="link" accessibilityLabel={`${label} 내용 보기`}>
        <Text style={styles.consentLink}>보기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: D.bg, overflow: 'hidden' },
  fill: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  header: { alignItems: 'center' },
  word: { marginTop: 12, fontFamily: FONT.numSemi, fontSize: 20, lineHeight: 24, color: D.ink, letterSpacing: 20 * 0.24, paddingLeft: 20 * 0.24 },
  sub: { marginTop: 8, fontSize: 13, color: D.muted },
  form: { marginTop: 28, gap: 12 },
  agreeBox: {
    marginTop: 8, backgroundColor: D.panel, borderRadius: 12,
    borderWidth: 1, borderColor: D.line, padding: 12, gap: 2,
  },
  agreeAll: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: D.line, marginBottom: 4, minHeight: 44 },
  agreeAllTxt: { fontSize: 14, fontWeight: '700', color: D.ink },
  consentRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  consentMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  consentTxt: { fontSize: 13, color: D.mid, flexShrink: 1 },
  consentLink: { fontSize: 12, color: D.muted, textDecorationLine: 'underline', paddingHorizontal: 4 },
  box: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: D.line2,
    color: D.bg, fontSize: 14, fontWeight: '800', textAlign: 'center', lineHeight: 21, overflow: 'hidden',
  },
  boxOn: { backgroundColor: D.ink, borderColor: D.ink },
  btn: { marginTop: 8, height: 54, borderRadius: 12, backgroundColor: D.ink, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { color: D.bg, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  footerTxt: { color: D.muted, fontSize: 13.5 },
  textBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  link: { color: D.ink, fontWeight: '700', fontSize: 13.5 },
});
