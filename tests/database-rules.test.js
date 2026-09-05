const {after,afterEach,before}=require("node:test");
const test=require("node:test");
const assert=require("node:assert/strict");
const {initializeTestEnvironment,assertFails,assertSucceeds}=require("@firebase/rules-unit-testing");
const {get,ref,set,update}=require("firebase/database");
const fs=require("node:fs");

let env,driver,rd;
const openHazard={vehicleId:"ranger",description:"Debris near Turn 2",category:"Debris",requestStopClock:true,requestSafetyCar:true,status:"open",createdAt:100};

before(async()=>{
 env=await initializeTestEnvironment({projectId:"mfma-flag-system",database:{rules:fs.readFileSync("database.rules.json","utf8")}});
 driver=env.authenticatedContext("driver-device",{firebase:{sign_in_provider:"anonymous"}}).database();
 rd=env.authenticatedContext("2DCyQB0Js1UpWGI0LkEQtnOhGPl1",{firebase:{sign_in_provider:"github.com"}}).database();
});
afterEach(()=>env.clearDatabase());
after(()=>env.cleanup());

test("Driver can submit and resubmit only valid occupant information",async()=>{
 const report=ref(driver,"mfma/state/event/vehicleReports/ranger");
 await assertSucceeds(set(report,{driverName:"Stealth",passengerName:"Alex",submittedAt:100}));
 await assertSucceeds(set(report,{driverName:"Stealth",passengerName:"",submittedAt:200}));
 await assertFails(update(report,{score:99}));
 await assertFails(set(report,{driverName:"",passengerName:"Alex",submittedAt:300}));
});

test("Driver can create an open hazard but cannot acknowledge or resolve it",async()=>{
 const hazard=ref(driver,"mfma/state/event/hazards/h1");
 await assertSucceeds(set(hazard,openHazard));
 await assertFails(update(hazard,{status:"acknowledged",acknowledgedAt:200}));
 await assertFails(update(hazard,{status:"resolved",resolvedAt:300}));
 await assertFails(set(ref(driver,"mfma/state/event/hazards/h2"),{...openHazard,status:"acknowledged",acknowledgedAt:100}));
 await assertFails(set(ref(driver,"mfma/state/event/hazards/h3"),{...openHazard,rdNotes:"driver note"}));
});

test("Driver cannot change Race Director state",async()=>{
 for(const [path,value] of [
  ["activeFlag","red"],
  ["systemState","session-complete"],
  ["session/running",false],
  ["event/safetyCarOvertake",{active:true}],
  ["event/scores/ranger",99],
  ["session/resultOfficial",true],
  ["event/name","Changed by Driver"]
 ])await assertFails(set(ref(driver,`mfma/state/${path}`),value));
});

test("Race Director retains authoritative event and hazard controls",async()=>{
 await assertSucceeds(set(ref(rd,"mfma/state"),{systemState:"session-live",activeFlag:"green",event:{hazards:{h1:openHazard}},session:{running:true}}));
 await assertSucceeds(update(ref(rd,"mfma/state/event/hazards/h1"),{status:"acknowledged",acknowledgedAt:200}));
 await assertSucceeds(update(ref(rd,"mfma/state"),{activeFlag:"safety-car","session/running":false}));
 await assertSucceeds(update(ref(rd,"mfma/state/event/hazards/h1"),{status:"resolved",resolvedAt:300}));
});

test("Driver to Race Director round trip carries crew and hazard status",async()=>{
 await assertSucceeds(set(ref(driver,"mfma/state/event/vehicleReports/ranger"),{driverName:"Stealth",passengerName:"Alex",submittedAt:100}));
 assert.deepEqual((await get(ref(rd,"mfma/state/event/vehicleReports/ranger"))).val(),{driverName:"Stealth",passengerName:"Alex",submittedAt:100});
 await assertSucceeds(set(ref(driver,"mfma/state/event/hazards/h1"),openHazard));
 assert.equal((await get(ref(rd,"mfma/state/event/hazards/h1/status"))).val(),"open");
 await assertSucceeds(update(ref(rd,"mfma/state/event/hazards/h1"),{status:"acknowledged",acknowledgedAt:200}));
 assert.equal((await get(ref(driver,"mfma/state/event/hazards/h1/status"))).val(),"acknowledged");
 await assertSucceeds(update(ref(rd,"mfma/state/event/hazards/h1"),{status:"resolved",resolvedAt:300}));
 assert.equal((await get(ref(driver,"mfma/state/event/hazards/h1/status"))).val(),"resolved");
});
