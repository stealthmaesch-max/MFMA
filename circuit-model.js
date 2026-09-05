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
 return {...root,systemState:"session-complete",activeFlag:"checkered",session:{...session,running:false,resultOfficial:true},event:{...root.event,scores,circuit:{...(root.event.circuit||{}),roles}}};
}
