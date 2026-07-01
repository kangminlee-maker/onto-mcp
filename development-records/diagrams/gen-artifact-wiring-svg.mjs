import { writeFileSync } from "node:fs";

// ─────────────────────────────────────────────────────────────────────────────
// onto review + reconstruct — complete artifact wiring blueprint.
// Judgment question: what input does each stage consume, what output does it
// produce, and which gate does that output pass through?
// Ground truth: reconstruct = completed run defect3-ab-fix-rerun2 manifest (102
// steps) + RECONSTRUCT_STAGE_IDS (artifact-types.ts:1554) + run.ts validators.
// review = REVIEW_PROGRESS_STEPS (review-progress-contract.ts:29) + pipeline-
// execution-ledger.ts unit specs + a real onto review session.
// Each *_validation gate is folded into its producer node's gate chip.
// actor: D=deterministic runtime · L=host_llm author · U=host/user mediated
// gate: throw=hard-block (assertRuntimeValidationValid aborts run) · disclose=
//   writes validation_status, pipeline continues · degrade=review halt/halted_partial
// flag: skipped (this run) · new (working-tree, not in this run binary) · loop
// ─────────────────────────────────────────────────────────────────────────────

// ===== RECONSTRUCT phase columns =====
// node = [name, artifact_id, actor, gate, flag]
const RC = [
  { title: "0 · Control", sub: "run gate / registry", nodes: [
    ["Run Control","reconstruct-run-control","D","throw",null],
    ["Registry Verification","registry-verification-evidence","D","throw",null],
    ["Target Material Profile","target-material-profile","D","throw",null],
  ]},
  { title: "1 · Source & Safety", sub: "observe → safety ledger", nodes: [
    ["Source Inventory","source-inventory","D","none",null],
    ["Source Observation","source-observations","D","graceful",null],
    ["Source Safety Ledger","source-safety-ledger","D","throw",null],
    ["Source Scout Pack","source-scout-pack","D","throw",null],
    ["Obs Lineage Index","source-observation-lineage-index","D","throw",null],
  ]},
  { title: "2 · Exploration (per round)", sub: "directive → lens → frontier", nodes: [
    ["Observation Directive","source-observation-directive","L","throw",null],
    ["Lens Judgment ×9","lens-judgment-index","L","disclose",null],
    ["Exploration Synthesis","exploration-synthesis","L","none",null],
    ["Source Frontier","source-frontier","L","throw",null],
    ["Source Obs Delta","source-observation-delta","D","graceful","skipped"],
    ["Leaf Read (LLM-touch)","leaf-read-census","L","disclose",null],
  ]},
  { title: "3 · Purpose & Seeding", sub: "candidates → seed → CQ", nodes: [
    ["Source Purpose Candidates","source-purpose-candidates","L","throw",null],
    ["Purpose Confirmation","purpose-confirmation","U","throw",null],
    ["Material Admission Ledger","material-admission-ledger","D","throw",null],
    ["Candidate Inventory","candidate-inventory","L","none",null],
    ["Candidate Disposition","candidate-disposition","L","throw",null],
    ["Seed Authoring Readiness","seed-authoring-readiness","D","throw",null],
    ["Ontology Seed","ontology-seed","L","throw",null],
    ["Claim Realization Map","claim-realization-map","L","throw",null],
    ["Seed Confirmation","seed-confirmation","U","disclose",null],
    ["Competency Questions","competency-questions","L","throw",null],
  ]},
  { title: "4 · Assessment & Handoff", sub: "assess → classify → gate", nodes: [
    ["CQ Assessment","competency-question-assessment","L","throw",null],
    ["Failure Classification","failure-classification","L","throw",null],
    ["Revision Proposal","revision-proposal","L","throw",null],
    ["Metrics","reconstruct-metrics","D","none",null],
    ["Stop Decision","stop-decision","L","throw",null],
    ["Pre-handoff Manifest Val.","run-manifest.pre-handoff","D","throw",null],
    ["Handoff Decision Val.","handoff-decision","D","throw",null],
  ]},
  { title: "5 · Maturation Loop", sub: "read values → answer → expand", nodes: [
    ["Maturation Baseline","maturation-baseline","D","throw",null],
    ["Baseline Actionab. Matrix","baseline-actionability-matrix","D","throw",null],
    ["Maturation Value-Read","maturation-value-discharge","L","disclose","new"],
    ["Question Frontier","maturation-question-frontier","L","throw",null],
    ["Closure Frontier","maturation-closure-frontier","L","throw",null],
    ["Authority Response","maturation-authority-response","D","throw",null],
    ["Answer Support Ledger","answer-support-ledger","L","throw",null],
    ["Answer Support Judgment","answer-support-judgment","L","throw",null],
    ["Answer Claims","maturation-answer-claims","L","throw",null],
    ["Ontology Expansion","ontology-expansion","L","throw",null],
    ["Actionability Matrix","actionability-matrix","D","throw",null],
    ["Convergence Ledger","maturation-convergence-ledger","D","throw",null],
    ["Continuation Decision","maturation-continuation-decision","D","throw","loop"],
  ]},
  { title: "6 · Proofs & Publication", sub: "project → final → record", nodes: [
    ["Query / Viz / Graph Proofs","*-proofs","D","throw",null],
    ["Actionable Ontology","actionable-ontology","D","throw","skipped"],
    ["Claim Projection","claim-projection","D","throw",null],
    ["Final Output","final-output.md","L","throw",null],
    ["Record Assembly","reconstruct-record","D","none",null],
    ["Post-pub Manifest Val.","run-manifest.post-publication","D","throw",null],
  ]},
];

