import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { embed } from './embed.js';

const KB_PATH = process.env.KB_PATH ?? fileURLToPath(new URL('../../../data/kb.json', import.meta.url));
let kb;

async function loadKb() {
  if (!kb) kb = JSON.parse(await readFile(KB_PATH, 'utf8'));
  return kb;
}

// 벡터가 이미 정규화되어 있으므로 내적이 곧 코사인 유사도
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

/**
 * 입력 문장에서 소아/성인을 추정한다. 단서가 없으면 undefined (양쪽 모두 검색).
 * KTAS는 만 15세 미만을 소아로 구분한다.
 * @param {string} query
 * @returns {'소아'|'성인'|undefined}
 */
export function detectPopulation(query) {
  const age = query.match(/(\d{1,3})\s*(?:살|세)/);
  if (age) return Number(age[1]) < 15 ? '소아' : '성인';
  if (/\d+\s*개월|아이|아기|애기|영아|유아|신생아|소아|어린이|초등학생|유치원/.test(query)) return '소아';
  if (/아버지|어머니|할머니|할아버지|남편|아내|어르신|노인/.test(query)) return '성인';
  return undefined;
}

/**
 * @param {string} query 사용자 증상 입력
 * @param {number} [topK]
 * @param {{kind?: 'symptom'|'common', population?: '소아'|'성인'|'auto'|'any'}} [opts] 기본은 증상 청크만, 소아/성인은 문장에서 자동 추정
 * @returns {Promise<Array<{id:string, kind:string, population:string, name:string, levels?:string[], text:string, score:number}>>}
 */
export async function retrieve(query, topK = 3, { kind = 'symptom', population = 'auto' } = {}) {
  const { chunks, model } = await loadKb();
  const q = await embed(query, 'query', model);
  const pop = population === 'auto' ? detectPopulation(query) : population === 'any' ? undefined : population;
  return chunks
    .filter((c) => c.kind === kind && (!pop || c.population === pop))
    .map(({ embedding, ...c }) => ({ ...c, score: dot(q, embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
