import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getDatabase, ref, set, update, onValue, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
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
import { personnel, vehicles } from "./personnel.js?v=40";
import { signals } from "./signals.js?v=40";
import { getRenderMode, showOnly } from "./display-state.js?v=44";
import { enableSounds, getSoundStatus, onSoundStatus, playStateTransition } from "./sounds.js?v=51";

const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
const githubProvider=new GithubAuthProvider();
const googleProvider=new GoogleAuthProvider();
const db=getDatabase(app);
const stateRef=ref(db,"mfma/state");
const $=id=>document.getElementById(id);
let state=null,sessionType="vehicle-vehicle",roleIndex=0,currentUser=null;

const E={connection:$("connection"),noEvent:$("no-event"),eventArea:$("event-area"),standby:$("standby-panel"),setup:$("setup-panel"),sprint:$("sprint-panel"),live:$("live-panel"),provisional:$("provisional-panel"),eventName:$("event-name"),eventMeta:$("event-meta"),roleSummary:$("role-summary"),hide:$("hide-seconds"),find:$("find-seconds"),validation:$("validation"),phase:$("phase-name"),timer:$("timer"),sessionLabel:$("session-label"),roles:$("roles"),active:$("active-state"),badge:$("live-badge"),findingStart:$("finding-start-panel"),spots:$("spot-buttons"),scoreboard:$("scoreboard"),between:$("between-scoreboard"),circuit:$("circuit-progress"),provisionalDetail:$("provisional-detail"),resultTitle:$("result-title"),finalize:$("finalize-result"),next:$("next-session"),courseLap:$("course-lap-panel"),courseLapStatus:$("course-lap-status"),termination:$("termination-panel"),terminationTitle:$("termination-title"),terminationDetail:$("termination-detail")};


const authPanel=$("auth-panel");
const securedControl=$("secured-control");
const authStatus=$("auth-status");
const authError=$("auth-error");
const accountName=$("account-name");
const controlSound=$("control-sound");

function renderControlSound({state:audioState}){controlSound.textContent=audioState==="enabled"?"Sound On":"Enable Sound"}
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
function driverOptions(){return Object.entries(personnel).map(([id,p])=>`<option value="${id}">${p.name}</option>`).join("")}
function passengerChecks(prefix){return Object.entries(personnel).map(([id,p])=>`<label class="chip"><input type="checkbox" data-passenger="${id}" data-prefix="${prefix}">${p.name}</label>`).join("")}

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
 renderVVAssignments();updateRoleSummary();
}
function renderVVAssignments(){
 const chosen=[...new Set([$("vv-team-1").value,$("vv-team-2").value].filter(Boolean))];
 $("vv-assignments").innerHTML=chosen.map(v=>`<div class="assignment-row"><strong>${vehicles[v].name}</strong><label><span class="sr-only">${vehicles[v].name} driver</span><select data-vv-driver="${v}"><option value="">Unassigned</option>${driverOptions()}</select></label><details class="passenger-details"><summary>Select passengers</summary><div class="chips">${passengerChecks(v)}</div></details></div>`).join("");
}
function renderVF(){
 $("vf-driver").innerHTML=`<option value="">Unassigned</option>${driverOptions()}`;$("vf-passengers").innerHTML=passengerChecks("vf");updateRoleSummary();
}
function updateRoleSummary(){const r=rolePair();E.roleSummary.textContent=`${r.names[r.pursuit]} pursuing • ${r.names[r.evading]} evading`}

