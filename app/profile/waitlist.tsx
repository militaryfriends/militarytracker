/**
 * 관리자 · 대기자 명단 가져오기 — Tally 에서 내려받은 CSV 를 붙여 넣는다.
 * 기준일 이전 신청자는 3개월(90일), 이후는 1개월(30일). 서버(subGrant)가 이메일 · 번호를 해시로만 저장한다.
 * 가입 이메일이 명단에 있으면 다음 접속 때 자동 지급, 번호만 낸 사람은 웹 구독 화면에 번호를 넣는다.
 */
import { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { colors, themed, useThemeMode } from '../../src/theme';
import { Screen, TopBar, Body, SectionLabel, PrimaryBtn, useSafeBack, EmptyState } from '../../src/components/ui';
import { functions } from '../../src/services/firebase';
import { useAuthStore } from '../../src/stores/authStore';
import { showAlert } from '../../src/utils/alert';

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
  const [cutoff, setCutoff] = useState('2026-10-25');
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => toRows(csv, cutoff), [csv, cutoff]);

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
      <TopBar title="대기자 명단" meta="ADMIN" onBack={goBack} />
      {!isAdmin ? (
        <EmptyState text="관리자만 사용할 수 있어요." />
      ) : (
        <Body>
          <Text style={s.lead}>
            Tally 응답을 CSV 로 내려받아 그대로 붙여 넣으세요. 이메일 · 휴대폰 번호는 서버에 해시로만 저장됩니다.
          </Text>
          <SectionLabel>기준일 (이날까지 신청 = 3개월, 이후 = 1개월)</SectionLabel>
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
}));
