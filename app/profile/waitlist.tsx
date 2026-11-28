/**
 * 관리자 · 대기자 명단 가져오기 — Tally 에서 내려받은 CSV 를 붙여 넣는다.
 * 기준일 이전 신청자는 3개월(90일), 이후는 1개월(30일) 무료 자격. 서버(subGrant)가 이메일 · 번호를 해시로만 저장한다.
 * 가입 이메일이 명단에 있으면 다음 접속 때 자동 확인, 번호만 낸 사람은 웹 구독 화면에 번호를 넣는다.
 * 2026-11-28 대표 결정: 무료 기간은 결제 수단을 등록해야 시작된다(스토어 결제창 — 끝나면 자동 결제, 그 전에 언제든 취소).
 *  · iOS 는 App Store 일회용 오퍼 코드를 아래 칸으로 넣어 둔다 — 대기자가 '무료 받기'를 누르면 한 명에 하나씩 나간다.
 *  · Android 는 Play Console 개발자 지정 혜택(태그 waitlist-3m · waitlist-1m)이라 여기서 넣을 것이 없다.
 *  설정 순서: docs/대기자-혜택-스토어-설정.md
 */
import { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { colors, themed, useThemeMode } from '../../src/theme';
import { Screen, TopBar, Body, SectionLabel, PrimaryBtn, useSafeBack, EmptyState } from '../../src/components/ui';
import { functions } from '../../src/services/firebase';
import { useAuthStore } from '../../src/stores/authStore';
import { showAlert } from '../../src/utils/alert';
import { PressableScale } from '../../src/ui';
import { OFFER_LABEL, parseOfferCodes, type WaitlistOffer } from '../../src/utils/waitlistOffer';

type Stats = Record<WaitlistOffer, { free: number; assigned: number }>;

interface Row { email?: string; phone?: string; days: number }

/** 따옴표 · 줄바꿈이 든 칸까지 읽는 작은 CSV 파서 */
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',' || c === '\t') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim())) out.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) out.push(row);
  return out;
}

function toRows(text: string, cutoff: string): { rows: Row[]; long: number; short: number } {
  const table = parseCsv(text.trim());
  if (table.length < 2) return { rows: [], long: 0, short: 0 };
  const head = table[0].map((h) => h.trim().toLowerCase());
  const col = (...keys: string[]) => head.findIndex((h) => keys.some((k) => h.includes(k)));
  const ei = col('이메일', 'email');
  const pi = col('휴대폰', '전화', 'phone');
  const ti = col('submitted', '제출', '신청일', 'created');
  const cut = Date.parse(`${cutoff}T23:59:59+09:00`);
  let long = 0;
  let short = 0;
  const rows = table.slice(1).map((r) => {
    const at = ti >= 0 ? Date.parse(String(r[ti] ?? '').trim().replace(' ', 'T')) : NaN;
    const days = Number.isFinite(cut) && Number.isFinite(at) && at > cut ? 30 : 90;
    if (days === 90) long++; else short++;
    return {
      email: ei >= 0 ? r[ei]?.trim() || undefined : undefined,
      phone: pi >= 0 ? r[pi]?.trim() || undefined : undefined,
      days,
    };
  }).filter((r) => r.email || r.phone);
  return { rows, long, short };
}

