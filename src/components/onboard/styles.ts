/** 온보딩 단계 화면 공용 스타일 — 예전 app/onboard.tsx 의 값 그대로 */
import { StyleSheet } from 'react-native';
import { colors, themed } from '../../theme';

export const o = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  progRow: { flexDirection: 'row', gap: 5, padding: 22, paddingBottom: 0 },
  progBar: { flex: 1, height: 3, borderRadius: 3, backgroundColor: colors.panel3 },
  progOn: { backgroundColor: colors.ink },
  scroll: { flex: 1 },
  scrollInner: { padding: 22, paddingBottom: 16 },
  foot: { flexDirection: 'row', gap: 10, padding: 18 },
  backBtn: {
    flex: 0, minWidth: 90, borderWidth: 1, borderColor: colors.line2,
    borderRadius: 10, paddingVertical: 15, alignItems: 'center',
  },
  backTxt: { color: colors.mid, fontSize: 14, fontWeight: '600' },
  nextBtn: { flex: 1, backgroundColor: colors.ink, borderRadius: 10, paddingVertical: 15, alignItems: 'center' },
  btnOff: { opacity: 0.35 },
  nextTxt: { color: colors.bg, fontSize: 15, fontWeight: '700' },

  stepNum: { fontSize: 11, fontWeight: '700', color: colors.muted, letterSpacing: 2, marginBottom: 10 },
  q: { fontSize: 23, fontWeight: '700', color: colors.ink, lineHeight: 32, marginBottom: 6 },
  desc: { fontSize: 13, color: colors.muted, marginBottom: 20, lineHeight: 20 },
  label: { fontSize: 12, color: colors.muted, marginTop: 16, marginBottom: 6 },
  input: {
    backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line2,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: colors.ink,
  },
  inputErr: { borderColor: colors.wrongLine },
  err: { fontSize: 12, color: colors.wrong, marginTop: 6, lineHeight: 17 },
  warn: { fontSize: 12, color: colors.pr, marginTop: 6, lineHeight: 17 },
  grid2: { flexDirection: 'row', gap: 9 },
  opt: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.line2,
    borderRadius: 10, padding: 15, marginBottom: 9, flex: 1,
  },
  optOn: { borderColor: colors.ink, backgroundColor: colors.panel2 },
  optTxt: { fontSize: 15, color: colors.mid },
  optTxtOn: { color: colors.ink, fontWeight: '600' },
  optSub: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  optDot: { fontSize: 14, color: colors.muted },
  optDotOn: { color: colors.ink },
  chipRow: { flexDirection: 'row', gap: 7, flexWrap: 'wrap', marginBottom: 4 },
  chip: { borderWidth: 1, borderColor: colors.line2, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTxt: { fontSize: 13, color: colors.mid },
  chipOnTxt: { color: colors.bg, fontWeight: '600' },
  textBtn: { alignItems: 'center', paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  textBtnTxt: { fontSize: 13.5, color: colors.mid, fontWeight: '600', textDecorationLine: 'underline' },
}));
