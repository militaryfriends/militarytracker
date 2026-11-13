/**
 * 운동 종목 DB — 181종 (2026-11-01 숄더프레스 머신 추가 · 기본 종목 난이도 3→2: 바벨로우 · 풀업 · 바벨 스쿼트 · 데드리프트 · 가슴 딥스)
 * 가슴 30 · 등 30 · 하체 30 · 어깨 30 · 이두 15 · 삼두 15 · 복근 30
 *
 * 필드
 *  id   : 미디어 파일명과 1:1로 매칭되는 키 (assets/exercise/{id}.mp4 / .png)
 *  n    : 한글 종목명
 *  part : 대분류 부위
 *  g    : 세부 타겟
 *  eq   : 필요 장비 (bw 맨몸 / bb 바벨 / db 덤벨 / mc 머신 / cb 케이블 / sm 스미스 / band 밴드 / plate 원판)
 *  pl   : 수행 가능 장소
 *  s    : 권장 세트
 *  r    : 권장 반복
 *  rest : 권장 세트간 휴식(초)
 *  lv   : 난이도 1 입문 / 2 중급 / 3 상급
 *  ppl  : 푸시·풀·레그·코어 분류 (루틴 자동 구성에 사용)
 */

export type Part = 'chest' | 'back' | 'legs' | 'shoulders' | 'biceps' | 'triceps' | 'abs';
export type Equip = 'bw' | 'bb' | 'db' | 'mc' | 'cb' | 'sm' | 'band' | 'plate';
export type Place = 'gym' | 'home';
export type PPL = 'push' | 'pull' | 'legs' | 'core';

export interface Exercise {
  id: string;
  n: string;
  part: Part;
  g: string;
  eq: Equip[];
  pl: Place[];
  s: number;
  r: string;
  rest: number;
  lv: 1 | 2 | 3;
  ppl: PPL;
}

export const PART_LABEL: Record<Part, string> = {
  chest: '가슴',
  back: '등',
  legs: '하체',
  shoulders: '어깨',
  biceps: '이두',
  triceps: '삼두',
  abs: '복근',
};

export const PART_ORDER: Part[] = ['chest', 'back', 'legs', 'shoulders', 'biceps', 'triceps', 'abs'];

export const EQUIP_LABEL: Record<Equip, string> = {
  bw: '맨몸',
  bb: '바벨',
  db: '덤벨',
  mc: '머신',
  cb: '케이블',
  sm: '스미스',
  band: '밴드',
  plate: '원판',
};

export const LEVEL_LABEL: Record<1 | 2 | 3, string> = { 1: '입문', 2: '중급', 3: '상급' };

export const PPL_LABEL: Record<PPL, string> = { push: '푸시', pull: '풀', legs: '레그', core: '코어' };