// ===== REVIEW phase columns =====
const RV = [
  { title: "A · Interpret & Bind", sub: "invoke → plan", nodes: [
    ["Interpretation","interpretation","L","none",null],
    ["Binding","binding","D","none",null],
    ["Target Profile + Value Criteria","review-target-profile","D","none",null],
    ["Execution Plan + Seats","execution-plan","D","none",null],
    ["Target Materialization","prompt-packets","D","none",null],
  ]},
  { title: "B · Isolated Lenses", sub: "9 lenses, parallel", nodes: [
    ["Manifest Validation","review-run-manifest","D","throw",null],
    ["Lens Dispatch ×9","round1/<lens>.findings","L","seat",null],
    ["Lens Completion Barrier","lens-completion-barrier","D","degrade",null],
  ]},
  { title: "C · Aggregate & Relate", sub: "findings → issues", nodes: [
    ["Finding Ledger","finding-ledger","L","degrade",null],
    ["Finding Relation Graph","finding-relation-graph","L","degrade",null],
    ["Issue Ledger","issue-ledger","L","degrade",null],
    ["Issue Stance (per-lens map)","issue-stance:<lens>","L","none",null],
    ["Issue Stance Matrix (reduce)","issue-stance-matrix","D","degrade",null],
  ]},
  { title: "D · Deliberate", sub: "plan → respond → teamlead", nodes: [
    ["Deliberation Plan","deliberation-plan","L","degrade",null],
    ["Lens Deliberation Responses","deliberation:<issue>:<lens>","L","degrade",null],
    ["Teamlead Controlled Delib.","controlled-deliberation","L","degrade",null],
  ]},
  { title: "E · Synthesize", sub: "frame → record", nodes: [
    ["Problem Framing","problem-framing","L","degrade",null],
    ["Synthesize","execution-result","L","degrade",null],
    ["Review Record + Final Output","review-record","D","none",null],
  ]},
];

// ===== style =====
const ACT = {
  D: { fill:"#e6f4ea", stroke:"#34a853", label:"runtime" },   // green
  L: { fill:"#fff8e1", stroke:"#f9ab00", label:"LLM author" },// amber
  U: { fill:"#f3e8fd", stroke:"#a142f4", label:"host/user" }, // purple
};
const GATE = {
  throw:    { c:"#d93025", t:"THROW" },   // red — hard block (run aborts)
  disclose: { c:"#12a4af", t:"DISCLOSE" },// cyan — non-blocking validation
  degrade:  { c:"#12a4af", t:"DEGRADE" }, // cyan — review halt/halted_partial
  seat:     { c:"#d93025", t:"SEAT" },    // red — canonical-seat presence
  graceful: { c:"#e37400", t:"GRACEFUL" },// orange — input-conditional stop → honest blocked/limited terminal (not a crash)
  none:     null,
};
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