function collectSetup(){
 const r=rolePair();
 if(sessionType==="vehicle-vehicle"){
  const ids=[$("vv-team-1").value,$("vv-team-2").value],teams={};
  for(const v of ids)teams[v]={vehicle:v,driver:document.querySelector(`[data-vv-driver="${v}"]`)?.value||"",passengers:[...document.querySelectorAll(`[data-passenger][data-prefix="${v}"]:checked`)].map(x=>x.dataset.passenger)};
  return {format:sessionType,teamNames:r.names,role:r,vehicleTeams:teams,pursuitVehicleIds:[ids[r.pursuit==="a"?0:1]],evadingVehicleId:ids[r.evading==="a"?0:1]};
 }
 const v=$("vf-vehicle").value;
 return {format:sessionType,teamNames:r.names,role:r,pursuitVehicleIds:[v],pursuitVehicle:v,pursuitDriver:$("vf-driver").value,passengers:[...document.querySelectorAll(`[data-passenger][data-prefix="vf"]:checked`)].map(x=>x.dataset.passenger),evadingOnFoot:true};
}
function validate(){
 const errors=[],setup=collectSetup(),used=new Set();
 if(sessionType==="vehicle-vehicle"){
  if($("vv-team-1").value===$("vv-team-2").value)errors.push("Choose two different vehicle teams.");
  for(const [v,t] of Object.entries(setup.vehicleTeams)){
   for(const p of [t.driver,...t.passengers].filter(Boolean)){if(used.has(p))errors.push(`${personnel[p].name} is assigned twice.`);used.add(p)}
   if(t.passengers.includes(t.driver))errors.push(`${personnel[t.driver]?.name} cannot also be a passenger.`);
  }
 }else{
  for(const p of [$("vf-driver").value,...setup.passengers].filter(Boolean)){if(used.has(p))errors.push(`${personnel[p].name} is assigned twice.`);used.add(p)}
  if(setup.passengers.includes($("vf-driver").value))errors.push("The driver cannot also be a passenger.");
 }
 E.validation.classList.toggle("hidden",!errors.length);E.validation.innerHTML=errors.length?`<strong>Fix before starting:</strong><ul>${errors.map(e=>`<li>${e}</li>`).join("")}</ul>`:"";
 return {ok:!errors.length,setup};
}

async function createEvent(){
 if(!requireAuthenticatedWrite())return;
 await set(stateRef,{systemState:"standby",activeFlag:"clear",event:{name:$("new-event-name").value||"MFMA Event",scores:{},sessionNumber:1,circuit:{format:null,roleIndex:0,roles:{}},pendingAdjustment:null,courseLap:{required:true,status:"pending"},safetyCarOvertake:null},session:null,sprint:null,updatedAt:serverTimestamp()});
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
  const sprintFlags=new Set(["green","yellow","red","safety-car","white","checkered","clear"]);
  if(!state?.sprint?.active||!sprintFlags.has(flag))return;
  await update(stateRef,{activeFlag:flag,updatedAt:serverTimestamp()});
  return;
 }
 if(state?.systemState==="standby"){
  const standbyFlags=new Set(["yellow","red","safety-car","white","checkered","clear"]);
  if(!standbyFlags.has(flag))return;
  await update(stateRef,{activeFlag:flag,updatedAt:serverTimestamp()});
  return;
 }
 if(!state?.session||state.systemState!=="session-live")return;
 if(flag==="yellow"&&state.systemState==="session-live"){await update(stateRef,{activeFlag:"yellow","session/flag":"yellow","session/lastTickAt":Date.now(),updatedAt:serverTimestamp()});return}
 if(flag==="green"&&state.systemState==="session-live"&&state.session.phase!=="awaiting-finding-start"){await update(stateRef,{activeFlag:"green","session/flag":"green","session/running":true,"session/lastTickAt":Date.now(),updatedAt:serverTimestamp()});return}
 if(flag==="red"&&state.systemState==="session-live"){await update(stateRef,{activeFlag:"red","session/flag":"red","session/running":false,updatedAt:serverTimestamp()});return}
 if(flag==="safety-car"&&state.systemState==="session-live"){await update(stateRef,{systemState:"safety-car-termination",activeFlag:"safety-car","session/running":false,"session/terminationType":"safety-car","session/terminationDetail":"Session terminated by Safety Car. Follow the Official Vehicle.",updatedAt:serverTimestamp()});return}
 if(flag==="white")openWhiteDialog();
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

 const people=new Set();
 const setup=session.setup||{};

 if(setup.vehicleTeams&&typeof setup.vehicleTeams==="object"){
  Object.values(setup.vehicleTeams).forEach(team=>{
   if(team?.driver)people.add(team.driver);
   (Array.isArray(team?.passengers)?team.passengers:[]).forEach(personId=>{
    if(personId)people.add(personId);
   });
  });
 }else{
  if(setup.pursuitDriver)people.add(setup.pursuitDriver);
  (Array.isArray(setup.passengers)?setup.passengers:[]).forEach(personId=>{
   if(personId)people.add(personId);
  });
 }

 $("responsible-party").innerHTML=
  `<option value="unknown">Unknown / Team Responsibility</option>`+
  [...people]
   .filter(id=>personnel[id])
   .map(id=>`<option value="${id}">${personnel[id].name}</option>`)
   .join("");
}
function openWhiteDialog(){
 try{
  if(!state?.session){
   throw new Error("No active or recently completed session is available for White Flag Review.");
  }

  populateWhite();

  const overlay=$("white-review-overlay");
  if(!overlay){
   throw new Error("The White Flag Review panel is missing from control.html.");
  }

  overlay.classList.remove("hidden");
  overlay.style.display="grid";
  document.body.classList.add("modal-open");
 }catch(error){
  console.error("White Flag Review failed:",error);
  alert(`White Flag Review could not open: ${error.message}`);
 }
}

