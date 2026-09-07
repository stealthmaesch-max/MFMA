import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getDatabase, ref, set, update, onValue, serverTimestamp, runTransaction } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import {
  getAuth,
  GithubAuthProvider,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js?v=40";
import { vehicles } from "./personnel.js?v=40";
import { signals } from "./signals.js?v=61";
import { getRenderMode, showOnly } from "./display-state.js?v=60";
import { enableSounds, getSoundStatus, onSoundStatus, playStateTransition, playSound } from "./sounds.js?v=60";
import { getCircuitStatus, applyOfficialSessionResult } from "./circuit-model.js?v=52";
import { newOpenHazardIds } from "./report-model.js?v=57";

const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
const githubProvider=new GithubAuthProvider();
const googleProvider=new GoogleAuthProvider();
const db=getDatabase(app);
const stateRef=ref(db,"mfma/state");
const $=id=>document.getElementById(id);
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]);
let state=null,sessionType="vehicle-vehicle",roleIndex=0,currentUser=null,warningTimer=null;

const E={connection:$("connection"),noEvent:$("no-event"),eventArea:$("event-area"),standby:$("standby-panel"),setup:$("setup-panel"),sprint:$("sprint-panel"),live:$("live-panel"),provisional:$("provisional-panel"),eventName:$("event-name"),eventMeta:$("event-meta"),roleSummary:$("role-summary"),hide:$("hide-seconds"),find:$("find-seconds"),validation:$("validation"),phase:$("phase-name"),timer:$("timer"),sessionLabel:$("session-label"),roles:$("roles"),active:$("active-state"),badge:$("live-badge"),findingStart:$("finding-start-panel"),spots:$("spot-buttons"),scoreboard:$("scoreboard"),between:$("between-scoreboard"),circuit:$("circuit-progress"),provisionalDetail:$("provisional-detail"),resultTitle:$("result-title"),finalize:$("finalize-result"),next:$("next-session"),courseLap:$("course-lap-panel"),courseLapStatus:$("course-lap-status"),termination:$("termination-panel"),terminationTitle:$("termination-title"),terminationDetail:$("termination-detail")};


const authPanel=$("auth-panel");
const securedControl=$("secured-control");
const authStatus=$("auth-status");
const authError=$("auth-error");
const accountName=$("account-name");
const controlSound=$("control-sound");

function renderControlSound({state:audioState}){controlSound.textContent=audioState==="enabled"?"Sound On":"Enable Sounds";controlSound.dataset.state=audioState}
controlSound.onclick=async()=>{try{await enableSounds()}catch(error){console.warn("Unable to enable Race Control sounds",error)}renderControlSound(getSoundStatus())};
onSoundStatus(renderControlSound);

function providerLabel(user){
 const provider=user?.providerData?.[0]?.providerId||"firebase";
 if(provider==="github.com")return "GitHub";
 if(provider==="google.com")return "Google";
 return "Firebase";
}

function displayUserName(user){
 return user?.displayName||user?.email||"Authorized user";
}

function setAuthError(message=""){
 authError.textContent=message;
}

async function beginProviderSignIn(provider,label){
 setAuthError("");
 authStatus.textContent=`Opening ${label} sign-in…`;
 try{
  await signInWithPopup(auth,provider);
 }catch(error){
  console.error(`${label} sign-in failed`,error);
  const messages={
   "auth/popup-closed-by-user":"Sign-in was canceled.",
   "auth/popup-blocked":"The browser blocked the sign-in window. Allow pop-ups for this site and try again.",
   "auth/unauthorized-domain":"Add stealthmaesch-max.github.io to Firebase Authentication authorized domains.",
   "auth/account-exists-with-different-credential":"That email is already connected to another provider. Sign in with that provider first.",
   "auth/operation-not-allowed":`${label} sign-in is not enabled in Firebase Authentication.`
  };
  setAuthError(messages[error.code]||`Sign-in failed: ${error.message}`);
  authStatus.textContent="Not signed in";
 }
}

$("github-sign-in").onclick=()=>beginProviderSignIn(githubProvider,"GitHub");
$("google-sign-in").onclick=()=>beginProviderSignIn(googleProvider,"Google");

$("sign-out").onclick=async()=>{
 try{
  await signOut(auth);
 }catch(error){
  console.error("Sign-out failed",error);
  setAuthError(`Sign-out failed: ${error.message}`);
 }
};

$("copy-uid").onclick=async()=>{
 if(!currentUser)return;
 try{
  await navigator.clipboard.writeText(currentUser.uid);
  $("copy-uid").textContent="UID Copied";
  setTimeout(()=>$("copy-uid").textContent="Copy UID",1500);
 }catch(error){
  prompt("Copy this Firebase UID:",currentUser.uid);
 }
};

setPersistence(auth,browserLocalPersistence).catch(error=>{
 console.warn("Could not set local authentication persistence",error);
});

onAuthStateChanged(auth,user=>{
 currentUser=user||null;
 const signedIn=Boolean(user);
 authPanel.classList.toggle("hidden",signedIn);
 securedControl.classList.toggle("hidden",!signedIn);

 if(signedIn){
  authStatus.textContent="Signed in";
  accountName.textContent=`${displayUserName(user)} • ${providerLabel(user)}`;
  setAuthError("");
 }else{
  authStatus.textContent="Choose a sign-in method";
  accountName.textContent="Signed out";
 }
});

function requireAuthenticatedWrite(){
 if(currentUser)return true;
 setAuthError("Race Control requires sign-in before making changes.");
 authPanel.classList.remove("hidden");
 securedControl.classList.add("hidden");
 return false;
}

