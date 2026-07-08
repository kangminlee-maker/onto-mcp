import { writeFileSync } from "node:fs";

// status: full | partial | pending | audit | deferred ; mark: slice21 | next | null
const COLS = [
  { title: "Cross-cutting", sub: "run control + registry", nodes: [
    ["Run Control","reconstruct-run-control",1,5,4,"partial",null],
    ["Registry Verification","registry-verification-evidence",7,8,1,"partial",null],
  ]},
  { title: "1 · Source & Profile", sub: "observe / lineage / safety", nodes: [
    ["Target Material Profile","target-material-profile",0,6,6,"deferred",null],
    ["Source Safety Ledger","source-safety-ledger",0,5,5,"deferred",null],
    ["Source Observation Delta","source-observation-delta",4,5,1,"partial",null],
    ["Source Obs Re-entry","source-observation-reentry",4,4,0,"full",null],
    ["Source Obs Lineage Index","source-observation-lineage-index",0,7,7,"deferred",null],
    ["Source Scout Pack","source-scout-pack",0,5,5,"deferred",null],
    ["Scout Pack · Pre-seed","source-scout-pack-pre-seed",0,5,5,"deferred",null],
    ["Scout Pack · Post-matur.","source-scout-pack-post-maturation",0,5,5,"deferred",null],
  ]},
  { title: "2 · Purpose", sub: "candidates / confirm", nodes: [
    ["Source Purpose Candidates","source-purpose-candidates",0,10,10,"pending",null],
    ["Purpose Confirmation","purpose-confirmation",3,5,2,"partial",null],
  ]},
  { title: "3 · Seed Authoring", sub: "disposition / seed / CQ", nodes: [
    ["Candidate Disposition","candidate-disposition",4,9,5,"partial",null],
    ["Material Admission Ledger","material-admission-ledger",6,7,1,"partial",null],
    ["Seed Authoring Readiness","seed-authoring-readiness",0,8,8,"deferred",null],
    ["Ontology Seed","ontology-seed",0,13,13,"pending",null],
    ["Claim Realization Map","claim-realization-map",3,3,0,"full",null],
    ["Competency Questions","competency-questions",0,23,23,"pending",null],
    ["Competency Q Assessment","competency-question-assessment",3,5,2,"partial",null],
  ]},
  { title: "4 · Baseline & Matrix", sub: "seed the maturation loop", nodes: [
    ["Maturation Baseline","maturation-baseline",3,6,3,"partial",null],
    ["Baseline Actionab. Matrix","baseline-actionability-matrix",4,6,2,"partial",null],
    ["Actionability Matrix","actionability-matrix",3,7,4,"partial",null],
  ]},
  { title: "5 · Maturation Loop", sub: "ask → support → expand", nodes: [
    ["Question Frontier","maturation-question-frontier",2,6,4,"partial",null],
    ["Closure Frontier","maturation-closure-frontier",0,10,10,"pending",null],
    ["Authority Response","maturation-authority-response",0,5,5,"audit",null],
    ["Answer Support Ledger","answer-support-ledger",4,9,5,"partial","slice21"],
    ["Answer Support Judgment","answer-support-judgment",4,4,0,"full",null],
    ["Answer Claims","maturation-answer-claims",2,5,3,"partial",null],
    ["Ontology Expansion","ontology-expansion",2,4,2,"partial",null],
    ["Convergence Ledger","maturation-convergence-ledger",1,7,6,"partial",null],
    ["Continuation Decision","maturation-continuation-decision",0,9,9,"pending","next"],
  ]},
  { title: "6 · Actionable & Terminal", sub: "project / handoff", nodes: [
    ["Actionable Ontology","actionable-ontology",4,7,3,"partial",null],
    ["Claim Projection","claim-projection",0,9,9,"pending",null],
    ["Handoff Decision","handoff-decision",2,8,6,"partial",null],
    ["Pre-handoff Run Manifest","pre-handoff-run-manifest",0,27,27,"pending",null],
    ["Failure Classification","failure-classification",0,5,5,"audit",null],
  ]},
];

const C = {
  full:    { fill:"#e6f4ea", stroke:"#34a853", bar:"#34a853" },
  partial: { fill:"#fff8e1", stroke:"#f9ab00", bar:"#f9ab00" },
  pending: { fill:"#fdecdd", stroke:"#e8710a", bar:"#e8710a" },
  audit:   { fill:"#f1f3f4", stroke:"#9aa0a6", bar:"#9aa0a6" },
  deferred:{ fill:"#eceff1", stroke:"#b0bec5", bar:"#cfd8dc" },
};
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