async function resolveWhiteForm(){
 if(!requireAuthenticatedWrite())return;
 const dq=$("dq-team").value;
 const responsible=$("responsible-party").value;
 const reason=$("dq-reason").value;
 const additionalPenalty=$("penalty-type").value;
 const outcome=$("white-outcome").value;
 const names=state.session.teamNames;
 const opponent=Object.keys(names).find(key=>key!==dq);

 const responsibleName=
  responsible==="unknown"
   ?"Unknown / team responsibility"
   :(personnel[responsible]?.name||"Unknown");

 let winner=null;
 let nextState="white-termination";
 let pendingAdjustment=null;

 let detail=
  `${names[dq]} disqualified. Responsible party: ${responsibleName}. Reason: ${reason}.`;

 if(additionalPenalty==="time"){
  pendingAdjustment={
   againstTeam:dq,
   benefitingTeam:$("benefiting-team").value,
   remedy:$("time-remedy").value,
   seconds:Number($("time-seconds").value),
   reason,
   responsible
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
  activeFlag:"white",
  "session/running":false,
  "session/whiteReview":{
   dq,
   responsible,
   reason,
   additionalPenalty,
   outcome,
   detail
  },
  "session/provisionalWinner":winner,
  "session/provisionalReason":detail,
  "session/terminationType":"white",
  "session/terminationDetail":detail,
  "event/pendingAdjustment":pendingAdjustment,
  updatedAt:serverTimestamp()
 });

 $("white-review-overlay").classList.add("hidden");
 $("white-review-overlay").style.display="";
 document.body.classList.remove("modal-open");
}

async function finalizeResult(){
 if(!requireAuthenticatedWrite())return;
 const winner=state.session.provisionalWinner;
 const scores={...(state.event.scores||{})};
 if(winner)scores[winner]=(scores[winner]||0)+1;

 const roles={...(state.event.circuit.roles||{})},s=state.session;
 roles[s.pursuitTeam]={...(roles[s.pursuitTeam]||{}),pursuit:true};
 roles[s.evadingTeam]={...(roles[s.evadingTeam]||{}),evading:true};

 await update(stateRef,{
  systemState:"session-complete",
  activeFlag:"checkered",
  "session/running":false,
  "session/resultOfficial":true,
  "event/scores":scores,
  "event/circuit/roles":roles,
  updatedAt:serverTimestamp()
 });
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
  "event/safetyCarOvertake":null,
  updatedAt:serverTimestamp()
 });
}
async function completeCourseLap(){
 if(!requireAuthenticatedWrite())return;
 await update(stateRef,{
  systemState:"standby",
  activeFlag:"clear",
  "event/courseLap/status":"complete",
  "event/safetyCarOvertake":null,
  updatedAt:serverTimestamp()
 });
}