function fmt(ms){const t=Math.max(0,Math.ceil(ms/1000));return `${String(Math.floor(t/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`}
function sprintTime(s=state?.sprint,now=Date.now()){
 if(!s||s.timerMode==="none")return 0;
 const delta=s.running?Math.max(0,now-(s.lastTickAt||now)):0;
 return s.timerMode==="count-up"?Math.max(0,(s.elapsedMs||0)+delta):Math.max(0,(s.remainingMs||0)-delta);
}
function sprintTimerPatch(s=state?.sprint,now=Date.now()){
 const value=sprintTime(s,now);
 return s.timerMode==="count-up"?{"sprint/elapsedMs":value,"sprint/lastTickAt":s.running?now:null}:{"sprint/remainingMs":value,"sprint/lastTickAt":s.running?now:null};
}
function setConn(kind,text){E.connection.className=`pill ${kind||""}`;E.connection.querySelector("span:last-child").textContent=text}
function availableVehicles(){return ["ranger","shelly","gator"].filter(v=>$(`available-${v}`).checked)}
function currentTeams(){
 if(sessionType==="vehicle-vehicle"){
  const a=$("vv-team-1").value,b=$("vv-team-2").value;
  return {a,b,names:{a:vehicles[a]?.name+" Team",b:vehicles[b]?.name+" Team"}}
 }
 return {a:"a",b:"b",names:{a:$("vf-team-a").value||"Team A",b:$("vf-team-b").value||"Team B"}}
}
function rolePair(){const t=currentTeams();return roleIndex%2===0?{pursuit:"a",evading:"b",names:t.names}:{pursuit:"b",evading:"a",names:t.names}}

function renderVVSelectors(){
 const ids=availableVehicles();
 for(const id of ["vv-team-1","vv-team-2"]){
  const s=$(id),prev=s.value;s.innerHTML=ids.map(v=>`<option value="${v}">${vehicles[v].name}</option>`).join("");
  if(prev&&ids.includes(prev))s.value=prev;
 }
 if(ids.length>1&&$("vv-team-1").value===$("vv-team-2").value)$("vv-team-2").value=ids[1];
 updateRoleSummary();
}
function renderVF(){
 updateRoleSummary();
}
function updateRoleSummary(){const r=rolePair();E.roleSummary.textContent=`${r.names[r.pursuit]} pursuing • ${r.names[r.evading]} evading`}

function collectSetup(){
 const r=rolePair();
 if(sessionType==="vehicle-vehicle"){
  const ids=[$("vv-team-1").value,$("vv-team-2").value];
  return {format:sessionType,teamNames:r.names,role:r,vehicleIds:ids,pursuitVehicleIds:[ids[r.pursuit==="a"?0:1]],evadingVehicleId:ids[r.evading==="a"?0:1]};
 }
 const v=$("vf-vehicle").value;
 return {format:sessionType,teamNames:r.names,role:r,pursuitVehicleIds:[v],pursuitVehicle:v,evadingOnFoot:true};
}
function validate(){
 const errors=[],setup=collectSetup();
 if(sessionType==="vehicle-vehicle"){
  if($("vv-team-1").value===$("vv-team-2").value)errors.push("Choose two different vehicle teams.");
 }
 E.validation.classList.toggle("hidden",!errors.length);E.validation.innerHTML=errors.length?`<strong>Fix before starting:</strong><ul>${errors.map(e=>`<li>${e}</li>`).join("")}</ul>`:"";
 return {ok:!errors.length,setup};
}

async function createEvent(){
 if(!requireAuthenticatedWrite())return;
 await set(stateRef,{systemState:"standby",activeFlag:"clear",event:{name:$("new-event-name").value||"MFMA Event",scores:{},sessionNumber:1,circuit:{format:null,roleIndex:0,roles:{}},pendingAdjustment:null,courseLap:{required:true,status:"pending"}},session:null,sprint:null,updatedAt:serverTimestamp()});
 $("event-dialog").close();
}

async function startSession(){
 if(!requireAuthenticatedWrite())return;
 if(state?.systemState!=="standby"||state?.sprint?.active)return;
 if(state.event?.courseLap?.required&&state.event.courseLap.status!=="complete"){alert("Complete the Safety Car familiarization lap before Session 1.");return}
 const v=validate();if(!v.ok)return;
 const r=v.setup.role,now=Date.now();let hide=Number(E.hide.value)*1000,find=Number(E.find.value)*1000;
 const adj=state.event.pendingAdjustment;
 if(adj){
  if(adj.remedy==="reduce-hide"&&r.evading===adj.benefitingTeam)hide=Math.max(1000,hide-adj.seconds*1000);
  if(adj.remedy==="increase-find"&&r.pursuit===adj.benefitingTeam)find+=adj.seconds*1000;
 }
 const spotIds=v.setup.pursuitVehicleIds||[];
 const session={number:state.event.sessionNumber||1,format:sessionType,teamNames:v.setup.teamNames,pursuitTeam:r.pursuit,evadingTeam:r.evading,setup:v.setup,phase:"hiding",remainingMs:hide,hideDurationMs:hide,findDurationMs:find,running:true,lastTickAt:now,flag:"green",spotStatus:Object.fromEntries(spotIds.map(id=>[id,false])),pursuitVehicleIds:spotIds,provisionalWinner:null,provisionalReason:null};
 const scores={...(state.event.scores||{})};for(const k of Object.keys(v.setup.teamNames))if(scores[k]===undefined)scores[k]=0;
 await update(stateRef,{systemState:"session-live",activeFlag:"green",session,"event/scores":scores,"event/teamNames":v.setup.teamNames,"event/circuit/format":sessionType,"event/circuit/roleIndex":roleIndex,"event/pendingAdjustment":null,updatedAt:serverTimestamp()});
}

async function startSprint(){
 if(!requireAuthenticatedWrite())return;
 if(state?.systemState!=="standby"||state?.sprint?.active)return;
 await update(stateRef,{systemState:"sprint-live",activeFlag:"clear",sprint:{active:true,timerMode:"none",running:false,remainingMs:0,elapsedMs:0,configuredMs:0,lastTickAt:null},updatedAt:serverTimestamp()});
}

