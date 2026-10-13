import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { signUpWithEmail } from '../../src/services/authService';
import { useAuthStore } from '../../src/stores/authStore';
import { colors, themed, useThemeMode } from '../../src/theme';
import { showAlert } from '../../src/utils/alert';
import { LEGAL } from '../../src/config/entitlements';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function SignupScreen() {
  useThemeMode();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // 건강(신체) 정보는 민감정보라 별도 동의가 필요하다 — 셋 다 필수
  const [agree, setAgree] = useState({ terms: false, privacy: false, health: false });
  const allAgreed = agree.terms && agree.privacy && agree.health;

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
      // onAuthChange 가 문서보다 먼저 도착해 setUser(null) 이 되는 레이스가 있었다 —
      // 가입 결과를 직접 스토어에 넣어 온보딩으로 확실히 넘긴다(_layout 도 같은 값을 다시 넣는다).
      useAuthStore.getState().setUser(u);
    } catch (e: any) {
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

  return (
    <SafeAreaView style={s.root}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <Text style={s.logo}>MILITARYTRACKER</Text>
          <Text style={s.sub}>계정을 만들고 시작하세요</Text>
        </View>

        <View style={s.form}>
          <Text style={s.label}>닉네임</Text>
          <TextInput style={s.input} placeholder="사용할 이름" placeholderTextColor={colors.muted} value={displayName} onChangeText={setDisplayName} maxLength={20} />
          <Text style={s.label}>이메일</Text>
          <TextInput style={s.input} placeholder="email@example.com" placeholderTextColor={colors.muted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
          <Text style={s.label}>비밀번호</Text>
          <TextInput style={s.input} placeholder="6자 이상" placeholderTextColor={colors.muted} value={password} onChangeText={setPassword} secureTextEntry />
          <Text style={s.label}>비밀번호 확인</Text>
          <TextInput style={s.input} placeholder="동일하게 입력" placeholderTextColor={colors.muted} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />

          <View style={s.agreeBox}>
            <TouchableOpacity activeOpacity={0.7}
              style={s.agreeAll}
              onPress={() => setAgree(allAgreed ? { terms: false, privacy: false, health: false } : { terms: true, privacy: true, health: true })}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: allAgreed }}
            >
              <Text style={[s.box, allAgreed && s.boxOn]}>{allAgreed ? '✓' : ''}</Text>
              <Text style={s.agreeAllTxt}>모두 동의합니다</Text>
            </TouchableOpacity>
            <Consent
              on={agree.terms}
              onToggle={() => setAgree((a) => ({ ...a, terms: !a.terms }))}
              label="[필수] 이용약관 동의"
              url={LEGAL.terms}
            />
            <Consent
              on={agree.privacy}
              onToggle={() => setAgree((a) => ({ ...a, privacy: !a.privacy }))}
              label="[필수] 개인정보 수집·이용 동의"
              url={LEGAL.privacy}
            />
            <Consent
              on={agree.health}
              onToggle={() => setAgree((a) => ({ ...a, health: !a.health }))}
              label="[필수] 건강정보(신체·운동 기록) 수집·이용 동의"
              url={LEGAL.privacy}
            />
          </View>

          <TouchableOpacity activeOpacity={0.7}
            style={[s.btn, (loading || !allAgreed) && s.btnOff]}
            onPress={handleSignup}
            disabled={loading || !allAgreed}
            accessibilityRole="button"
            accessibilityState={{ disabled: loading || !allAgreed }}
          >
            {loading ? <ActivityIndicator color={colors.bg} /> : <Text style={s.btnTxt}>가입하기</Text>}
          </TouchableOpacity>

          <View style={s.footer}>
            <Text style={s.footerTxt}>이미 계정이 있으신가요? </Text>
            <Link href="/auth/login" asChild>
              <TouchableOpacity activeOpacity={0.7}>
                <Text style={s.link}>로그인</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Consent({ on, onToggle, label, url }: { on: boolean; onToggle: () => void; label: string; url: string }) {
  useThemeMode();
  return (
    <View style={s.consentRow}>
      <TouchableOpacity activeOpacity={0.7}
        style={s.consentMain}
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        accessibilityLabel={label}
      >
        <Text style={[s.box, on && s.boxOn]}>{on ? '✓' : ''}</Text>
        <Text style={s.consentTxt}>{label}</Text>
      </TouchableOpacity>
      <TouchableOpacity activeOpacity={0.7} onPress={() => Linking.openURL(url)} hitSlop={10} accessibilityRole="link" accessibilityLabel={`${label} 내용 보기`}>
        <Text style={s.consentLink}>보기</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  agreeBox: {
    marginTop: 20, backgroundColor: colors.panel, borderRadius: 12,
    borderWidth: 1, borderColor: colors.line, padding: 12, gap: 2,
  },
  agreeAll: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line, marginBottom: 4 },
  agreeAllTxt: { fontSize: 14, fontWeight: '700', color: colors.ink },
  consentRow: { flexDirection: 'row', alignItems: 'center', minHeight: 40 },
  consentMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  consentTxt: { fontSize: 13, color: colors.mid, flexShrink: 1 },
  consentLink: { fontSize: 12, color: colors.muted, textDecorationLine: 'underline', paddingHorizontal: 4 },
  box: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: colors.line2,
    color: colors.bg, fontSize: 14, fontWeight: '800', textAlign: 'center', lineHeight: 21,
    overflow: 'hidden',
  },
  boxOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 40 },
  logo: { fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: 2 },
  sub: { fontSize: 13, color: colors.muted, marginTop: 10 },
  form: {},
  label: { fontSize: 12, color: colors.muted, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: colors.ink,
  },
  btn: {
    backgroundColor: colors.ink,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 24,
  },
  btnOff: { opacity: 0.4 },
  btnTxt: { color: colors.bg, fontSize: 15, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  footerTxt: { color: colors.muted, fontSize: 13 },
  link: { color: colors.ink, fontWeight: '700', fontSize: 13 },
}));
