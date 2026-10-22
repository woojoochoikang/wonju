// [1단계] 검색: 증상 문장 → KTAS 증상 청크 Top-K
// src/lib/rag/retrieve.js 의 브라우저 버전. 같은 kb.json, 같은 소아/성인 추정 로직을 쓴다.
import { config } from './config.js';
import { detectPopulation } from '../../src/lib/rag/population.js';

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js';

let kbPromise;
let extractorPromise;

function loadKb() {
  kbPromise ??= fetch(config.kbUrl).then((r) => {
    if (!r.ok) throw new Error(`kb.json 을 불러오지 못했습니다 (${r.status}). npm run build:kb 를 먼저 실행했는지 확인하세요.`);
    return r.json();
  });
  return kbPromise;
}

function loadExtractor(onProgress) {
  extractorPromise ??= import(TRANSFORMERS_URL).then(({ pipeline }) =>
    pipeline('feature-extraction', config.embedModel, {
      dtype: config.embedDtype,
      progress_callback: (p) => {
        if (p.status === 'progress' && p.total) onProgress?.(`모델 다운로드 ${p.file} ${Math.round(p.progress)}%`);
      },
    }),
  );
  // 실패하면 다음 호출에서 다시 시도할 수 있게 비운다
  extractorPromise.catch(() => (extractorPromise = undefined));
  return extractorPromise;
}

const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/**
 * @param {string} query
 * @param {{onProgress?: (msg: string) => void}} [opts]
 * @returns {Promise<{population?: string, results: Array<{id,name,population,levels,text,score}>}>}
 */
export async function retrieve(query, { onProgress } = {}) {
  onProgress?.('지식베이스 불러오는 중');
  const [kb, extractor] = await Promise.all([loadKb(), loadExtractor(onProgress)]);
  onProgress?.('질문 임베딩 중');
  const pooling = config.embedModel.includes('bge') ? 'cls' : 'mean';
  const out = await extractor(query, { pooling, normalize: true });
  const q = out.data;

  const population = detectPopulation(query);
  const results = kb.chunks
    .filter((c) => c.kind === 'symptom' && (!population || c.population === population))
    .map(({ embedding, ...c }) => ({ ...c, score: dot(q, embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, config.topK);
  return { population, results };
}