async function terminateSprint(){
 if(!requireAuthenticatedWrite())return;
 if(state?.systemState!=="sprint-live"||!state?.sprint?.active)return;
 await update(stateRef,{systemState:"standby",activeFlag:"clear",sprint:null,updatedAt:serverTimestamp()});
}

async function setSprintTimerMode(){
 if(!requireAuthenticatedWrite()||state?.systemState!=="sprint-live")return;
 const timerMode=$("sprint-timer-mode").value,configuredMs=Math.max(0,Number($("sprint-duration").value)||0)*1000;
 const patch={"sprint/timerMode":timerMode,"sprint/running":false,"sprint/lastTickAt":null,updatedAt:serverTimestamp()};
 if(timerMode==="count-up")patch["sprint/elapsedMs"]=0;
 if(timerMode==="count-down"){patch["sprint/configuredMs"]=configuredMs;patch["sprint/remainingMs"]=configuredMs}
 await update(stateRef,patch);
}

async function configureSprintDuration(){
 if(!requireAuthenticatedWrite()||state?.systemState!=="sprint-live")return;
 const configuredMs=Math.max(0,Number($("sprint-duration").value)||0)*1000;
 await update(stateRef,{"sprint/configuredMs":configuredMs,updatedAt:serverTimestamp()});
}

async function startSprintTimer(){
 if(!requireAuthenticatedWrite()||state?.systemState!=="sprint-live"||state.sprint?.timerMode==="none")return;
 await update(stateRef,{...sprintTimerPatch(),"sprint/running":true,"sprint/lastTickAt":Date.now(),updatedAt:serverTimestamp()});
}

async function pauseSprintTimer(){
 if(!requireAuthenticatedWrite()||state?.systemState!=="sprint-live"||!state.sprint?.running)return;
 await update(stateRef,{...sprintTimerPatch(),"sprint/running":false,"sprint/lastTickAt":null,updatedAt:serverTimestamp()});
}

async function resetSprintTimer(){
 if(!requireAuthenticatedWrite()||state?.systemState!=="sprint-live")return;
 const s=state.sprint,patch={"sprint/running":false,"sprint/lastTickAt":null,updatedAt:serverTimestamp()};
 if(s.timerMode==="count-up")patch["sprint/elapsedMs"]=0;
 if(s.timerMode==="count-down")patch["sprint/remainingMs"]=Math.max(0,s.configuredMs||0);
 await update(stateRef,patch);
}

async function adjustSprintTimer(deltaMs){
 if(!requireAuthenticatedWrite()||state?.systemState!=="sprint-live"||state.sprint?.timerMode==="none")return;
 const s=state.sprint,now=Date.now(),value=Math.max(0,sprintTime(s,now)+deltaMs),field=s.timerMode==="count-up"?"sprint/elapsedMs":"sprint/remainingMs";
 await update(stateRef,{[field]:value,"sprint/lastTickAt":s.running?now:null,updatedAt:serverTimestamp()});
}

async function setSprintTimer(){
 const value=Math.max(0,Number($("sprint-direct-time").value)||0)*1000;
 await adjustSprintTimer(value-sprintTime());
}

async function automaticCheckered(winner,reason){
 if(!requireAuthenticatedWrite())return;await update(stateRef,{systemState:"provisional",activeFlag:"checkered","session/running":false,"session/provisionalWinner":winner,"session/provisionalReason":reason,updatedAt:serverTimestamp()})}

async function issueFlag(flag){
 if(!requireAuthenticatedWrite())return;
 if(state?.systemState==="sprint-live"){
  const sprintFlags=new Set(["green","yellow","move-over","red","safety-car","checkered","clear"]);
  if(!state?.sprint?.active||!sprintFlags.has(flag))return;
  await update(stateRef,{activeFlag:flag,updatedAt:serverTimestamp()});
  return;
 }
 if(state?.systemState==="standby"){
  const standbyFlags=new Set(["yellow","move-over","red","safety-car","checkered","clear"]);
  if(!standbyFlags.has(flag))return;
  await update(stateRef,{activeFlag:flag,updatedAt:serverTimestamp()});
  return;
 }
 if(!state?.session||state.systemState!=="session-live")return;
 if(flag==="yellow"&&state.systemState==="session-live"){await update(stateRef,{activeFlag:"yellow","session/flag":"yellow","session/lastTickAt":Date.now(),updatedAt:serverTimestamp()});return}
 if(flag==="move-over"&&state.systemState==="session-live"){await update(stateRef,{activeFlag:"move-over",updatedAt:serverTimestamp()});return}
 if(flag==="green"&&state.systemState==="session-live"&&state.session.phase!=="awaiting-finding-start"){await update(stateRef,{activeFlag:"green","session/flag":"green","session/running":true,"session/lastTickAt":Date.now(),updatedAt:serverTimestamp()});return}
 if(flag==="red"&&state.systemState==="session-live"){await update(stateRef,{activeFlag:"red","session/flag":"red","session/running":false,updatedAt:serverTimestamp()});return}
 if(flag==="safety-car"&&state.systemState==="session-live"){await update(stateRef,{systemState:"safety-car-termination",activeFlag:"safety-car","session/running":false,"session/terminationType":"safety-car","session/terminationDetail":"Session terminated by Safety Car. Follow the Official Vehicle.",updatedAt:serverTimestamp()});return}
 if(flag==="checkered"&&state.systemState==="session-live")automaticCheckered(null,"Manual Checkered");
}

async function confirmSpot(id){
 if(!requireAuthenticatedWrite())return;
 if(state?.systemState!=="session-live"||state?.session?.phase!=="finding"||!state.session.pursuitVehicleIds?.includes(id)||state.session.spotStatus?.[id])return;
 const status={...(state.session.spotStatus||{}),[id]:true};await update(stateRef,{"session/spotStatus":status,updatedAt:serverTimestamp()});
 if(state.session.pursuitVehicleIds.every(v=>v===id||status[v]))await automaticCheckered(state.session.pursuitTeam,"All required pursuit vehicles confirmed valid radio spots");
}

