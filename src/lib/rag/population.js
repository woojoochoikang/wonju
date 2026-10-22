// Node(retrieve.js)와 브라우저(web/js/retrieve.js)가 같이 쓰는 소아/성인 추정 로직.
// node 전용 모듈을 import 하지 않으므로 양쪽에서 그대로 import 가능.

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
