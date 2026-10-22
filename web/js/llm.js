// [2단계] LLM 판단: 증상 + 검색된 KTAS 기준 → 구조화된 분류 결과
// Claude 의 tool use 를 강제해서 항상 같은 JSON 형태(TRIAGE_SCHEMA)로 받는다.
import { config } from './config.js';

/** 병상 매칭(match.js)과 공유하는 자원 목록. LLM 은 이 중에서만 고른다. */
export const RESOURCES = ['응급실', '일반중환자실', '신경중환자실', '흉부중환자실', '신생아중환자실', '수술실', 'CT', 'MRI', '혈관조영', '인공호흡기'];

const TRIAGE_SCHEMA = {
  type: 'object',
  properties: {
    ktas_level: { type: 'integer', minimum: 1, maximum: 5, description: 'KTAS 단계 (1 소생 ~ 5 비응급)' },
    population: { type: 'string', enum: ['성인', '소아'] },
    chief_complaint: { type: 'string', description: '가장 부합하는 KTAS 증상 카테고리명 (검색 결과의 name 중 하나)' },
    reasoning: { type: 'string', description: '판단 근거. 어떤 KTAS 기준에 해당하는지 2~4문장' },
    red_flags: { type: 'array', items: { type: 'string' }, description: '입력에서 찾은 위험 신호' },
    missing_info: { type: 'array', items: { type: 'string' }, description: '단계를 확정하려면 추가로 확인해야 할 것' },
    required_resources: { type: 'array', items: { type: 'string', enum: RESOURCES }, description: '이송 병원에 필요한 자원' },
    recommended_dept: { type: 'string', description: '우선 진료과' },
    advice: { type: 'string', description: '환자·보호자 행동 요령 1~2문장. 1~2단계면 119 신고를 안내' },
  },
  required: ['ktas_level', 'population', 'chief_complaint', 'reasoning', 'red_flags', 'missing_info', 'required_resources', 'recommended_dept', 'advice'],
};

const SYSTEM = `당신은 응급실 중증도 분류(KTAS)를 보조하는 도구입니다.
- 반드시 함께 제공된 KTAS 기준 발췌만 근거로 판단하고, 근거가 없는 내용은 지어내지 마세요.
- 정보가 부족하거나 두 단계 사이에서 애매하면 더 높은 중증도(더 낮은 숫자)를 고르고 missing_info 에 적으세요.
- 이 결과는 진단이 아니라 참고용이며, 최종 판단은 의료진이 합니다.
- 결과는 triage_result 도구로만 답하세요.`;

function buildContext(retrieval) {
  if (!retrieval?.results?.length) return '(검색된 KTAS 기준 없음 — 일반 지식으로 보수적으로 판단)';
  return retrieval.results
    .map((r, i) => `<기준 ${i + 1} name="${r.name}" population="${r.population}" score="${r.score.toFixed(3)}">\n${r.text.slice(0, config.maxContextChars)}\n</기준 ${i + 1}>`)
    .join('\n\n');
}

async function callClaude(symptom, retrieval) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
      // 백엔드 없이 브라우저에서 직접 호출하기 위한 헤더. 키가 브라우저에 노출되므로 개발·시연용으로만 사용.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.claudeModel,
      max_tokens: 1500,
      system: SYSTEM,
      tools: [{ name: 'triage_result', description: 'KTAS 분류 결과를 반환한다', input_schema: TRIAGE_SCHEMA }],
      tool_choice: { type: 'tool', name: 'triage_result' },
      messages: [
        {
          role: 'user',
          content: `# 환자 증상 (보호자/환자 입력)\n${symptom}\n\n# 추정 환자군\n${retrieval?.population ?? '단서 없음'}\n\n# 검색된 KTAS 기준\n${buildContext(retrieval)}`,
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API 오류 ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const tool = data.content.find((c) => c.type === 'tool_use');
  if (!tool) throw new Error('Claude 응답에 triage_result 가 없습니다');
  return tool.input;
}

/** API 키가 없을 때 파이프라인을 끝까지 돌려보기 위한 가짜 판단. 검색 1위 결과를 그대로 쓴다. */
function mockTriage(symptom, retrieval) {
  const top = retrieval?.results?.[0];
  const levels = (top?.levels ?? ['3']).map(Number);
  const urgent = /의식|숨을 안|숨이 안|경련|마비|피를 토|쓰러/.test(symptom);
  const level = urgent ? Math.min(...levels, 2) : levels[Math.floor(levels.length / 2)];
  const res = new Set(['응급실']);
  if (/가슴|흉통/.test(symptom)) ['혈관조영', '흉부중환자실'].forEach((x) => res.add(x));
  if (/마비|어눌|뇌졸중|머리/.test(symptom)) ['CT', 'MRI', '신경중환자실'].forEach((x) => res.add(x));
  if (/숨|호흡/.test(symptom)) res.add('인공호흡기');
  if (/사고|골절|뼈/.test(symptom)) ['CT', '수술실'].forEach((x) => res.add(x));
  return {
    ktas_level: level,
    population: retrieval?.population ?? top?.population ?? '성인',
    chief_complaint: top?.name ?? '미분류',
    reasoning: '[목업] Claude API 키가 없어 검색 1위 결과와 키워드 규칙으로 만든 가짜 판단입니다.',
    red_flags: urgent ? ['[목업] 위험 키워드 감지'] : [],
    missing_info: ['[목업] 활력징후(혈압, 맥박, 산소포화도)', '[목업] 증상 시작 시각'],
    required_resources: [...res],
    recommended_dept: '응급의학과',
    advice: level <= 2 ? '즉시 119에 신고하세요.' : '가까운 응급실에서 진료를 받으세요.',
    mock: true,
  };
}

/**
 * @param {string} symptom
 * @param {{population?: string, results: any[]}|null} retrieval
 */
export async function triage(symptom, retrieval) {
  if (!config.anthropicApiKey) return mockTriage(symptom, retrieval);
  return callClaude(symptom, retrieval);
}
