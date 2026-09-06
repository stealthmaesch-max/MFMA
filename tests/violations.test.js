const assert=require("node:assert/strict");
const fs=require("node:fs");
const test=require("node:test");

test("Issue Violation replaces legacy White Flag controls",()=>{
 const html=fs.readFileSync("control.html","utf8");
 assert.match(html,/Issue Violation/);
 assert.match(html,/value="warning">Infraction Warning/);
 assert.match(html,/value="disqualification">Disqualification/);
 assert.doesNotMatch(html,/data-(?:quick-flag|sprint-flag|flag)="white"|Issue White Flag|White Flag Review/);
});

test("infraction warning records enforcement without stopping the session",()=>{
 const control=fs.readFileSync("control.js","utf8");
 const warning=control.match(/if\(violationType==="warning"\)\{([\s\S]*?)\n \}/)?.[1]||"";
 assert.match(warning,/activeFlag:"infraction-warning"/);
 assert.match(warning,/event\/violations/);
 assert.match(warning,/session\/violationReview/);
 assert.doesNotMatch(warning,/session\/running|systemState:/);
});

test("disqualification terminates through the official outcome workflow",()=>{
 const control=fs.readFileSync("control.js","utf8");
 assert.match(control,/activeFlag:nextState==="standby"\?"clear":"disqualification"/);
 assert.match(control,/"session\/running":false/);
 assert.match(control,/"session\/terminationType":"white"/);
 assert.match(control,/type:"disqualification"/);
});

test("infraction warning has the physical white and folded-yellow display",async()=>{
 const {signals}=await import(new URL("../signals.js",`file://${__filename}`));
 assert.equal(signals["infraction-warning"].className,"flag-infraction-warning");
 assert.match(signals["infraction-warning"].instruction,/WHITE \+ FOLDED YELLOW/);
 const css=fs.readFileSync("styles.css","utf8");
 assert.match(css,/\.violation,\.flag-infraction-warning/);
});