async function startFinding(){
 if(!requireAuthenticatedWrite())return;
 if(state?.systemState!=="session-live"||state?.session?.phase!=="awaiting-finding-start")return;
 const now=Date.now();
 await update(stateRef,{"session/phase":"finding","session/remainingMs":state.session.findDurationMs,"session/running":true,"session/lastTickAt":now,updatedAt:serverTimestamp()});
}

function tick(){
 if(!state?.session||state.systemState!=="session-live"||!state.session.running)return;
 const s=state.session,elapsed=Date.now()-(s.lastTickAt||Date.now()),factor=s.flag==="yellow"?0.5:1,remaining=Math.max(0,s.remainingMs-elapsed*factor);
 E.timer.textContent=fmt(remaining);$("toolbar-timer").textContent=fmt(remaining);
 if(remaining<=0){
  if(s.flag==="yellow"){E.timer.textContent="00:01";return}
  if(s.phase==="hiding")update(stateRef,{"session/phase":"awaiting-finding-start","session/remainingMs":s.findDurationMs,"session/running":false,updatedAt:serverTimestamp()});
  else automaticCheckered(s.evadingTeam,"Finding period expired");
 }else if(elapsed>=900)update(stateRef,{"session/remainingMs":remaining,"session/lastTickAt":Date.now(),updatedAt:serverTimestamp()});
}

function sprintTick(){
 if(state?.systemState!=="sprint-live"||!state?.sprint?.active)return;
 const s=state.sprint,value=sprintTime(s);
 $("sprint-timer").textContent=s.timerMode==="none"?"NO TIMER":fmt(value);$("toolbar-timer").textContent=s.timerMode==="none"?"NO TIMER":fmt(value);
 if(!s.running)return;
 if(s.timerMode==="count-down"&&value<=0){update(stateRef,{"sprint/remainingMs":0,"sprint/running":false,"sprint/lastTickAt":null,updatedAt:serverTimestamp()});return}
 if(Date.now()-(s.lastTickAt||Date.now())>=900)update(stateRef,{...sprintTimerPatch(),updatedAt:serverTimestamp()});
}

function populateWhite(){
 const session=state?.session||{};
 const names=session.teamNames||{};
 const teamEntries=Object.entries(names);

 if(!teamEntries.length){
  throw new Error("No session team information is available. Return to Standby and start a new session.");
 }

 const teamOptions=teamEntries
  .map(([key,name])=>`<option value="${key}">${name}</option>`)
  .join("");

 $("dq-team").innerHTML=teamOptions;
 $("benefiting-team").innerHTML=teamOptions;

}
function openWhiteDialog(){
 try{
  if(!state?.session){
   throw new Error("No active or recently completed session is available for rule enforcement.");
  }

  populateWhite();

  const overlay=$("white-review-overlay");
  if(!overlay){
   throw new Error("The Issue Violation panel is missing from control.html.");
  }

  overlay.classList.remove("hidden");
  overlay.style.display="grid";
  document.body.classList.add("modal-open");
 }catch(error){
  console.error("Issue Violation failed:",error);
  alert(`Issue Violation could not open: ${error.message}`);
 }
}

function syncViolationForm(){
 const type=$("violation-type").value;
 const disqualification=type==="disqualification";
 $("disqualification-options").classList.toggle("hidden",!disqualification);
 $("violation-guidance").textContent=disqualification?"Records the Race Director's decision and opens the official outcome workflow.":type==="review"?"Displays White, pauses the session, and directs everyone to the starting zone for review.":"Displays white crossed with folded yellow for 10 seconds, then automatically returns to Green.";
 $("issue-violation-submit").textContent=disqualification?"Issue Disqualification":type==="review"?"Begin Review":"Issue 10-Second Warning";
}

function closeViolationDialog(){const overlay=$("white-review-overlay");overlay.classList.add("hidden");overlay.style.display="";document.body.classList.remove("modal-open")}
function currentSessionRemaining(){const s=state?.session;if(!s)return 0;if(!s.running)return s.remainingMs||0;const factor=s.flag==="yellow"?0.5:1;return Math.max(0,(s.remainingMs||0)-(Date.now()-(s.lastTickAt||Date.now()))*factor)}