export const EX: Exercise[] = [
  // ─── 가슴 (30) ────────────────────────────────────────────────────────────
  { id: 'pushup',          n: '푸시업',                part: 'chest', g: '가슴 중부', eq: ['bw'],        pl: ['gym', 'home'], s: 3, r: '12-20', rest: 60, lv: 1, ppl: 'push' },
  { id: 'widepushup',      n: '와이드 푸시업',          part: 'chest', g: '가슴 외측', eq: ['bw'],        pl: ['gym', 'home'], s: 3, r: '12-20', rest: 60, lv: 1, ppl: 'push' },
  { id: 'diamondpushup',   n: '다이아몬드 푸시업',      part: 'chest', g: '가슴 내측', eq: ['bw'],        pl: ['gym', 'home'], s: 3, r: '10-15', rest: 60, lv: 2, ppl: 'push' },
  { id: 'declinepushup',   n: '디클라인 푸시업',        part: 'chest', g: '가슴 상부', eq: ['bw'],        pl: ['gym', 'home'], s: 3, r: '10-15', rest: 60, lv: 2, ppl: 'push' },
  { id: 'inclinepushup',   n: '인클라인 푸시업',        part: 'chest', g: '가슴 하부', eq: ['bw'],        pl: ['gym', 'home'], s: 3, r: '15-20', rest: 75, lv: 1, ppl: 'push' },
  { id: 'bench',           n: '벤치프레스',            part: 'chest', g: '가슴 중부', eq: ['bb'],        pl: ['gym'],         s: 4, r: '6-10',  rest: 120, lv: 2, ppl: 'push' },
  { id: 'inclinebench',    n: '인클라인 벤치프레스',    part: 'chest', g: '가슴 상부', eq: ['bb'],        pl: ['gym'],         s: 4, r: '8-10',  rest: 120, lv: 2, ppl: 'push' },
  { id: 'declinebench',    n: '디클라인 벤치프레스',    part: 'chest', g: '가슴 하부', eq: ['bb'],        pl: ['gym'],         s: 3, r: '8-12',  rest: 90, lv: 2, ppl: 'push' },
  { id: 'dbbench',         n: '덤벨 벤치프레스',        part: 'chest', g: '가슴 중부', eq: ['db'],        pl: ['gym', 'home'], s: 4, r: '8-12',  rest: 90, lv: 1, ppl: 'push' },
  { id: 'incdbpress',      n: '인클라인 덤벨 프레스',   part: 'chest', g: '가슴 상부', eq: ['db'],        pl: ['gym', 'home'], s: 4, r: '8-12',  rest: 90, lv: 1, ppl: 'push' },
  { id: 'decdbpress',      n: '디클라인 덤벨 프레스',   part: 'chest', g: '가슴 하부', eq: ['db'],        pl: ['gym'],         s: 3, r: '10-12', rest: 75, lv: 2, ppl: 'push' },
  { id: 'dbfly',           n: '덤벨 플라이',            part: 'chest', g: '가슴 외측', eq: ['db'],        pl: ['gym', 'home'], s: 3, r: '12-15', rest: 60, lv: 1, ppl: 'push' },
  { id: 'incdbfly',        n: '인클라인 덤벨 플라이',   part: 'chest', g: '가슴 상부', eq: ['db'],        pl: ['gym', 'home'], s: 3, r: '12-15', rest: 60, lv: 2, ppl: 'push' },
  { id: 'crossover',       n: '케이블 크로스오버',      part: 'chest', g: '가슴 내측', eq: ['cb'],        pl: ['gym'],         s: 3, r: '12-15', rest: 60, lv: 1, ppl: 'push' },
  { id: 'lowcablefly',     n: '로우 케이블 플라이',     part: 'chest', g: '가슴 상부', eq: ['cb'],        pl: ['gym'],         s: 3, r: '12-15', rest: 60, lv: 1, ppl: 'push' },
  { id: 'highcablefly',    n: '하이 케이블 플라이',     part: 'chest', g: '가슴 하부', eq: ['cb'],        pl: ['gym'],         s: 3, r: '12-15', rest: 60, lv: 1, ppl: 'push' },
  { id: 'pecdeck',         n: '펙덱 플라이',            part: 'chest', g: '가슴 내측', eq: ['mc'],        pl: ['gym'],         s: 3, r: '12-15', rest: 60, lv: 1, ppl: 'push' },
  { id: 'chestpressmc',    n: '체스트프레스 머신',      part: 'chest', g: '가슴 중부', eq: ['mc'],        pl: ['gym'],         s: 3, r: '10-12', rest: 75, lv: 1, ppl: 'push' },
  { id: 'dipschest',       n: '딥스 (가슴)',            part: 'chest', g: '가슴 하부', eq: ['bw'],        pl: ['gym'],         s: 3, r: '8-12',  rest: 90, lv: 2, ppl: 'push' },
  { id: 'smithbench',      n: '스미스머신 벤치프레스',  part: 'chest', g: '가슴 중부', eq: ['sm'],        pl: ['gym'],         s: 4, r: '8-12',  rest: 90, lv: 1, ppl: 'push' },
  { id: 'svend',           n: '스벤드 프레스',          part: 'chest', g: '가슴 내측', eq: ['plate'],        pl: ['gym', 'home'], s: 3, r: '15-20', rest: 75, lv: 1, ppl: 'push' },
  { id: 'floorpress',      n: '플로어 프레스',          part: 'chest', g: '가슴 중부', eq: ['bb', 'db'],  pl: ['gym', 'home'], s: 3, r: '8-12',  rest: 90, lv: 2, ppl: 'push' },
  { id: 'pikepushup',      n: '파이크 푸시업',          part: 'chest', g: '가슴 상부', eq: ['bw'],        pl: ['gym', 'home'], s: 3, r: '10-15', rest: 60, lv: 2, ppl: 'push' },
  { id: 'archerpushup',    n: '아처 푸시업',            part: 'chest', g: '가슴 외측', eq: ['bw'],        pl: ['gym', 'home'], s: 3, r: '6-10',  rest: 75, lv: 3, ppl: 'push' },
  { id: 'plyopushup',      n: '플라이오 푸시업',        part: 'chest', g: '가슴 파워', eq: ['bw'],        pl: ['gym', 'home'], s: 3, r: '6-10',  rest: 90, lv: 3, ppl: 'push' },
  { id: 'spiderpushup',    n: '스파이더맨 푸시업',      part: 'chest', g: '가슴·코어', eq: ['bw'],        pl: ['gym', 'home'], s: 3, r: '10-14', rest: 60, lv: 2, ppl: 'push' },
  { id: 'hindupushup',     n: '힌두 푸시업',            part: 'chest', g: '가슴·어깨', eq: ['bw'],        pl: ['gym', 'home'], s: 3, r: '8-12',  rest: 60, lv: 2, ppl: 'push' },
  { id: 'revbench',        n: '리버스그립 벤치프레스',  part: 'chest', g: '가슴 상부', eq: ['bb'],        pl: ['gym'],         s: 3, r: '8-12',  rest: 90, lv: 3, ppl: 'push' },
  { id: 'squeezepress',    n: '스퀴즈 프레스',          part: 'chest', g: '가슴 내측', eq: ['db'],        pl: ['gym', 'home'], s: 3, r: '12-15', rest: 60, lv: 1, ppl: 'push' },
  { id: 'guillotine',      n: '길로틴 프레스',          part: 'chest', g: '가슴 상부', eq: ['bb'],        pl: ['gym'],         s: 3, r: '10-12', rest: 90, lv: 3, ppl: 'push' },

  // ─── 등 (30) ──────────────────────────────────────────────────────────────
  { id: 'pullup',            n: '풀업',                  part: 'back', g: '광배',      eq: ['bw'],        pl: ['gym', 'home'], s: 4, r: '5-10',  rest: 120, lv: 2, ppl: 'pull' },
  { id: 'chinup',            n: '친업',                  part: 'back', g: '광배·이두', eq: ['bw'],        pl: ['gym', 'home'], s: 4, r: '6-10',  rest: 120, lv: 2, ppl: 'pull' },
  { id: 'latpull',           n: '랫풀다운',              part: 'back', g: '광배',      eq: ['cb', 'mc'],  pl: ['gym'],         s: 4, r: '10-12', rest: 90, lv: 1, ppl: 'pull' },
  { id: 'widelatpull',       n: '와이드그립 랫풀다운',   part: 'back', g: '광배 상부', eq: ['cb', 'mc'],  pl: ['gym'],         s: 3, r: '10-12', rest: 90, lv: 1, ppl: 'pull' },
  { id: 'closelatpull',      n: '클로즈그립 랫풀다운',   part: 'back', g: '광배 하부', eq: ['cb', 'mc'],  pl: ['gym'],         s: 3, r: '10-12', rest: 90, lv: 1, ppl: 'pull' },
  { id: 'revlatpull',        n: '리버스그립 랫풀다운',   part: 'back', g: '광배·이두', eq: ['cb', 'mc'],  pl: ['gym'],         s: 3, r: '10-12', rest: 90, lv: 1, ppl: 'pull' },
  { id: 'deadlift',          n: '데드리프트',            part: 'back', g: '후면사슬',  eq: ['bb'],        pl: ['gym'],         s: 4, r: '3-6',   rest: 180, lv: 2, ppl: 'pull' },
  { id: 'rdl',               n: '루마니안 데드리프트',   part: 'back', g: '후면사슬',  eq: ['bb', 'db'],  pl: ['gym', 'home'], s: 3, r: '8-12',  rest: 120, lv: 2, ppl: 'pull' },
  { id: 'bbrow',             n: '바벨로우',              part: 'back', g: '등 두께',   eq: ['bb'],        pl: ['gym'],         s: 4, r: '8-10',  rest: 120, lv: 2, ppl: 'pull' },
  { id: 'pendlay',           n: '펜들레이로우',          part: 'back', g: '등 두께',   eq: ['bb'],        pl: ['gym'],         s: 4, r: '5-8',   rest: 120, lv: 3, ppl: 'pull' },
  { id: 'dbrow',             n: '덤벨로우',              part: 'back', g: '등 두께',   eq: ['db'],        pl: ['gym', 'home'], s: 3, r: '10-12', rest: 90, lv: 1, ppl: 'pull' },
  { id: 'onearmdbrow',       n: '원암 덤벨로우',         part: 'back', g: '광배',      eq: ['db'],        pl: ['gym', 'home'], s: 3, r: '10-12', rest: 75, lv: 1, ppl: 'pull' },
  { id: 'cablerow',          n: '시티드 케이블로우',     part: 'back', g: '등 중부',   eq: ['cb'],        pl: ['gym'],         s: 4, r: '10-12', rest: 90, lv: 1, ppl: 'pull' },
  { id: 'tbarrow',           n: 'T바로우',               part: 'back', g: '등 두께',   eq: ['bb', 'mc'],  pl: ['gym'],         s: 3, r: '8-12',  rest: 90, lv: 2, ppl: 'pull' },
  { id: 'chestsupportedrow', n: '체스트서포티드 로우',   part: 'back', g: '등 중부',   eq: ['db', 'mc'],  pl: ['gym'],         s: 3, r: '10-12', rest: 90, lv: 1, ppl: 'pull' },
  { id: 'invertedrow',       n: '인버티드 로우',         part: 'back', g: '등 중부',   eq: ['bw'],        pl: ['gym', 'home'], s: 3, r: '10-15', rest: 75, lv: 1, ppl: 'pull' },
  { id: 'facepull',          n: '페이스풀',              part: 'back', g: '후면삼각·승모', eq: ['cb', 'band'], pl: ['gym', 'home'], s: 3, r: '15-20', rest: 75, lv: 1, ppl: 'pull' },
  { id: 'straightarmpull',   n: '스트레이트암 풀다운',   part: 'back', g: '광배',      eq: ['cb'],        pl: ['gym'],         s: 3, r: '12-15', rest: 60, lv: 1, ppl: 'pull' },
  { id: 'cablepullover',     n: '케이블 풀오버',         part: 'back', g: '광배',      eq: ['cb'],        pl: ['gym'],         s: 3, r: '12-15', rest: 60, lv: 2, ppl: 'pull' },
  { id: 'backext',           n: '백익스텐션',            part: 'back', g: '척추기립근', eq: ['bw', 'mc'],  pl: ['gym', 'home'], s: 3, r: '12-15', rest: 60, lv: 1, ppl: 'pull' },
  { id: 'shrug',             n: '슈러그',                part: 'back', g: '승모근',    eq: ['db'],        pl: ['gym', 'home'], s: 3, r: '12-15', rest: 60, lv: 1, ppl: 'pull' },
  { id: 'bbshrug',           n: '바벨 슈러그',           part: 'back', g: '승모근',    eq: ['bb'],        pl: ['gym'],         s: 3, r: '10-15', rest: 75, lv: 1, ppl: 'pull' },
  { id: 'negativepullup',    n: '네거티브 풀업',         part: 'back', g: '광배',      eq: ['bw'],        pl: ['gym', 'home'], s: 3, r: '5-8',   rest: 90, lv: 2, ppl: 'pull' },
  { id: 'landminerow',       n: '랜드마인 로우',         part: 'back', g: '등 두께',   eq: ['bb'],        pl: ['gym'],         s: 3, r: '10-12', rest: 90, lv: 2, ppl: 'pull' },
  { id: 'seatedshrug',       n: '시티드 슈러그',         part: 'back', g: '승모근',    eq: ['db'],        pl: ['gym', 'home'], s: 3, r: '12-15', rest: 60, lv: 1, ppl: 'pull' },
  { id: 'reversefly',        n: '리버스 플라이',         part: 'back', g: '후면삼각',  eq: ['db', 'mc'],  pl: ['gym', 'home'], s: 3, r: '12-15', rest: 60, lv: 1, ppl: 'pull' },
  { id: 'bandedpulldown',    n: '밴디드 풀다운',         part: 'back', g: '광배',      eq: ['band'],      pl: ['gym', 'home'], s: 3, r: '15-20', rest: 75, lv: 1, ppl: 'pull' },
  { id: 'rackpull',          n: '랙풀',                  part: 'back', g: '등 두께',   eq: ['bb'],        pl: ['gym'],         s: 3, r: '5-8',   rest: 150, lv: 3, ppl: 'pull' },
  { id: 'goodmorning',       n: '굿모닝',                part: 'back', g: '척추기립근', eq: ['bb'],        pl: ['gym'],         s: 3, r: '10-12', rest: 90, lv: 3, ppl: 'pull' },

  // ─── 하체 (30) ────────────────────────────────────────────────────────────
  { id: 'bwsquat',       n: '맨몸 스쿼트',              part: 'legs', g: '대퇴사두',  eq: ['bw'],       pl: ['gym', 'home'], s: 3, r: '15-20', rest: 75, lv: 1, ppl: 'legs' },
  { id: 'backsquat',     n: '바벨 스쿼트',              part: 'legs', g: '대퇴사두',  eq: ['bb'],       pl: ['gym'],         s: 4, r: '6-10',  rest: 150, lv: 2, ppl: 'legs' },
  { id: 'frontsquat',    n: '프론트 스쿼트',            part: 'legs', g: '대퇴사두',  eq: ['bb'],       pl: ['gym'],         s: 3, r: '6-10',  rest: 150, lv: 3, ppl: 'legs' },
  { id: 'sumosquat',     n: '스모 스쿼트',              part: 'legs', g: '내전근·둔근', eq: ['bw', 'db'], pl: ['gym', 'home'], s: 3, r: '12-15', rest: 60, lv: 1, ppl: 'legs' },
  { id: 'bulgarian',     n: '불가리안 스플릿 스쿼트',   part: 'legs', g: '대퇴사두·둔근', eq: ['bw', 'db'], pl: ['gym', 'home'], s: 3, r: '8-12',  rest: 90, lv: 2, ppl: 'legs' },
  { id: 'dbsquat',       n: '덤벨 스쿼트',              part: 'legs', g: '대퇴사두',  eq: ['db'],       pl: ['gym', 'home'], s: 3, r: '10-15', rest: 75, lv: 1, ppl: 'legs' },
  { id: 'legpress',      n: '레그프레스',               part: 'legs', g: '대퇴사두',  eq: ['mc'],       pl: ['gym'],         s: 4, r: '10-12', rest: 120, lv: 1, ppl: 'legs' },
  { id: 'legext',        n: '레그익스텐션',             part: 'legs', g: '대퇴사두',  eq: ['mc'],       pl: ['gym'],         s: 3, r: '12-15', rest: 60, lv: 1, ppl: 'legs' },
  { id: 'legcurl',       n: '레그컬',                   part: 'legs', g: '햄스트링',  eq: ['mc'],       pl: ['gym'],         s: 3, r: '12-15', rest: 60, lv: 1, ppl: 'legs' },
  { id: 'lyinglegcurl',  n: '라잉 레그컬',              part: 'legs', g: '햄스트링',  eq: ['mc'],       pl: ['gym'],         s: 3, r: '12-15', rest: 60, lv: 1, ppl: 'legs' },
  { id: 'seatedlegcurl', n: '시티드 레그컬',            part: 'legs', g: '햄스트링',  eq: ['mc'],       pl: ['gym'],         s: 3, r: '12-15', rest: 60, lv: 1, ppl: 'legs' },
  { id: 'rdlleg',        n: '루마니안 데드리프트 (하체)', part: 'legs', g: '햄스트링·둔근', eq: ['bb', 'db'], pl: ['gym', 'home'], s: 3, r: '8-12',  rest: 120, lv: 2, ppl: 'legs' },
  { id: 'lunge',         n: '런지',                     part: 'legs', g: '대퇴사두·둔근', eq: ['bw', 'db'], pl: ['gym', 'home'], s: 3, r: '10-12', rest: 75, lv: 1, ppl: 'legs' },
  { id: 'walkinglunge',  n: '워킹런지',                 part: 'legs', g: '대퇴사두·둔근', eq: ['bw', 'db'], pl: ['gym', 'home'], s: 3, r: '12-16', rest: 90, lv: 2, ppl: 'legs' },
  { id: 'reverselunge',  n: '리버스런지',               part: 'legs', g: '둔근',      eq: ['bw', 'db'], pl: ['gym', 'home'], s: 3, r: '10-12', rest: 75, lv: 1, ppl: 'legs' },
  { id: 'sidelunge',     n: '사이드런지',               part: 'legs', g: '내전근',    eq: ['bw', 'db'], pl: ['gym', 'home'], s: 3, r: '10-12', rest: 60, lv: 1, ppl: 'legs' },
  { id: 'stepup',        n: '스텝업',                   part: 'legs', g: '둔근',      eq: ['bw', 'db'], pl: ['gym', 'home'], s: 3, r: '10-12', rest: 75, lv: 1, ppl: 'legs' },
  { id: 'hipthrust',     n: '힙쓰러스트',               part: 'legs', g: '둔근',      eq: ['bb', 'db'], pl: ['gym', 'home'], s: 4, r: '10-12', rest: 90, lv: 2, ppl: 'legs' },
  { id: 'glutebridge',   n: '글루트 브릿지',            part: 'legs', g: '둔근',      eq: ['bw', 'bb'],       pl: ['gym', 'home'], s: 3, r: '15-20', rest: 75, lv: 1, ppl: 'legs' },
  { id: 'calfraise',     n: '카프레이즈',               part: 'legs', g: '종아리',    eq: ['bw', 'db'], pl: ['gym', 'home'], s: 4, r: '15-20', rest: 75, lv: 1, ppl: 'legs' },
  { id: 'seatedcalf',    n: '시티드 카프레이즈',        part: 'legs', g: '종아리',    eq: ['mc'],       pl: ['gym'],         s: 3, r: '15-20', rest: 75, lv: 1, ppl: 'legs' },
  { id: 'hacksquat',     n: '핵스쿼트',                 part: 'legs', g: '대퇴사두',  eq: ['mc'],       pl: ['gym'],         s: 3, r: '10-12', rest: 120, lv: 2, ppl: 'legs' },
  { id: 'smithsquat',    n: '스미스머신 스쿼트',        part: 'legs', g: '대퇴사두',  eq: ['sm'],       pl: ['gym'],         s: 4, r: '10-12', rest: 120, lv: 1, ppl: 'legs' },
  { id: 'sldl',          n: '싱글레그 데드리프트',      part: 'legs', g: '햄스트링·밸런스', eq: ['bw', 'db'], pl: ['gym', 'home'], s: 3, r: '8-12',  rest: 75, lv: 2, ppl: 'legs' },
  { id: 'glutekickback', n: '글루트 킥백',              part: 'legs', g: '둔근',      eq: ['cb', 'band'], pl: ['gym', 'home'], s: 3, r: '12-15', rest: 75, lv: 1, ppl: 'legs' },
  { id: 'hipabduction',  n: '힙 어브덕션',              part: 'legs', g: '중둔근',    eq: ['mc', 'band'], pl: ['gym', 'home'], s: 3, r: '15-20', rest: 75, lv: 1, ppl: 'legs' },
  { id: 'jumpsquat',     n: '점프스쿼트',               part: 'legs', g: '하체 파워',  eq: ['bw'],       pl: ['gym', 'home'], s: 3, r: '10-15', rest: 75, lv: 2, ppl: 'legs' },
  { id: 'wallsit',       n: '월싯',                     part: 'legs', g: '대퇴사두',  eq: ['bw'],       pl: ['gym', 'home'], s: 3, r: '30-60초', rest: 60, lv: 1, ppl: 'legs' },
  { id: 'boxsquat',      n: '박스스쿼트',               part: 'legs', g: '둔근·대퇴사두', eq: ['bb', 'bw'], pl: ['gym', 'home'], s: 3, r: '8-12',  rest: 120, lv: 2, ppl: 'legs' },
  { id: 'goblet',        n: '고블릿 스쿼트',            part: 'legs', g: '대퇴사두',  eq: ['db'],       pl: ['gym', 'home'], s: 3, r: '10-15', rest: 75, lv: 1, ppl: 'legs' },

  // ─── 어깨 (30) ────────────────────────────────────────────────────────────
  { id: 'ohp',                n: '오버헤드 프레스',        part: 'shoulders', g: '전면삼각', eq: ['bb'],         pl: ['gym'],         s: 4, r: '6-10',  rest: 120, lv: 2, ppl: 'push' },
  { id: 'dbshoulderpress',    n: '덤벨 숄더프레스',        part: 'shoulders', g: '전면·측면', eq: ['db'],        pl: ['gym', 'home'], s: 4, r: '8-12',  rest: 90, lv: 1, ppl: 'push' },
  { id: 'seateddbpress',      n: '시티드 덤벨프레스',      part: 'shoulders', g: '전면·측면', eq: ['db'],        pl: ['gym', 'home'], s: 3, r: '8-12',  rest: 90, lv: 1, ppl: 'push' },
  { id: 'arnold',             n: '아놀드 프레스',          part: 'shoulders', g: '삼각근 전체', eq: ['db'],      pl: ['gym', 'home'], s: 3, r: '10-12', rest: 75, lv: 2, ppl: 'push' },
  { id: 'militarypress',      n: '밀리터리 프레스',        part: 'shoulders', g: '전면삼각', eq: ['bb'],         pl: ['gym'],         s: 4, r: '5-8',   rest: 150, lv: 3, ppl: 'push' },
  { id: 'pushpress',          n: '푸시프레스',             part: 'shoulders', g: '삼각근 파워', eq: ['bb'],      pl: ['gym'],         s: 3, r: '3-6',   rest: 150, lv: 3, ppl: 'push' },
  { id: 'latraise',           n: '사이드 레터럴레이즈',    part: 'shoulders', g: '측면삼각', eq: ['db'],         pl: ['gym', 'home'], s: 4, r: '12-15', rest: 75, lv: 1, ppl: 'push' },
  { id: 'frontraise',         n: '프론트레이즈',           part: 'shoulders', g: '전면삼각', eq: ['db'],         pl: ['gym', 'home'], s: 3, r: '12-15', rest: 75, lv: 1, ppl: 'push' },
  { id: 'bentoverraise',      n: '벤트오버 레터럴레이즈',  part: 'shoulders', g: '후면삼각', eq: ['db'],         pl: ['gym', 'home'], s: 3, r: '12-15', rest: 75, lv: 1, ppl: 'push' },
  { id: 'cablelatraise',      n: '케이블 사이드레터럴',    part: 'shoulders', g: '측면삼각', eq: ['cb'],         pl: ['gym'],         s: 3, r: '12-15', rest: 75, lv: 1, ppl: 'push' },
  { id: 'reardeltfly',        n: '리어델트 플라이',        part: 'shoulders', g: '후면삼각', eq: ['mc', 'db'],   pl: ['gym', 'home'], s: 3, r: '12-15', rest: 75, lv: 1, ppl: 'push' },
  { id: 'cablereardelt',      n: '케이블 리어델트 플라이', part: 'shoulders', g: '후면삼각', eq: ['cb'],         pl: ['gym'],         s: 3, r: '12-15', rest: 75, lv: 2, ppl: 'push' },
  { id: 'uprow',              n: '업라이트로우',           part: 'shoulders', g: '측면삼각·승모', eq: ['bb', 'db'], pl: ['gym', 'home'], s: 3, r: '10-12', rest: 60, lv: 2, ppl: 'push' },
  { id: 'facepullsh',         n: '페이스풀 (어깨)',        part: 'shoulders', g: '후면삼각', eq: ['cb', 'band'], pl: ['gym', 'home'], s: 3, r: '15-20', rest: 75, lv: 1, ppl: 'push' },
  { id: 'smithshoulderpress', n: '스미스머신 숄더프레스',  part: 'shoulders', g: '전면삼각', eq: ['sm'],         pl: ['gym'],         s: 3, r: '8-12',  rest: 90, lv: 1, ppl: 'push' },
  { id: 'shoulderpressmc', n: '숄더프레스 머신',        part: 'shoulders', g: '전면삼각', eq: ['mc'],         pl: ['gym'],         s: 3, r: '8-12',  rest: 90, lv: 1, ppl: 'push' },
  { id: 'landminepress',      n: '랜드마인 프레스',        part: 'shoulders', g: '전면삼각', eq: ['bb'],         pl: ['gym'],         s: 3, r: '10-12', rest: 75, lv: 2, ppl: 'push' },
  { id: 'platefrontraise',    n: '플레이트 프론트레이즈',  part: 'shoulders', g: '전면삼각', eq: ['plate'],         pl: ['gym'],         s: 3, r: '12-15', rest: 75, lv: 1, ppl: 'push' },
  { id: 'sixwayraise',        n: '6웨이 레이즈',           part: 'shoulders', g: '삼각근 전체', eq: ['db'],      pl: ['gym', 'home'], s: 3, r: '8-10',  rest: 60, lv: 2, ppl: 'push' },
  { id: 'cubanrotation',      n: '쿠반 로테이션',          part: 'shoulders', g: '회전근개', eq: ['db'],         pl: ['gym', 'home'], s: 3, r: '12-15', rest: 75, lv: 2, ppl: 'push' },
  { id: 'onearmlatraise',     n: '원암 레터럴레이즈',      part: 'shoulders', g: '측면삼각', eq: ['db'],         pl: ['gym', 'home'], s: 3, r: '12-15', rest: 75, lv: 1, ppl: 'push' },
  { id: 'leaninglatraise',    n: '리닝 레터럴레이즈',      part: 'shoulders', g: '측면삼각', eq: ['db'],         pl: ['gym', 'home'], s: 3, r: '12-15', rest: 75, lv: 2, ppl: 'push' },
  { id: 'zpress',             n: 'Z프레스',                part: 'shoulders', g: '전면삼각·코어', eq: ['bb', 'db'], pl: ['gym', 'home'], s: 3, r: '8-10',  rest: 90, lv: 3, ppl: 'push' },
  { id: 'bradford',           n: '브래드포드 프레스',      part: 'shoulders', g: '삼각근 전체', eq: ['bb'],      pl: ['gym'],         s: 3, r: '10-12', rest: 75, lv: 3, ppl: 'push' },
  { id: 'handstandhold',      n: '핸드스탠드 홀드',        part: 'shoulders', g: '삼각근 안정화', eq: ['bw'],    pl: ['gym', 'home'], s: 3, r: '20-45초', rest: 90, lv: 3, ppl: 'push' },
  { id: 'pikepushupsh',       n: '파이크 푸시업 (어깨)',   part: 'shoulders', g: '전면삼각', eq: ['bw'],         pl: ['gym', 'home'], s: 3, r: '10-15', rest: 60, lv: 2, ppl: 'push' },
  { id: 'bandedlatraise',     n: '밴디드 레터럴레이즈',    part: 'shoulders', g: '측면삼각', eq: ['band'],       pl: ['gym', 'home'], s: 3, r: '15-20', rest: 75, lv: 1, ppl: 'push' },
  { id: 'inclinereardelt',    n: '인클라인 리어델트 레이즈', part: 'shoulders', g: '후면삼각', eq: ['db'],       pl: ['gym', 'home'], s: 3, r: '12-15', rest: 75, lv: 2, ppl: 'push' },
  { id: 'cablefrontraise',    n: '케이블 프론트레이즈',    part: 'shoulders', g: '전면삼각', eq: ['cb'],         pl: ['gym'],         s: 3, r: '12-15', rest: 75, lv: 1, ppl: 'push' },
  { id: 'behindneckpress',    n: '비하인드넥 프레스',      part: 'shoulders', g: '측면삼각', eq: ['bb'],         pl: ['gym'],         s: 3, r: '8-12',  rest: 90, lv: 3, ppl: 'push' },
  { id: 'scaption',           n: '스캡션 레이즈',          part: 'shoulders', g: '전면·측면', eq: ['db'],        pl: ['gym', 'home'], s: 3, r: '12-15', rest: 75, lv: 1, ppl: 'push' },

  // ─── 이두 (15) ────────────────────────────────────────────────────────────
  { id: 'bbcurl',            n: '바벨컬',            part: 'biceps', g: '이두 전체', eq: ['bb'],        pl: ['gym'],         s: 3, r: '8-12',  rest: 75, lv: 1, ppl: 'pull' },
  { id: 'dbcurl',            n: '덤벨컬',            part: 'biceps', g: '이두 전체', eq: ['db'],        pl: ['gym', 'home'], s: 3, r: '10-12', rest: 60, lv: 1, ppl: 'pull' },
  { id: 'hammercurl',        n: '해머컬',            part: 'biceps', g: '상완근',    eq: ['db'],        pl: ['gym', 'home'], s: 3, r: '10-12', rest: 60, lv: 1, ppl: 'pull' },
  { id: 'preachercurl',      n: '프리처컬',          part: 'biceps', g: '이두 단두',  eq: ['bb', 'db'],  pl: ['gym'],         s: 3, r: '10-12', rest: 60, lv: 2, ppl: 'pull' },
  { id: 'concentrationcurl', n: '컨센트레이션컬',    part: 'biceps', g: '이두 피크',  eq: ['db'],        pl: ['gym', 'home'], s: 3, r: '10-12', rest: 60, lv: 1, ppl: 'pull' },
  { id: 'cablecurl',         n: '케이블컬',          part: 'biceps', g: '이두 전체', eq: ['cb'],        pl: ['gym'],         s: 3, r: '12-15', rest: 60, lv: 1, ppl: 'pull' },
  { id: 'incdbcurl',         n: '인클라인 덤벨컬',   part: 'biceps', g: '이두 장두',  eq: ['db'],        pl: ['gym', 'home'], s: 3, r: '10-12', rest: 60, lv: 2, ppl: 'pull' },
  { id: 'spidercurl',        n: '스파이더컬',        part: 'biceps', g: '이두 단두',  eq: ['db', 'bb'],  pl: ['gym'],         s: 3, r: '10-12', rest: 60, lv: 2, ppl: 'pull' },
  { id: 'cablehammer',       n: '케이블 해머컬',     part: 'biceps', g: '상완근',    eq: ['cb'],        pl: ['gym'],         s: 3, r: '12-15', rest: 60, lv: 1, ppl: 'pull' },
  { id: 'reversecurl',       n: '리버스컬',          part: 'biceps', g: '전완',      eq: ['bb', 'db'],  pl: ['gym', 'home'], s: 3, r: '12-15', rest: 60, lv: 1, ppl: 'pull' },
  { id: 'onearmcablecurl',   n: '원암 케이블컬',     part: 'biceps', g: '이두 피크',  eq: ['cb'],        pl: ['gym'],         s: 3, r: '12-15', rest: 75, lv: 1, ppl: 'pull' },

  // ─── 삼두 (15) ────────────────────────────────────────────────────────────
  { id: 'pushdown',          n: '케이블 푸시다운',            part: 'triceps', g: '삼두 외측', eq: ['cb'],        pl: ['gym'],         s: 3, r: '10-12', rest: 60, lv: 1, ppl: 'push' },
  { id: 'ropepushdown',      n: '로프 푸시다운',              part: 'triceps', g: '삼두 외측', eq: ['cb'],        pl: ['gym'],         s: 3, r: '12-15', rest: 60, lv: 1, ppl: 'push' },
  { id: 'ohext',             n: '오버헤드 트라이셉스 익스텐션', part: 'triceps', g: '삼두 장두', eq: ['db'],      pl: ['gym', 'home'], s: 3, r: '10-12', rest: 60, lv: 1, ppl: 'push' },
  { id: 'lyingext',          n: '라잉 트라이셉스 익스텐션',   part: 'triceps', g: '삼두 장두', eq: ['bb', 'db'],  pl: ['gym', 'home'], s: 3, r: '10-12', rest: 60, lv: 2, ppl: 'push' },
  { id: 'dipstri',           n: '딥스 (삼두)',                part: 'triceps', g: '삼두 전체', eq: ['bw'],        pl: ['gym'],         s: 3, r: '8-12',  rest: 90, lv: 3, ppl: 'push' },
  { id: 'closegripbench',    n: '클로즈그립 벤치프레스',      part: 'triceps', g: '삼두 내측', eq: ['bb'],        pl: ['gym'],         s: 3, r: '8-10',  rest: 90, lv: 2, ppl: 'push' },
  { id: 'kickback',          n: '트라이셉스 킥백',            part: 'triceps', g: '삼두 외측', eq: ['db'],        pl: ['gym', 'home'], s: 3, r: '12-15', rest: 75, lv: 1, ppl: 'push' },
  { id: 'benchdip',          n: '벤치딥스',                   part: 'triceps', g: '삼두 전체', eq: ['bw'],        pl: ['gym', 'home'], s: 3, r: '12-15', rest: 60, lv: 1, ppl: 'push' },
  { id: 'skullcrusher',      n: '스컬크러셔',                 part: 'triceps', g: '삼두 장두', eq: ['bb'],        pl: ['gym'],         s: 3, r: '10-12', rest: 75, lv: 2, ppl: 'push' },
  { id: 'revpushdown',       n: '리버스그립 푸시다운',        part: 'triceps', g: '삼두 내측', eq: ['cb'],        pl: ['gym'],         s: 3, r: '12-15', rest: 60, lv: 2, ppl: 'push' },
  { id: 'diamondpushuptri',  n: '다이아몬드 푸시업 (삼두)',   part: 'triceps', g: '삼두 전체', eq: ['bw'],        pl: ['gym', 'home'], s: 3, r: '10-15', rest: 60, lv: 2, ppl: 'push' },
  { id: 'ohropeext',         n: '오버헤드 로프 익스텐션',     part: 'triceps', g: '삼두 장두', eq: ['cb'],        pl: ['gym'],         s: 3, r: '12-15', rest: 60, lv: 1, ppl: 'push' },
  { id: 'onearmohext',       n: '원암 오버헤드 익스텐션',     part: 'triceps', g: '삼두 장두', eq: ['db'],        pl: ['gym', 'home'], s: 3, r: '12-15', rest: 75, lv: 1, ppl: 'push' },

  // ─── 복근 (30) ────────────────────────────────────────────────────────────
  { id: 'crunch',           n: '크런치',            part: 'abs', g: '상복부',     eq: ['bw'],         pl: ['gym', 'home'], s: 3, r: '15-20', rest: 60, lv: 1, ppl: 'core' },
  { id: 'revcrunch',        n: '리버스크런치',      part: 'abs', g: '하복부',     eq: ['bw'],         pl: ['gym', 'home'], s: 3, r: '12-15', rest: 60, lv: 1, ppl: 'core' },
  { id: 'bicyclecrunch',    n: '바이시클크런치',    part: 'abs', g: '복사근',     eq: ['bw'],         pl: ['gym', 'home'], s: 3, r: '20-30', rest: 60, lv: 1, ppl: 'core' },
  { id: 'plank',            n: '플랭크',            part: 'abs', g: '코어 전체',  eq: ['bw'],         pl: ['gym', 'home'], s: 3, r: '30-60초', rest: 60, lv: 1, ppl: 'core' },
  { id: 'sideplank',        n: '사이드플랭크',      part: 'abs', g: '복사근',     eq: ['bw'],         pl: ['gym', 'home'], s: 3, r: '30-45초', rest: 60, lv: 1, ppl: 'core' },
  { id: 'legraise',         n: '레그레이즈',        part: 'abs', g: '하복부',     eq: ['bw'],         pl: ['gym', 'home'], s: 3, r: '12-15', rest: 60, lv: 1, ppl: 'core' },
  { id: 'hanginglegraise',  n: '행잉 레그레이즈',   part: 'abs', g: '하복부',     eq: ['bw'],         pl: ['gym'],         s: 3, r: '10-12', rest: 60, lv: 3, ppl: 'core' },
  { id: 'russiantwist',     n: '러시안트위스트',    part: 'abs', g: '복사근',     eq: ['bw', 'db', 'plate'],   pl: ['gym', 'home'], s: 3, r: '20-30', rest: 60, lv: 1, ppl: 'core' },
  { id: 'mountainclimber',  n: '마운틴클라이머',    part: 'abs', g: '코어·유산소', eq: ['bw'],        pl: ['gym', 'home'], s: 3, r: '30-40', rest: 60, lv: 1, ppl: 'core' },
  { id: 'deadbug',          n: '데드버그',          part: 'abs', g: '코어 안정화', eq: ['bw'],        pl: ['gym', 'home'], s: 3, r: '12-16', rest: 60, lv: 1, ppl: 'core' },
  { id: 'hollowhold',       n: '할로우홀드',        part: 'abs', g: '코어 전체',  eq: ['bw'],         pl: ['gym', 'home'], s: 3, r: '20-40초', rest: 60, lv: 2, ppl: 'core' },
  { id: 'vup',              n: '브이업',            part: 'abs', g: '복직근',     eq: ['bw'],         pl: ['gym', 'home'], s: 3, r: '12-15', rest: 60, lv: 2, ppl: 'core' },
  { id: 'cablecrunch',      n: '케이블 크런치',     part: 'abs', g: '상복부',     eq: ['cb'],         pl: ['gym'],         s: 3, r: '12-15', rest: 60, lv: 1, ppl: 'core' },
  { id: 'abwheel',          n: '앱휠 롤아웃',       part: 'abs', g: '코어 전체',  eq: ['bw'],         pl: ['gym', 'home'], s: 3, r: '8-12',  rest: 75, lv: 3, ppl: 'core' },
  { id: 'seatedknee',       n: '시티드 니턱',       part: 'abs', g: '하복부',     eq: ['bw'],         pl: ['gym', 'home'], s: 3, r: '15-20', rest: 60, lv: 1, ppl: 'core' },
  { id: 'heeltouch',        n: '힐터치',            part: 'abs', g: '복사근',     eq: ['bw'],         pl: ['gym', 'home'], s: 3, r: '20-30', rest: 60, lv: 1, ppl: 'core' },
  { id: 'flutterkick',      n: '플러터킥',          part: 'abs', g: '하복부',     eq: ['bw'],         pl: ['gym', 'home'], s: 3, r: '20-30', rest: 60, lv: 1, ppl: 'core' },
  { id: 'woodchop',         n: '우드찹',            part: 'abs', g: '복사근',     eq: ['db', 'band'], pl: ['gym', 'home'], s: 3, r: '12-15', rest: 60, lv: 1, ppl: 'core' },
  { id: 'pallofpress',      n: '팔로프 프레스',     part: 'abs', g: '안티로테이션', eq: ['cb', 'band'], pl: ['gym', 'home'], s: 3, r: '10-12', rest: 60, lv: 2, ppl: 'core' },
  { id: 'cablewoodchop',    n: '케이블 우드찹',     part: 'abs', g: '복사근',     eq: ['cb'],         pl: ['gym'],         s: 3, r: '12-15', rest: 60, lv: 2, ppl: 'core' },
];

