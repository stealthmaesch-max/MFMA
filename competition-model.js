export const LEGACY_VEHICLES={
 ranger:{name:"Ranger",status:"approved",legacy:true},
 shelly:{name:"Shelly",status:"approved",legacy:true},
 gator:{name:"Gator",status:"approved",legacy:true}
};

export const DEFAULT_POINTS=[5,3];
export const DEFAULT_DRIVER_ROLES={"mra-16":"primary","mra-3":"honorary"};
export const OFFICIAL_TEAM_IDS=["monarch-mfma-team","parakeet-mfma-team"];
export const TEAM_BRANDING={
 "monarch-mfma-team":{accent:"#7758ff",emblem:"assets/branding/monarch-team-emblem.png",logo:"assets/branding/monarch-mfma-team-logo-dignified.png"},
 "parakeet-mfma-team":{accent:"#139ff2",emblem:"assets/branding/parakeet-team-emblem-v2.png",logo:"assets/branding/parakeet-mfma-team-logo-v2.png"}
};

export function normalizeMraNumber(value){return String(value??"").trim().toUpperCase().replace(/\s+/g,"")}
export function normalizeName(value){return String(value??"").trim().replace(/\s+/g," ")}
export function slugify(value){return normalizeName(value).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48)}
export function currentSeasonId(date=new Date()){return String(date.getFullYear())}
export function teamBranding(teamId){return TEAM_BRANDING[teamId]||{accent:"#f11524",emblem:null,logo:null}}
export function driverCompetitionRole(driverId,driver={}){return driver.competitionRole||DEFAULT_DRIVER_ROLES[driverId]||"primary"}
export function isScoringDriverEligible(driverId,driver={}){return Boolean(driverId&&Object.keys(driver||{}).length&&driver?.status!=="pending"&&driver?.status!=="rejected"&&driverCompetitionRole(driverId,driver)!=="honorary")}
export function eventRegistrationId(driverId){return String(driverId||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,64)}
export function registeredVehicleId(driverId,vehicleName){return `${eventRegistrationId(driverId)}-${slugify(vehicleName)}`.slice(0,64)}

export function approvedVehicles(registry={}){
 const merged={...LEGACY_VEHICLES,...registry};
 return Object.fromEntries(Object.entries(merged).filter(([,vehicle])=>vehicle?.status==="approved").sort((a,b)=>(a[1].name||a[0]).localeCompare(b[1].name||b[0])));
}

export function findDriver(drivers={},name,mraNumber){
 const wantedName=normalizeName(name).toLocaleLowerCase(),wantedNumber=normalizeMraNumber(mraNumber);
 return Object.entries(drivers).find(([,driver])=>driver?.status==="approved"&&normalizeName(driver.name).toLocaleLowerCase()===wantedName&&normalizeMraNumber(driver.mraNumber)===wantedNumber)||null;
}

function rankedEntries(event={}){
 const scores=event.scores||{},vehicleIds=event.vehicleIds||event.lastVehicleIds||[];
 return Object.entries(scores).map(([side,wins],index)=>({side,wins:Number(wins)||0,vehicleId:vehicleIds[side==="a"?0:side==="b"?1:index]||null,teamName:event.teamNames?.[side]||null})).sort((a,b)=>b.wins-a.wins||a.side.localeCompare(b.side));
}

function matchingTeam(teams={},name){const wanted=normalizeName(name).toLocaleLowerCase();return Object.entries(teams).find(([,team])=>normalizeName(team?.name).toLocaleLowerCase()===wanted)||null}

