// 파이프라인 전역 설정. 화면의 "설정" 패널에서 입력한 값이 여기 덮어써진다.
// API 키는 메모리에만 두고 저장하지 않는다 (새로고침하면 다시 입력).

export const config = {
  // 1) 검색 (RAG) — build-kb.js 가 만든 지식베이스. 프로젝트 루트에서 정적 서버를 띄운다는 전제.
  kbUrl: '../data/kb.json',
  embedModel: 'Xenova/bge-m3', // kb.json 을 만든 모델과 같아야 한다
  embedDtype: 'q8', // 브라우저용 양자화 모델 (fp32 는 2GB 이상이라 무거움)
  topK: 5,

  // 2) LLM — Claude Messages API
  anthropicApiKey: '', // 비어 있으면 목업 판단 사용
  claudeModel: 'claude-sonnet-5-5',
  maxContextChars: 2500, // 청크 하나당 LLM에 넘길 최대 글자 수

  // 3) 병상 — 공공데이터포털 "국립중앙의료원_전국 응급의료기관 정보 조회 서비스"
  bedApiKey: '', // 비어 있으면 data/beds-mock.json 사용
  region: { stage1: '강원특별자치도', stage2: '원주시' },
  bedsMockUrl: './data/beds-mock.json',
};