// ─── 조회 헬퍼 ──────────────────────────────────────────────────────────────
/**
 * 앱에서 뺀 종목(2026-11-13 밀프 요청 — 다른 종목으로 바꿨거나 영상이 아직 없는 칸). 고르기 · 플랜 · 코치에는 나오지 않고,
 * 예전 운동 기록에 이 id 가 남아 있을 때 이름 · 부위를 보여 주는 데만 쓴다(exForLog). 다시 넣으려면 이 줄을 EX 로 옮긴다.
 * 할로우락 자리는 할로우홀드, 다이아몬드 푸시업(삼두)은 가슴 다이아몬드 푸시업 영상을 같이 쓴다.
 */
const RETIRED: Exercise[] = [
  { id: 'assistedpullup',    n: '어시스티드 풀업',       part: 'back', g: '광배',      eq: ['mc', 'band'], pl: ['gym', 'home'], s: 3, r: '8-12',  rest: 90, lv: 1, ppl: 'pull' },
  { id: 'curl21s',           n: '21s 컬',            part: 'biceps', g: '이두 전체', eq: ['bb'],        pl: ['gym'],         s: 3, r: '21',    rest: 75, lv: 2, ppl: 'pull' },
  { id: 'dragcurl',          n: '드래그컬',          part: 'biceps', g: '이두 장두',  eq: ['bb'],        pl: ['gym'],         s: 3, r: '10-12', rest: 60, lv: 2, ppl: 'pull' },
  { id: 'zottman',           n: '조트만컬',          part: 'biceps', g: '이두·전완',  eq: ['db'],        pl: ['gym', 'home'], s: 3, r: '10-12', rest: 60, lv: 2, ppl: 'pull' },
  { id: 'widecurl',          n: '와이드그립컬',      part: 'biceps', g: '이두 단두',  eq: ['bb'],        pl: ['gym'],         s: 3, r: '10-12', rest: 60, lv: 1, ppl: 'pull' },
  { id: 'jmpress',           n: 'JM프레스',                   part: 'triceps', g: '삼두 장두', eq: ['bb'],        pl: ['gym'],         s: 3, r: '8-10',  rest: 90, lv: 3, ppl: 'push' },
  { id: 'bandedpushdown',    n: '밴디드 푸시다운',            part: 'triceps', g: '삼두 외측', eq: ['band'],      pl: ['gym', 'home'], s: 3, r: '15-20', rest: 75, lv: 1, ppl: 'push' },
  { id: 'toetouch',         n: '토터치',            part: 'abs', g: '상복부',     eq: ['bw'],         pl: ['gym', 'home'], s: 3, r: '15-20', rest: 60, lv: 1, ppl: 'core' },
  { id: 'plankjack',        n: '플랭크잭',          part: 'abs', g: '코어·유산소', eq: ['bw'],        pl: ['gym', 'home'], s: 3, r: '20-30', rest: 60, lv: 2, ppl: 'core' },
  { id: 'scorpion',         n: '스콜피온',          part: 'abs', g: '복사근·가동성', eq: ['bw'],      pl: ['gym', 'home'], s: 3, r: '10-12', rest: 60, lv: 2, ppl: 'core' },
  { id: 'dragonflag',       n: '드래곤플래그',      part: 'abs', g: '코어 전체',  eq: ['bw'],         pl: ['gym', 'home'], s: 3, r: '5-8',   rest: 90, lv: 3, ppl: 'core' },
  { id: 'lsit',             n: 'L싯',               part: 'abs', g: '코어 전체',  eq: ['bw'],         pl: ['gym', 'home'], s: 3, r: '15-30초', rest: 75, lv: 3, ppl: 'core' },
  { id: 'windshieldwiper',  n: '윈드쉴드와이퍼',    part: 'abs', g: '복사근',     eq: ['bw'],         pl: ['gym', 'home'], s: 3, r: '10-12', rest: 60, lv: 3, ppl: 'core' },
  { id: 'copenhagen',       n: '코펜하겐 플랭크',   part: 'abs', g: '내전근·복사근', eq: ['bw'],      pl: ['gym', 'home'], s: 3, r: '20-30초', rest: 60, lv: 3, ppl: 'core' },
  { id: 'hollowrock',       n: '할로우락',          part: 'abs', g: '코어 전체',  eq: ['bw'],         pl: ['gym', 'home'], s: 3, r: '15-20', rest: 60, lv: 2, ppl: 'core' },
  { id: 'bandedcrunch',     n: '밴디드 크런치',     part: 'abs', g: '상복부',     eq: ['band'],       pl: ['gym', 'home'], s: 3, r: '15-20', rest: 60, lv: 1, ppl: 'core' },
  { id: 'hangingwiper',     n: '행잉 윈드쉴드와이퍼', part: 'abs', g: '복사근',   eq: ['bw'],         pl: ['gym'],         s: 3, r: '8-10',  rest: 75, lv: 3, ppl: 'core' },
];

