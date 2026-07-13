# fable5 review-cert/v2 run — 다음 세션 시작점 (2026-07-12)

owner 승인: v2 계약(resubmit-enabled 측정)으로 fresh cert run 실행.
구현·검증 완료 커밋 9d4a53a (설계: 20260712-review-cert-v2-design.md §5 개정판).

## 재개 시 상태 검증 (먼저 실행)

```
pwd                          # /Users/kangmin/Documents/onto-mcp
git branch --show-current    # feat/review-role-registration (PR #185 오픈)
git log --oneline -1         # 9d4a53a feat(bench): review-cert/v2 ...
```

워킹트리 잔여(정상): IMPLEMENTATION_MAP.html(M, 타세션), 20260711-140727/*(M),
untracked 벤치 증거들(20260712-101717 run 산출물 포함 — 커밋 대상 아님, 참조용).

## 무엇이 바뀌었나 (v1 run과의 차이)

- cert가 **resubmit ON**으로 돈다(하니스가 --retry-resubmit 상시 전달, v2 계약).
  stance `unsupported ref` 반려는 이제 오답노트(반려 원문+허용 목록) 재시도로
  자가 치유 — v1에서 attempt의 ~절반을 죽인 클래스. K1(화이트리스트 정렬)로
  bare rel-id 반려는 아예 소멸.
- record는 review-cert/v2로 조립되고 run_controls {salvage:false, resubmit:true}
  핀을 검증. resubmit 사용량은 비차단 disclosure로 로그에 출력됨(0이어도 출력).
- progress 행에 run_controls 스탬프 — **구 run dir(20260712-101717)에 --resume
  금지**(가드가 fail-loud로 거부함; fresh --out만 사용).

## 전제조건 (run 전 반드시)

1. **claude 로그인/쿼터**: 사용자 계정이 claude-1/2/3 로테이션. 프로브:
   `/Users/kangmin/.superset/bin/claude -p "reply ok" --model claude-fable-5`
   (셸 alias `claude`는 echo 트랩이라 절대경로 필수). 사용자가 "claude-N 계정"
   이라 하면 워커 주입은 하니스 env에 `CLAUDE_CONFIG_DIR=/Users/kangmin/.claude-N`
   프리픽스(기본 ~/.claude가 로그인된 계정이면 불필요 — 프로브로 판정).
2. **codex 윈도우**: baseline arm(gpt-5.5)이 ~150+ dispatch 소비. 한도 시
   "You've hit your usage limit ... try again at HH:MM" — 그 시각+1분 후 재개.
3. 쿼터 fast-fail 시그니처(진단 즉시 하니스 정지 권장): lens 6유닛 전멸,
   dispatch당 ~10-20초, attempt가 ~90초-3분에 사망. 스탬프 가드 때문에 resume은
   **같은 v2 run dir에만** 유효(--max-attempts 누적 상향 필요).

## run 절차

```
OUT="development-records/benchmark/review-cert/$(date +%Y%m%d-%H%M%S)" && mkdir -p "$OUT" && \
nohup npx tsx scripts/review-cert-run.mts \
  --candidate-model claude-fable-5 --candidate-provider anthropic \
  --candidate-auth oauth --candidate-effort medium \
  --baseline-model gpt-5.5 --baseline-effort medium \
  --reps 3 --max-attempts 8 --timeout-ms 1500000 \
  --out "$OUT" > "$OUT/run.log" 2>&1 & disown
# (계정 지정 시: 위 nohup 앞에 CLAUDE_CONFIG_DIR=/Users/kangmin/.claude-N)
```

- 시작 로그 확인: "v2 mechanical-ON" 라인 + 양 shim self-test 통과.
- 감시: Monitor로 run.log tail — 필터
  `attempt [0-9]+ ok|not_run|REP FLOOR|GUARD FAILED|RECOMPUTE|record →|witness:|Error`
  + pid 사망 감시(하니스 프로세스 exit 시 알림). 세션 재시작 시 감시자 재장착.
- 페이스 기대: attempt당 ~20분(1500초 예산), candidate 성공률은 v1의 ~13%보다
  유의미하게 높아야 정상(resubmit 치유가 이 run의 측정 대상).
- 절단 시: 같은 OUT에 `--resume "$OUT" --max-attempts <누적 상향>`.

## 종료 후

- recompute 0 violations → R7 큐레이션(README에 witness 계약 arm-단위 명기,
  resubmit_usage disclosure 수치 해석 포함) → registry 등록 커밋
  (roles: [review]; G7이 v2 binding 자동 검증).
- 위반 있으면 sol 선례(8c845c7)처럼 실패 증거 커밋. rep_floor 재발 시
  resubmit 사용량 disclosure가 "치유가 부족했는가/발화 자체가 없었는가"를 판별.
- 20260712-101717 v1 run 산출물(record·rejected·진단)은 실패 증거로 별도
  큐레이션 후 커밋 가능(미커밋 상태).

## 잔여 owner 결정 (run과 독립)

준승인 tier registry 표기, production 기본값 전환, deliberation/synthesis
enum-대안 후속(H1·H2 잔여·H4)은 format-rescue-ladder·ref-vocabulary 설계 §3-§4.
