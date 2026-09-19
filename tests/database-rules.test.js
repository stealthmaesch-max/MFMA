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
async function authorizeDriver(){await set(ref(rd,"mfma/competition/teams/team-one"),{name:"Team One",status:"approved"});await set(ref(rd,"mfma/competition/drivers/d1"),{name:"Stealth",mraNumber:"MRA101",teamId:"team-one",teamName:"Team One",status:"approved"});await set(ref(rd,"mfma/driverAccess/driver-device"),{teamId:"team-one",teamName:"Team One",status:"approved"})}

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

test("Approved team devices can acknowledge only the current MRA instruction",async()=>{
 await authorizeDriver();
 await set(ref(rd,"mfma/state/event/currentInstruction"),{id:9001,type:"return-to-start",label:"EVERYONE RETURN TO STARTING ZONE",issuedAt:9001});
 const acknowledgement={instructionId:9001,type:"return-to-start",vehicleId:"ranger",driverId:"d1",teamId:"team-one",acknowledgedAt:9100};
 await assertSucceeds(set(ref(driver,"mfma/state/event/instructionAcks/driver-device"),acknowledgement));
 await assertFails(set(ref(driver,"mfma/state/event/instructionAcks/another-device"),acknowledgement));
 await assertFails(set(ref(driver,"mfma/state/event/instructionAcks/driver-device"),{...acknowledgement,instructionId:8999}));
 await assertFails(set(ref(driver,"mfma/state/event/instructionAcks/driver-device"),{...acknowledgement,type:"red"}));
 await assertFails(set(ref(driver,"mfma/state/event/instructionAcks/driver-device"),{...acknowledgement,vehicleId:"unapproved"}));
 await assertFails(set(ref(driver,"mfma/state/event/instructionAcks/driver-device"),{...acknowledgement,teamId:"other-team"}));
});

test("Driver cannot change Race Director state",async()=>{
 for(const [path,value] of [
  ["activeFlag","red"],
  ["systemState","session-complete"],
  ["session/running",false],
  ["event/safetyCarOvertake",{active:true}],
  ["event/scores/ranger",99],
  ["event/participationSessions/d1",99],
  ["event/sprintParticipants/d1",{driverId:"d1",verified:true,durationMs:60000}],
  ["event/qualifying",{active:true,trackLength:"short",vehicleId:"shelly"}],
  ["session/resultOfficial",true],
  ["event/name","Changed by Driver"]
 ])await assertFails(set(ref(driver,`mfma/state/${path}`),value));
});

test("Race Director retains authoritative event and hazard controls",async()=>{
 await assertSucceeds(set(ref(rd,"mfma/state"),{systemState:"session-live",activeFlag:"green",event:{hazards:{h1:openHazard}},session:{running:true}}));
 await assertSucceeds(update(ref(rd,"mfma/state/event/hazards/h1"),{status:"acknowledged",acknowledgedAt:200}));
 await assertSucceeds(update(ref(rd,"mfma/state"),{activeFlag:"safety-car","session/running":false}));
 await assertSucceeds(update(ref(rd,"mfma/state/event"),{"participationSessions/d1":1,"participationSessions/p1":1}));
 await assertSucceeds(update(ref(rd,"mfma/state/event"),{"sprintParticipants/d1":{driverId:"d1",verified:true,durationMs:60000}}));
 await assertSucceeds(update(ref(rd,"mfma/state/event"),{qualifying:{active:true,trackLength:"short",vehicleId:"shelly",running:false,laps:{}}}));
 await assertSucceeds(update(ref(rd,"mfma/state/event/hazards/h1"),{status:"resolved",resolvedAt:300}));
});

