// [4단계] 병원 매칭: LLM 이 고른 필요 자원 × 병원별 가용 병상 → 추천 순위
// 지금은 "필요 자원을 다 갖췄는가 → 응급실 여유 병상" 순으로만 정렬한다.
// TODO: 거리/이송시간 (getEgytBassInfoInqire 의 좌표 + 사용자 위치), 응급의료기관 등급 반영
import { RESOURCE_FIELDS } from './beds.js';

function has(hospital, resource) {
  const field = RESOURCE_FIELDS[resource];
  if (!field) return true; // 매핑이 없는 자원은 판단 보류
  const v = hospital[field];
  return typeof v === 'number' ? v > 0 : v === 'Y';
}

/**
 * @param {{required_resources: string[], ktas_level: number}} triage
 * @param {object[]} hospitals
 */
export function matchHospitals(triage, hospitals) {
  const need = triage.required_resources ?? ['응급실'];
  return hospitals
    .map((h) => {
      const missing = need.filter((r) => !has(h, r));
      return { ...h, missing, ok: missing.length === 0 };
    })
    .sort((a, b) => Number(b.ok) - Number(a.ok) || a.missing.length - b.missing.length || (b.hvec ?? 0) - (a.hvec ?? 0));
}
