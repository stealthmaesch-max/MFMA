export const LEGACY_VEHICLES={
 ranger:{name:"Ranger",status:"approved",legacy:true},
 shelly:{name:"Shelly",status:"approved",legacy:true},
 gator:{name:"Gator",status:"approved",legacy:true}
};

export const DEFAULT_POINTS=[10,6,4,3,2,1];

export function normalizeMraNumber(value){return String(value??"").trim().toUpperCase().replace(/\s+/g,"")}
export function normalizeName(value){return String(value??"").trim().replace(/\s+/g," ")}
export function slugify(value){return normalizeName(value).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48)}
export function currentSeasonId(date=new Date()){return String(date.getFullYear())}

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
 return Object.entries(scores).map(([side,wins],index)=>({side,wins:Number(wins)||0,vehicleId:vehicleIds[side==="a"?0:side==="b"?1:index]||null})).sort((a,b)=>b.wins-a.wins||a.side.localeCompare(b.side));
}

export function buildEventArchive(state,competition={},options={}){
 const event=state?.event||{},reports=event.vehicleReports||{},points=competition?.seasons?.[options.seasonId]?.points||DEFAULT_POINTS;
 const ranked=rankedEntries({...event,lastVehicleIds:state?.session?.setup?.vehicleIds||state?.session?.pursuitVehicleIds||[]});
 let priorWins=null,priorPosition=0;
 const classification=ranked.map((entry,index)=>{
  const position=priorWins===entry.wins?priorPosition:index+1;priorWins=entry.wins;priorPosition=position;
  const report=reports[entry.vehicleId]||{},driver=competition?.drivers?.[report.driverId]||{};
  return {...entry,position,points:Number(points[position-1])||0,vehicleName:competition?.vehicles?.[entry.vehicleId]?.name||LEGACY_VEHICLES[entry.vehicleId]?.name||entry.vehicleId,driverId:report.driverId||null,driverName:report.driverName||driver.name||null,mraNumber:report.mraNumber||driver.mraNumber||null,teamId:driver.teamId||report.teamId||null,teamName:driver.teamName||report.teamName||null};
 });
 return {name:event.name||"MFMA Event",seasonId:options.seasonId,date:options.date||new Date().toISOString().slice(0,10),endedAt:options.endedAt||Date.now(),classification,sessionCount:Math.max(0,(event.sessionNumber||1)-1),circuit:event.circuit||null};
}

export function rebuildStandings(archives={}){
 const standings={drivers:{},teams:{},vehicles:{}};
 const add=(type,id,name,row)=>{if(!id)return;const current=standings[type][id]||{id,name:name||id,points:0,wins:0,podiums:0,events:0};current.name=name||current.name;current.points+=row.points||0;current.wins+=row.position===1?1:0;current.podiums+=row.position<=3?1:0;current.events+=1;standings[type][id]=current};
 for(const archive of Object.values(archives||{}))for(const row of archive?.classification||[]){
  add("drivers",row.driverId,row.driverName,row);add("teams",row.teamId,row.teamName,row);add("vehicles",row.vehicleId,row.vehicleName||row.vehicleId,row);
 }
 return standings;
}

export function sortedStandings(rows={}){return Object.values(rows||{}).sort((a,b)=>(b.points||0)-(a.points||0)||(b.wins||0)-(a.wins||0)||(a.name||"").localeCompare(b.name||""))}
