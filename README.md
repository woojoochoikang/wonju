# wonju-triage-rag

환자·보호자가 일상어로 입력한 증상을 **KTAS(한국형 응급환자 분류도구)** 기준으로 검색하고, LLM(Claude)이 중증도를 판단한 뒤 **응급실 가용 병상 정보**와 매칭해 갈 만한 병원을 추천하는 파이프라인 프로토타입입니다.

> ⚠️ 이 프로젝트는 연구·교육용 프로토타입입니다. 의료진의 판단을 대신하지 않으며, 일상어 표현(`aliases.js`)과 요약 초안(`ktas-draft.md`)은 의료진 검수 전 상태입니다.

## 파이프라인

```
증상 입력
  → ① KTAS 기준 검색 (bge-m3 임베딩 + kb.json)
  → ② LLM 중증도 판단 (Claude, 정해진 JSON 형식으로 응답)
  → ③ 병상 정보 조회 (공공데이터포털 응급실 실시간 가용병상 API)
  → ④ 병원 매칭 (필요 자원 충족 여부 → 응급실 여유 병상 순)
```

API 키가 없어도 ②는 목업 판단, ③은 목업 병상 데이터로 끝까지 실행됩니다.

## 폴더 구조

```
├─ scripts/
│  ├─ extract-ktas.js     # KTAS 지침서 PPTX → data/ktas-slides.json
│  ├─ chunk-ktas.js       # 슬라이드 → 증상 카테고리 청크 (data/ktas-chunks.json)
│  └─ ask.js              # 터미널에서 증상 검색해보기
├─ src/lib/rag/
│  ├─ build-kb.js         # 청크 임베딩 → data/kb.json
│  ├─ embed.js            # 임베딩 모델 래퍼 (기본 Xenova/bge-m3)
│  ├─ retrieve.js         # Node용 검색
│  ├─ population.js       # 소아/성인 추정 (Node·브라우저 공용)
│  ├─ aliases.js          # KTAS 증상명 → 일상어 표현
│  ├─ eval.js, eval-cases.js, test-retrieve.js   # 검색 평가
│  └─ chunks/ktas-draft.md
├─ web/                   # 단일 페이지 프론트 (백엔드 없음)
│  ├─ index.html
│  ├─ js/config.js        # 설정 (모델, 지역, 경로 등)
│  ├─ js/pipeline.js      # ①~④ 단계 연결
│  ├─ js/retrieve.js      # ① 브라우저 검색
│  ├─ js/llm.js           # ② Claude 호출 + 목업
│  ├─ js/beds.js          # ③ 병상 API + 목업
│  ├─ js/match.js         # ④ 병원 매칭
│  └─ data/beds-mock.json # 목업 병상 데이터
└─ data/                  # (git 제외) 생성 데이터: ktas-slides.json, ktas-chunks.json, kb.json
```

## 준비물

- **Node.js 18 이상** (`node -v`로 확인)
- **KTAS 지침서 `2021_KTAS_guideline_ver1.6.pptx`**
  - KTAS 제공자 교육 이수자에게 배포되는 자료라 이 저장소에는 포함되어 있지 않습니다 (`.gitignore` 처리). 팀 내부에서 받아 프로젝트 루트에 넣으세요.
- (선택) **Claude API 키**: [Claude Console](https://console.anthropic.com)에서 발급
- (선택) **병상 API 인증키**: [공공데이터포털](https://www.data.go.kr)에서 "국립중앙의료원_전국 응급의료기관 정보 조회 서비스" 활용 신청

## 실행 방법

> Windows PowerShell에서 `npm` 실행이 막히면 `npm` 대신 `npm.cmd`를 쓰거나,
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`를 한 번 실행하세요.

### 1. 설치

```bash
git clone https://github.com/woojoochoikang/wonju.git
cd wonju
npm install
```

### 2. 지식베이스 만들기 (처음 한 번, 또는 PPTX·aliases.js를 바꿨을 때)

```bash
node scripts/extract-ktas.js 2021_KTAS_guideline_ver1.6.pptx   # → data/ktas-slides.json
node scripts/chunk-ktas.js                                      # → data/ktas-chunks.json
npm run build:kb                                                # → data/kb.json
```

`build:kb`는 처음 실행할 때 임베딩 모델을 내려받으므로 시간이 걸립니다.

### 3. 웹 페이지 실행

```bash
npm run web
```

브라우저에서 **http://localhost:8080/web/** 을 엽니다.

- 상단 **설정**에 Claude API 키를 넣으면 실제 LLM 판단, 비우면 목업 판단을 사용합니다.
- 병상 API 키를 넣으면 실제 API를 호출하고, 비우거나 호출이 실패하면 목업 병상 데이터를 사용합니다.
- 키는 탭 메모리에만 있고 저장되지 않습니다.
- 첫 실행 때 브라우저가 검색용 모델(bge-m3 양자화, 수백 MB)을 내려받습니다. 이후에는 캐시를 사용합니다.
- `index.html`을 더블클릭해서 열면 `kb.json`을 불러올 수 없으니 꼭 `npm run web`으로 실행하세요.

### 4. (선택) 터미널에서 검색·평가

```bash
node scripts/ask.js "3살 아이가 열이 40도고 경련을 해요"   # 증상 1건 검색
node scripts/ask.js                                         # 대화형 검색
npm run test:retrieve                                       # 예시 9건 Top-1/Top-5
npm run eval                                                # 30건 Hit@K, 소아/성인 판별 정확도
```

## 설정 (`web/js/config.js`)

| 항목 | 기본값 | 설명 |
|---|---|---|
| `kbUrl` | `../data/kb.json` | 검색용 지식베이스 경로 |
| `embedModel` / `embedDtype` | `Xenova/bge-m3` / `q8` | `kb.json`을 만든 모델과 같아야 함 |
| `topK` | `5` | LLM에 넘길 검색 결과 수 |
| `claudeModel` | `claude-sonnet-5-5` | 화면 설정에서 바꿀 수 있음 |
| `region` | 강원특별자치도 / 원주시 | 병상 조회 지역 |

## 알려진 한계 · TODO

- **검색 정확도**: 아직 개선 전입니다. `npm run eval`로 측정할 수 있습니다.
- **병상 API 필드명**: `web/js/beds.js`의 `RESOURCE_FIELDS`(hvec, hvctayn 등)는 공식 활용가이드와 대조가 필요합니다.
- **CORS**: 공공데이터포털 API는 브라우저에서 직접 호출하면 막힐 수 있습니다. 그 경우 목업으로 넘어가며, 실제 연동에는 프록시 서버가 필요할 수 있습니다.
- **API 키 노출**: Claude API를 브라우저에서 직접 호출하므로 개발·시연용으로만 사용하세요. 공개 서비스로 만들려면 서버에서 호출해야 합니다.
- **거리순 정렬 미구현**: 병원 좌표(`getEgytBassInfoInqire`)와 사용자 위치를 반영해야 합니다 (`web/js/match.js`).
- **배포 주의**: `data/kb.json`에는 KTAS 지침서 원문이 들어 있습니다. 공개 웹(GitHub Pages 등)에 함께 올리지 마세요.