async function resolveWhiteForm(){
 if(!requireAuthenticatedWrite())return;
 const violationType=$("violation-type").value;
 const dq=$("dq-team").value;
 const reason=$("dq-reason").value;
 const additionalPenalty=$("penalty-type").value;
 const outcome=$("white-outcome").value;
 const names=state.session.teamNames;
 const opponent=Object.keys(names).find(key=>key!==dq);

 const violationId=`v${Date.now()}`;
 if(violationType==="warning"){
  if(state.systemState!=="session-live"){alert("Infraction warnings can only be issued during a live session.");return}
  const expiresAt=Date.now()+10000;
  const detail=`Infraction warning for ${names[dq]}. Reason: ${reason}.`;
  const violation={type:"warning",team:dq,reason,detail,issuedAt:serverTimestamp(),expiresAt};
  await update(stateRef,{activeFlag:"infraction-warning","session/flag":"infraction-warning","session/remainingMs":currentSessionRemaining(),"session/lastTickAt":state.session.running?Date.now():null,"session/violationReview":violation,[`event/violations/${violationId}`]:violation,updatedAt:serverTimestamp()});
  closeViolationDialog();return;
 }

 if(violationType==="review"){
  if(state.systemState!=="session-live"){alert("A review can only begin during a live session.");return}
  const detail=`${names[dq]} placed under review. Reason: ${reason}. Return to the starting zone and await the Race Director.`;
  const violation={type:"review",team:dq,reason,detail,issuedAt:serverTimestamp()};
  await update(stateRef,{systemState:"violation-review",activeFlag:"under-review","session/running":false,"session/remainingMs":currentSessionRemaining(),"session/lastTickAt":null,"session/flag":"under-review","session/violationReview":violation,"session/terminationType":"review","session/terminationDetail":detail,[`event/violations/${violationId}`]:violation,updatedAt:serverTimestamp()});
  closeViolationDialog();return;
 }

 let winner=null;
 let nextState="white-termination";
 let pendingAdjustment=null;

 let detail=`${names[dq]} disqualified after review. Reason: ${reason}.`;

 if(additionalPenalty==="time"){
  pendingAdjustment={
   againstTeam:dq,
   benefitingTeam:$("benefiting-team").value,
   remedy:$("time-remedy").value,
   seconds:Number($("time-seconds").value),
   reason
  };

  detail+=
   ` Additional penalty: ${
    pendingAdjustment.remedy==="reduce-hide"
     ?"hiding time reduced"
     :"finding time increased"
   } by ${pendingAdjustment.seconds} seconds for ${names[pendingAdjustment.benefitingTeam]}.`;
 }

 if(outcome==="award-opponent")winner=opponent;
 if(outcome==="preserve")winner=state.session.provisionalWinner;
 if(outcome==="restart")nextState="standby";
 if(outcome==="no-result")winner=null;

 await update(stateRef,{
  systemState:nextState,
  activeFlag:nextState==="standby"?"clear":"disqualification",
  "session/running":false,
  "session/violationReview":{
   type:"disqualification",
   dq,
   reason,
   additionalPenalty,
   outcome,
   detail
  },
  "session/provisionalWinner":winner,
  "session/provisionalReason":detail,
  "session/terminationType":"disqualification",
  "session/terminationDetail":detail,
  [`event/violations/${violationId}`]:{type:"disqualification",team:dq,reason,detail,issuedAt:serverTimestamp()},
  "event/pendingAdjustment":pendingAdjustment,
  updatedAt:serverTimestamp()
 });

 closeViolationDialog();
}

async function resumeViolationReview(){if(!requireAuthenticatedWrite()||state?.systemState!=="violation-review")return;await update(stateRef,{systemState:"session-live",activeFlag:"green","session/running":true,"session/flag":"green","session/lastTickAt":Date.now(),"session/terminationType":null,"session/terminationDetail":null,updatedAt:serverTimestamp()})}
function openDisqualificationReview(){if(state?.systemState!=="violation-review")return;openWhiteDialog();$("violation-type").value="disqualification";syncViolationForm()}
async function noResultViolationReview(){if(!requireAuthenticatedWrite()||state?.systemState!=="violation-review")return;const detail="No result following violation review.";await update(stateRef,{systemState:"provisional",activeFlag:"checkered","session/running":false,"session/provisionalWinner":null,"session/provisionalReason":detail,"session/terminationType":null,"session/terminationDetail":null,updatedAt:serverTimestamp()})}

function scheduleWarningReturn(){
 if(warningTimer){clearTimeout(warningTimer);warningTimer=null}
 const warning=state?.session?.violationReview;
 if(state?.systemState!=="session-live"||state?.activeFlag!=="infraction-warning"||warning?.type!=="warning"||!warning.expiresAt)return;
 const restore=async()=>{if(!currentUser){warningTimer=setTimeout(restore,500);return}if(state?.systemState!=="session-live"||state?.activeFlag!=="infraction-warning")return;await update(stateRef,{activeFlag:"green","session/flag":"green","session/remainingMs":currentSessionRemaining(),"session/lastTickAt":state.session.running?Date.now():null,updatedAt:serverTimestamp()})};
 warningTimer=setTimeout(()=>restore().catch(error=>console.error("Unable to clear infraction warning",error)),Math.max(0,warning.expiresAt-Date.now()));
}

async function finalizeResult(){
 if(!requireAuthenticatedWrite())return;
 await runTransaction(stateRef,current=>{const next=applyOfficialSessionResult(current);if(next!==current)next.updatedAt=Date.now();return next});
}

async function advanceNextSession(){
 if(!requireAuthenticatedWrite())return;
 roleIndex=(state.event.circuit.roleIndex||0)+1;
 await update(stateRef,{
  systemState:"standby",
  activeFlag:"clear",
  session:null,
  "event/sessionNumber":(state.event.sessionNumber||1)+1,
  "event/circuit/roleIndex":roleIndex,
  updatedAt:serverTimestamp()
 });
}

async function startCourseLap(){
 if(!requireAuthenticatedWrite())return;
 if(state?.systemState!=="standby"||state?.sprint?.active)return;
 await update(stateRef,{
  systemState:"course-lap",
  activeFlag:"safety-car",
  "event/courseLap/status":"active",
  updatedAt:serverTimestamp()
 });
}
async function completeCourseLap(){
 if(!requireAuthenticatedWrite())return;
 await update(stateRef,{
  systemState:"standby",
  activeFlag:"clear",
  "event/courseLap/status":"complete",
  updatedAt:serverTimestamp()
 });
}

async function returnFromTermination(){
 if(!requireAuthenticatedWrite())return;
 await update(stateRef,{systemState:"standby",activeFlag:"clear",session:null,updatedAt:serverTimestamp()});
}
async function restartTerminatedSession(){
 if(!requireAuthenticatedWrite())return;
 if(!state.session)return;
 const s=state.session,now=Date.now();
 await update(stateRef,{
  systemState:"session-live",
  activeFlag:"green",
  "session/phase":"hiding",
  "session/remainingMs":s.hideDurationMs,
  "session/running":true,
  "session/lastTickAt":now,
  "session/flag":"green",
  "session/terminationType":null,
  "session/terminationDetail":null,
  "session/spotStatus":Object.fromEntries((s.pursuitVehicleIds||[]).map(v=>[v,false])),
  updatedAt:serverTimestamp()
 });
}


