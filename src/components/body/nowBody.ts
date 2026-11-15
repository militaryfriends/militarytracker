/**
 * "지금 내 몸" 한 곳에서 — 진행 중인 프로젝트가 있으면 그 지금(체크인 · 주간 체중 반영), 없으면 마지막 계산 + 그 뒤 체중 기록.
 * MY 탭 카드(MyBodyCard)와 같은 규칙. 계산이 아직 없으면 null.
 */
import { useMemo } from 'react';
import { useAppStore } from '../../stores/appStore';
import { cellWithHysteresis, updateComp, type Accuracy, type Coord, type Sex } from '../../utils/bodyComp';
import { trendWeight } from '../../utils/body';
import { coordOf } from './avatar3d/morph';
import { projectNow } from './progress';

export interface NowBody {
  sex: Sex;
  cell: string;
  coord: Coord;
  bfPct: number;
  weightKg: number;
  accuracy: Accuracy;
}

export function useNowBody(): NowBody | null {
  const analysis = useAppStore((st) => st.analysis);
  const project = useAppStore((st) => st.project);
  const checkins = useAppStore((st) => st.checkins);
  const weights = useAppStore((st) => st.weights);
  return useMemo(() => {
    if (project && (project.status === 'active' || project.status === 'paused')) {
      const sex = project.input.sex;
      const n = projectNow(project, checkins, weights);
      return {
        sex, cell: n.nowCell, coord: coordOf(sex, n.nowComp.bfPct, n.nowComp.nffmi), bfPct: n.nowComp.bfPct,
        weightKg: n.nowComp.ffmKg + n.nowComp.fmKg, accuracy: n.nowComp.accuracy,
      };
    }
    if (!analysis) return null;
    const sex = analysis.input.sex;
    const after = weights.filter((w) => (w.createdAt ?? w.date) > analysis.createdAt);
    const tw = trendWeight(after);
    const c = tw ? updateComp(analysis.comp, analysis.input.heightCm, tw) : analysis.comp;
    return {
      sex,
      cell: tw ? cellWithHysteresis(sex, c.bfPct, c.nffmi, analysis.cell) : analysis.cell,
      coord: tw ? coordOf(sex, c.bfPct, c.nffmi) : analysis.coord,
      bfPct: c.bfPct,
      weightKg: tw ?? analysis.input.weightKg,
      accuracy: c.accuracy,
    };
  }, [analysis, project, checkins, weights]);
}
