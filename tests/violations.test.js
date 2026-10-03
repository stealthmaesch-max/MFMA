const assert=require("node:assert/strict");
const fs=require("node:fs");
const test=require("node:test");

test("Issue Violation replaces legacy White Flag controls",()=>{
 const html=fs.readFileSync("control.html","utf8");
 assert.match(html,/Issue Violation/);
 assert.match(html,/value="warning">Infraction Warning/);
 assert.match(html,/value="review">Open Investigation/);
 assert.match(html,/id="review-disqualify"/);
 assert.match(html,/id="penalty-dialog"/);
 assert.doesNotMatch(html,/id="review-no-result"/);
 assert.doesNotMatch(html,/responsible-party|Responsible Party/);
 assert.match(html,/quick-flag-bar[\s\S]*data-violation-open/);
 assert.doesNotMatch(html,/data-(?:quick-flag|sprint-flag|flag)="white"|Issue White Flag|White Flag Review/);
});

test("infraction warning works inside or outside sessions and restores safely after ten seconds",()=>{
 const control=fs.readFileSync("control.js","utf8");
 const warning=control.match(/if\(violationType==="warning"\)\{([\s\S]*?)\n \}/)?.[1]||"";
 assert.match(warning,/activeFlag:"infraction-warning"/);
 assert.match(warning,/event\/violations/);
 assert.match(warning,/event\/activeWarning/);
 assert.match(warning,/Date\.now\(\)\+10000/);
 assert.doesNotMatch(warning,/warnings can only be issued during a live session/i);
 assert.match(control,/function scheduleWarningReturn\(\)/);
 assert.match(control,/restoredFlag=live\?"green":warning\.previousFlag\|\|"clear"/);
 assert.match(control,/state\?\.session\?\.teamNames\|\|state\?\.event\?\.teamNames/);
});

test("white begins a paused review before any disqualification decision",()=>{
 const control=fs.readFileSync("control.js","utf8");
 const review=control.match(/if\(violationType==="review"\)\{([\s\S]*?)\n \}/)?.[1]||"";
 assert.match(review,/systemState:"violation-review"/);
 assert.match(review,/activeFlag:"under-review"/);
 assert.match(review,/caseId/);
 assert.match(review,/status:"open"/);
 assert.match(review,/"session\/running":false/);
 assert.match(control,/review-resume/);
 assert.match(control,/review-disqualify/);
 assert.doesNotMatch(control,/responsible-party|Responsible party|responsible,/);
});

test("Sprint investigations pause safely and retain a penalty path",()=>{
 const control=fs.readFileSync("control.js","utf8"),display=fs.readFileSync("display.js","utf8");
 assert.match(control,/\["session-live","sprint-live","provisional","session-complete"\]/,"Sprint is an allowed investigation state");
 assert.match(control,/"event\/activeInvestigation":violation/);
 assert.match(control,/"event\/teamNames":teams\.names/);
 assert.match(control,/previousState==="sprint-live"/);
 assert.match(control,/Object\.assign\(updates,sprintTimerPatch\(\),\{"sprint\/running":false/);
 assert.match(control,/state\.event\?\.activeInvestigation\|\|state\.session\?\.violationReview/);
 assert.match(control,/"event\/activePenalty":record/);
 assert.match(control,/if\(sprint\)Object\.assign\(updates,\{"sprint\/running":Boolean\(review\.wasRunning\)/);
 assert.match(display,/state\.event\?\.activeInvestigation\|\|state\.session\?\.violationReview/);
});

test("Driver enforcement displays identify the cited team and allegation",()=>{
 const control=fs.readFileSync("control.js","utf8"),display=fs.readFileSync("display.js","utf8");
 assert.match(control,/type:"warning",team:dq,teamName,reason/);
 assert.match(control,/type:"review",status:"open",caseId,team:dq,teamName,reason/);
 assert.match(display,/function enforcementCitation/);
 assert.match(display,/CITED FOR \$\{reason\}/);
 assert.match(display,/STEWARD INVESTIGATING INCIDENT/);
 assert.match(display,/\$\{team\} • DISQUALIFICATION/);
 assert.match(display,/\$\{team\} • CITED FOR \$\{reason\}/);
 assert.match(display,/new Set\(\["infraction-warning","under-review","disqualification"\]\)/,"MRA branding covers every enforcement display");
});

test("post-session White remains available only before the proceed order",()=>{
 const control=fs.readFileSync("control.js","utf8"),html=fs.readFileSync("control.html","utf8");
 assert.match(control,/new Set\(\["session-live","sprint-live","provisional","session-complete"\]\)/);
 assert.match(control,/systemState:"next-session-staging",activeFlag:"proceed-to-start"/);
 assert.match(control,/state\?\.systemState!=="next-session-staging"/);
 assert.match(html,/Team Stopped Behind Line — Start Countdown/);
 assert.match(html,/Swap Next Find \/ Hide Teams/);
 assert.match(control,/function swapNextRoles\(\)/);
 assert.match(control,/nextRolesSwapped\?1:0/);
 assert.match(control,/Array\.from\(\{length:5\}/);
 assert.match(control,/systemState:"next-session-countdown",activeFlag:"proceed-to-start",session/);
 assert.match(control,/phase:"countdown"[\s\S]*countdownEndsAt:Date\.now\(\)\+10000/);
});

test("disqualification terminates through the official outcome workflow",()=>{
 const control=fs.readFileSync("control.js","utf8"),display=fs.readFileSync("display.js","utf8");
 assert.match(control,/function resolvePenaltyForm/);
 assert.match(control,/state\?\.systemState!=="violation-review"/);
 assert.match(control,/decision==="disqualification"\?"disqualification":"checkered"/);
 assert.match(control,/"session\/running":false/);
 assert.match(control,/"session\/terminationType":decision/);
 assert.match(control,/type:"decision",status:"decided"/);
 assert.match(control,/review\.violationId\|\|`v\$\{Date\.now\(\)\}`/);
 assert.match(control,/closed-no-action/);
 assert.match(control,/PENALTY — DISQUALIFICATION/);
 assert.match(control,/Penalty Issued — Disqualification/);
 assert.match(display,/"PENALTY ISSUED"/);
 assert.match(display,/DISQUALIFICATION •/);
});

test("infraction warning has the physical white and folded-yellow display",async()=>{
 const {signals}=await import(new URL("../signals.js",`file://${__filename}`));
 assert.equal(signals["infraction-warning"].className,"flag-infraction-warning");
 assert.match(signals["infraction-warning"].instruction,/WHITE \+ FOLDED YELLOW/);
 assert.equal(signals["under-review"].label,"MRA STEWARD");
 assert.equal(signals["under-review"].instruction,"STEWARD INVESTIGATING INCIDENT");
 assert.equal(signals.disqualification.label,"PENALTY ISSUED");
 assert.equal(signals.disqualification.instruction,"DISQUALIFICATION • RETURN TO STARTING ZONE");
 const css=fs.readFileSync("styles.css","utf8");
 assert.match(css,/\.violation,\.flag-infraction-warning/);
});