function renderBlock(cols, x0, y0, blockW, opts){
  const NCOLS = cols.length;
  const GAP = 10;
  const colW = Math.floor((blockW - (NCOLS-1)*GAP) / NCOLS);
  const nodeW = colW - 10;
  const HEADY = y0, HEADH = 30;
  const NY0 = y0 + HEADH + 14, NH = 46, NGAP = 8, STEP = NH + NGAP;
  const colX = i => x0 + i*(colW+GAP);
  let s = "", maxN = Math.max(...cols.map(c=>c.nodes.length));
  const blockH = (NY0 - y0) + maxN*STEP + 6;
  // phase spine arrows between column headers
  for (let i=0;i<NCOLS-1;i++){
    const x1 = colX(i)+colW, x2 = colX(i+1), y = HEADY+HEADH/2;
    s += `<line x1="${x1}" y1="${y}" x2="${x2-3}" y2="${y}" stroke="#5f6368" stroke-width="2" marker-end="url(#ar)"/>`;
  }
  cols.forEach((col,i)=>{
    s += `<rect x="${colX(i)}" y="${HEADY}" width="${colW}" height="${HEADH}" rx="6" fill="#f1f3f4" stroke="#dadce0"/>`;
    s += `<text x="${colX(i)+colW/2}" y="${HEADY+13}" font-size="11.5" font-weight="700" fill="#202124" text-anchor="middle">${esc(col.title)}</text>`;
    s += `<text x="${colX(i)+colW/2}" y="${HEADY+25}" font-size="9" fill="#5f6368" text-anchor="middle">${esc(col.sub)}</text>`;
    col.nodes.forEach((n,j)=>{
      const [name,id,actor,gate,flag] = n;
      const x = colX(i)+5, y = NY0 + j*STEP;
      const a = ACT[actor];
      const dashed = flag==="skipped";
      const fill = dashed ? "#fdecdd" : a.fill;
      const stroke = dashed ? "#e8710a" : a.stroke;
      s += `<g>`;
      s += `<rect x="${x}" y="${y}" width="${nodeW}" height="${NH}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1.4" ${dashed?'stroke-dasharray="4 2"':''}/>`;
      if (flag==="new") s += `<rect x="${x-2}" y="${y-2}" width="${nodeW+4}" height="${NH+4}" rx="8" fill="none" stroke="#1a73e8" stroke-width="2" stroke-dasharray="5 3"/>`;
      if (flag==="loop") s += `<rect x="${x-2}" y="${y-2}" width="${nodeW+4}" height="${NH+4}" rx="8" fill="none" stroke="#1a73e8" stroke-width="2"/>`;
      // actor dot
      s += `<circle cx="${x+9}" cy="${y+13}" r="4.5" fill="${a.stroke}"/>`;
      s += `<text x="${x+20}" y="${y+16}" font-size="10.5" font-weight="700" fill="#202124">${esc(name)}</text>`;
      s += `<text x="${x+9}" y="${y+30}" font-size="8" fill="#5f6368" font-family="ui-monospace,Menlo,monospace">▸ ${esc(id)}</text>`;
      // gate chip
      const g = GATE[gate];
      if (g){
        const cw = g.t.length*5.6 + 12;
        s += `<rect x="${x+9}" y="${y+34}" width="${cw}" height="11" rx="5.5" fill="${g.c}"/>`;
        s += `<text x="${x+9+cw/2}" y="${y+42.5}" font-size="7.6" font-weight="700" fill="#ffffff" text-anchor="middle">${g.t}</text>`;
      } else {
        s += `<text x="${x+9}" y="${y+42}" font-size="7.6" fill="#9aa0a6">— no own gate —</text>`;
      }
      if (flag==="skipped") s += `<text x="${x+nodeW-8}" y="${y+16}" font-size="8" font-weight="700" fill="#e8710a" text-anchor="end">SKIPPED</text>`;
      if (flag==="new")     s += `<text x="${x+nodeW-8}" y="${y+16}" font-size="8" font-weight="700" fill="#1a73e8" text-anchor="end">NEW</text>`;
      s += `</g>`;
    });
  });
  return { svg:s, blockH, colX, colW, NY0, STEP, nodeW };
}

