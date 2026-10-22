// [3단계] 병상 조회: 지역 응급의료기관의 실시간 가용 병상
// 실제 API: 공공데이터포털 "국립중앙의료원_전국 응급의료기관 정보 조회 서비스"
//   오퍼레이션 getEmrrmRltmUsefulSckbdInfoInqire (응급실 실시간 가용병상정보 조회)
// ※ 필드 코드(hvec 등)는 기억에 의존해 적은 것이므로, 인증키 발급 후 공식 명세서(활용가이드)와 꼭 대조하세요.
import { config } from './config.js';

const ENDPOINT = 'https://apis.data.go.kr/B552657/ErmctInfoInqireService/getEmrrmRltmUsefulSckbdInfoInqire';

/** 우리 파이프라인에서 쓰는 자원명 → API 응답 필드. match.js 가 이 표로 판단한다. */
export const RESOURCE_FIELDS = {
  응급실: 'hvec', // 응급실 가용 병상 수
  일반중환자실: 'hvicc',
  신경중환자실: 'hvcc',
  흉부중환자실: 'hvccc',
  신생아중환자실: 'hvncc',
  수술실: 'hvoc',
  CT: 'hvctayn', // Y/N
  MRI: 'hvmriayn',
  혈관조영: 'hvangioayn',
  인공호흡기: 'hvventiayn',
};

const NUMERIC = ['hvec', 'hvicc', 'hvcc', 'hvccc', 'hvncc', 'hvoc', 'hvgc'];

function normalize(item) {
  const h = { ...item };
  for (const k of NUMERIC) if (k in h) h[k] = Number(h[k]);
  return h;
}

/** data.go.kr 기본 응답(XML) → 객체 배열 */
function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const code = doc.querySelector('resultCode')?.textContent;
  if (code && code !== '00') throw new Error(`병상 API 오류 ${code}: ${doc.querySelector('resultMsg')?.textContent}`);
  return [...doc.querySelectorAll('item')].map((item) =>
    Object.fromEntries([...item.children].map((el) => [el.tagName, el.textContent.trim()])),
  );
}

async function fetchReal() {
  const params = new URLSearchParams({
    STAGE1: config.region.stage1,
    STAGE2: config.region.stage2,
    pageNo: '1',
    numOfRows: '100',
  });
  // serviceKey 는 포털에서 "인코딩" 키를 받았다면 그대로 붙여야 이중 인코딩을 피할 수 있다
  const res = await fetch(`${ENDPOINT}?serviceKey=${config.bedApiKey}&${params}`);
  if (!res.ok) throw new Error(`병상 API HTTP ${res.status}`);
  return parseXml(await res.text());
}

async function fetchMock() {
  const res = await fetch(config.bedsMockUrl);
  return res.json();
}

/**
 * @returns {Promise<{source: 'api'|'mock', warning?: string, hospitals: object[]}>}
 */
export async function getBeds() {
  if (config.bedApiKey) {
    try {
      return { source: 'api', hospitals: (await fetchReal()).map(normalize) };
    } catch (e) {
      // 브라우저에서 직접 호출하면 CORS 로 막힐 수 있다 → 그 경우 목업으로 계속 진행
      const hospitals = (await fetchMock()).map(normalize);
      return { source: 'mock', warning: `실제 API 호출 실패, 목업 사용: ${e.message}`, hospitals };
    }
  }
  return { source: 'mock', hospitals: (await fetchMock()).map(normalize) };
}