function renderScore(id){
 const scores=state?.event?.scores||{},names=state?.session?.teamNames||currentTeams().names||{};
 $(id).innerHTML=Object.keys(scores).map(k=>`<div class="score"><span>${names[k]||k}</span><strong>${scores[k]}</strong></div>`).join("")||"<p>No score yet.</p>";
}
function renderCircuit(id){
 const names=state?.session?.teamNames||state?.event?.teamNames||currentTeams().names||{},teamIds=Object.keys(names),status=getCircuitStatus(state?.event?.circuit,teamIds);
 const summary=status.completedCircuitCount===1?"1 Circuit Complete":`${status.completedCircuitCount} Circuits Complete`;
 const progress=status.isCircuitBalanced?"Balanced":`Circuit ${status.currentCircuitNumber} In Progress`;
 $(id).innerHTML=`<div class="circuit-summary"><strong>${summary}</strong><span>${progress}</span></div>`+teamIds.map(k=>`<div class="progress-card"><strong>${names[k]}</strong><span>Pursuit ${status.roles[k].pursuitCount}</span><span>Evading ${status.roles[k].evadingCount}</span></div>`).join("");
}
function relativeTime(timestamp){if(!timestamp)return"";const seconds=Math.max(0,Math.floor((Date.now()-timestamp)/1000));return seconds<60?"Updated just now":seconds<3600?`Updated ${Math.floor(seconds/60)}m ago`:`Updated ${Math.floor(seconds/3600)}h ago`}
async function stopRequestedClock(){if(state?.systemState==="sprint-live")return pauseSprintTimer();if(state?.systemState==="session-live")return issueFlag("red")}
async function resolveHazard(id){
 if(!requireAuthenticatedWrite())return;
 const otherActive=Object.entries(state?.event?.hazards||{}).some(([hazardId,hazard])=>hazardId!==id&&hazard.status!=="resolved");
 const updates={[`event/hazards/${id}/status`]:"resolved",[`event/hazards/${id}/resolvedAt`]:serverTimestamp(),updatedAt:serverTimestamp()};
 if(!otherActive&&state?.systemState==="standby"&&new Set(["yellow","red","safety-car"]).has(state.activeFlag))updates.activeFlag="clear";
 await update(stateRef,updates);
}
function renderReports(){
 const reports=state?.event?.vehicleReports||{};
 $("occupant-panel").classList.toggle("hidden",!Object.keys(reports).length);$("occupant-list").innerHTML=Object.entries(reports).map(([vehicleId,r])=>`<article><strong>${escapeHtml(vehicles[vehicleId]?.name||vehicleId)}</strong><span>Driver: ${escapeHtml(r.driverName||"—")}</span><span>Passenger: ${escapeHtml(r.passengerName||"—")}</span><small>${relativeTime(r.submittedAt)}</small></article>`).join("");
 const hazards=Object.entries(state?.event?.hazards||{}).map(([id,hazard])=>({id,...hazard})).filter(h=>h.status!=="resolved").sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
 const canApplyFlag=new Set(["standby","sprint-live","session-live"]).has(state?.systemState);
 $("hazard-panel").classList.toggle("hidden",!hazards.length);$("hazard-list").innerHTML=hazards.map(h=>`<article class="hazard-alert ${escapeHtml(h.status)}"><div class="hazard-alert-head"><b>REQUEST • ${escapeHtml((vehicles[h.vehicleId]?.name||h.vehicleId).toUpperCase())}</b><span>${h.status==="open"?"NEW":"ACKNOWLEDGED"}</span></div><strong>${h.requestSafetyCar?"Safety Car requested":"Red Flag requested"}</strong><div class="hazard-requests">${h.requestStopClock?"<b>RED FLAG</b>":""}${h.requestSafetyCar?"<b>SAFETY CAR</b>":""}</div>${canApplyFlag?"":"<small>Session action unavailable in the current state.</small>"}<div class="button-row">${h.status==="open"?`<button class="mini-btn" data-hazard-ack="${h.id}">Acknowledge</button>`:""}${h.status!=="resolved"?`<button class="mini-btn" data-hazard-resolve="${h.id}">Resolve</button>`:""}${canApplyFlag&&h.requestStopClock?`<button class="mini-btn" data-hazard-red="${h.id}">Red Flag</button>`:""}${canApplyFlag&&h.requestSafetyCar?`<button class="mini-btn" data-hazard-safety="${h.id}">Safety Car</button>`:""}</div></article>`).join("");
 document.querySelectorAll("[data-hazard-ack]").forEach(b=>b.onclick=()=>update(stateRef,{[`event/hazards/${b.dataset.hazardAck}/status`]:"acknowledged",[`event/hazards/${b.dataset.hazardAck}/acknowledgedAt`]:serverTimestamp()}));
 document.querySelectorAll("[data-hazard-resolve]").forEach(b=>b.onclick=()=>resolveHazard(b.dataset.hazardResolve));
 document.querySelectorAll("[data-hazard-red]").forEach(b=>b.onclick=()=>issueFlag("red"));document.querySelectorAll("[data-hazard-safety]").forEach(b=>b.onclick=()=>issueFlag("safety-car"));
}
function render(){
 const mode=getRenderMode(state),has=mode!=="no-event";document.body.dataset.mode=mode;document.body.classList.toggle("flag-controls-active",["standby","session-live","sprint-live"].includes(mode));E.noEvent.classList.toggle("hidden",has);E.eventArea.classList.toggle("hidden",!has);if(!has)return;
 E.eventName.textContent=state.event.name;E.eventMeta.textContent=state.event.circuit?.format?state.event.circuit.format.replace("-","–"):"Awaiting first session";
 const standby=mode==="standby",course=mode==="course-lap",sprintLive=mode==="sprint-live",live=mode==="session-live"||mode==="awaiting-finding-start",awaiting=mode==="awaiting-finding-start",prov=mode==="provisional",complete=mode==="session-complete",safetyTerm=mode==="safety-car-termination",review=mode==="violation-review",whiteTerm=mode==="white-termination";
 showOnly(mode,{standby:E.standby,"course-lap":E.courseLap,"sprint-live":E.sprint,"session-live":E.live,"awaiting-finding-start":E.live,provisional:E.provisional,"session-complete":E.provisional,"safety-car-termination":E.termination,"violation-review":E.termination,"white-termination":E.termination});
 E.setup.classList.toggle("hidden",!standby);$("event-score-panel").classList.toggle("hidden",!(standby||(live&&!awaiting)));
 const flagsAllowed=standby||sprintLive||(live&&!awaiting);$("quick-flag-panel").classList.toggle("hidden",!flagsAllowed);$("quick-flag-status").textContent=(state.activeFlag||"clear").replaceAll("-"," ").toUpperCase();
 const permittedFlags=standby?new Set(["yellow","move-over","red","safety-car","checkered","clear"]):sprintLive?new Set(["green","yellow","move-over","red","safety-car","checkered","clear"]):new Set(["green","yellow","move-over","red","safety-car","checkered"]);
 document.querySelectorAll("[data-quick-flag]").forEach(button=>{button.disabled=!permittedFlags.has(button.dataset.quickFlag);button.classList.toggle("active",button.dataset.quickFlag===state.activeFlag)});
 $("toolbar-event-name").textContent=state.event.name;$("toolbar-state").textContent=whiteTerm?"DISQUALIFICATION":review?"UNDER REVIEW":mode.replaceAll("-"," ").toUpperCase();$("toolbar-flag").textContent=(state.activeFlag||"clear").replaceAll("-"," ").toUpperCase();
 $("toolbar-timer").textContent=sprintLive?(state.sprint?.timerMode==="none"?"NO TIMER":fmt(sprintTime())):live?fmt(state.session?.remainingMs||0):review?"HELD":(prov||complete||safetyTerm||whiteTerm)?"ENDED":"--:--";
 renderScore("scoreboard");renderCircuit("sidebar-circuit");$("sidebar-status").textContent=awaiting?"Hiding complete — confirmation required":live?`${state.session?.format?.replaceAll("-"," ")||"Session"} • Session ${state.session?.number||""}`:state.event?.courseLap?.status==="complete"?"✓ Course Lap Complete":"Ready for competition";
 renderReports();
 const dedicatedTermination=safetyTerm||review||whiteTerm;$("standby-button").classList.toggle("hidden",sprintLive||course||live||prov||complete||dedicatedTermination);$("end-event").classList.toggle("hidden",sprintLive||course||live||dedicatedTermination);
 if(standby||course){
  const lap=state.event?.courseLap||{};
  $("standby-course-lap").classList.toggle("hidden",!standby||lap.required===false);
  $("standby-course-lap-status").textContent=lap.status==="complete"?"Course Lap Complete":"Course Lap Required";
  $("start-course-lap").classList.toggle("hidden",!standby||lap.status==="active"||lap.status==="complete");
  $("complete-course-lap").classList.toggle("hidden",lap.status!=="active");
  E.courseLapStatus.textContent="Course lap in progress. Follow the Safety Car; no overtaking.";
 }
 if(safetyTerm||review||whiteTerm){
  $("review-resume").classList.toggle("hidden",!review);$("review-disqualify").classList.toggle("hidden",!review);$("review-no-result").classList.toggle("hidden",!review);$("termination-standby").classList.toggle("hidden",review);$("termination-restart").classList.toggle("hidden",review);
  E.terminationTitle.textContent=safetyTerm?"Safety Car Termination":review?"Under Review / Investigation":"Disqualification";
  E.terminationDetail.textContent=state.session?.terminationDetail||state.session?.provisionalReason||"Session terminated.";
 }
 if(sprintLive){
  const s=state.sprint||{},flag=(state.activeFlag||"clear").replaceAll("-"," ").toUpperCase();
  $("sprint-timer-mode").value=s.timerMode||"none";
  $("sprint-timer-mode-label").textContent=(s.timerMode||"none").replaceAll("-"," ").toUpperCase();
  $("sprint-timer").textContent=s.timerMode==="none"?"NO TIMER":fmt(sprintTime(s));
  $("sprint-timer-status").textContent=s.timerMode==="none"?"NO TIMER":s.running?"RUNNING":"PAUSED";
  $("sprint-active-flag").textContent=`FLAG: ${flag}`;
  $("sprint-duration").value=Math.max(0,(s.configuredMs||0)/1000);
 }
 if(live){const s=state.session,spotsEnabled=s.phase==="finding";E.phase.textContent=s.phase==="hiding"?"HIDING":awaiting?"HIDING COMPLETE":"FINDING";E.timer.textContent=fmt(s.remainingMs);E.sessionLabel.textContent=`Session ${s.number}`;E.roles.textContent=`${s.teamNames[s.pursuitTeam]} pursuing • ${s.teamNames[s.evadingTeam]} evading`;E.active.textContent=signals[state.activeFlag]?.label||state.activeFlag;E.badge.textContent=awaiting?"AWAITING RACE DIRECTOR":s.running?"SESSION LIVE":"SESSION PAUSED";E.findingStart.classList.toggle("hidden",!awaiting);$("live-signal-panel").classList.toggle("hidden",awaiting);$("live-flag-panel").classList.toggle("hidden",awaiting);$("live-spots-panel").classList.toggle("hidden",awaiting);E.spots.innerHTML=(s.pursuitVehicleIds||[]).map(v=>`<button class="spot ${s.spotStatus?.[v]?"confirmed":""}" data-spot="${v}" ${s.spotStatus?.[v]||!spotsEnabled?"disabled":""}><span>${vehicles[v].name}</span><strong>${s.spotStatus?.[v]?"SPOT CONFIRMED":spotsEnabled?"CONFIRM VALID RADIO SPOT":"FINDING NOT STARTED"}</strong></button>`).join("");E.spots.querySelectorAll("[data-spot]").forEach(b=>b.onclick=()=>confirmSpot(b.dataset.spot))}
 if(prov||complete){
  E.provisionalDetail.textContent=state.session.provisionalReason||"Session complete";
  E.resultTitle.textContent=complete?"Official Checkered":"Provisional Checkered";
  E.finalize.classList.toggle("hidden",complete);
  E.next.classList.toggle("hidden",!complete);
  renderScore("between-scoreboard");
  renderCircuit("circuit-progress");
 }
}