test("Race Director can atomically end and cancel an invalid event",async()=>{await assertSucceeds(set(ref(rd,"mfma/state"),{systemState:"standby",activeFlag:"clear",event:{name:"Invalid Test",championshipEventId:"round-invalid"}}));await assertSucceeds(set(ref(rd,"mfma/competition/events/round-invalid"),{name:"Invalid Test",status:"active",registrationStatus:"closed"}));await assertSucceeds(update(ref(rd,"mfma"),{state:{systemState:"no-event",activeFlag:"clear",event:null,session:null,sprint:null},"competition/events/round-invalid/status":"cancelled","competition/events/round-invalid/registrationStatus":"closed","competition/events/round-invalid/cancelReason":"Missing legal event requirements"}))});

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

test("Registration is self-service but approval and team-device binding remain MRA-only",async()=>{
 await set(ref(rd,"mfma/competition/teams/team-one"),{name:"Team One",status:"approved"});
 const registration={uid:"driver-device",name:"New Driver",teamId:"team-one",teamName:"Team One",requestedMraNumber:"MRA202",status:"pending",requestedAt:100};
 await assertSucceeds(set(ref(driver,"mfma/requests/registrations/driver-device"),registration));
 await assertFails(set(ref(driver,"mfma/requests/registrations/driver-device"),{...registration,teamId:"invented-team",teamName:"Invented Team"}));
 await assertFails(set(ref(driver,"mfma/driverAccess/driver-device"),{teamId:"new-team",status:"approved"}));
 await assertFails(set(ref(driver,"mfma/competition/drivers/d2"),{name:"New Driver",status:"approved"}));
 await assertSucceeds(update(ref(rd,"mfma"),{"competition/drivers/d2":{name:"New Driver",mraNumber:"MRA202",teamId:"new-team",teamName:"New Team",status:"approved"},"competition/teams/new-team":{name:"New Team",status:"approved"},"driverAccess/driver-device":{teamId:"new-team",teamName:"New Team",status:"approved"},"requests/registrations/driver-device/status":"approved"}));
});

test("A team device can switch among its drivers but cannot impersonate another team",async()=>{
 await authorizeDriver();
 await set(ref(rd,"mfma/competition/drivers/d2"),{name:"Alex",mraNumber:"MRA102",teamId:"team-one",teamName:"Team One",status:"approved"});
 await set(ref(rd,"mfma/competition/drivers/d3"),{name:"Rival",mraNumber:"MRA201",teamId:"team-two",teamName:"Team Two",status:"approved"});
 const report={driverId:"d2",mraNumber:"MRA102",teamId:"team-one",teamName:"Team One",driverName:"Alex",passengerName:"",submittedAt:100};
 await assertSucceeds(set(ref(driver,"mfma/state/event/vehicleReports/ranger"),report));
 await assertFails(set(ref(driver,"mfma/state/event/vehicleReports/ranger"),{...report,driverId:"d3",driverName:"Rival",mraNumber:"MRA201",teamId:"team-two",teamName:"Team Two"}));
});

test("A device may request an approved team but cannot self-approve its binding",async()=>{
 await set(ref(rd,"mfma/competition/teams/team-one"),{name:"Team One",status:"approved"});
 const request={uid:"driver-device",teamId:"team-one",teamName:"Team One",status:"pending",requestedAt:100};
 await assertSucceeds(set(ref(driver,"mfma/requests/access/driver-device"),request));
 await assertFails(set(ref(driver,"mfma/requests/access/driver-device"),{...request,teamId:"team-two",teamName:"Team Two"}));
 await assertFails(set(ref(driver,"mfma/driverAccess/driver-device"),{teamId:"team-one",teamName:"Team One",status:"approved"}));
 await assertSucceeds(set(ref(rd,"mfma/driverAccess/driver-device"),{teamId:"team-one",teamName:"Team One",status:"approved"}));
});

test("A team can record one registered passenger participation entry per event",async()=>{
 await authorizeDriver();
 await set(ref(rd,"mfma/competition/drivers/d2"),{name:"Passenger",mraNumber:"MRA202",teamId:"team-two",teamName:"Team Two",status:"approved"});
 const participation={driverId:"d2",driverName:"Passenger",mraNumber:"MRA202",recordedByTeamId:"team-one",participatedAt:100};
 await assertSucceeds(set(ref(driver,"mfma/state/event/passengerParticipants/d2"),participation));
 await assertSucceeds(set(ref(driver,"mfma/state/event/passengerParticipants/d2"),{...participation,participatedAt:200}));
 await assertFails(set(ref(driver,"mfma/state/event/passengerParticipants/d2"),{...participation,driverName:"Imposter"}));
});

