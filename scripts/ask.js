// 증상 문장을 입력하면 KTAS 증상 청크를 검색해 보여준다.
// 사용: node scripts/ask.js "아이가 열이 나고 경련을 해요"   (인자 없이 실행하면 대화형)
import { createInterface } from 'node:readline/promises';
import { retrieve, detectPopulation } from '../src/lib/rag/retrieve.js';

const TOP_K = 5;

async function ask(q) {
  const pop = detectPopulation(q) ?? '단서 없음(소아·성인 모두 검색)';
  const results = await retrieve(q, TOP_K);
  console.log(`\n입력: ${q}\n추정 환자군: ${pop}`);
  results.forEach((r, i) =>
    console.log(`  ${i + 1}. [${r.population}] ${r.name}  score=${r.score.toFixed(4)}  KTAS 단계=${r.levels?.join(',') || '-'}`),
  );
  console.log(`\n--- 1위 청크 원문 ---\n${results[0].text}\n`);
}

const arg = process.argv.slice(2).join(' ').trim();
if (arg) {
  await ask(arg);
} else {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log('증상을 입력하세요 (종료: 빈 줄 또는 Ctrl+C)');
  for (;;) {
    const q = (await rl.question('> ')).trim();
    if (!q) break;
    await ask(q);
  }
  rl.close();
}
