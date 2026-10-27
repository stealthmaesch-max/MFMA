const assert=require("node:assert/strict");
const fs=require("node:fs");
const test=require("node:test");

test("White opens a recorded investigation before any penalty decision",()=>{
 const html=fs.readFileSync("control.html","utf8"),control=fs.readFileSync("control.js","utf8");
 assert.match(html,/id="white-review-title">Open Investigation/);
 assert.match(html,/does not decide guilt or impose a penalty/);
 assert.match(html,/id="penalty-dialog"/);
 const review=control.slice(control.indexOf("async function resolveWhiteForm"),control.indexOf("function openPenaltyDialog"));
 assert.match(review,/systemState:"violation-review"/);assert.match(review,/activeFlag:"under-review"/);
 assert.match(review,/status:"open"/);assert.match(review,/caseId/);assert.match(review,/"session\/running":false/);
 assert.doesNotMatch(review,/decision:"disqualification"|activeFlag:"disqualification"/);
});

test("investigation decisions cover the Sporting Code penalty menu",()=>{
 const html=fs.readFileSync("control.html","utf8"),control=fs.readFileSync("control.js","utf8");
 for(const value of ["warning","time-remedy","restart","no-result","disqualification","event-disqualification","point-adjustment","participation-restriction","removal-event","removal-mfma"])assert.match(html,new RegExp(`value="${value}"`));
 assert.match(control,/function resolvePenaltyForm/);assert.match(control,/applyDisqualificationWin\(current,team,detail\)/);
 assert.match(control,/closed-no-action/);assert.match(control,/event\/activePenalty/);
});

test("investigation is available in sessions Sprint and post-session but locks after Proceed",()=>{
 const control=fs.readFileSync("control.js","utf8"),html=fs.readFileSync("control.html","utf8");
 assert.match(control,/\["session-live","sprint-live","provisional","session-complete"\]/);
 assert.match(control,/\["next-session-staging","next-session-countdown"\]/);
 assert.match(html,/data-white-open/);assert.match(html,/id="post-white"[^>]*>Open Investigation/);
});

test("Driver enforcement display distinguishes investigation from a decided disqualification",()=>{
 const display=fs.readFileSync("display.js","utf8"),signals=fs.readFileSync("signals.js","utf8");
 assert.match(display,/currentEnforcementRecord/);assert.match(display,/CITED FOR \$\{reason\}/);
 assert.match(display,/mode==="violation-review"\?"MRA STEWARD":"PENALTY ISSUED"/);
 assert.match(display,/\$\{team\} • DISQUALIFICATION/);
 assert.match(signals,/STEWARD INVESTIGATING INCIDENT/);
});

test("only the MRA console creates investigations and penalties",()=>{
 const display=fs.readFileSync("display.js","utf8"),fan=fs.readFileSync("fan.js","utf8"),operations=fs.readFileSync("operations.js","utf8"),championship=fs.readFileSync("championship.js","utf8");
 for(const publicCode of [display,fan,operations,championship])assert.doesNotMatch(publicCode,/activeInvestigation\s*[:=]|activePenalty\s*[:=]|resolvePenaltyForm|applyDisqualificationWin/);
});
