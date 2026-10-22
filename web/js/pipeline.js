// 전체 파이프라인: 증상 입력 → [1] 검색 → [2] LLM 판단 → [3] 병상 조회 → [4] 병원 매칭
// 각 단계는 독립 모듈이라 하나만 바꿔 끼울 수 있다 (예: 검색을 서버로, LLM 을 다른 회사로).
// 단계마다 onStep(id, status, detail) 로 진행 상황을 알린다. status: 'run' | 'done' | 'warn' | 'error'
import { retrieve } from './retrieve.js';
import { triage } from './llm.js';
import { getBeds } from './beds.js';
import { matchHospitals } from './match.js';

export const STEPS = [
  { id: 'retrieve', label: 'KTAS 기준 검색' },
  { id: 'triage', label: 'LLM 중증도 판단' },
  { id: 'beds', label: '병상 정보 조회' },
  { id: 'match', label: '병원 매칭' },
];

export async function runPipeline(symptom, onStep = () => {}) {
  const out = { symptom, retrieval: null, triage: null, beds: null, hospitals: [], timings: {} };
  const time = async (id, fn) => {
    const t0 = performance.now();
    try {
      return await fn();
    } finally {
      out.timings[id] = Math.round(performance.now() - t0);
    }
  };

  // [1] 검색 — 실패해도 LLM 단계는 계속 (근거 없이 보수적으로 판단)
  onStep('retrieve', 'run');
  try {
    out.retrieval = await time('retrieve', () => retrieve(symptom, { onProgress: (m) => onStep('retrieve', 'run', m) }));
    const top = out.retrieval.results[0];
    onStep('retrieve', 'done', top ? `1위 ${top.population} ${top.name} (${top.score.toFixed(3)})` : '결과 없음');
  } catch (e) {
    onStep('retrieve', 'warn', `검색 실패, 근거 없이 진행: ${e.message}`);
  }

  // [2] LLM 판단 — 실패하면 여기서 중단
  onStep('triage', 'run');
  try {
    out.triage = await time('triage', () => triage(symptom, out.retrieval));
    onStep('triage', out.triage.mock ? 'warn' : 'done', `KTAS ${out.triage.ktas_level} · ${out.triage.chief_complaint}${out.triage.mock ? ' (목업)' : ''}`);
  } catch (e) {
    onStep('triage', 'error', e.message);
    throw e;
  }

  // [3] 병상
  onStep('beds', 'run');
  try {
    out.beds = await time('beds', () => getBeds());
    onStep('beds', out.beds.source === 'mock' ? 'warn' : 'done', out.beds.warning ?? `${out.beds.hospitals.length}곳 (${out.beds.source === 'mock' ? '목업' : '실시간'})`);
  } catch (e) {
    onStep('beds', 'error', e.message);
    return out;
  }

  // [4] 매칭
  onStep('match', 'run');
  out.hospitals = matchHospitals(out.triage, out.beds.hospitals);
  onStep('match', 'done', `조건 충족 ${out.hospitals.filter((h) => h.ok).length}곳`);
  return out;
}
