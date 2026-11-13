/**
 * 코치 모델별 요청 방식 — 서버(aiCoach)와 평가(scripts/coach-eval)가 같이 쓴다.
 *
 * Haiku 4.5: 답을 `{"next":"` 로 시작시킨다(assistant 프리필) — JSON 밖 글 · 울타리를 막는다.
 * Haiku 5.5 이후: 프리필을 400 으로 거절한다(마지막 턴이 assistant 면 안 됨). 대신 structured outputs(JSON 스키마)로
 *   형식을 강제하고, 기본으로 켜지는 adaptive thinking 은 끈다 — 생각 토큰이 max_tokens 를 다 먹으면 글 없이 끝나서(평가에서 확인).
 *   effort 는 'high' 이하에서만 thinking 을 끌 수 있다.
 */
import { PREFILL } from './prompt';

/** 답 JSON 스키마 — prompt.ts <output> 과 같은 키 · 같은 순서 */
export const COACH_SCHEMA = {
  type: 'object',
  properties: {
    next: { type: 'string' },
    text: { type: 'string' },
    meal: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          properties: {
            t: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: { n: { type: 'string' }, q: { type: 'number' }, u: { type: 'string' }, kcal: { type: 'number' }, p: { type: 'number' } },
                required: ['n', 'q', 'u', 'kcal', 'p'],
                additionalProperties: false,
              },
            },
          },
          required: ['t', 'items'],
          additionalProperties: false,
        },
      ],
    },
    warning: { type: ['string', 'null'] },
    cheer: { type: ['string', 'null'] },
  },
  required: ['next', 'text', 'meal', 'warning', 'cheer'],
  additionalProperties: false,
} as const;

export type Effort = 'low' | 'medium' | 'high';

export interface ModelRequest {
  /** 답 앞에 붙일 글(프리필). 없으면 '' */
  prefill: string;
  /** 요청 본문에 더할 것 */
  body: Record<string, unknown>;
}

/** 프리필을 받지 않는 모델(Haiku 5.5 · Sonnet 5 · Opus 5 계열 이후) */
export const noPrefill = (model: string) => /claude-(haiku|sonnet|opus)-5|fable|mythos/.test(model);

export function coachRequest(model: string, effort: Effort = 'low'): ModelRequest {
  if (!noPrefill(model)) return { prefill: PREFILL, body: {} };
  return {
    prefill: '',
    body: {
      thinking: { type: 'disabled' },
      output_config: { effort, format: { type: 'json_schema', schema: COACH_SCHEMA } },
    },
  };
}
