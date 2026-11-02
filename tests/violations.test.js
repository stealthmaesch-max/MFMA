const assert=require("node:assert/strict");
const fs=require("node:fs");
const test=require("node:test");

const model=import("../enforcement-model.js");
function eventState(flag="green"){return {systemState:"session-live",activeFlag:flag,event:{name:"Test",scores:{a:0,b:0},teamNames:{a:"Monarch",b:"Parakeet"},circuit:{roles:{}}},session:{number:1,phase:"finding",running:true,flag,remainingMs:10000,lastTickAt:1000,teamNames:{a:"Monarch",b:"Parakeet"},pursuitTeam:"a",evadingTeam:"b",pursuitVehicleIds:["ranger"],setup:{vehicleIds:["ranger","shelly"]}}}}
async function openCase(root=eventState()){return (await model).openInvestigation(root,{id:"v1",caseId:"MRA-1",team:"a",reason:"Reported contact",official:"steward"},2000)}
const decision=(name,extra={})=>({caseId:"v1",decision:name,rationale:"Reviewed the report and evidence.",official:"steward",...extra});

test("White opens a recorded investigation before any penalty decision",async()=>{
 const html=fs.readFileSync("control.html","utf8"),control=fs.readFileSync("control.js","utf8");
 assert.match(html,/id="white-review-title">Open Investigation/);
 assert.match(html,/does not decide guilt or impose a penalty/);
 assert.match(html,/id="penalty-dialog"/);
 const review=control.slice(control.indexOf("async function resolveWhiteForm"),control.indexOf("function openPenaltyDialog"));
 assert.match(review,/runTransaction/);assert.match(review,/openInvestigation/);
 const opened=await openCase();assert.equal(opened.systemState,"violation-review");assert.equal(opened.activeFlag,"under-review");assert.equal(opened.event.activeInvestigation.status,"open");assert.equal(opened.session.running,false);assert.equal(opened.session.remainingMs,9000);assert.equal(opened.event.activePenalty,undefined);assert.deepEqual(opened.event.scores,{a:0,b:0});
 assert.doesNotMatch(review,/decision:"disqualification"|activeFlag:"disqualification"/);
});

