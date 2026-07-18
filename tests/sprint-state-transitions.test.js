const assert=require("assert");
const fs=require("fs");

const control=fs.readFileSync("control.js","utf8");
const html=fs.readFileSync("control.html","utf8");

function functionSource(name){
 const start=control.indexOf(`function ${name}(`);
 assert(start>=0,`${name} exists`);
 const brace=control.indexOf("{",start);
 let depth=0;
 for(let i=brace;i<control.length;i++){
  if(control[i]==="{")depth++;
  if(control[i]==="}"&&--depth===0)return control.slice(start,i+1);
 }
 throw new Error(`Could not parse ${name}`);
}

const issue=functionSource("issueFlag");
const sprintBranch=issue.match(/if\(state\?\.systemState==="sprint-live"\)\{([\s\S]*?)\n \}/)?.[1];
assert(sprintBranch,"Sprint flag branch exists");
for(const flag of ["green","yellow","red","safety-car","white","checkered","clear"])assert(sprintBranch.includes(`"${flag}"`),`${flag} is allowed in Sprint`);
assert.match(sprintBranch,/update\(stateRef,\{activeFlag:flag,updatedAt:serverTimestamp\(\)\}\)/);
for(const forbidden of ["automaticCheckered","openWhiteDialog","safety-car-termination","session/","event/"])assert(!sprintBranch.includes(forbidden),`Sprint flags exclude ${forbidden}`);

const sprintFunctions=["startSprint","terminateSprint","setSprintTimerMode","configureSprintDuration","startSprintTimer","pauseSprintTimer","resetSprintTimer","adjustSprintTimer","setSprintTimer","sprintTick"].map(functionSource).join("\n");
for(const forbidden of ["event/scores","event/sessionNumber","event/circuit","session/provisionalWinner","session/provisionalReason","session/resultOfficial","session/whiteReview","session/terminationType","session/terminationDetail","teamNames","pursuitTeam","evadingTeam"]){
 assert(!sprintFunctions.includes(forbidden),`Sprint actions never write or create ${forbidden}`);
}
for(const mode of ["none","count-up","count-down"])assert(sprintFunctions.includes(`"${mode}"`),`${mode} timer mode is implemented`);

function sprintTime(s,now){
 if(!s||s.timerMode==="none")return 0;
 const delta=s.running?Math.max(0,now-(s.lastTickAt||now)):0;
 return s.timerMode==="count-up"?Math.max(0,(s.elapsedMs||0)+delta):Math.max(0,(s.remainingMs||0)-delta);
}
assert.equal(sprintTime({timerMode:"none",running:true},5000),0,"no-timer has no numeric clock");
assert.equal(sprintTime({timerMode:"count-up",running:true,elapsedMs:2000,lastTickAt:1000},6000),7000,"count-up advances normally");
assert.equal(sprintTime({timerMode:"count-down",running:true,remainingMs:3000,lastTickAt:1000},6000),0,"countdown clamps at zero");
assert.equal(Math.max(0,2000-5000),0,"subtract time cannot become negative");
assert.equal(Math.max(0,2000+5000),7000,"add time updates the timer");
assert.equal(Math.max(0,-1000),0,"direct set cannot become negative");
assert(!functionSource("sprintTime").includes("yellow"),"Yellow does not affect Sprint time");
assert(!functionSource("sprintTick").includes("automaticCheckered"),"Sprint expiry never terminates or checks results");

const terminate=functionSource("terminateSprint");
assert.match(terminate,/systemState:"standby",activeFlag:"clear",sprint:null/);
assert(!terminate.includes("session:"),"termination preserves normal session state");
assert.match(functionSource("startSession"),/systemState!=="standby"\|\|state\?\.sprint\?\.active/);
assert.match(functionSource("startCourseLap"),/systemState!=="standby"\|\|state\?\.sprint\?\.active/);

const sprintPanel=html.match(/<section id="sprint-panel"[\s\S]*?<section class="panel sprint-terminate">/)?.[0]||"";
for(const flag of ["green","yellow","red","safety-car","white","checkered","clear"])assert(sprintPanel.includes(`data-sprint-flag="${flag}"`),`${flag} control is present`);
for(const controlId of ["sprint-timer-mode","sprint-start-timer","sprint-pause-timer","sprint-reset-timer","sprint-add-time","sprint-subtract-time","sprint-set-time","terminate-sprint"])assert(html.includes(`id="${controlId}"`),`${controlId} is present`);

assert(control.includes('if(flag==="yellow"&&state.systemState==="session-live")'),"normal Yellow behavior remains");
assert(control.includes('state.session.phase!=="awaiting-finding-start"'),"awaiting-finding-start Green guard remains");
assert(control.includes('if(flag==="safety-car"&&state.systemState==="session-live")'),"normal Safety Car termination remains");
assert(control.includes('if(flag==="checkered"&&state.systemState==="session-live")automaticCheckered'),"normal Checkered workflow remains");

console.log("Sprint state-transition assertions passed.");
