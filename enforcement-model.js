import {trialRemaining} from "./mutual-spotting.js?v=6";
import {applyDisqualificationWin} from "./circuit-model.js?v=54";

export const DECISION_LABELS={"no-action":"No Further Action",warning:"Warning","time-remedy":"Time Remedy",restart:"Restart Ordered","no-result":"No Result",disqualification:"Session Disqualification","event-disqualification":"Event Disqualification","point-adjustment":"Point Adjustment","participation-restriction":"Participation Restriction","removal-event":"Removal From Event","removal-mfma":"Removal From MFMA Competition"};
const stopped=new Set(["red","mechanical-incident","safety-car","under-review","disqualification","checkered"]);
const reviewModes=new Set(["session-live","sprint-live","provisional","session-complete"]);
export const mutualEvent = root => root?.event?.eventFormat === "mutual-spotting" || root?.systemState === "mutual-spotting" || root?.event?.activeInvestigation?.previousState === "mutual-spotting";
export function enforcementTeams(root) {
 if (mutualEvent(root)) return Object.fromEntries(Object.entries(root.trial?.teams || {}).map(([side,id]) => [side,root.trial?.entrants?.[side]?.teamName || root.event?.teamNames?.[side] || id]));
 return (root?.systemState === "sprint-live" ? root.event?.teamNames : root.session?.teamNames) || root.event?.teamNames || {};
}
export function investigationRecord(root){return root?.event?.activeInvestigation||root?.session?.violationReview||null}

export function openInvestigation(root,input,now=Date.now()){
 if(!root?.event||!(reviewModes.has(root.systemState)||root.systemState==="mutual-spotting")||investigationRecord(root))throw Error("An investigation cannot be opened in the current state.");
 const names=enforcementTeams(root),teamName=names[input.team],reason=String(input.reason||"").trim();
 if(!teamName||!reason||!input.id)throw Error("Choose an affected team and describe the allegation.");
 const mutual=mutualEvent(root),sprint=root.systemState==="sprint-live",source=sprint?root.sprint:root.session;
 const record={violationId:input.id,caseId:input.caseId,type:"review",status:"open",team:input.team,teamName,reason,detail:reason,previousState:root.systemState,previousFlag:root.activeFlag||"clear",previousSessionFlag:root.session?.flag||null,wasRunning:Boolean(source?.running),openedAt:now,issuedAt:now,openedBy:input.official||null};
 const next={...root,systemState:"violation-review",activeFlag:"under-review",event:{...root.event,activeInvestigation:record,violations:{...root.event.violations,[input.id]:record}},updatedAt:now};
 if(mutual){
  const t=root.trial;if(!t||!["formation","finding","start-hold","live","reset","complete"].includes(t.phase))throw Error("Stop the starting lights before opening an investigation.");
  next.trial={...t,remainingMs:trialRemaining(t,now),deadline:null};
  record.wasRunning=t.deadline!=null&&!t.spot;record.heat=t.heat;record.previousTrialPhase=t.phase;
 }
 else if(sprint&&source){const delta=source.running?Math.max(0,now-(source.lastTickAt||now)):0;next.sprint={...source,running:false,lastTickAt:null,...(source.timerMode==="count-up"?{elapsedMs:(source.elapsedMs||0)+delta}:{remainingMs:Math.max(0,(source.remainingMs||0)-delta)})};}
 else if(source){const elapsed=source.running?Math.max(0,now-(source.lastTickAt||now))*(source.flag==="yellow"?.5:1):0;next.session={...source,running:false,remainingMs:Math.max(0,(source.remainingMs||0)-elapsed),lastTickAt:null,flag:"under-review",violationReview:record,terminationType:"review",terminationDetail:reason};}
 return next;
}
// Administrative participation changes require an explicit second action and are atomic with the case audit.
export function applyParticipationRuling(database, caseId, official, now=Date.now()) {
 const root=database?.state,record=root?.event?.violations?.[caseId];
 if(root?.event?.activeInvestigation)throw Error('Resolve the open investigation before applying a participation ruling.');
 if(!record?.followUpRequired||!['participation-restriction','removal-event','removal-mfma'].includes(record.decision))throw Error('This participation ruling is no longer pending.');
 const side=record.team,teamId=root.trial?.teams?.[side]||root.event.teamIds?.[side];
 if(!teamId)throw Error('The affected team identity is missing.');
 const applied={...record,followUpRequired:false,appliedAt:now,appliedBy:official,scope:record.decision==='removal-mfma'?'mfma':'event'};
 let state={...root,activeFlag:root.activeFlag==='red'?'red':'disqualification',event:{...root.event,enforcementOutcomes:{...root.event.enforcementOutcomes,[side]:'dq'},violations:{...root.event.violations,[caseId]:applied},lastEnforcementDecision:applied,activePenalty:applied},updatedAt:now};
 if(mutualEvent(root)){
  const t=root.trial,other=side==='a'?'b':'a';
  state.trial={...t,phase:'complete',endedByDecision:true,deadline:null,remainingMs:0,spot:null,ack:null,replay:false,results:{...t.results,[t.heat]:other},heatOutcomes:{...t.heatOutcomes,[t.heat]:{[side]:'dq',[other]:'winner'}}};
  state.systemState='mutual-spotting';
 }else{
  state.systemState='white-termination';
  if(state.session)state=applyDisqualificationWin({...state,session:{...state.session,running:false,lastTickAt:null}},side,applied.rationale);
  if(state.sprint)state.sprint={...state.sprint,running:false,lastTickAt:null};
 }
 let competition=database.competition||{};
 if(applied.scope==='mfma'){
  if(!competition.teams?.[teamId])throw Error('The team registry record is missing.');
  const drivers={...competition.drivers};
  for(const [id,driver] of Object.entries(drivers))if(driver.teamId===teamId)drivers[id]={...driver,status:'removed',enforcementCase:record.caseId||caseId};
  competition={...competition,teams:{...competition.teams,[teamId]:{...competition.teams[teamId],status:'removed',enforcementCase:record.caseId||caseId}},drivers};
 }
 if(root.activeFlag==='red')state.activeFlag='red';
 return {...database,state,competition};
}