const W = 1900;
const LM = 20, NCOLS = COLS.length;
// wider gap before the terminal column reserves a clear channel for the re-question loop arrow
const GAPS = [8,8,8,8,8,56]; // gap after col i
const colW = Math.floor((W - 2*LM - GAPS.reduce((a,b)=>a+b,0)) / NCOLS); // ~252
const nodeW = colW - 12;
const LEFTS = [];
for (let i=0;i<NCOLS;i++) LEFTS[i] = i===0 ? LM : LEFTS[i-1] + colW + GAPS[i-1];
const colX = i => LEFTS[i];
const nodeX = i => colX(i) + 6;
const HEADY = 150, HEADH = 34;
const NY0 = 200, NH = 74, NGAP = 12, STEP = NH + NGAP;
const maxN = Math.max(...COLS.map(c=>c.nodes.length));
const H = NY0 + maxN*STEP + 60;

let s = "";
s += `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="ttl dsc" font-family="-apple-system,Segoe UI,Roboto,sans-serif">`;
s += `<title id="ttl">Reconstruct validator pipeline — obligation coverage by artifact stage</title>`;
s += `<desc id="dsc">36 active reconstruct validators grouped into pipeline stages by the authored artifact each validates, color-coded by G(a) obligation-coverage status (66 of 272 recorded). Slice 21 (answer-support-ledger 4/9) highlighted; next = maturation-continuation-decision.</desc>`;
s += `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`;
// defs: arrow + hatch
s += `<defs>`;
s += `<marker id="ar" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="#5f6368"/></marker>`;
s += `<marker id="arL" markerWidth="12" markerHeight="12" refX="9" refY="3.5" orient="auto"><path d="M0,0 L9,3.5 L0,7 Z" fill="#1a73e8"/></marker>`;
s += `<pattern id="hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#eceff1"/><line x1="0" y1="0" x2="0" y2="6" stroke="#cfd8dc" stroke-width="2"/></pattern>`;
s += `</defs>`;

// Title
s += `<text x="${LM}" y="42" font-size="24" font-weight="700" fill="#202124">Reconstruct Validator Pipeline — Obligation Coverage by Artifact Stage</text>`;
s += `<text x="${LM}" y="68" font-size="13.5" fill="#5f6368">How the authored-artifact chain flows through its 36 active validators, and where G(a) instrumentation stands — 66 / 272 obligation pairs recorded (24.3%). Slice 21 just landed; arrows = stage handoff.</text>`;

// Legend
const leg = [
  ["full","Fully recorded (rec = total)"],
  ["partial","Partially recorded"],
  ["pending","Pending Track A (queued)"],
  ["audit","Audit-only (0 recordable)"],
  ["deferred","Deferred · reuse-hashed (not Track A)"],
];
let lx = LM, ly = 92;
for (const [k,label] of leg){
  s += `<rect x="${lx}" y="${ly}" width="22" height="13" rx="3" fill="${C[k].fill}" stroke="${C[k].stroke}" stroke-width="1.4" ${k==="deferred"?'stroke-dasharray="3 2"':''}/>`;
  s += `<text x="${lx+28}" y="${ly+11}" font-size="11.5" fill="#3c4043">${esc(label)}</text>`;
  lx += 34 + label.length*6.6 + 18;
}
// mark legend
s += `<rect x="${lx}" y="${ly}" width="22" height="13" rx="3" fill="#ffffff" stroke="#1a73e8" stroke-width="2.5"/>`;
s += `<text x="${lx+28}" y="${ly+11}" font-size="11.5" fill="#3c4043">★ slice 21 landed</text>`;
lx += 34 + "★ slice 21 landed".length*6.6 + 18;
s += `<rect x="${lx}" y="${ly}" width="22" height="13" rx="3" fill="#ffffff" stroke="#1a73e8" stroke-width="2" stroke-dasharray="4 2"/>`;
s += `<text x="${lx+28}" y="${ly+11}" font-size="11.5" fill="#3c4043">▶ next slice</text>`;

// stage flow spine (between pipeline cols 1..6 header)
for (let i=1;i<NCOLS-1;i++){
  const x1 = colX(i)+colW-2, x2 = colX(i+1)+2, y = HEADY+HEADH/2;
  s += `<line x1="${x1}" y1="${y}" x2="${x2-3}" y2="${y}" stroke="#5f6368" stroke-width="2" marker-end="url(#ar)"/>`;
}