test("A team device records its driver participation but cannot claim a rival driver",async()=>{
 await authorizeDriver();
 await set(ref(rd,"mfma/competition/drivers/d2"),{name:"Rival",mraNumber:"MRA202",teamId:"team-two",teamName:"Team Two",status:"approved"});
 const participation={driverId:"d1",driverName:"Stealth",mraNumber:"MRA101",teamId:"team-one",teamName:"Team One",vehicleId:"ranger",lastParticipatedAt:100};
 await assertSucceeds(set(ref(driver,"mfma/state/event/driverParticipants/d1"),participation));
 await assertFails(set(ref(driver,"mfma/state/event/driverParticipants/d2"),{...participation,driverId:"d2",driverName:"Rival",mraNumber:"MRA202",teamId:"team-two",teamName:"Team Two"}));
 await assertSucceeds(update(ref(driver,"mfma/state/event"),{"vehicleReports/ranger":{driverId:"d1",driverName:"Stealth",mraNumber:"MRA101",teamId:"team-one",teamName:"Team One",passengerName:"",passengerId:null,passengerMraNumber:null,submittedAt:200},"driverParticipants/d1":{...participation,lastParticipatedAt:200}}));
});

test("Unapproved devices cannot submit race reports",async()=>{
 await assertFails(set(ref(driver,"mfma/state/event/vehicleReports/ranger"),{driverId:"d1",mraNumber:"MRA101",teamId:"team-one",teamName:"Team One",driverName:"Stealth",passengerName:"",submittedAt:100}));
 await assertFails(set(ref(driver,"mfma/state/event/hazards/h1"),openHazard));
});

test("Approved drivers can register only themselves and only fixed vehicles for an open event",async()=>{
 await authorizeDriver();
 await set(ref(rd,"mfma/competition/events/round-1"),{name:"Round 1",seasonId:"2026",date:"2026-09-20",status:"scheduled",registrationStatus:"open"});
 const entry={driverId:"d1",driverName:"Stealth",mraNumber:"MRA101",teamId:"team-one",teamName:"Team One",vehicleId:"ranger",vehicleName:"Ranger",status:"registered",registeredAt:100};
 await assertSucceeds(set(ref(driver,"mfma/competition/eventRegistrations/round-1/d1"),entry));
 await assertFails(set(ref(driver,"mfma/competition/eventRegistrations/round-1/d2"),{...entry,driverId:"d2"}));
 await assertFails(set(ref(driver,"mfma/competition/eventRegistrations/round-1/d1"),{...entry,vehicleId:"fourth-car",vehicleName:"Fourth Car"}));
 await assertFails(set(ref(driver,"mfma/competition/eventRegistrations/round-1/d1"),{...entry,teamId:"other-team",teamName:"Other Team"}));
});

test("Drivers cannot register for a closed event or create championship events",async()=>{
 await authorizeDriver();
 await set(ref(rd,"mfma/competition/events/round-1"),{name:"Round 1",seasonId:"2026",date:"2026-09-20",status:"scheduled",registrationStatus:"closed"});
 const entry={driverId:"d1",driverName:"Stealth",mraNumber:"MRA101",teamId:"team-one",teamName:"Team One",vehicleId:"shelly",vehicleName:"Shelly",status:"registered",registeredAt:100};
 await assertFails(set(ref(driver,"mfma/competition/eventRegistrations/round-1/d1"),entry));
 await assertFails(set(ref(driver,"mfma/competition/events/round-2"),{name:"Round 2",registrationStatus:"open"}));
 await assertSucceeds(set(ref(rd,"mfma/competition/events/round-2"),{name:"Round 2",registrationStatus:"open"}));
});
