const {after,afterEach,before}=require("node:test");
const test=require("node:test");
const assert=require("node:assert/strict");
const {initializeTestEnvironment,assertFails,assertSucceeds}=require("@firebase/rules-unit-testing");
const {get,ref,set,update}=require("firebase/database");
const fs=require("node:fs");

let env,driver,rd;
const openHazard={driverId:"d1",mraNumber:"MRA101",vehicleId:"ranger",description:"Debris near Turn 2",category:"Debris",requestStopClock:true,requestSafetyCar:true,status:"open",createdAt:100};

before(async()=>{
 env=await initializeTestEnvironment({projectId:"mfma-flag-system",database:{rules:fs.readFileSync("database.rules.json","utf8")}});
 driver=env.authenticatedContext("driver-device",{firebase:{sign_in_provider:"anonymous"}}).database();
 rd=env.authenticatedContext("2DCyQB0Js1UpWGI0LkEQtnOhGPl1",{firebase:{sign_in_provider:"github.com"}}).database();
});
afterEach(()=>env.clearDatabase());
after(()=>env.cleanup());
async function authorizeDriver(){await set(ref(rd,"mfma/competition/drivers/d1"),{name:"Stealth",mraNumber:"MRA101",teamId:"team-one",teamName:"Team One",status:"approved"});await set(ref(rd,"mfma/driverAccess/driver-device"),{driverId:"d1",status:"approved"})}

test("Driver can submit and resubmit only valid occupant information",async()=>{
 await authorizeDriver();
 const report=ref(driver,"mfma/state/event/vehicleReports/ranger");
 const valid={driverId:"d1",mraNumber:"MRA101",teamId:"team-one",teamName:"Team One",driverName:"Stealth",passengerName:"Alex",submittedAt:100};
 await assertSucceeds(set(report,valid));
 await assertSucceeds(set(report,{...valid,passengerName:"",submittedAt:200}));
 await assertFails(update(report,{score:99}));
 await assertFails(set(report,{...valid,teamId:"passenger-team",submittedAt:250}));
 await assertFails(set(report,{driverName:"",passengerName:"Alex",submittedAt:300}));
});

test("Driver can create an open hazard but cannot acknowledge or resolve it",async()=>{
 await authorizeDriver();
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
 await authorizeDriver();const report={driverId:"d1",mraNumber:"MRA101",teamId:"team-one",teamName:"Team One",driverName:"Stealth",passengerName:"Alex",submittedAt:100};
 await assertSucceeds(set(ref(driver,"mfma/state/event/vehicleReports/ranger"),report));
 assert.deepEqual((await get(ref(rd,"mfma/state/event/vehicleReports/ranger"))).val(),report);
 await assertSucceeds(set(ref(driver,"mfma/state/event/hazards/h1"),openHazard));
 assert.equal((await get(ref(rd,"mfma/state/event/hazards/h1/status"))).val(),"open");
 await assertSucceeds(update(ref(rd,"mfma/state/event/hazards/h1"),{status:"acknowledged",acknowledgedAt:200}));
 assert.equal((await get(ref(driver,"mfma/state/event/hazards/h1/status"))).val(),"acknowledged");
 await assertSucceeds(update(ref(rd,"mfma/state/event/hazards/h1"),{status:"resolved",resolvedAt:300}));
 assert.equal((await get(ref(driver,"mfma/state/event/hazards/h1/status"))).val(),"resolved");
});

test("Registration is self-service but approval and device binding remain MRA-only",async()=>{
 const registration={uid:"driver-device",name:"New Driver",teamName:"New Team",requestedMraNumber:"MRA202",status:"pending",requestedAt:100};
 await assertSucceeds(set(ref(driver,"mfma/requests/registrations/driver-device"),registration));
 await assertFails(set(ref(driver,"mfma/driverAccess/driver-device"),{driverId:"d2",status:"approved"}));
 await assertFails(set(ref(driver,"mfma/competition/drivers/d2"),{name:"New Driver",status:"approved"}));
 await assertSucceeds(update(ref(rd,"mfma"),{"competition/drivers/d2":{name:"New Driver",mraNumber:"MRA202",teamId:"new-team",teamName:"New Team",status:"approved"},"driverAccess/driver-device":{driverId:"d2",status:"approved"},"requests/registrations/driver-device/status":"approved"}));
});

test("Unapproved devices cannot submit race reports",async()=>{
 await assertFails(set(ref(driver,"mfma/state/event/vehicleReports/ranger"),{driverId:"d1",mraNumber:"MRA101",teamId:"team-one",teamName:"Team One",driverName:"Stealth",passengerName:"",submittedAt:100}));
 await assertFails(set(ref(driver,"mfma/state/event/hazards/h1"),openHazard));
});