const W = 2040, LM = 24;
const blockW = W - 2*LM;

// header heights
const TOP = 132;
const rcY = TOP;
const rc = renderBlock(RC, LM, rcY, blockW, {});
const rvY = rcY + rc.blockH + 70;
const rv = renderBlock(RV, LM, rvY, blockW, {});
// reserve room for the cross-cutting-gates footer (1 header + 7 note lines @14px)
const H = rvY + rv.blockH + 14 + 16 + 7*14 + 26;

let s = "";
s += `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="ttl dsc" font-family="-apple-system,Segoe UI,Roboto,sans-serif">`;
s += `<title id="ttl">onto reconstruct + review — complete artifact wiring</title>`;
s += `<desc id="dsc">Every pipeline stage of reconstruct (102-step run) and review (12-step), showing the artifact each stage consumes and produces, the actor (runtime/LLM/user), and the gate the output passes (THROW hard-block vs GRACEFUL blocked/limited terminal vs DISCLOSE/DEGRADE non-blocking).</desc>`;
s += `<defs>`;
s += `<marker id="ar" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="#5f6368"/></marker>`;
s += `<marker id="arL" markerWidth="12" markerHeight="12" refX="9" refY="3.5" orient="auto"><path d="M0,0 L9,3.5 L0,7 Z" fill="#1a73e8"/></marker>`;
s += `</defs>`;
s += `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`;

// Title + question
s += `<text x="${LM}" y="40" font-size="23" font-weight="800" fill="#202124">onto · reconstruct + review — complete artifact wiring</text>`;
s += `<text x="${LM}" y="64" font-size="13" fill="#5f6368">Judgment question: what does each stage <tspan font-weight="700">consume</tspan> → <tspan font-weight="700">produce</tspan>, and which <tspan font-weight="700">gate</tspan> does the output pass? Time flows left→right within each phase; phases flow left→right. Each *_validation is folded into its producer's gate chip.</text>`;

// Legend
let lx = LM, ly = 88;
const swatch=(fill,stroke,label,dash)=>{ let o=`<rect x="${lx}" y="${ly}" width="20" height="13" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1.4" ${dash?'stroke-dasharray="3 2"':''}/><circle cx="${lx+10}" cy="${ly+6.5}" r="3.5" fill="${stroke}"/><text x="${lx+26}" y="${ly+11}" font-size="11" fill="#3c4043">${esc(label)}</text>`; lx += 26 + label.length*6.4 + 20; return o; };
s += swatch(ACT.D.fill,ACT.D.stroke,"runtime (deterministic)");
s += swatch(ACT.L.fill,ACT.L.stroke,"LLM author");
s += swatch(ACT.U.fill,ACT.U.stroke,"host/user mediated");
// gate chips legend
const chip=(c,t,desc)=>{ const cw=t.length*5.6+12; let o=`<rect x="${lx}" y="${ly}" width="${cw}" height="13" rx="6.5" fill="${c}"/><text x="${lx+cw/2}" y="${ly+9.5}" font-size="7.8" font-weight="700" fill="#fff" text-anchor="middle">${t}</text><text x="${lx+cw+6}" y="${ly+11}" font-size="11" fill="#3c4043">${esc(desc)}</text>`; lx += cw + 6 + desc.length*6.4 + 18; return o; };
s += chip("#d93025","THROW","hard-block (run aborts)");
s += chip("#12a4af","DISCLOSE","non-blocking validation / review DEGRADE");
s += chip("#e37400","GRACEFUL","input-conditional stop → blocked/limited terminal");
// flags legend
s += `<rect x="${lx}" y="${ly}" width="20" height="13" rx="3" fill="#fdecdd" stroke="#e8710a" stroke-width="1.4" stroke-dasharray="4 2"/><text x="${lx+26}" y="${ly+11}" font-size="11" fill="#3c4043">skipped (this run)</text>`; lx += 26 + "skipped (this run)".length*6.4 + 20;
s += `<rect x="${lx}" y="${ly}" width="20" height="13" rx="3" fill="none" stroke="#1a73e8" stroke-width="2" stroke-dasharray="5 3"/><text x="${lx+26}" y="${ly+11}" font-size="11" fill="#3c4043">NEW (working tree)</text>`;

