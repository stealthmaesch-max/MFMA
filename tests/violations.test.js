const assert=require("node:assert/strict");
const fs=require("node:fs");
const test=require("node:test");

test("Incident Noted remains separate from the White Flag disqualification procedure",()=>{
 const html=fs.readFileSync("control.html","utf8"),control=fs.readFileSync("control.js","utf8");
 assert.match(html,/data-steward-notice-open/);assert.match(html,/data-white-open/);assert.match(html,/id="white-review-title">Issue White Flag/);
 assert.match(html,/White immediately disqualifies the selected team/);assert.match(html,/id="white-outcome"/);assert.match(html,/Issue White Flag — Disqualify/);
 assert.doesNotMatch(html,/Open Investigation|Open Penalty Decision|id="penalty-dialog"/);
 assert.match(control,/document\.querySelectorAll\("\[data-white-open\]"\)/);assert.match(control,/document\.querySelectorAll\("\[data-steward-notice-open\]"\)/);
});

test("White immediately terminates the session and records a disqualification",()=>{
 const control=fs.readFileSync("control.js","utf8"),white=control.slice(control.indexOf("async function resolveWhiteForm"),control.indexOf("async function finalizeResult"));
 assert.match(white,/systemState:"white-termination"/);assert.match(white,/activeFlag:"disqualification"/);assert.match(white,/decision:"disqualification"/);
 assert.match(white,/"session\/running":false/);assert.match(white,/"session\/flag":"disqualification"/);assert.match(white,/All competitors return to the Starting Zone/);
 assert.doesNotMatch(white,/systemState:"violation-review"|activeFlag:"under-review"|status:"open"/);
});

test("White supplies the rulebook result and restart choices",()=>{
 const html=fs.readFileSync("control.html","utf8"),control=fs.readFileSync("control.js","utf8");
 for(const value of ["award-opponent","restart","no-result","preserve"])assert.match(html,new RegExp(`value="${value}"`));
 assert.match(control,/outcome==="award-opponent"\?opponent/);assert.match(control,/outcome==="preserve"\?state\.session\.provisionalWinner/);
 assert.match(control,/outcome==="restart"/);assert.match(control,/outcome==="no-result"/);assert.match(control,/applyDisqualificationWin\(current,dq,detail\)/);
 assert.match(html,/id="termination-restart"/);assert.match(html,/id="termination-standby"/);
});

test("White is available live and post-session but locks after Proceed",()=>{
 const control=fs.readFileSync("control.js","utf8"),html=fs.readFileSync("control.html","utf8");
 assert.match(control,/\["session-live","provisional","session-complete"\]/);assert.match(control,/\["next-session-staging","next-session-countdown"\]/);
 assert.match(html,/data-white-open/);assert.match(html,/id="post-white"[^>]*>Issue White Flag/);
});

test("Driver enforcement display identifies the disqualified team and allegation",()=>{
 const display=fs.readFileSync("display.js","utf8");
 assert.match(display,/currentEnforcementRecord/);assert.match(display,/CITED FOR \$\{reason\}/);assert.match(display,/\$\{team\} • DISQUALIFICATION/);
 assert.match(display,/mode==="white-termination"/);assert.match(display,/"PENALTY ISSUED"/);
});

test("legacy warning and investigation states remain displayable but cannot be newly issued",async()=>{
 const {signals}=await import(new URL("../signals.js",`file://${__filename}`)),control=fs.readFileSync("control.js","utf8"),css=fs.readFileSync("styles.css","utf8");
 assert.equal(signals["infraction-warning"].className,"flag-infraction-warning");assert.equal(signals["under-review"].label,"MRA STEWARD");assert.equal(signals.disqualification.label,"PENALTY ISSUED");
 assert.match(css,/\.violation,\.flag-infraction-warning/);assert.doesNotMatch(control,/activeFlag:"infraction-warning"|activeFlag:"under-review"/);
});