const EX_MAP: Map<string, Exercise> = new Map(EX.map((e) => [e.id, e]));
const RETIRED_MAP: Map<string, Exercise> = new Map(RETIRED.map((e) => [e.id, e]));
/** 운동 기록 표시용 — 지금 목록에 없으면 뺀 종목에서도 찾는다 */
export const exForLog = (id: string): Exercise | undefined => EX_MAP.get(id) ?? RETIRED_MAP.get(id);

export const exById = (id: string): Exercise | undefined => EX_MAP.get(id);

export const exByIds = (ids: string[]): Exercise[] =>
  ids.map((id) => EX_MAP.get(id)).filter((e): e is Exercise => !!e);

export const exByPart = (part: Part): Exercise[] => EX.filter((e) => e.part === part);

/** 장소·난이도 조건으로 필터 */
export function exFilter(opts: { place?: Place; maxLevel?: 1 | 2 | 3; part?: Part; ppl?: PPL }): Exercise[] {
  return EX.filter((e) => {
    if (opts.place && !e.pl.includes(opts.place)) return false;
    if (opts.maxLevel && e.lv > opts.maxLevel) return false;
    if (opts.part && e.part !== opts.part) return false;
    if (opts.ppl && e.ppl !== opts.ppl) return false;
    return true;
  });
}

