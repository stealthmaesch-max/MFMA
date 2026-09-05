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

test("hazards store independent response requests including neither",async()=>{
 const {cleanHazardReport}=await importModule("report-model.js");
 const neither=cleanHazardReport({id:"h1",vehicleId:"ranger",description:"Debris"},100);
 assert.equal(neither.status,"open");assert.equal(neither.requestStopClock,false);assert.equal(neither.requestSafetyCar,false);
 assert.equal(cleanHazardReport({...neither,id:"h2",requestStopClock:true},200).requestStopClock,true);
 assert.equal(cleanHazardReport({...neither,id:"h3",requestSafetyCar:true},300).requestSafetyCar,true);
});

test("hazard submission cannot automatically change timer or deploy Safety Car",async()=>{
 const {cleanHazardReport}=await importModule("report-model.js");
 const state={systemState:"session-live",activeFlag:"green",session:{running:true}};
 cleanHazardReport({id:"h",vehicleId:"ranger",description:"Oil",requestStopClock:true,requestSafetyCar:true},100);
 assert.deepEqual(state,{systemState:"session-live",activeFlag:"green",session:{running:true}});
});

test("Race Director acknowledgement, resolution, and one-time sound wiring exist",async()=>{
 const control=fs.readFileSync("control.js","utf8");
 assert.match(control,/status`\]:"acknowledged"/);assert.match(control,/status`\]:"resolved"/);
 const {newOpenHazardIds}=await importModule("report-model.js");
 const current={event:{hazards:{h1:{status:"open"}}}};
 assert.deepEqual(newOpenHazardIds(null,current),[],"initial Firebase render is silent");
 assert.deepEqual(newOpenHazardIds({event:{hazards:{}}},current),["h1"]);
 assert.deepEqual(newOpenHazardIds(current,current),[],"duplicate Firebase render is silent");
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