export function buildEventArchive(state,competition={},options={}){
 const event=state?.event||{},reports=event.vehicleReports||{},points=competition?.seasons?.[options.seasonId]?.points||DEFAULT_POINTS;
 const ranked=rankedEntries({...event,lastVehicleIds:state?.session?.setup?.vehicleIds||state?.session?.pursuitVehicleIds||[]});
 let priorWins=null,priorPosition=0;
 const classification=ranked.map((entry,index)=>{
  const position=priorWins===entry.wins?priorPosition:index+1;priorWins=entry.wins;priorPosition=position;
  const explicitTeamId=event.teamIds?.[entry.side],team=explicitTeamId&&competition?.teams?.[explicitTeamId]?[explicitTeamId,competition.teams[explicitTeamId]]:matchingTeam(competition?.teams,entry.teamName),teamId=team?.[0]||null;
  const report=reports[entry.vehicleId]||Object.values(reports).find(item=>item?.teamId===teamId||item?.teamName===entry.teamName)||{},requestedDriverId=event.scoringDrivers?.[teamId]||report.driverId||null,requestedDriver=competition?.drivers?.[requestedDriverId]||{},selectedDriverId=isScoringDriverEligible(requestedDriverId,requestedDriver)?requestedDriverId:null,participant=event.driverParticipants?.[selectedDriverId]||{},driver=competition?.drivers?.[selectedDriverId]||{};
  return {...entry,position,points:Number(points[position-1])||0,vehicleName:competition?.vehicles?.[entry.vehicleId]?.name||LEGACY_VEHICLES[entry.vehicleId]?.name||entry.vehicleId,driverId:selectedDriverId,driverName:driver.name||participant.driverName||report.driverName||null,mraNumber:driver.mraNumber||participant.mraNumber||report.mraNumber||null,teamId:teamId||driver.teamId||report.teamId||null,teamName:team?.[1]?.name||driver.teamName||report.teamName||entry.teamName||null};
 });
 const scoringDriverIds=new Set(classification.map(row=>row.driverId).filter(Boolean)),participationByDriver={};
 for(const item of Object.values(event.driverParticipants||{})){const driver=competition?.drivers?.[item?.driverId],completedSessions=event.participationSessions?.[item?.driverId]||0;if(item?.driverId&&!scoringDriverIds.has(item.driverId)&&driver?.status==="approved"&&completedSessions>0&&driverCompetitionRole(item.driverId,driver)!=="honorary")participationByDriver[item.driverId]={driverId:item.driverId,driverName:driver.name,mraNumber:driver.mraNumber,role:"substitute",points:1,completedSessions}}
 for(const item of Object.values(event.passengerParticipants||{})){const driver=competition?.drivers?.[item?.driverId],completedSessions=event.participationSessions?.[item?.driverId]||0;if(item?.driverId&&!scoringDriverIds.has(item.driverId)&&driver?.status==="approved"&&completedSessions>0)participationByDriver[item.driverId]={driverId:item.driverId,driverName:driver.name,mraNumber:driver.mraNumber,role:"passenger",points:1,completedSessions}}
 const participationAwards=Object.values(participationByDriver),passengerParticipation=participationAwards.filter(item=>item.role==="passenger");
 return {name:event.name||"MFMA Event",seasonId:options.seasonId,pointsEvent:event.pointsEvent!==false,date:options.date||new Date().toISOString().slice(0,10),endedAt:options.endedAt||Date.now(),classification,participationAwards,passengerParticipation,sessionCount:Math.max(0,(event.sessionNumber||1)-1),circuit:event.circuit||null};
}

export function rebuildStandings(archives={}){
 const standings={drivers:{},teams:{},vehicles:{}};
 const add=(type,id,name,row,endedAt)=>{if(!id)return;const current=standings[type][id]||{id,name:name||id,points:0,wins:0,runnerUps:0,events:0};current.name=name||current.name;current.points+=row.points||0;current.wins+=row.position===1?1:0;current.runnerUps+=row.position===2?1:0;current.events+=1;if(row.position===1)current.latestWinAt=Math.max(current.latestWinAt||0,endedAt||0);standings[type][id]=current};
 for(const archive of Object.values(archives||{})){
  if(archive?.pointsEvent===false||archive?.status==="void")continue;
  const classifiedDrivers=new Set();
  for(const row of archive?.classification||[]){add("drivers",row.driverId,row.driverName,row,archive.endedAt);add("teams",row.teamId,row.teamName,row,archive.endedAt);add("vehicles",row.vehicleId,row.vehicleName||row.vehicleId,row,archive.endedAt);if(row.driverId)classifiedDrivers.add(row.driverId)}
  for(const participant of archive?.participationAwards||archive?.passengerParticipation||[]){if(!participant.driverId)continue;const current=standings.drivers[participant.driverId]||{id:participant.driverId,name:participant.driverName||participant.driverId,points:0,wins:0,runnerUps:0,events:0};current.name=participant.driverName||current.name;current.points+=(participant.points||1);current.participationPoints=(current.participationPoints||0)+(participant.points||1);if(!classifiedDrivers.has(participant.driverId))current.events+=1;standings.drivers[participant.driverId]=current}
 }
 return standings;
}

export function applyStandingsAdjustments(standings,adjustments={}){
 const result=standings||{drivers:{},teams:{},vehicles:{}};
 for(const adjustment of Object.values(adjustments||{})){if(adjustment?.status==="void"||!new Set(["drivers","teams","vehicles"]).has(adjustment?.type)||!adjustment.entityId)continue;const rows=result[adjustment.type],row=rows[adjustment.entityId]||{id:adjustment.entityId,name:adjustment.entityName||adjustment.entityId,points:0,wins:0,runnerUps:0,events:0};row.points+=(Number(adjustment.points)||0);rows[adjustment.entityId]=row}
 return result;
}

export function sortedStandings(rows={}){const sportingKey=row=>[row.points||0,row.wins||0,row.runnerUps||0,row.latestWinAt||0].join("|"),sorted=Object.values(rows||{}).sort((a,b)=>(b.points||0)-(a.points||0)||(b.wins||0)-(a.wins||0)||(b.runnerUps||0)-(a.runnerUps||0)||(b.latestWinAt||0)-(a.latestWinAt||0)||(a.name||"").localeCompare(b.name||""));let prior=null,rank=0;return sorted.map((row,index)=>{const key=sportingKey(row);if(key!==prior)rank=index+1;prior=key;return {...row,championshipRank:rank,tied:Boolean(sorted[index-1]&&sportingKey(sorted[index-1])===key||sorted[index+1]&&sportingKey(sorted[index+1])===key)}})}
