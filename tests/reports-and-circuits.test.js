const assert=require("assert");
const fs=require("fs");
const test=require("node:test");

const importModule=name=>import(new URL(`../${name}`,`file://${__filename}`));

test("occupant reports accept driver-only, driver and passenger, and latest resubmission",async()=>{
 const {cleanOccupantReport}=await importModule("report-model.js");
 assert.deepEqual(cleanOccupantReport("Stealth","",100),{driverName:"Stealth",passengerName:"",submittedAt:100});
 assert.deepEqual(cleanOccupantReport("Stealth","Alex",200),{driverName:"Stealth",passengerName:"Alex",submittedAt:200});
 const reports={ranger:cleanOccupantReport("First","",100)};
 reports.ranger=cleanOccupantReport("Latest","Alex",200);
 assert.equal(reports.ranger.driverName,"Latest");assert.equal(reports.ranger.submittedAt,200);
});

test("occupant names are informational and excluded from session eligibility",()=>{
 const control=fs.readFileSync("control.js","utf8");
 const start=control.indexOf("function validate(");const end=control.indexOf("\n}\n",start)+2;const validation=control.slice(start,end);
 assert(!/driverName|passengerName|vehicleReports/.test(validation));
});

test("driver report submission waits for anonymous authentication",()=>{
 const display=fs.readFileSync("display.js","utf8");
 assert.match(display,/function ensureDriverAuth\(\)/);
 assert.match(display,/await ensureDriverAuth\(\);const report=cleanOccupantReport/);
 assert.match(display,/await ensureDriverAuth\(\);const hazardRef=push/);
 assert.doesNotMatch(display,/if\(!driverUser\).*Connecting securely/);
});

test("hazards provide one-tap Safety Car and Red Flag requests",async()=>{
 const {cleanHazardReport}=await importModule("report-model.js");
 const neither=cleanHazardReport({id:"h1",vehicleId:"ranger",description:"Debris"},100);
 assert.equal(neither.status,"open");assert.equal(neither.requestStopClock,false);assert.equal(neither.requestSafetyCar,false);
 assert.equal(cleanHazardReport({...neither,id:"h2",requestStopClock:true},200).requestStopClock,true);
 assert.equal(cleanHazardReport({...neither,id:"h3",requestSafetyCar:true},300).requestSafetyCar,true);
 const html=fs.readFileSync("display.html","utf8"),display=fs.readFileSync("display.js","utf8");
 assert.match(html,/data-hazard-request="safety-car"/);assert.match(html,/data-hazard-request="red-flag"/);assert.doesNotMatch(html,/hazard-description|hazard-category/);
 assert.match(display,/description:`\$\{label\} requested`/);assert.match(display,/requestStopClock:!safetyCar,requestSafetyCar:safetyCar/);
});

test("hazard receipt calls immediate yellow but leaves requested final flag to Race Director",async()=>{
 const {cleanHazardReport}=await importModule("report-model.js");
 const state={systemState:"session-live",activeFlag:"green",session:{running:true}};
 cleanHazardReport({id:"h",vehicleId:"ranger",description:"Oil",requestStopClock:true,requestSafetyCar:true},100);
 assert.deepEqual(state,{systemState:"session-live",activeFlag:"green",session:{running:true}});
 const display=fs.readFileSync("display.js","utf8"),control=fs.readFileSync("control.js","utf8");
 assert.doesNotMatch(display,/issueFlag|activeFlag\s*:/);
 assert.match(control,/newHazards\.length/);assert.match(control,/new Set\(\["clear","green","move-over"\]\)/);assert.match(control,/issueFlag\("yellow"\)/);assert.match(control,/data-hazard-red/);assert.match(control,/data-hazard-safety/);
 assert.match(control,/canApplyFlag=new Set\(\["standby","sprint-live","session-live"\]\)/);
});