test("investigation decisions cover the Sporting Code penalty menu",async()=>{
 const html=fs.readFileSync("control.html","utf8"),control=fs.readFileSync("control.js","utf8");
 for(const value of ["warning","time-remedy","restart","no-result","disqualification","event-disqualification","point-adjustment","participation-restriction","removal-event","removal-mfma"])assert.match(html,new RegExp(`value="${value}"`));
 assert.match(control,/function resolvePenaltyForm/);assert.match(control,/runTransaction\(stateRef,current=>decideInvestigation/);
 for(const value of ["no-action","warning","time-remedy","restart","no-result","disqualification","event-disqualification","point-adjustment","participation-restriction","removal-event","removal-mfma"])assert((await model).DECISION_LABELS[value]);
});

test("investigation is available in sessions Sprint and post-session but locks after Proceed",()=>{
 const control=fs.readFileSync("control.js","utf8"),html=fs.readFileSync("control.html","utf8");
 assert.match(control,/\["session-live","sprint-live","provisional","session-complete"\]/);
 assert.match(control,/\["next-session-staging","next-session-countdown"\]/);
 assert.match(html,/data-white-open/);assert.match(html,/id="post-white"[^>]*>Open Investigation/);
});

test("Incident Noted replaces the retired Infraction Warning while White remains investigation-only",()=>{
 const control=fs.readFileSync("control.js","utf8"),html=fs.readFileSync("control.html","utf8"),display=fs.readFileSync("display.js","utf8"),signals=fs.readFileSync("signals.js","utf8");
 assert.match(html,/data-steward-notice-open/);assert.match(html,/id="steward-notice-dialog"/);assert.match(control,/function issueStewardNotice/);
 assert.doesNotMatch(`${html}\n${control}\n${display}\n${signals}`,/Infraction Warning|infraction-warning|activeInfractionWarning|issueInfractionWarning/);
 assert.match(html,/data-white-open/);assert.match(html,/Display White — Open Investigation/);assert.match(signals,/"under-review":\{className:"flag-white flag-under-review"/);
});

test("Driver enforcement display distinguishes investigation from a decided disqualification",()=>{
 const display=fs.readFileSync("display.js","utf8"),signals=fs.readFileSync("signals.js","utf8");
 assert.match(display,/currentEnforcementRecord/);assert.match(display,/"RATIONALE":"ALLEGATION"/);assert.doesNotMatch(display,/CITED FOR/);
 assert.match(display,/mode==="violation-review"\?"UNDER REVIEW":"DISQUALIFIED"/);
 assert.match(display,/NO PENALTY DECIDED/);assert.match(display,/renderDriverCase/);
 assert.match(signals,/STEWARD INVESTIGATING INCIDENT/);
});

test("only the MRA console creates investigations and penalties",()=>{
 const display=fs.readFileSync("display.js","utf8"),fan=fs.readFileSync("fan.js","utf8"),operations=fs.readFileSync("operations.js","utf8"),championship=fs.readFileSync("championship.js","utf8");
 for(const publicCode of [display,fan,operations,championship])assert.doesNotMatch(publicCode,/activeInvestigation\s*[:=]|activePenalty\s*[:=]|resolvePenaltyForm|applyDisqualificationWin/);
});

test("No Action and Warning restore Yellow without spending review time or ending the session",async()=>{
 const m=await model;for(const value of ["no-action","warning"]){const opened=await openCase(eventState("yellow")),next=m.decideInvestigation(opened,decision(value),5000);assert.equal(next.systemState,"session-live");assert.equal(next.activeFlag,"yellow");assert.equal(next.session.flag,"yellow");assert.equal(next.session.running,true);assert.equal(next.session.remainingMs,9500);assert.equal(next.session.lastTickAt,5000);assert.equal(next.event.activeInvestigation,null);assert.equal(next.event.violations.v1.rationale,decision(value).rationale);assert.equal(next.event.violations.v1.reason,"Reported contact");assert.deepEqual(next.event.scores,{a:0,b:0});assert.equal(next.session.provisionalWinner,undefined);assert.equal(next.event.decisionNotice.expiresAt,10000)}
});
test("review closure preserves Safety Car and later Red instructions",async()=>{
 const m=await model,root=eventState("safety-car");root.session.running=false;const opened=await openCase(root);let next=m.decideInvestigation(opened,decision("no-action"),5000);assert.equal(next.activeFlag,"safety-car");assert.equal(next.session.running,false);next=m.decideInvestigation({...opened,activeFlag:"red"},decision("warning"),5000);assert.equal(next.activeFlag,"red");assert.equal(next.session.flag,"red");assert.equal(next.session.running,false);
});
test("post-session warnings preserve the official winner and score",async()=>{
 const m=await model,root=eventState("checkered");root.systemState="session-complete";root.session.running=false;root.session.resultOfficial=true;root.session.provisionalWinner="b";root.event.scores={a:0,b:1};const next=m.decideInvestigation(await openCase(root),decision("warning"),5000);assert.equal(next.systemState,"session-complete");assert.equal(next.session.resultOfficial,true);assert.equal(next.session.provisionalWinner,"b");assert.deepEqual(next.event.scores,{a:0,b:1});
});
test("decisions require a separate rationale, valid outcome, and the current case",async()=>{
 const m=await model,opened=await openCase();assert.throws(()=>m.decideInvestigation(opened,decision("warning",{rationale:" "})),/rationale/);assert.throws(()=>m.decideInvestigation(opened,decision("__proto__")),/Choose a decision/);assert.throws(()=>m.decideInvestigation(opened,decision("warning",{caseId:"another"})),/changed/);assert.throws(()=>m.openInvestigation(opened,{id:"v2",team:"a",reason:"Another"}),/cannot/);
});
test("time remedies validate the benefiting team and preserve the live session",async()=>{
 const m=await model,opened=await openCase(),remedy={benefitingTeam:"b",remedy:"increase-find",seconds:15};const next=m.decideInvestigation(opened,decision("time-remedy",{timeRemedy:remedy}),5000);assert.equal(next.systemState,"session-live");assert.equal(next.event.pendingAdjustment.seconds,15);assert.equal(next.event.pendingAdjustment.againstTeam,"a");assert.throws(()=>m.decideInvestigation(opened,decision("time-remedy",{timeRemedy:{...remedy,benefitingTeam:"a"}})),/other team/);assert.throws(()=>m.decideInvestigation(opened,decision("no-action",{timeRemedy:remedy})),/cannot include/);
});
test("a disqualification awards the regular-session win once, with an audited decision",async()=>{
 const m=await model,next=m.decideInvestigation(await openCase(),decision("disqualification"),5000);assert.equal(next.systemState,"white-termination");assert.equal(next.event.scores.b,1);assert.equal(next.event.sessionResults.length,1);assert.equal(next.event.sessionResults[0].entrants.find(e=>e.side==="a").outcome,"dq");assert.equal(next.event.activePenalty.decidedBy,"steward");assert.throws(()=>m.decideInvestigation(next,decision("disqualification"),6000),/resolved/);
});
test("Sprint decisions cannot rewrite a retained regular session",async()=>{
 const m=await model,root=eventState();root.systemState="sprint-live";root.event.teamNames={a:"Sprint Monarch",b:"Sprint Parakeet"};root.sprint={active:true,timerMode:"count-up",running:true,elapsedMs:5000,lastTickAt:1000};const opened=await openCase(root);assert.equal(opened.event.activeInvestigation.teamName,"Sprint Monarch");assert.equal(opened.sprint.elapsedMs,6000);const next=m.decideInvestigation(opened,decision("disqualification"),5000);assert.deepEqual(next.session,root.session);assert.deepEqual(next.event.scores,root.event.scores);assert.equal(next.event.sessionResults,undefined);
});
test("an event disqualification is retained for event classification",async()=>{
 const m=await model,next=m.decideInvestigation(await openCase(),decision("event-disqualification"),5000);assert.equal(next.event.enforcementOutcomes.a,"dq");
});
test("No Result corrects a finalized session victory without duplicating roles",async()=>{
 const {applyOfficialSessionResult}=await import("../circuit-model.js"),m=await model;let root=eventState();root.session.provisionalWinner="a";root=applyOfficialSessionResult(root);const roles=structuredClone(root.event.circuit.roles),next=m.decideInvestigation(await openCase(root),decision("no-result"),5000);assert.equal(next.systemState,"session-complete");assert.equal(next.event.scores.a,0);assert.equal(next.event.sessionResults[0].winnerSide,null);assert(next.event.sessionResults[0].entrants.every(e=>e.outcome==="no-result"));assert.deepEqual(next.event.circuit.roles,roles);
});
test("administrative penalties remain explicit follow-up work rather than silent eligibility changes",async()=>{
 const m=await model,next=m.decideInvestigation(await openCase(),decision("point-adjustment"),5000);assert.equal(next.event.activePenalty.followUpRequired,true);assert.deepEqual(next.event.scores,{a:0,b:0});assert.equal(next.systemState,"session-live");
});