function openOvertakeDialog(){
 const overlay=$("overtake-overlay");
 overlay.classList.remove("hidden");overlay.style.display="grid";document.body.classList.add("modal-open");
}
async function authorizeOvertake(){
 if(!requireAuthenticatedWrite())return;
 const reason=$("overtake-reason").value||"Race Director authorization";
 await update(stateRef,{"event/safetyCarOvertake":{active:true,reason,authorizedAt:Date.now()},updatedAt:serverTimestamp()});
 $("overtake-overlay").classList.add("hidden");$("overtake-overlay").style.display="";document.body.classList.remove("modal-open");
}
async function cancelOvertake(){
 if(!requireAuthenticatedWrite())return;await update(stateRef,{"event/safetyCarOvertake":null,updatedAt:serverTimestamp()});}
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
 const roles=state?.event?.circuit?.roles||{},names=state?.session?.teamNames||currentTeams().names||{};
 $(id).innerHTML=Object.keys(names).map(k=>`<div class="progress-card"><strong>${names[k]}</strong><span>Pursuit ${roles[k]?.pursuit?"✓":"○"}</span><span>Evading ${roles[k]?.evading?"✓":"○"}</span></div>`).join("");
}
function render(){
 const mode=getRenderMode(state),has=mode!=="no-event";document.body.dataset.mode=mode;document.body.classList.toggle("flag-controls-active",["standby","session-live","sprint-live"].includes(mode));E.noEvent.classList.toggle("hidden",has);E.eventArea.classList.toggle("hidden",!has);if(!has)return;
 E.eventName.textContent=state.event.name;E.eventMeta.textContent=state.event.circuit?.format?state.event.circuit.format.replace("-","–"):"Awaiting first session";
 const standby=mode==="standby",course=mode==="course-lap",sprintLive=mode==="sprint-live",live=mode==="session-live"||mode==="awaiting-finding-start",awaiting=mode==="awaiting-finding-start",prov=mode==="provisional",complete=mode==="session-complete",safetyTerm=mode==="safety-car-termination",whiteTerm=mode==="white-termination";
 showOnly(mode,{standby:E.standby,"course-lap":E.courseLap,"sprint-live":E.sprint,"session-live":E.live,"awaiting-finding-start":E.live,provisional:E.provisional,"session-complete":E.provisional,"safety-car-termination":E.termination,"white-termination":E.termination});
 E.setup.classList.toggle("hidden",!standby);$("event-score-panel").classList.toggle("hidden",!(standby||(live&&!awaiting)));
 const flagsAllowed=standby||sprintLive||(live&&!awaiting);$("quick-flag-panel").classList.toggle("hidden",!flagsAllowed);$("quick-flag-status").textContent=(state.activeFlag||"clear").replaceAll("-"," ").toUpperCase();
 const permittedFlags=standby?new Set(["yellow","red","safety-car","white","checkered","clear"]):sprintLive?new Set(["green","yellow","red","safety-car","white","checkered","clear"]):new Set(["green","yellow","red","safety-car","white","checkered"]);
 document.querySelectorAll("[data-quick-flag]").forEach(button=>{button.disabled=!permittedFlags.has(button.dataset.quickFlag);button.classList.toggle("active",button.dataset.quickFlag===state.activeFlag)});
 $("toolbar-event-name").textContent=state.event.name;$("toolbar-state").textContent=mode.replaceAll("-"," ").toUpperCase();$("toolbar-flag").textContent=(state.activeFlag||"clear").replaceAll("-"," ").toUpperCase();
 $("toolbar-timer").textContent=sprintLive?(state.sprint?.timerMode==="none"?"NO TIMER":fmt(sprintTime())):live?fmt(state.session?.remainingMs||0):(prov||complete||safetyTerm||whiteTerm)?"ENDED":"--:--";
 renderScore("scoreboard");renderCircuit("sidebar-circuit");$("sidebar-status").textContent=awaiting?"Hiding complete — confirmation required":live?`${state.session?.format?.replaceAll("-"," ")||"Session"} • Session ${state.session?.number||""}`:state.event?.courseLap?.status==="complete"?"✓ Course Lap Complete":"Ready for competition";
 const dedicatedTermination=safetyTerm||whiteTerm;$("standby-button").classList.toggle("hidden",sprintLive||course||live||prov||complete||dedicatedTermination);$("end-event").classList.toggle("hidden",sprintLive||course||live||dedicatedTermination);
 if(standby||course){
  const lap=state.event?.courseLap||{},overtake=state.event?.safetyCarOvertake||null;
  $("standby-course-lap").classList.toggle("hidden",!standby||lap.required===false);
  $("standby-course-lap-status").textContent=lap.status==="complete"?"Course Lap Complete":"Course Lap Required";
  $("start-course-lap").classList.toggle("hidden",!standby||lap.status==="active"||lap.status==="complete");
  $("complete-course-lap").classList.toggle("hidden",lap.status!=="active");
  $("authorize-overtake").classList.toggle("hidden",lap.status!=="active");
  $("cancel-overtake").classList.toggle("hidden",!overtake?.active);
  E.courseLapStatus.textContent=overtake?.active?"Safety Car overtake authorized for all drivers.":"Course lap in progress.";
 }
 if(safetyTerm||whiteTerm){
  $("termination-authorize-overtake").classList.toggle("hidden",!safetyTerm);
  $("termination-cancel-overtake").classList.toggle("hidden",!(safetyTerm&&state.event?.safetyCarOvertake?.active));
  E.terminationTitle.textContent=safetyTerm?"Safety Car Termination":"White Flag Termination";
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
$("vv-team-1").onchange=()=>{renderVVAssignments();updateRoleSummary()};$("vv-team-2").onchange=()=>{renderVVAssignments();updateRoleSummary()};
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
$("post-white").onclick=openWhiteDialog;$("close-white").onclick=()=>{$("white-review-overlay").classList.add("hidden");document.body.classList.remove("modal-open")};$("penalty-type").onchange=()=>$("time-penalty-options").classList.toggle("hidden",$("penalty-type").value!=="time");$("white-form").onsubmit=e=>{e.preventDefault();resolveWhiteForm()};
$("finalize-result").onclick=finalizeResult;$("next-session").onclick=advanceNextSession;$("return-standby").onclick=()=>update(stateRef,{systemState:"standby",activeFlag:"clear",session:null,updatedAt:serverTimestamp()});$("show-scoreboard").onclick=()=>update(stateRef,{showScoreboard:true,updatedAt:serverTimestamp()});


$("start-course-lap").onclick=startCourseLap;
$("complete-course-lap").onclick=completeCourseLap;
$("authorize-overtake").onclick=openOvertakeDialog;
$("cancel-overtake").onclick=cancelOvertake;
$("close-overtake").onclick=()=>{$("overtake-overlay").classList.add("hidden");$("overtake-overlay").style.display="";document.body.classList.remove("modal-open")};
$("overtake-form").onsubmit=e=>{e.preventDefault();authorizeOvertake()};$("overtake-overlay").onclick=e=>{if(e.target===$("overtake-overlay")){$("overtake-overlay").classList.add("hidden");$("overtake-overlay").style.display="";document.body.classList.remove("modal-open")}};
$("termination-authorize-overtake").onclick=openOvertakeDialog;$("termination-cancel-overtake").onclick=cancelOvertake;$("termination-standby").onclick=returnFromTermination;
$("termination-restart").onclick=restartTerminatedSession;

$("white-review-overlay").onclick=e=>{
 if(e.target===$("white-review-overlay")){
  $("white-review-overlay").classList.add("hidden");
  document.body.classList.remove("modal-open");
 }
};

onValue(stateRef,s=>{const previous=state;state=s.val()||{systemState:"no-event"};playStateTransition(previous,state);setConn("connected","Connected");roleIndex=state.event?.circuit?.roleIndex||roleIndex;if(!state.event){$("toolbar-event-name").textContent="Race Control";$("toolbar-state").textContent="NO EVENT";$("toolbar-flag").textContent="CLEAR";$("toolbar-timer").textContent="--:--"}render()},e=>{setConn("error","Connection error");console.error(e)});
renderVVSelectors();renderVF();setInterval(()=>{tick();sprintTick()},250);