document.querySelectorAll("[data-type]").forEach(b=>b.onclick=()=>{document.querySelectorAll("[data-type]").forEach(x=>x.classList.remove("active"));b.classList.add("active");sessionType=b.dataset.type;$("vehicle-vehicle-setup").classList.toggle("hidden",sessionType!=="vehicle-vehicle");$("vehicle-foot-setup").classList.toggle("hidden",sessionType!=="vehicle-foot");if(sessionType==="vehicle-foot"){E.hide.value=120;E.find.value=300;renderVF()}else{E.hide.value=60;E.find.value=120;renderVVSelectors()}});
["ranger","shelly","gator"].forEach(v=>$(`available-${v}`).onchange=renderVVSelectors);
$("vv-team-1").onchange=updateRoleSummary;$("vv-team-2").onchange=updateRoleSummary;
$("vf-team-a").oninput=updateRoleSummary;$("vf-team-b").oninput=updateRoleSummary;$("vf-vehicle").onchange=renderVF;$("swap-teams").onclick=()=>{roleIndex=roleIndex%2===0?1:0;updateRoleSummary()};
$("create-event").onclick=()=>$("event-dialog").showModal();$("close-dialog").onclick=()=>$("event-dialog").close();$("event-form").onsubmit=e=>{e.preventDefault();createEvent()};
$("end-event").onclick=async()=>{if(!requireAuthenticatedWrite()||state?.systemState==="sprint-live")return;if(confirm("End the event?"))await set(stateRef,{systemState:"no-event",activeFlag:"clear",event:null,session:null,sprint:null,updatedAt:serverTimestamp()})};
$("standby-button").onclick=()=>{if(state?.systemState!=="sprint-live")update(stateRef,{systemState:"standby",activeFlag:"clear",session:null,updatedAt:serverTimestamp()})};$("start-session").onclick=startSession;
$("start-sprint").onclick=startSprint;$("terminate-sprint").onclick=()=>{if(confirm("Terminate MFMA Sprint and return to Standby?"))terminateSprint()};
$("sprint-timer-mode").onchange=setSprintTimerMode;$("sprint-duration").onchange=configureSprintDuration;$("sprint-start-timer").onclick=startSprintTimer;$("sprint-pause-timer").onclick=pauseSprintTimer;$("sprint-reset-timer").onclick=resetSprintTimer;
$("sprint-add-time").onclick=()=>adjustSprintTimer(Math.max(0,Number($("sprint-adjustment").value)||0)*1000);$("sprint-subtract-time").onclick=()=>adjustSprintTimer(-Math.max(0,Number($("sprint-adjustment").value)||0)*1000);$("sprint-set-time").onclick=setSprintTimer;
document.querySelectorAll("[data-sprint-flag]").forEach(b=>b.onclick=()=>issueFlag(b.dataset.sprintFlag));
document.querySelectorAll("[data-quick-flag]").forEach(b=>b.onclick=()=>issueFlag(b.dataset.quickFlag));
$("start-finding").onclick=startFinding;
document.querySelectorAll("[data-flag]").forEach(b=>b.onclick=()=>issueFlag(b.dataset.flag));
$("post-white").onclick=openWhiteDialog;document.querySelectorAll("[data-violation-open]").forEach(button=>button.onclick=openWhiteDialog);$("close-white").onclick=closeViolationDialog;$("violation-type").onchange=syncViolationForm;$("penalty-type").onchange=()=>$("time-penalty-options").classList.toggle("hidden",$("penalty-type").value!=="time");$("white-form").onsubmit=e=>{e.preventDefault();resolveWhiteForm()};syncViolationForm();
$("finalize-result").onclick=finalizeResult;$("next-session").onclick=advanceNextSession;$("return-standby").onclick=()=>update(stateRef,{systemState:"standby",activeFlag:"clear",session:null,updatedAt:serverTimestamp()});$("show-scoreboard").onclick=()=>update(stateRef,{showScoreboard:true,updatedAt:serverTimestamp()});