test("Safety Car uses the original persistent high-contrast display with no overtaking",()=>{
 const display=fs.readFileSync("display.js","utf8");
 const branch=display.match(/if\(mode==="safety-car-termination"\)\{([\s\S]*?)\n\}/)?.[1]||"";
 const html=fs.readFileSync("display.html","utf8"),css=fs.readFileSync("styles.css","utf8"),control=fs.readFileSync("control.js","utf8");
 assert.match(branch,/label\.textContent="SAFETY CAR"/);
 assert.match(branch,/NO OVERTAKING/);
 assert.match(branch,/timer\.textContent="ENDED"/);
 assert.match(css,/\.flag-safety-car[\s\S]*#050505[\s\S]*#ffe919/);
 assert.match(css,/\.flag-safety-car \.safety-car-emblem \{ display: none; \}/);
 assert.doesNotMatch(css,/safetyCarBorderPulse/);
 assert.match(branch,/flag-safety-car flash/);
 assert.doesNotMatch(`${html}\n${control}\n${display}`,/authorize-overtake|cancel-overtake|safetyCarOvertake|OVERTAKE SAFETY CAR/i);
});

test("operational signals flash while Green and infractions remain steady",async()=>{
 const {signals}=await importModule("signals.js");
 for(const name of ["yellow","move-over","safety-car","red","checkered","return-to-start"])assert.equal(signals[name].flash,true,`${name} flashes`);
 for(const name of ["green","proceed-to-start","infraction-warning","under-review","disqualification"])assert.equal(signals[name].flash,false,`${name} remains steady`);
 const display=fs.readFileSync("display.js","utf8"),css=fs.readFileSync("styles.css","utf8");
 assert.match(display,/flag-safety-car flash/);
 assert.match(display,/flag-disqualified/);assert.match(display,/flag-under-review/);
 assert.match(css,/\.flash \.signal-label,[\s\S]*\.flash \.status-title/);
 assert.doesNotMatch(css,/\.flag-checkered \.signal-label[\s\S]*animation: none/);
});

test("MRA safety information is scoped to the currently active management signal",()=>{
 const control=fs.readFileSync("control.js","utf8"),display=fs.readFileSync("display.js","utf8"),html=fs.readFileSync("control.html","utf8"),driverHtml=fs.readFileSync("display.html","utf8");
 assert.match(html,/id="safety-message-dialog"/);assert.match(html,/maxlength="100"/);assert.match(html,/data-safety-preset/);
 assert.match(control,/safetyManagementFlags=new Set\(\["yellow","move-over","red","safety-car","return-to-start","infraction-warning","under-review","disqualification"\]\)/);
 assert.match(control,/safetyMessage:clean\?\{text:clean,flag:state\.activeFlag,updatedAt:Date\.now\(\)\}:null/);
 assert.match(display,/state\.safetyMessage\?\.flag===state\.activeFlag/);
 assert.match(display,/panel\.classList\.toggle\("hidden",!message\)/);
 assert.match(display,/\$\("safety-message"\)\.textContent=message/);
 assert.match(driverHtml,/id="safety-management"[\s\S]*mra-logo\.png[\s\S]*id="safety-message"/);
});

test("Driver Portal keeps a local profile and syncs it through narrow anonymous writes",()=>{
 const display=fs.readFileSync("display.js","utf8"),html=fs.readFileSync("display.html","utf8");
 assert.match(html,/mfma-driver-portal-logo\.png/);assert.match(html,/id="driver-signin-form"/);assert.match(html,/id="driver-sign-out"/);
 assert.match(display,/PROFILE_KEY="mfma-driver-profile"/);assert.match(display,/localStorage\.setItem\(PROFILE_KEY,JSON\.stringify\(profile\)\)/);
 assert.match(display,/await ensureDriverAuth\(\);const report=cleanOccupantReport/);
 assert.match(display,/mfma\/state\/event\/vehicleReports\/\$\{driverProfile\.vehicleId\}/);
 assert.match(display,/syncStoredDriverProfile\(\)/);
});

test("a stopped session can return to the line and restart through the full light sequence",()=>{
 const html=fs.readFileSync("control.html","utf8"),control=fs.readFileSync("control.js","utf8"),display=fs.readFileSync("display.js","utf8");
 assert.match(html,/id="restart-at-line"[\s\S]*Return to Starting Line/);
 assert.match(control,/state\.activeFlag!=="red"/);
 assert.match(control,/systemState:"next-session-staging"[\s\S]*"session\/restart":true[\s\S]*"session\/countdownEndsAt":null/);
 assert.match(control,/state\?\.systemState!=="next-session-staging"[\s\S]*systemState:"next-session-countdown"/);
 assert.match(display,/restart\?"RESTART":"NEXT HIDING TEAM"/);
});

test("Race Director acknowledgement, resolution, and one-time sound wiring exist",async()=>{
 const control=fs.readFileSync("control.js","utf8");
 assert.match(control,/status`\]:"acknowledged"/);assert.match(control,/status`\]:"resolved"/);
 assert.match(control,/function resolveHazard\(id\)/);assert.match(control,/state\?\.systemState==="standby"/);
 assert.match(control,/new Set\(\["yellow","red","safety-car"\]\)/);assert.match(control,/updates\.activeFlag="clear"/);
 const {newOpenHazardIds}=await importModule("report-model.js");
 const current={event:{hazards:{h1:{status:"open"}}}};
 assert.deepEqual(newOpenHazardIds(null,current),["h1"],"an open report survives reload and alerts Race Control");
 assert.deepEqual(newOpenHazardIds({event:{hazards:{}}},current),["h1"]);
 assert.deepEqual(newOpenHazardIds(current,current),[],"duplicate Firebase render is silent");
 const css=fs.readFileSync("styles.css","utf8");
 assert.doesNotMatch(css,/\]\) \.dashboard-event \{ display: none; \}/,"live modes do not hide Driver reports");
 assert.match(css,/\]\) \.event-head\.dashboard-event \{ display: none; \}/,"only the compact event header is hidden during live modes");
});

