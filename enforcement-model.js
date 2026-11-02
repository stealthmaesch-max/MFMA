import {applyDisqualificationWin} from "./circuit-model.js?v=54";

export const DECISION_LABELS={"no-action":"No Further Action",warning:"Warning","time-remedy":"Time Remedy",restart:"Restart Ordered","no-result":"No Result",disqualification:"Session Disqualification","event-disqualification":"Event Disqualification","point-adjustment":"Point Adjustment","participation-restriction":"Participation Restriction","removal-event":"Removal From Event","removal-mfma":"Removal From MFMA Competition"};
const stopped=new Set(["red","mechanical-incident","safety-car","under-review","disqualification","checkered"]);
const reviewModes=new Set(["session-live","sprint-live","provisional","session-complete"]);
export function investigationRecord(root){return root?.event?.activeInvestigation||root?.session?.violationReview||null}

export function openInvestigation(root,input,now=Date.now()){
 if(!root?.event||!reviewModes.has(root.systemState)||investigationRecord(root))throw Error("An investigation cannot be opened in the current state.");
 const names=(root.systemState==="sprint-live"?root.event.teamNames:root.session?.teamNames)||root.event.teamNames||{},teamName=names[input.team],reason=String(input.reason||"").trim();
 if(!teamName||!reason||!input.id)throw Error("Choose an affected team and describe the allegation.");
 const sprint=root.systemState==="sprint-live",source=sprint?root.sprint:root.session;
 const record={violationId:input.id,caseId:input.caseId,type:"review",status:"open",team:input.team,teamName,reason,detail:reason,previousState:root.systemState,previousFlag:root.activeFlag||"clear",previousSessionFlag:root.session?.flag||null,wasRunning:Boolean(source?.running),openedAt:now,issuedAt:now,openedBy:input.official||null};
 const next={...root,systemState:"violation-review",activeFlag:"under-review",event:{...root.event,activeInvestigation:record,violations:{...root.event.violations,[input.id]:record}},updatedAt:now};
 if(sprint&&source){const delta=source.running?Math.max(0,now-(source.lastTickAt||now)):0;next.sprint={...source,running:false,lastTickAt:null,...(source.timerMode==="count-up"?{elapsedMs:(source.elapsedMs||0)+delta}:{remainingMs:Math.max(0,(source.remainingMs||0)-delta)})};}
 else if(source){const elapsed=source.running?Math.max(0,now-(source.lastTickAt||now))*(source.flag==="yellow"?.5:1):0;next.session={...source,running:false,remainingMs:Math.max(0,(source.remainingMs||0)-elapsed),lastTickAt:null,flag:"under-review",violationReview:record,terminationType:"review",terminationDetail:reason};}
 return next;
}

export function decideInvestigation(root,input,now=Date.now()){
 const review=investigationRecord(root);
 if(root?.systemState!=="violation-review"||!review?.violationId||review.violationId!==input.caseId)throw Error("This case has changed or has already been resolved. Reopen the current case.");
 const decision=input.decision,rationale=String(input.rationale||"").trim();
 if(!Object.hasOwn(DECISION_LABELS,decision))throw Error("Choose a decision.");
 if(!rationale||rationale.length>300)throw Error("Enter a separate decision rationale, up to 300 characters.");
 if(decision==="no-action"&&input.timeRemedy)throw Error("No Further Action cannot include a penalty.");
 const sprint=review.previousState==="sprint-live",regular=!sprint&&Boolean(root.session),dq=new Set(["disqualification","event-disqualification"]).has(decision),terminal=dq||decision==="restart"||decision==="no-result",red=root.activeFlag==="red",flag=red?"red":review.previousFlag||"clear",running=Boolean(review.wasRunning)&&!stopped.has(flag);
 let pendingAdjustment=root.event.pendingAdjustment||null;
 if(decision==="time-remedy"||input.timeRemedy){const remedy=input.timeRemedy,names=root.session?.teamNames||root.event.teamNames||{};if(!remedy||!names[remedy.benefitingTeam]||remedy.benefitingTeam===review.team||!new Set(["reduce-hide","increase-find"]).has(remedy.remedy)||!Number.isInteger(remedy.seconds)||remedy.seconds<1)throw Error("Choose the other team, a valid time remedy, and positive whole seconds.");pendingAdjustment={againstTeam:review.team,...remedy,reason:rationale};}
 const followUp=new Set(["point-adjustment","participation-restriction","removal-event","removal-mfma"]).has(decision);
 const record={...review,type:"decision",status:decision==="no-action"?"closed-no-action":"decided",decision,rationale,detail:`${DECISION_LABELS[decision]}: ${rationale}`,decidedAt:now,decidedBy:input.official||null,followUpRequired:followUp};
 let next={...root,systemState:review.previousState||"standby",activeFlag:flag,event:{...root.event,activeInvestigation:null,activePenalty:decision==="no-action"?null:record,lastEnforcementDecision:record,decisionNotice:{id:`${review.violationId}:${now}`,caseId:review.caseId,teamName:review.teamName,decision,rationale,expiresAt:now+5000},violations:{...root.event.violations,[review.violationId]:record},pendingAdjustment},updatedAt:now};
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
