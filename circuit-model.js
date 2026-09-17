export function normalizeRoleCount(value){
 if(value===true)return 1;
 if(value===false||value==null)return 0;
 const count=Number(value);
 return Number.isFinite(count)?Math.max(0,Math.floor(count)):0;
}

export function normalizeCircuitRoles(roles={},teamIds=["a","b"]){
 return Object.fromEntries(teamIds.map(teamId=>{
  const role=roles[teamId]||{};
  return [teamId,{
   pursuitCount:normalizeRoleCount(role.pursuitCount??role.pursuit),
   evadingCount:normalizeRoleCount(role.evadingCount??role.evading)
  }];
 }));
}

export function getCircuitStatus(circuit={},teamIds=["a","b"]){
 const roles=normalizeCircuitRoles(circuit.roles,teamIds);
 const counts=teamIds.flatMap(teamId=>[roles[teamId].pursuitCount,roles[teamId].evadingCount]);
 const completedCircuitCount=counts.length?Math.min(...counts):0;
 const isCircuitBalanced=counts.length>0&&counts[0]>0&&counts.every(count=>count===counts[0]);
 return {roles,completedCircuitCount,isCircuitBalanced,currentCircuitNumber:completedCircuitCount+1};
}

export function applyOfficialSessionResult(root){
 if(!root?.event||!root?.session||root.session.resultOfficial)return root;
 const session=root.session;
 const teamIds=Object.keys(session.teamNames||{});
 const roles=normalizeCircuitRoles(root.event.circuit?.roles,teamIds);
 if(!roles[session.pursuitTeam]||!roles[session.evadingTeam])return root;
 roles[session.pursuitTeam].pursuitCount+=1;
 roles[session.evadingTeam].evadingCount+=1;
 const scores={...(root.event.scores||{})};
 if(session.provisionalWinner)scores[session.provisionalWinner]=(scores[session.provisionalWinner]||0)+1;
 const participationSessions={...(root.event.participationSessions||{})};
 for(const report of Object.values(root.event.vehicleReports||{})){
  if(report?.driverId)participationSessions[report.driverId]=(participationSessions[report.driverId]||0)+1;
  if(report?.passengerId)participationSessions[report.passengerId]=(participationSessions[report.passengerId]||0)+1;
 }
 const vehicleIds=session.setup?.vehicleIds||session.pursuitVehicleIds||[];
 const sessionResult={
  sessionNumber:session.number||root.event.sessionNumber||1,
  winnerSide:session.provisionalWinner||null,
  reason:session.provisionalReason||"Official session result",
  completedAt:Date.now(),
  entrants:teamIds.map((side,index)=>{
   const vehicleId=vehicleIds[side==="a"?0:side==="b"?1:index]||null,report=root.event.vehicleReports?.[vehicleId]||{};
   return {side,position:session.provisionalWinner?side===session.provisionalWinner?1:2:null,outcome:session.provisionalWinner?side===session.provisionalWinner?"winner":"classified":"no-result",teamId:root.event.teamIds?.[side]||report.teamId||null,teamName:session.teamNames?.[side]||report.teamName||null,vehicleId,driverId:report.driverId||null,driverName:report.driverName||null,mraNumber:report.mraNumber||null};
  })
 };
 const sessionResults=[...(root.event.sessionResults||[]),sessionResult];
 return {...root,systemState:"session-complete",activeFlag:root.activeFlag==="return-to-start"?"return-to-start":"checkered",session:{...session,running:false,resultOfficial:true},event:{...root.event,scores,participationSessions,sessionResults,circuit:{...(root.event.circuit||{}),roles}}};
}