export function decideInvestigation(root,input,now=Date.now()){
 const review=investigationRecord(root);
 if(root?.systemState!=="violation-review"||!review?.violationId||review.violationId!==input.caseId)throw Error("This case has changed or has already been resolved. Reopen the current case.");
 const decision=input.decision,rationale=String(input.rationale||"").trim();
 if(!Object.hasOwn(DECISION_LABELS,decision))throw Error("Choose a decision.");
 if(!rationale||rationale.length>300)throw Error("Enter a separate decision rationale, up to 300 characters.");
 if(decision==="no-action"&&input.timeRemedy)throw Error("No Further Action cannot include a penalty.");
 const mutual=mutualEvent(root),sprint=review.previousState==="sprint-live",regular=!mutual&&!sprint&&Boolean(root.session),dq=new Set(["disqualification","event-disqualification"]).has(decision),terminal=dq||decision==="restart"||decision==="no-result",red=root.activeFlag==="red",flag=red?"red":review.previousFlag||"clear",running=Boolean(review.wasRunning)&&!stopped.has(flag);
 if(dq&&input.timeRemedy)throw Error("A disqualification cannot include a concurrent time remedy.");
 let pendingAdjustment=root.event.pendingAdjustment||null;
 if(decision==="time-remedy"||input.timeRemedy){const remedy=input.timeRemedy,names=enforcementTeams(root);if(!remedy||!names[remedy.benefitingTeam]||remedy.benefitingTeam===review.team||!(mutual?remedy.remedy==="eligibility-runoff":new Set(["reduce-hide","increase-find"]).has(remedy.remedy))||!Number.isInteger(remedy.seconds)||remedy.seconds<1)throw Error("Choose the other team, a valid time remedy, and positive whole seconds.");pendingAdjustment={againstTeam:review.team,...remedy,reason:rationale};}
 const followUp=new Set(["participation-restriction","removal-event","removal-mfma"]).has(decision);
 const record={...review,...(input.timeRemedy?{timeRemedy:{...input.timeRemedy}}:{}),type:"decision",status:decision==="no-action"?"closed-no-action":"decided",decision,rationale,detail:`${DECISION_LABELS[decision]}: ${rationale}`,decidedAt:now,decidedBy:input.official||null,followUpRequired:followUp};
 let next={...root,systemState:review.previousState||"standby",activeFlag:flag,event:{...root.event,activeInvestigation:null,activePenalty:decision==="no-action"?null:record,lastEnforcementDecision:record,decisionNotice:{id:`${review.violationId}:${now}`,caseId:review.caseId,teamName:review.teamName,decision,rationale,expiresAt:now+5000},violations:{...root.event.violations,[review.violationId]:record},pendingAdjustment},updatedAt:now};
 if(decision==="point-adjustment"){if(!Number.isInteger(input.points)||input.points===0||Math.abs(input.points)>100)throw Error("Enter a nonzero whole-point adjustment between -100 and 100.");next.event.pointAdjustments={...next.event.pointAdjustments,[review.team]:Number(next.event.pointAdjustments?.[review.team]||0)+input.points};record.points=input.points;record.followUpRequired=false;}
 if(mutual){
  let t={...root.trial},results={...t.results},outcomes={...t.heatOutcomes},heat=String(review.heat||t.heat),against=review.team,other=against==="a"?"b":"a";
  if(dq){
   results[heat]=other;outcomes[heat]={[against]:"dq",[other]:"winner"};
   t={...t,phase:"reset",results,heatOutcomes:outcomes,replay:false,spot:null,ack:null,deadline:null,remainingMs:0};
   next.activeFlag=red?"red":"disqualification";
   if(decision==="event-disqualification"){
    next.event.enforcementOutcomes={...next.event.enforcementOutcomes,[against]:"dq"};
    t.phase="complete";t.endedByDecision=true;
   }
  }else if(decision==="restart"||decision==="no-result"||input.timeRemedy||decision==="time-remedy"){
   delete results[heat];delete outcomes[heat];
   t={...t,phase:"reset",results,heatOutcomes:outcomes,replay:true,spot:null,ack:null,deadline:null,remainingMs:0};
   if(input.timeRemedy){t.runoff={againstTeam:against,eligibleTeam:other,seconds:input.timeRemedy.seconds,caseId:review.caseId};next.event.pendingAdjustment=null;}
   next.activeFlag=red?"red":"yellow";
  }else if(review.wasRunning&&!red&&!stopped.has(flag))t.deadline=now+(t.remainingMs||0)/(t.clockRate||1);
  next.trial=t;next.systemState="mutual-spotting";
  return next;
 }
 if(sprint&&root.sprint)next.sprint={...root.sprint,running:!terminal&&running,lastTickAt:!terminal&&running?now:null};
 if(regular)next.session={...root.session,running:!terminal&&running&&review.previousState==="session-live",flag:red?"red":review.previousSessionFlag||flag,lastTickAt:!terminal&&running&&review.previousState==="session-live"?now:null,violationReview:null,terminationType:null,terminationDetail:null};
 if(decision==="restart"){next.systemState=sprint?"sprint-live":"standby";next.activeFlag=red?"red":"clear";}
 if(decision==="no-result"){
  next.systemState=sprint?"standby":root.session?.resultOfficial?"session-complete":"provisional";next.activeFlag=red?"red":"checkered";
  if(sprint)next.sprint={...next.sprint,active:false};
  if(regular){next.session={...next.session,provisionalWinner:null,provisionalReason:record.detail};if(root.session.resultOfficial){const results=[...(root.event.sessionResults||[])],index=results.findLastIndex(r=>Number(r.sessionNumber)===Number(root.session.number));if(index<0)throw Error("The official session record is missing. Correct the event record before changing its result.");const prior=results[index],scores={...root.event.scores};if(prior.winnerSide)scores[prior.winnerSide]=Math.max(0,(scores[prior.winnerSide]||0)-1);results[index]={...prior,winnerSide:null,reason:record.detail,entrants:(prior.entrants||[]).map(e=>({...e,outcome:"no-result",position:null}))};next.event={...next.event,scores,sessionResults:results};}}
 }
 if(dq){next.systemState="white-termination";next.activeFlag="disqualification";if(regular)next=applyDisqualificationWin(next,review.team,record.detail);if(red)next.activeFlag="red";}
 if(decision==="event-disqualification")next.event={...next.event,enforcementOutcomes:{...next.event.enforcementOutcomes,[review.team]:"dq"}};
 return next;
}
