const assert=require("node:assert/strict");
const fs=require("node:fs");
const test=require("node:test");

test("Issue Violation replaces legacy White Flag controls",()=>{
 const html=fs.readFileSync("control.html","utf8");
 assert.match(html,/Issue Violation/);
 assert.match(html,/value="warning">Infraction Warning/);
 assert.match(html,/value="review">Begin Review \/ Investigation/);
 assert.match(html,/id="review-disqualify"/);
 assert.doesNotMatch(html,/responsible-party|Responsible Party/);
 assert.match(html,/quick-flag-bar[\s\S]*data-violation-open/);
 assert.doesNotMatch(html,/data-(?:quick-flag|sprint-flag|flag)="white"|Issue White Flag|White Flag Review/);
});

test("infraction warning records enforcement and returns to green after ten seconds",()=>{
 const control=fs.readFileSync("control.js","utf8");
 const warning=control.match(/if\(violationType==="warning"\)\{([\s\S]*?)\n \}/)?.[1]||"";
 assert.match(warning,/activeFlag:"infraction-warning"/);
 assert.match(warning,/event\/violations/);
 assert.match(warning,/session\/violationReview/);
 assert.match(warning,/Date\.now\(\)\+10000/);
 assert.doesNotMatch(warning,/session\/running|systemState:/);
 assert.match(control,/function scheduleWarningReturn\(\)/);
 assert.match(control,/activeFlag:"green"/);
});

test("white begins a paused review before any disqualification decision",()=>{
 const control=fs.readFileSync("control.js","utf8");
 const review=control.match(/if\(violationType==="review"\)\{([\s\S]*?)\n \}/)?.[1]||"";
 assert.match(review,/systemState:"violation-review"/);
 assert.match(review,/activeFlag:"under-review"/);
 assert.match(review,/"session\/running":false/);
 assert.match(control,/review-resume/);
 assert.match(control,/review-disqualify/);
 assert.doesNotMatch(control,/responsible-party|Responsible party|responsible,/);
});

test("post-session White remains available only before the proceed order",()=>{
 const control=fs.readFileSync("control.js","utf8"),html=fs.readFileSync("control.html","utf8");
 assert.match(control,/new Set\(\["session-live","provisional","session-complete"\]\)/);
 assert.match(control,/systemState:"next-session-staging",activeFlag:"proceed-to-start"/);
 assert.match(control,/state\?\.systemState!=="next-session-staging"/);
 assert.match(html,/Team Stopped Behind Line — Start Countdown/);
 assert.match(control,/Array\.from\(\{length:2\}/);
 assert.doesNotMatch(control,/Array\.from\(\{length:5\}/);
});

test("disqualification terminates through the official outcome workflow",()=>{
 const control=fs.readFileSync("control.js","utf8");
 assert.match(control,/activeFlag:nextState==="standby"\?"clear":"disqualification"/);
 assert.match(control,/"session\/running":false/);
 assert.match(control,/"session\/terminationType":"disqualification"/);
 assert.match(control,/type:"disqualification"/);
});

test("infraction warning has the physical white and folded-yellow display",async()=>{
 const {signals}=await import(new URL("../signals.js",`file://${__filename}`));
 assert.equal(signals["infraction-warning"].className,"flag-infraction-warning");
 assert.match(signals["infraction-warning"].instruction,/WHITE \+ FOLDED YELLOW/);
 assert.equal(signals["under-review"].label,"UNDER REVIEW");
 assert.match(signals["under-review"].instruction,/RETURN TO STARTING ZONE/);
 const css=fs.readFileSync("styles.css","utf8");
 assert.match(css,/\.violation,\.flag-infraction-warning/);
});