// columns + headers + nodes
COLS.forEach((col, i) => {
  // governance col gets a distinct dashed band
  const gov = i===0;
  s += `<rect x="${colX(i)}" y="${HEADY}" width="${colW}" height="${HEADH}" rx="6" fill="${gov?'#e8f0fe':'#f1f3f4'}" stroke="${gov?'#aecbfa':'#dadce0'}" ${gov?'stroke-dasharray="4 3"':''}/>`;
  s += `<text x="${colX(i)+colW/2}" y="${HEADY+15}" font-size="12.5" font-weight="700" fill="#202124" text-anchor="middle">${esc(col.title)}</text>`;
  s += `<text x="${colX(i)+colW/2}" y="${HEADY+28}" font-size="10" fill="#5f6368" text-anchor="middle">${esc(col.sub)}</text>`;
  if (gov){
    // bracket showing cross-cutting
    s += `<text x="${colX(i)+colW/2}" y="${H-30}" font-size="10.5" fill="#1a67d2" text-anchor="middle" font-style="italic">gates every stage</text>`;
  }
  col.nodes.forEach((n, j) => {
    const [name, stem, rec, total, park, status, mark] = n;
    const x = nodeX(i), y = NY0 + j*STEP;
    const col0 = C[status];
    const fillv = status==="deferred" ? "url(#hatch)" : col0.fill;
    s += `<g>`;
    s += `<rect x="${x}" y="${y}" width="${nodeW}" height="${NH}" rx="7" fill="${fillv}" stroke="${col0.stroke}" stroke-width="${status==='deferred'?1.2:1.5}" ${status==='deferred'?'stroke-dasharray="4 2"':''}/>`;
    // mark highlight
    if (mark==="slice21") s += `<rect x="${x-2}" y="${y-2}" width="${nodeW+4}" height="${NH+4}" rx="9" fill="none" stroke="#1a73e8" stroke-width="3"/>`;
    if (mark==="next") s += `<rect x="${x-2}" y="${y-2}" width="${nodeW+4}" height="${NH+4}" rx="9" fill="none" stroke="#1a73e8" stroke-width="2" stroke-dasharray="5 3"/>`;
    s += `<text x="${x+11}" y="${y+19}" font-size="12.5" font-weight="700" fill="#202124">${esc(name)}</text>`;
    s += `<text x="${x+11}" y="${y+35}" font-size="9" fill="#5f6368" font-family="ui-monospace,Menlo,monospace">▸ ${esc(stem)}</text>`;
    // progress bar
    const barW = 110, bx = x+11, by = y+47;
    s += `<rect x="${bx}" y="${by}" width="${barW}" height="7" rx="3.5" fill="#ffffff" stroke="#dadce0" stroke-width="0.8"/>`;
    if (total>0 && rec>0) s += `<rect x="${bx}" y="${by}" width="${Math.max(4,Math.round(barW*rec/total))}" height="7" rx="3.5" fill="${col0.bar}"/>`;
    s += `<text x="${bx+barW+8}" y="${by+7}" font-size="10.5" font-weight="700" fill="#202124">${rec}/${total}</text>`;
    s += `<text x="${x+nodeW-10}" y="${y+19}" font-size="9" fill="#80868b" text-anchor="end">park ${park}</text>`;
    if (mark==="slice21") s += `<text x="${x+nodeW-10}" y="${y+NH-7}" font-size="9.5" font-weight="700" fill="#1a73e8" text-anchor="end">★ slice 21</text>`;
    if (mark==="next") s += `<text x="${x+nodeW-10}" y="${y+NH-7}" font-size="9.5" font-weight="700" fill="#1a73e8" text-anchor="end">▶ NEXT</text>`;
    s += `</g>`;
  });
});

// maturation re-question back-loop (continuation-decision -> question-frontier), drawn in the
// reserved channel between the maturation column and the terminal column so it overlaps neither
const mc = 5;
const sx = nodeX(mc) + nodeW;
const bx = colX(mc) + colW + 30;
const lastY = NY0 + (COLS[mc].nodes.length-1)*STEP + NH/2;
const firstY = NY0 + 22;
s += `<path d="M ${sx} ${lastY} C ${bx} ${lastY}, ${bx} ${firstY}, ${sx} ${firstY}" fill="none" stroke="#1a73e8" stroke-width="1.6" stroke-dasharray="5 3" marker-end="url(#arL)"/>`;
s += `<text x="${bx+11}" y="${(firstY+lastY)/2}" font-size="10" fill="#1a67d2" transform="rotate(90 ${bx+11} ${(firstY+lastY)/2})" text-anchor="middle">re-question until convergence</text>`;

// footer counts
s += `<text x="${LM}" y="${H-14}" font-size="11" fill="#5f6368">Active validators: 36 · recorded 66 · parked 206 · total obligation pairs 272.  Deferred (reuse-hashed, not Track A): 7 validators.  Audit-only (structural, 0 recordable): 2.</text>`;

s += `</svg>`;
writeFileSync("development-records/diagrams/20260623-reconstruct-validator-pipeline-coverage.svg", s);
console.log("wrote SVG, height", H, "colW", colW);