export default function WaitlistAdmin() {
  useThemeMode();
  const goBack = useSafeBack('/tabs/my');
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const [csv, setCsv] = useState('');
  const [cutoff, setCutoff] = useState('2026-10-31');
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => toRows(csv, cutoff), [csv, cutoff]);
  // iOS 혜택 코드(App Store 일회용 오퍼 코드)
  const [offer, setOffer] = useState<WaitlistOffer>('m3');
  const [codeText, setCodeText] = useState('');
  const codes = useMemo(() => parseOfferCodes(codeText), [codeText]);
  const [stats, setStats] = useState<Stats | null>(null);

  async function loadStats() {
    try {
      const call = httpsCallable(functions, 'subGrant', { timeout: 30_000 });
      const res = await call({ offerCodeStats: true });
      setStats(res.data as Stats);
    } catch (e) {
      showAlert('실패', (e as Error)?.message || '남은 코드를 불러오지 못했습니다.');
    }
  }

  async function uploadCodes() {
    if (!codes.length || busy) return;
    setBusy(true);
    try {
      const call = httpsCallable(functions, 'subGrant', { timeout: 60_000 });
      const res = await call({ offerCodes: { offer, codes } });
      const d = res.data as { added?: number; skipped?: number };
      showAlert('완료', `${OFFER_LABEL[offer]} 코드 ${d.added ?? 0}개 등록 · ${d.skipped ?? 0}개는 이미 있음`);
      setCodeText('');
      loadStats();
    } catch (e) {
      showAlert('실패', (e as Error)?.message || '등록하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    if (!parsed.rows.length || busy) return;
    setBusy(true);
    try {
      const call = httpsCallable(functions, 'subGrant', { timeout: 60_000 });
      const res = await call({ waitlist: parsed.rows });
      const d = res.data as { added?: number; skipped?: number };
      showAlert('완료', `${d.added ?? 0}명 등록 · ${d.skipped ?? 0}줄 건너뜀`);
      setCsv('');
    } catch (e) {
      showAlert('실패', (e as Error)?.message || '등록하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <TopBar title="대기자 명단" onBack={goBack} />
      {!isAdmin ? (
        <EmptyState text="관리자만 사용할 수 있어요." />
      ) : (
        <Body>
          <Text style={s.lead}>
            Tally 응답을 CSV 로 내려받아 그대로 붙여 넣으세요. 이메일 · 휴대폰 번호는 서버에 해시로만 저장됩니다.
            명단에 있는 사람은 결제 수단을 등록하면 무료 기간을 받고, 무료 기간이 끝나면 월 구독으로 자동 결제됩니다(그 전에 언제든 취소).
          </Text>
          <SectionLabel>기준일 (이날까지 신청 = 3개월 무료, 이후 = 1개월 무료)</SectionLabel>
          <TextInput style={s.input} value={cutoff} onChangeText={setCutoff} placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.placeholder} autoCapitalize="none" accessibilityLabel="기준일" />
          <SectionLabel>CSV</SectionLabel>
          <TextInput style={[s.input, s.area]} value={csv} onChangeText={setCsv} multiline
            placeholder={'Submitted at,이름,이메일,휴대폰 번호\n…'} placeholderTextColor={colors.placeholder}
            autoCapitalize="none" autoCorrect={false} accessibilityLabel="CSV 붙여 넣기" />
          <View style={s.sum}>
            <Text style={s.sumTxt}>
              {parsed.rows.length ? `${parsed.rows.length}명 · 3개월 ${parsed.long} · 1개월 ${parsed.short}` : '읽은 줄 없음'}
            </Text>
          </View>
          <PrimaryBtn label="명단 등록" loading={busy} disabled={!parsed.rows.length || busy} onPress={upload} />

          <View style={s.gap} />
          <SectionLabel>iOS 혜택 코드 (App Store 일회용 오퍼 코드)</SectionLabel>
          <Text style={s.lead}>
            App Store Connect 에서 &apos;무료 3개월&apos; · &apos;무료 1개월&apos; 오퍼 코드를 일회용으로 만들고, 내려받은 코드 목록을 혜택을 골라 붙여 넣으세요.
            아이폰에서 대기자가 &apos;무료 받기&apos;를 누르면 한 명에 하나씩 나갑니다. Android 는 Play Console 혜택이라 넣을 것이 없습니다.
          </Text>
          <View style={s.chips}>
            {(['m3', 'm1'] as const).map((k) => (
              <PressableScale key={k} haptic="select" onPress={() => setOffer(k)} style={[s.chip, offer === k && s.chipOn]}
                accessibilityRole="button" accessibilityState={{ selected: offer === k }}>
                <Text style={[s.chipTxt, offer === k && s.chipTxtOn]}>{OFFER_LABEL[k]} 무료</Text>
              </PressableScale>
            ))}
          </View>
          <TextInput style={[s.input, s.area]} value={codeText} onChangeText={setCodeText} multiline
            placeholder={'코드 목록 (한 줄에 하나, CSV 그대로도 됩니다)'} placeholderTextColor={colors.placeholder}
            autoCapitalize="characters" autoCorrect={false} accessibilityLabel="오퍼 코드 붙여 넣기" />
          <View style={s.sum}>
            <Text style={s.sumTxt}>{codes.length ? `${OFFER_LABEL[offer]} 무료 코드 ${codes.length}개` : '읽은 코드 없음'}</Text>
          </View>
          <PrimaryBtn label="코드 등록" loading={busy} disabled={!codes.length || busy} onPress={uploadCodes} />
          <PressableScale onPress={loadStats} hitSlop={8} accessibilityRole="button" style={s.statsBtn}>
            <Text style={s.statsLink}>남은 코드 보기</Text>
          </PressableScale>
          {stats ? (
            <Text style={s.statsTxt}>
              {`3개월 무료: 남음 ${stats.m3.free} · 나감 ${stats.m3.assigned}\n1개월 무료: 남음 ${stats.m1.free} · 나감 ${stats.m1.assigned}`}
            </Text>
          ) : null}
        </Body>
      )}
    </Screen>
  );
}

const s = themed(() => StyleSheet.create({
  lead: { fontSize: 13, color: colors.mid, lineHeight: 20, marginBottom: 12 },
  input: {
    backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line2, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.ink, marginBottom: 12,
  },
  area: { minHeight: 180, textAlignVertical: 'top', fontSize: 12 },
  sum: { paddingVertical: 8 },
  sumTxt: { fontSize: 13, color: colors.ink, fontWeight: '600' },
  gap: { height: 28 },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 1, borderColor: colors.line2 },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTxt: { fontSize: 13, fontWeight: '600', color: colors.mid },
  chipTxtOn: { color: colors.bg },
  statsBtn: { alignSelf: 'center', marginTop: 14 },
  statsLink: { fontSize: 13, color: colors.ink, fontWeight: '600', textDecorationLine: 'underline' },
  statsTxt: { fontSize: 13, color: colors.mid, lineHeight: 20, marginTop: 10, textAlign: 'center' },
}));