// Section A banner — reconstruct
s += `<text x="${LM}" y="${rcY-12}" font-size="15" font-weight="800" fill="#1a73e8">▏RECONSTRUCT — build an ontology seed &amp; mature it (102-step run · gate-on-fail = THROW: any invalid runtime validation aborts · input-conditional stops now GRACEFUL-terminal, not abort)</text>`;
s += rc.svg;

// maturation back-loop: continuation-decision (col 5 last) → question-frontier — drawn under the block
{
  const ci = 5;
  const x = rc.colX(ci) + rc.colW/2;
  const yBottom = rc.NY0 + (RC[ci].nodes.length-1)*rc.STEP + 46;
  const yTop = rc.NY0 + 2*rc.STEP; // question frontier is node index 3 (0-based) -> approx; loop to top of column
  const bx = rc.colX(ci) + rc.colW + 4;
  s += `<path d="M ${x} ${yBottom} C ${bx+30} ${yBottom+18}, ${bx+30} ${yTop-18}, ${x} ${yTop}" fill="none" stroke="#1a73e8" stroke-width="1.6" stroke-dasharray="5 3" marker-end="url(#arL)"/>`;
  s += `<text x="${bx+40}" y="${(yTop+yBottom)/2}" font-size="9.5" fill="#1a67d2" transform="rotate(90 ${bx+40} ${(yTop+yBottom)/2})" text-anchor="middle">re-question until convergence (else blocked)</text>`;
}

// Section B banner — review
s += `<text x="${LM}" y="${rvY-12}" font-size="15" font-weight="800" fill="#a142f4">▏REVIEW — find &amp; deliberate issues over a target/diff (12-step · gate-on-fail = DEGRADE: missing seat / barrier halts gracefully → halted_partial, not a hard abort)</text>`;
s += rv.svg;

// cross-cutting gates side note
const ny = rvY + rv.blockH + 14;
s += `<text x="${LM}" y="${ny}" font-size="11.5" font-weight="700" fill="#202124">Cross-cutting gates (wrap many stages):</text>`;
const notes = [
  "1 · assertRuntimeValidationValid — single THROW point; any runtime *_validation ≠ valid aborts reconstruct (validators return status; run.ts decides throw vs disclose).",
  "graceful · throw-census stabilization — a normal-but-unmet input-conditional stop → an honest BLOCKED terminal (record.terminal_disposition + witness-truthful graceful manifest + run-control HALTED), not a crash. Wired: site 1 (source_observation) + site 2 (source_observation_delta); other census sites still THROW.",
  "2 · terminal run-manifest validation — every RECONSTRUCT_STAGE_IDS stage must be a completed/skipped manifest step with on-disk refs (pre-handoff + post-publication).",
  "3 · source-safety ledger — visibility_tier re-derives from 4 axes; consumption_allowed needs runtime-target/explicit basis; gates what enters prompts + what value-read/answer-support may read.",
  "4 · reuse/resume provenance — authored artifact reused only if its sidecar hash matches freshly-computed digest; stale → regenerate (17 LLM stages).",
  "5 · telemetry call-graph coverage — unmapped authored-artifact name THROWs before the LLM call (Defect-1 fix); CI static guard asserts every callJsonAuthor name is mapped.",
  "review · seat-at-canonical-path + lens-completion-barrier — each unit's output must sit at its canonical seat; barrier holds downstream until lenses complete; failure DEGRADES (halted_partial), does not abort.",
];
notes.forEach((t,i)=> s += `<text x="${LM}" y="${ny+16+i*14}" font-size="10" fill="#5f6368">${esc(t)}</text>`);

s += `</svg>`;
const OUT = "development-records/diagrams/20260701-review-reconstruct-artifact-wiring.svg";
writeFileSync(OUT, s);
console.log("wrote", OUT, "W", W, "H", H);