test("circuit counts report completed history separately from balance",async()=>{
 const {getCircuitStatus}=await importModule("circuit-model.js");
 const status=(ap,ae,bp,be)=>getCircuitStatus({roles:{a:{pursuitCount:ap,evadingCount:ae},b:{pursuitCount:bp,evadingCount:be}}});
 assert.deepEqual([status(1,1,1,1).completedCircuitCount,status(1,1,1,1).isCircuitBalanced],[1,true]);
 assert.deepEqual([status(2,2,2,2).completedCircuitCount,status(2,2,2,2).isCircuitBalanced],[2,true]);
 assert.deepEqual([status(2,1,1,2).completedCircuitCount,status(2,1,1,2).isCircuitBalanced],[1,false]);
 assert.deepEqual([status(3,2,2,3).completedCircuitCount,status(3,2,2,3).isCircuitBalanced],[2,false]);
 assert.deepEqual([status(3,3,3,3).completedCircuitCount,status(3,3,3,3).isCircuitBalanced],[3,true]);
});

test("official finalization increments roles exactly once",async()=>{
 const {applyOfficialSessionResult}=await importModule("circuit-model.js");
 const initial={systemState:"provisional",activeFlag:"checkered",event:{scores:{a:0,b:0},circuit:{roles:{}}},session:{teamNames:{a:"A",b:"B"},pursuitTeam:"a",evadingTeam:"b",provisionalWinner:"a",resultOfficial:false,running:false}};
 const once=applyOfficialSessionResult(initial),twice=applyOfficialSessionResult(once);
 assert.equal(once.event.circuit.roles.a.pursuitCount,1);assert.equal(once.event.circuit.roles.b.evadingCount,1);assert.equal(once.event.scores.a,1);
 assert.strictEqual(twice,once);
});

test("legacy circuit booleans normalize to numeric counts",async()=>{
 const {normalizeCircuitRoles}=await importModule("circuit-model.js");
 assert.deepEqual(normalizeCircuitRoles({a:{pursuit:true,evading:false},b:{pursuit:false,evading:true}}),{a:{pursuitCount:1,evadingCount:0},b:{pursuitCount:0,evadingCount:1}});
});