$("start-course-lap").onclick=startCourseLap;
$("complete-course-lap").onclick=completeCourseLap;
$("termination-standby").onclick=returnFromTermination;
$("termination-restart").onclick=restartTerminatedSession;
$("review-resume").onclick=resumeViolationReview;$("review-disqualify").onclick=openDisqualificationReview;$("review-no-result").onclick=noResultViolationReview;

$("white-review-overlay").onclick=e=>{
 if(e.target===$("white-review-overlay")){
  $("white-review-overlay").classList.add("hidden");
  document.body.classList.remove("modal-open");
 }
};

onValue(stateRef,s=>{const previous=state;state=s.val()||{systemState:"no-event"};playStateTransition(previous,state);scheduleWarningReturn();const newHazards=newOpenHazardIds(previous,state);if(newHazards.length){try{playSound("hazard")}catch{}if(new Set(["clear","green","move-over"]).has(state.activeFlag||"clear"))issueFlag("yellow").catch(error=>console.error("Unable to call immediate yellow",error))}setConn("connected","Connected");roleIndex=state.event?.circuit?.roleIndex||roleIndex;if(!state.event){$("toolbar-event-name").textContent="Race Control";$("toolbar-state").textContent="NO EVENT";$("toolbar-flag").textContent="CLEAR";$("toolbar-timer").textContent="--:--"}render()},e=>{setConn("error","Connection error");console.error(e)});
renderVVSelectors();renderVF();setInterval(()=>{tick();sprintTick()},250);
