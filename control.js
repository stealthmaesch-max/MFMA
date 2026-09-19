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
import { signals } from "./signals.js?v=93";
import { getRenderMode, showOnly } from "./display-state.js?v=87";
import { enableSounds, getSoundStatus, onSoundStatus, playStateTransition, playSound } from "./sounds.js?v=70";
import { getCircuitStatus, applyOfficialSessionResult } from "./circuit-model.js?v=53";
import { newOpenHazardIds } from "./report-model.js?v=57";
import { DEFAULT_POINTS, DEFAULT_SESSION_POINTS, PASSENGER_SEASON_CAP, SPRINT_SEASON_CAP, OFFICIAL_TEAM_IDS, applyStandingsAdjustments, approvedVehicles, buildEventArchive, rebuildStandings, currentSeasonId, driverCompetitionRole, isScoringDriverEligible, normalizeMraNumber, normalizeName, slugify, sortedStandings, teamBranding } from "./competition-model.js?v=88";
import {QUALIFYING_TRACKS,fastestQualifyingLap,qualifyingTime,rankedQualifyingLaps} from "./qualifying-model.js?v=85";

const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
const githubProvider=new GithubAuthProvider();
const googleProvider=new GoogleAuthProvider();
const db=getDatabase(app);
const stateRef=ref(db,"mfma/state");
const competitionRef=ref(db,"mfma/competition"),requestsRef=ref(db,"mfma/requests");
const $=id=>document.getElementById(id);
let textEntryResolve=null;
function requestText(title,message,placeholder="Enter explanation"){const dialog=$("text-entry-dialog");if(textEntryResolve)textEntryResolve(null);$("text-entry-title").textContent=title;$("text-entry-message").textContent=message;$("text-entry-input").value="";$("text-entry-input").placeholder=placeholder;dialog.showModal();setTimeout(()=>$("text-entry-input").focus(),0);return new Promise(resolve=>{textEntryResolve=resolve})}
function finishTextEntry(value=null){const resolve=textEntryResolve;textEntryResolve=null;if($("text-entry-dialog").open)$("text-entry-dialog").close();resolve?.(value)}
let confirmationResolve=null;
function requestConfirmation(title,message,confirmLabel="Confirm"){const dialog=$("confirmation-dialog");if(confirmationResolve)confirmationResolve(false);$("confirmation-title").textContent=title;$("confirmation-message").textContent=message;$("confirmation-submit").textContent=confirmLabel;dialog.showModal();return new Promise(resolve=>{confirmationResolve=resolve})}
function finishConfirmation(confirmed=false){const resolve=confirmationResolve;confirmationResolve=null;if($("confirmation-dialog").open)$("confirmation-dialog").close();resolve?.(confirmed)}
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]);
let state=null,sessionType="vehicle-vehicle",roleIndex=0,currentUser=null,warningTimer=null,nextStartTimer=null,competition={},requests={},requestsUnsubscribe=null,managementEventKey=null;
const safetyManagementFlags=new Set(["yellow","move-over","red","safety-car","return-to-start","infraction-warning","under-review","disqualification"]);

const E={connection:$("connection"),noEvent:$("no-event"),eventArea:$("event-area"),testMode:$("test-mode-panel"),standby:$("standby-panel"),setup:$("setup-panel"),sprint:$("sprint-panel"),qualifying:$("qualifying-panel"),live:$("live-panel"),provisional:$("provisional-panel"),nextStart:$("next-start-panel"),eventName:$("event-name"),eventMeta:$("event-meta"),roleSummary:$("role-summary"),hide:$("hide-seconds"),find:$("find-seconds"),validation:$("validation"),phase:$("phase-name"),timer:$("timer"),sessionLabel:$("session-label"),roles:$("roles"),active:$("active-state"),badge:$("live-badge"),findingStart:$("finding-start-panel"),spots:$("spot-buttons"),scoreboard:$("scoreboard"),between:$("between-scoreboard"),circuit:$("circuit-progress"),provisionalDetail:$("provisional-detail"),resultTitle:$("result-title"),finalize:$("finalize-result"),next:$("next-session"),courseLap:$("course-lap-panel"),courseLapStatus:$("course-lap-status"),termination:$("termination-panel"),terminationTitle:$("termination-title"),terminationDetail:$("termination-detail")};


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
 }catch(error){alert(`Firebase UID: ${currentUser.uid}`)}
};

setPersistence(auth,browserLocalPersistence).catch(error=>{
 console.warn("Could not set local authentication persistence",error);
});

onAuthStateChanged(auth,user=>{
 const signedIn=Boolean(user&&!user.isAnonymous);
 currentUser=signedIn?user:null;
 authPanel.classList.toggle("hidden",signedIn);
 securedControl.classList.toggle("hidden",!signedIn);

 if(signedIn){
  authStatus.textContent="Signed in";
  accountName.textContent=`${displayUserName(user)} • ${providerLabel(user)}`;
  setAuthError("");
  if(!requestsUnsubscribe)requestsUnsubscribe=onValue(requestsRef,snapshot=>{requests=snapshot.val()||{};renderManagement()},error=>console.error("Unable to load MRA approval queue",error));
 }else{
  authStatus.textContent="Choose a sign-in method";
  accountName.textContent="Signed out";
  if(requestsUnsubscribe){requestsUnsubscribe();requestsUnsubscribe=null}requests={};
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
function fmtQualifying(ms){const value=Math.max(0,Math.floor(ms||0)),minutes=Math.floor(value/60000),seconds=Math.floor(value%60000/1000),millis=value%1000;return `${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}.${String(millis).padStart(3,"0")}`}
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
function vehicleCatalog(){return approvedVehicles(competition.vehicles)}
function vehicleLabel(id){return vehicleCatalog()[id]?.name||vehicles[id]?.name||id}
function activeEventEntries(){return Object.values(competition.eventRegistrations?.[state?.event?.championshipEventId]||{}).filter(entry=>entry.status==="registered")}
function vehicleTeamName(id){const entry=activeEventEntries().find(item=>item.vehicleId===id),vehicle=vehicleCatalog()[id];return entry?.teamName||vehicle?.teamName||competition.teams?.[vehicle?.teamId]?.name||`${vehicleLabel(id)} Team`}
function vehicleTeamId(id){const entries=activeEventEntries().filter(item=>item.vehicleId===id),vehicle=vehicleCatalog()[id];return entries.length===1?entries[0].teamId:vehicle?.teamId||null}
function availableVehicles(){return [...document.querySelectorAll("[data-available-vehicle]:checked")].map(input=>input.value)}
function currentTeams(){
 if(sessionType==="vehicle-vehicle"){
 const a=$("vv-team-1").value,b=$("vv-team-2").value;
  const ids={a:$("vv-team-id-1").value||null,b:$("vv-team-id-2").value||null};return {a,b,names:{a:competition.teams?.[ids.a]?.name||vehicleTeamName(a),b:competition.teams?.[ids.b]?.name||vehicleTeamName(b)},ids}
 }
 const ids={a:$("vf-team-a").value||null,b:$("vf-team-b").value||null},names={a:competition.teams?.[ids.a]?.name||"Team A",b:competition.teams?.[ids.b]?.name||"Team B"};return {a:"a",b:"b",names,ids}
}
function rolePair(){const t=currentTeams();return roleIndex%2===0?{pursuit:"a",evading:"b",names:t.names}:{pursuit:"b",evading:"a",names:t.names}}

function renderVVSelectors(){
 const ids=availableVehicles();
 for(const id of ["vv-team-1","vv-team-2"]){
  const s=$(id),prev=s.value;s.innerHTML=ids.map(v=>`<option value="${v}">${escapeHtml(vehicleLabel(v))}</option>`).join("");
  if(prev&&ids.includes(prev))s.value=prev;
 }
 if(ids.length>1&&$("vv-team-1").value===$("vv-team-2").value)$("vv-team-2").value=ids[1];
 updateRoleSummary();
}
function renderVF(){
 const ids=availableVehicles(),select=$("vf-vehicle"),prior=select.value;select.innerHTML=ids.map(id=>`<option value="${id}">${escapeHtml(vehicleLabel(id))}</option>`).join("");if(ids.includes(prior))select.value=prior;
 updateRoleSummary();
}
function renderOfficialTeamSelectors(){const teams=OFFICIAL_TEAM_IDS.filter(id=>competition.teams?.[id]?.status==="approved"),options=teams.map(id=>`<option value="${escapeHtml(id)}">${escapeHtml(competition.teams[id].name)}</option>`).join("");for(const [elementId,fallbackIndex] of [["vf-team-a",0],["vf-team-b",1],["vv-team-id-1",0],["vv-team-id-2",1]]){const select=$(elementId),prior=select.value;select.innerHTML=options;select.value=teams.includes(prior)?prior:teams[fallbackIndex]||teams[0]||""}}
function renderVehicleSetup(){const catalog=vehicleCatalog(),ids=Object.keys(catalog),selected=new Set(availableVehicles());if(!selected.size){selected.add(ids[0]);selected.add(ids[1])}$("available-vehicles").innerHTML=ids.map(id=>`<label class="chip"><input data-available-vehicle type="checkbox" value="${escapeHtml(id)}" ${selected.has(id)?"checked":""}> <span>${escapeHtml(catalog[id].name||id)}<small>${escapeHtml(vehicleTeamName(id))}</small></span></label>`).join("");document.querySelectorAll("[data-available-vehicle]").forEach(input=>input.onchange=()=>{renderVVSelectors();renderVF()});renderOfficialTeamSelectors();renderVVSelectors();renderVF()}
function updateRoleSummary(){const r=rolePair();E.roleSummary.textContent=`${r.names[r.pursuit]} pursuing • ${r.names[r.evading]} evading`}

function collectSetup(){
 const r=rolePair();
 if(sessionType==="vehicle-vehicle"){
  const ids=[$("vv-team-1").value,$("vv-team-2").value];
  return {format:sessionType,teamNames:r.names,teamIds:currentTeams().ids,role:r,vehicleIds:ids,pursuitVehicleIds:[ids[r.pursuit==="a"?0:1]],evadingVehicleId:ids[r.evading==="a"?0:1]};
 }
 const v=$("vf-vehicle").value;
 return {format:sessionType,teamNames:r.names,teamIds:currentTeams().ids,role:r,pursuitVehicleIds:[v],pursuitVehicle:v,evadingOnFoot:true};
}
function validate(){
 const errors=[],setup=collectSetup();
 if(sessionType==="vehicle-vehicle"){
  if($("vv-team-1").value===$("vv-team-2").value)errors.push("Choose two different vehicle teams.");
  const teamIds=setup.teamIds||{};if(!teamIds.a||!teamIds.b)errors.push("Choose a team for each selected vehicle.");else if(teamIds.a===teamIds.b)errors.push("Choose the two opposing teams.");
 }
 if(sessionType==="vehicle-foot"&&(!setup.teamIds?.a||!setup.teamIds?.b||setup.teamIds.a===setup.teamIds.b))errors.push("Choose both official teams for the session.");
 E.validation.classList.toggle("hidden",!errors.length);E.validation.innerHTML=errors.length?`<strong>Fix before starting:</strong><ul>${errors.map(e=>`<li>${e}</li>`).join("")}</ul>`:"";
 return {ok:!errors.length,setup};
}

async function createEvent(){
 if(!requireAuthenticatedWrite())return;
 const championshipEventId=$("new-event-championship").value||null,championshipEvent=competition.events?.[championshipEventId],seasonId=String(championshipEvent?.seasonId||$("new-event-season").value||currentSeasonId()).slice(0,4);
 const pointsEvent=championshipEvent?championshipEvent.pointsEvent!==false:$("new-event-points").value==="points";
 await set(stateRef,{systemState:"standby",activeFlag:"clear",event:{name:championshipEvent?.name||$("new-event-name").value||"MFMA Event",seasonId,championshipEventId,pointsEvent,scores:{},sessionNumber:1,circuit:{format:null,roleIndex:0,roles:{}},pendingAdjustment:null,courseLap:{required:true,status:"pending"}},session:null,sprint:null,updatedAt:serverTimestamp()});
 if(championshipEventId)await update(ref(db,`mfma/competition/events/${championshipEventId}`),{status:"active",registrationStatus:"closed",startedAt:serverTimestamp()});
 $("event-dialog").close();
}

async function startTestMode(){
 if(!requireAuthenticatedWrite()||state?.systemState!=="no-event")return;
 await set(stateRef,{systemState:"test-mode",activeFlag:"clear",event:{name:"MRA SYSTEM TEST",testMode:true},session:null,sprint:null,updatedAt:serverTimestamp()});
}
async function issueTestSignal(flag){if(!requireAuthenticatedWrite()||state?.systemState!=="test-mode"||!state.event?.testMode)return;await update(stateRef,{activeFlag:flag,updatedAt:serverTimestamp()})}
async function endTestMode(){if(!requireAuthenticatedWrite()||state?.systemState!=="test-mode"||!state.event?.testMode)return;await set(stateRef,{systemState:"no-event",activeFlag:"clear",event:null,session:null,sprint:null,updatedAt:serverTimestamp()})}

async function startSession(){
 if(!requireAuthenticatedWrite())return;
 if(state?.systemState!=="standby"||state?.sprint?.active)return;
 if(state.event?.courseLap?.required&&state.event.courseLap.status!=="complete"){alert("Complete the Safety Car familiarization lap before Session 1.");return}
 const v=validate();if(!v.ok)return;
 const r=v.setup.role;let hide=Number(E.hide.value)*1000,find=Number(E.find.value)*1000;
 const adj=state.event.pendingAdjustment;
 if(adj){
  if(adj.remedy==="reduce-hide"&&r.evading===adj.benefitingTeam)hide=Math.max(1000,hide-adj.seconds*1000);
  if(adj.remedy==="increase-find"&&r.pursuit===adj.benefitingTeam)find+=adj.seconds*1000;
 }
 const spotIds=v.setup.pursuitVehicleIds||[];
 const session={number:state.event.sessionNumber||1,format:sessionType,teamNames:v.setup.teamNames,pursuitTeam:r.pursuit,evadingTeam:r.evading,setup:v.setup,phase:"countdown",remainingMs:hide,hideDurationMs:hide,findDurationMs:find,running:false,lastTickAt:null,flag:"proceed-to-start",spotStatus:Object.fromEntries(spotIds.map(id=>[id,false])),pursuitVehicleIds:spotIds,provisionalWinner:null,provisionalReason:null,countdownEndsAt:Date.now()+10000};
 const scores={...(state.event.scores||{})};for(const k of Object.keys(v.setup.teamNames))if(scores[k]===undefined)scores[k]=0;
 await update(stateRef,{systemState:"next-session-countdown",activeFlag:"proceed-to-start",session,"event/scores":scores,"event/teamNames":v.setup.teamNames,"event/teamIds":v.setup.teamIds||{},"event/lastVehicleIds":v.setup.vehicleIds||v.setup.pursuitVehicleIds||[],"event/circuit/format":sessionType,"event/circuit/roleIndex":roleIndex,"event/pendingAdjustment":null,updatedAt:serverTimestamp()});
}

async function startSprint(){
 if(!requireAuthenticatedWrite())return;
 if(state?.systemState!=="standby"||state?.sprint?.active)return;
 const driverIds=[...document.querySelectorAll("[data-sprint-driver]:checked")].map(input=>input.dataset.sprintDriver);if(!driverIds.length)return alert("Choose at least one approved driver for the pre-start Sprint roster.");
 const roster=Object.fromEntries(driverIds.map(driverId=>[driverId,{driverId,driverName:competition.drivers?.[driverId]?.name||driverId,mraNumber:competition.drivers?.[driverId]?.mraNumber||null}]));
 await update(stateRef,{systemState:"sprint-live",activeFlag:"clear",sprint:{active:true,timerMode:"none",running:false,remainingMs:0,elapsedMs:0,configuredMs:0,lastTickAt:null,startedAt:Date.now(),roster},updatedAt:serverTimestamp()});
}

async function terminateSprint(){
 if(!requireAuthenticatedWrite())return;
 if(state?.systemState!=="sprint-live"||!state?.sprint?.active)return;
 const durationMs=Math.max(0,Date.now()-(state.sprint.startedAt||Date.now())),updates={systemState:"standby",activeFlag:"clear",sprint:null,updatedAt:serverTimestamp()};
 if(durationMs>=60000)for(const item of Object.values(state.sprint.roster||{}))updates[`event/sprintParticipants/${item.driverId}`]={...item,verified:true,durationMs,verifiedAt:Date.now()};
 else alert("Sprint ended before 60 seconds. No Sprint participation points were verified.");
 await update(stateRef,updates);
}
async function closeSprintForEventEnd(){if(state?.systemState!=="sprint-live"||!state?.sprint?.active)return;const durationMs=Math.max(0,Date.now()-(state.sprint.startedAt||Date.now())),participants={...(state.event?.sprintParticipants||{})};if(durationMs>=60000)for(const item of Object.values(state.sprint.roster||{}))participants[item.driverId]={...item,verified:true,durationMs,verifiedAt:Date.now()};await update(stateRef,{systemState:"standby",activeFlag:"clear",sprint:null,"event/sprintParticipants":participants,updatedAt:serverTimestamp()});state={...state,systemState:"standby",activeFlag:"clear",sprint:null,event:{...state.event,sprintParticipants:participants}}}

function qualifyingDrivers(){return Object.entries(competition.drivers||{}).filter(([,driver])=>driver?.status==="approved").sort((a,b)=>(a[1].name||"").localeCompare(b[1].name||""))}
function renderSprintRoster(){const container=$("sprint-roster"),selected=new Set([...container.querySelectorAll("[data-sprint-driver]:checked")].map(input=>input.dataset.sprintDriver)),drivers=qualifyingDrivers().filter(([driverId,driver])=>driverCompetitionRole(driverId,driver)!=="honorary");container.innerHTML=drivers.map(([driverId,driver])=>`<label><input type="checkbox" data-sprint-driver="${escapeHtml(driverId)}" ${selected.has(driverId)?"checked":""}><span><strong>${escapeHtml(driver.name)}</strong><small>${escapeHtml(driver.teamName||"Independent")} • MRA ${escapeHtml(driver.mraNumber||"—")}</small></span></label>`).join("")||'<p class="empty-state">No eligible approved drivers.</p>'}
function renderQualifyingDriverOptions(){for(const id of ["qualifying-driver","qualifying-live-driver"]){const select=$(id),prior=select.value,drivers=qualifyingDrivers();select.innerHTML=drivers.map(([driverId,driver])=>`<option value="${escapeHtml(driverId)}">${escapeHtml(driver.name)} • ${escapeHtml(driver.teamName||"Independent")} • MRA ${escapeHtml(driver.mraNumber||"")}</option>`).join("");if(drivers.some(([driverId])=>driverId===prior))select.value=prior}}
async function startQualifying(){if(!requireAuthenticatedWrite()||state?.systemState!=="standby")return;const driverId=$("qualifying-driver").value,driver=competition.drivers?.[driverId],trackLength=$("qualifying-track").value;if(!driver||!QUALIFYING_TRACKS[trackLength])return alert("Choose an approved driver and track length.");await update(stateRef,{systemState:"qualifying-live",activeFlag:"clear","event/qualifying":{active:true,trackLength,vehicleId:"shelly",currentDriverId:driverId,currentDriverName:driver.name,currentMraNumber:driver.mraNumber||null,running:false,elapsedMs:0,lastTickAt:null,laps:{},startedAt:Date.now()},updatedAt:serverTimestamp()})}
async function selectQualifyingDriver(){if(!requireAuthenticatedWrite()||state?.systemState!=="qualifying-live"||state.event.qualifying?.running)return;const driverId=$("qualifying-live-driver").value,driver=competition.drivers?.[driverId];if(!driver)return;await update(stateRef,{"event/qualifying/currentDriverId":driverId,"event/qualifying/currentDriverName":driver.name,"event/qualifying/currentMraNumber":driver.mraNumber||null,"event/qualifying/elapsedMs":0,"event/qualifying/lastTickAt":null,updatedAt:serverTimestamp()})}
async function startQualifyingRun(){if(!requireAuthenticatedWrite()||state?.systemState!=="qualifying-live"||state.event.qualifying?.running)return;await update(stateRef,{"event/qualifying/running":true,"event/qualifying/lastTickAt":Date.now(),activeFlag:"green",updatedAt:serverTimestamp()})}
async function resetQualifyingRun(){if(!requireAuthenticatedWrite()||state?.systemState!=="qualifying-live")return;await update(stateRef,{"event/qualifying/running":false,"event/qualifying/elapsedMs":0,"event/qualifying/lastTickAt":null,activeFlag:"clear",updatedAt:serverTimestamp()})}
async function finishQualifyingRun(){if(!requireAuthenticatedWrite()||state?.systemState!=="qualifying-live"||!state.event.qualifying?.running)return;const qualifying=state.event.qualifying,timeMs=qualifyingTime(qualifying),lapId=`lap-${Date.now().toString(36)}`;if(timeMs<1000)return alert("A qualifying lap must run for at least one second.");await update(stateRef,{[`event/qualifying/laps/${lapId}`]:{driverId:qualifying.currentDriverId,driverName:qualifying.currentDriverName,mraNumber:qualifying.currentMraNumber||null,teamId:competition.drivers?.[qualifying.currentDriverId]?.teamId||null,vehicleId:"shelly",trackLength:qualifying.trackLength,timeMs,status:"valid",recordedAt:Date.now()},"event/qualifying/running":false,"event/qualifying/elapsedMs":0,"event/qualifying/lastTickAt":null,activeFlag:"checkered",updatedAt:serverTimestamp()})}
async function invalidateQualifyingLap(lapId){if(!requireAuthenticatedWrite()||!state?.event?.qualifying?.laps?.[lapId])return;const reason=normalizeName(await requestText("Invalidate Qualifying Lap","Record why this lap must be excluded from the official qualifying order.","Reason for invalidation")||"");if(!reason)return;await update(stateRef,{[`event/qualifying/laps/${lapId}/status`]:"invalid",[`event/qualifying/laps/${lapId}/invalidReason`]:reason,[`event/qualifying/laps/${lapId}/invalidatedAt`]:serverTimestamp(),updatedAt:serverTimestamp()})}
async function endQualifying(){if(!requireAuthenticatedWrite()||state?.systemState!=="qualifying-live")return;const fastest=fastestQualifyingLap(state.event.qualifying?.laps);if(!await requestConfirmation("End Qualifying",fastest?`${fastest.driverName} is fastest at ${fmtQualifying(fastest.timeMs)}. Save this result and return to Standby?`:"End qualifying without a valid time?","End Qualifying"))return;await update(stateRef,{systemState:"standby",activeFlag:"clear","event/qualifying/active":false,"event/qualifying/running":false,"event/qualifying/lastTickAt":null,"event/qualifying/completedAt":serverTimestamp(),"event/qualifying/winner":fastest?{driverId:fastest.driverId,driverName:fastest.driverName,timeMs:fastest.timeMs,lapId:fastest.id}:null,updatedAt:serverTimestamp()})}

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
 if(!requireAuthenticatedWrite())return;await update(stateRef,{systemState:"provisional",activeFlag:"checkered","session/running":false,"session/provisionalWinner":winner,"session/provisionalReason":reason,"event/currentInstruction":null,"event/instructionAcks":null,updatedAt:serverTimestamp()})}

function instructionPatch(type,label){const id=Date.now();return {"event/currentInstruction":{id,type,label,issuedAt:id},"event/instructionAcks":null}}
function clearInstructionPatch(){return {"event/currentInstruction":null,"event/instructionAcks":null}}

async function issueFlag(flag){
 if(!requireAuthenticatedWrite())return;
 if(state?.systemState==="sprint-live"){
  const sprintFlags=new Set(["green","yellow","move-over","red","safety-car","checkered","clear"]);
  if(!state?.sprint?.active||!sprintFlags.has(flag))return;
  await update(stateRef,{activeFlag:flag,...clearInstructionPatch(),updatedAt:serverTimestamp()});
  return;
 }
 if(state?.systemState==="standby"){
  const standbyFlags=new Set(["yellow","move-over","red","safety-car","checkered","clear"]);
  if(!standbyFlags.has(flag))return;
  await update(stateRef,{activeFlag:flag,...clearInstructionPatch(),updatedAt:serverTimestamp()});
  return;
 }
 if(!state?.session||state.systemState!=="session-live")return;
 if(flag==="yellow"&&state.systemState==="session-live"){await update(stateRef,{activeFlag:"yellow","session/flag":"yellow","session/lastTickAt":Date.now(),...clearInstructionPatch(),updatedAt:serverTimestamp()});return}
 if(flag==="move-over"&&state.systemState==="session-live"){await update(stateRef,{activeFlag:"move-over",...clearInstructionPatch(),updatedAt:serverTimestamp()});return}
 if(flag==="green"&&state.systemState==="session-live"&&state.session.phase!=="awaiting-finding-start"){await update(stateRef,{activeFlag:"green","session/flag":"green","session/running":true,"session/lastTickAt":Date.now(),...clearInstructionPatch(),updatedAt:serverTimestamp()});return}
 if(flag==="red"&&state.systemState==="session-live"){await update(stateRef,{activeFlag:"red","session/flag":"red","session/running":false,...instructionPatch("red","STOP — AWAIT RACE CONTROL"),updatedAt:serverTimestamp()});return}
 if(flag==="safety-car"&&state.systemState==="session-live"){await update(stateRef,{systemState:"safety-car-termination",activeFlag:"safety-car","session/running":false,"session/terminationType":"safety-car","session/terminationDetail":"Session terminated by Safety Car. Follow the Official Vehicle.",...instructionPatch("safety-car","SAFETY CAR — FOLLOW OFFICIAL VEHICLE"),updatedAt:serverTimestamp()});return}
 if(flag==="checkered"&&state.systemState==="session-live")automaticCheckered(null,"Manual Checkered");
}

function safetyManagementActive(){return Boolean(state?.event&&safetyManagementFlags.has(state.activeFlag))}
function openSafetyMessage(){
 if(!safetyManagementActive())return;
 const current=state.safetyMessage?.flag===state.activeFlag?state.safetyMessage.text||"":"";
 $("safety-message-input").value=current;$("safety-message-status").textContent=`Current signal: ${(signals[state.activeFlag]?.label||state.activeFlag).toUpperCase()}`;$("safety-message-dialog").showModal();
}
async function saveSafetyMessage(text){
 if(!requireAuthenticatedWrite()||!safetyManagementActive())return;
 const clean=String(text||"").trim().slice(0,100);
 await update(stateRef,{safetyMessage:clean?{text:clean,flag:state.activeFlag,updatedAt:Date.now()}:null,updatedAt:serverTimestamp()});
 $("safety-message-dialog").close();
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
function qualifyingTick(){if(state?.systemState!=="qualifying-live")return;const value=qualifyingTime(state.event?.qualifying||{});$("qualifying-timer").textContent=fmtQualifying(value);$("toolbar-timer").textContent=fmtQualifying(value)}

function populateWhite(){
 const names=state?.session?.teamNames||state?.event?.teamNames||(state?.systemState==="standby"||state?.systemState==="sprint-live"?currentTeams().names:{});
 const teamEntries=Object.entries(names);

 if(!teamEntries.length){
  throw new Error("No team information is available. Configure the teams before issuing a warning.");
 }

 const teamOptions=teamEntries
  .map(([key,name])=>`<option value="${key}">${name}</option>`)
  .join("");

 $("dq-team").innerHTML=teamOptions;
 $("benefiting-team").innerHTML=teamOptions;

}
function openWhiteDialog(){
 try{
  if(!state?.event)throw new Error("Open an event before issuing a violation.");
  if(new Set(["next-session-staging","next-session-countdown"]).has(state.systemState))throw new Error("Violations are locked after the Proceed to Starting Line order.");

  populateWhite();
  const reviewOption=$("violation-type").querySelector('option[value="review"]');
  reviewOption.disabled=!state.session;
  if(!state.session&&$("violation-type").value!=="warning")$("violation-type").value="warning";
  syncViolationForm();

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
 $("violation-guidance").textContent=disqualification?"Records the Race Director's decision and opens the official outcome workflow.":type==="review"?"Displays White, pauses the session, and directs everyone to the starting zone for review.":"Displays white crossed with folded yellow for 10 seconds, then returns to Green during a session or the prior signal outside one.";
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
 const names=state?.session?.teamNames||state?.event?.teamNames||currentTeams().names;
 const opponent=Object.keys(names).find(key=>key!==dq);

 const violationId=`v${Date.now()}`;
 if(violationType==="warning"){
  const expiresAt=Date.now()+10000;
  const activeWarning=state.event?.activeWarning;
  const previousFlag=state.activeFlag==="infraction-warning"&&activeWarning?.previousFlag?activeWarning.previousFlag:state.systemState==="session-live"?"green":state.activeFlag||"clear";
  const detail=`Infraction warning for ${names[dq]}. Reason: ${reason}.`;
  const violation={type:"warning",team:dq,reason,detail,previousFlag,previousState:state.systemState,issuedAt:serverTimestamp(),expiresAt};
  const updates={activeFlag:"infraction-warning","event/activeWarning":violation,[`event/violations/${violationId}`]:violation,updatedAt:serverTimestamp()};
  if(state.systemState==="session-live"&&state.session){updates["session/flag"]="infraction-warning";updates["session/remainingMs"]=currentSessionRemaining();updates["session/lastTickAt"]=state.session.running?Date.now():null;updates["session/violationReview"]=violation}
  await update(stateRef,updates);
  closeViolationDialog();return;
 }

 if(violationType==="review"){
  if(!new Set(["session-live","provisional","session-complete"]).has(state.systemState)){alert("A review is only available before the Proceed to Starting Line order.");return}
  const previousState=state.systemState,previousFlag=state.activeFlag||"checkered",wasRunning=Boolean(state.session.running);
  const detail=`${names[dq]} placed under review. Reason: ${reason}. Return to the starting zone and await the Race Director.`;
  const violation={type:"review",team:dq,reason,detail,previousState,previousFlag,wasRunning,issuedAt:serverTimestamp()};
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

async function resumeViolationReview(){if(!requireAuthenticatedWrite()||state?.systemState!=="violation-review")return;const review=state.session?.violationReview||{},live=review.previousState==="session-live",flag=live?"green":review.previousFlag||"return-to-start";await update(stateRef,{systemState:review.previousState||"provisional",activeFlag:flag,"session/running":live&&review.wasRunning,"session/flag":flag,"session/lastTickAt":live&&review.wasRunning?Date.now():null,"session/terminationType":null,"session/terminationDetail":null,updatedAt:serverTimestamp()})}
function openDisqualificationReview(){if(state?.systemState!=="violation-review")return;openWhiteDialog();$("violation-type").value="disqualification";syncViolationForm()}
async function noResultViolationReview(){if(!requireAuthenticatedWrite()||state?.systemState!=="violation-review")return;const detail="No result following violation review.";await update(stateRef,{systemState:"provisional",activeFlag:"checkered","session/running":false,"session/provisionalWinner":null,"session/provisionalReason":detail,"session/terminationType":null,"session/terminationDetail":null,updatedAt:serverTimestamp()})}

function scheduleWarningReturn(){
 if(warningTimer){clearTimeout(warningTimer);warningTimer=null}
 const warning=state?.event?.activeWarning||state?.session?.violationReview;
 if(state?.activeFlag!=="infraction-warning"||warning?.type!=="warning"||!warning.expiresAt)return;
 const restore=async()=>{if(!currentUser){warningTimer=setTimeout(restore,500);return}if(state?.activeFlag!=="infraction-warning")return;const live=state.systemState==="session-live"&&state.session,restoredFlag=live?"green":warning.previousFlag||"clear",updates={activeFlag:restoredFlag,"event/activeWarning":null,updatedAt:serverTimestamp()};if(live){updates["session/flag"]="green";updates["session/remainingMs"]=currentSessionRemaining();updates["session/lastTickAt"]=state.session.running?Date.now():null}await update(stateRef,updates)};
 warningTimer=setTimeout(()=>restore().catch(error=>console.error("Unable to clear infraction warning",error)),Math.max(0,warning.expiresAt-Date.now()));
}

async function finalizeResult(){
 if(!requireAuthenticatedWrite())return;
 await runTransaction(stateRef,current=>{const next=applyOfficialSessionResult(current);if(next!==current)next.updatedAt=Date.now();return next});
}

async function advanceNextSession(){
 if(!requireAuthenticatedWrite()||state?.systemState!=="session-complete"||state.activeFlag!=="return-to-start")return;
 const prior=state.session,setup=prior.setup||{},nextRoleIndex=(state.event.circuit?.roleIndex||0)+1+(state.event.circuit?.nextRolesSwapped?1:0);
 const pursuit=nextRoleIndex%2===0?"a":"b",evading=pursuit==="a"?"b":"a";
 let hide=prior.hideDurationMs,find=prior.findDurationMs;
 const adjustment=state.event.pendingAdjustment;
 if(adjustment?.remedy==="reduce-hide"&&evading===adjustment.benefitingTeam)hide=Math.max(1000,hide-adjustment.seconds*1000);
 if(adjustment?.remedy==="increase-find"&&pursuit===adjustment.benefitingTeam)find+=adjustment.seconds*1000;
 const vehicleIds=setup.vehicleIds||prior.pursuitVehicleIds||[];
 const spotIds=prior.format==="vehicle-vehicle"?[vehicleIds[pursuit==="a"?0:1]].filter(Boolean):(setup.pursuitVehicleIds||prior.pursuitVehicleIds||[]);
 const session={number:(state.event.sessionNumber||prior.number||1)+1,format:prior.format,teamNames:prior.teamNames,pursuitTeam:pursuit,evadingTeam:evading,setup,phase:"staging",remainingMs:hide,hideDurationMs:hide,findDurationMs:find,running:false,lastTickAt:null,flag:"proceed-to-start",spotStatus:Object.fromEntries(spotIds.map(id=>[id,false])),pursuitVehicleIds:spotIds,provisionalWinner:null,provisionalReason:null,resultOfficial:false,countdownEndsAt:null};
 roleIndex=nextRoleIndex;
 await update(stateRef,{systemState:"next-session-staging",activeFlag:"proceed-to-start",session,"event/sessionNumber":session.number,"event/circuit/roleIndex":roleIndex,"event/circuit/nextRolesSwapped":null,"event/pendingAdjustment":null,...instructionPatch("proceed-to-start","NEXT HIDING TEAM TO STARTING LINE"),updatedAt:serverTimestamp()});
}

async function startNextCountdown(){if(!requireAuthenticatedWrite()||state?.systemState!=="next-session-staging")return;await update(stateRef,{systemState:"next-session-countdown","session/phase":"countdown","session/countdownEndsAt":Date.now()+10000,...clearInstructionPatch(),updatedAt:serverTimestamp()})}

async function issueReturnToStart(){if(!requireAuthenticatedWrite()||!new Set(["provisional","session-complete"]).has(state?.systemState))return;await update(stateRef,{activeFlag:"return-to-start","session/postSessionStage":"return-to-start",...instructionPatch("return-to-start","EVERYONE RETURN TO STARTING ZONE"),updatedAt:serverTimestamp()})}
async function swapNextRoles(){if(!requireAuthenticatedWrite()||!new Set(["provisional","session-complete"]).has(state?.systemState))return;await update(stateRef,{"event/circuit/nextRolesSwapped":!state.event.circuit?.nextRolesSwapped,updatedAt:serverTimestamp()})}
function countdownDots(element,endsAt){if(!element)return;const elapsed=Math.max(0,10000-(endsAt-Date.now())),lit=elapsed<9300?Math.min(5,Math.floor(elapsed/1500)+1):0;element.innerHTML=Array.from({length:5},(_,index)=>`<span class="${index<lit?"lit":"out"}"><i></i><i></i></span>`).join("")}
function scheduleNextStart(){
 if(nextStartTimer){clearTimeout(nextStartTimer);nextStartTimer=null}
 if(state?.systemState!=="next-session-countdown"||!state.session?.countdownEndsAt)return;
 const start=async()=>{if(!currentUser){nextStartTimer=setTimeout(start,500);return}if(state?.systemState!=="next-session-countdown")return;await update(stateRef,{systemState:"session-live",activeFlag:"green","session/phase":"hiding","session/running":true,"session/flag":"green","session/lastTickAt":Date.now(),"session/countdownEndsAt":null,...clearInstructionPatch(),updatedAt:serverTimestamp()})};
 nextStartTimer=setTimeout(()=>start().catch(error=>console.error("Unable to start next session",error)),Math.max(0,state.session.countdownEndsAt-Date.now()));
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
 const s=state.session;
 await update(stateRef,{
  systemState:"next-session-staging",
  activeFlag:"proceed-to-start",
  "session/phase":"restart-staging",
  "session/remainingMs":s.hideDurationMs,
  "session/running":false,
  "session/lastTickAt":null,
  "session/flag":"proceed-to-start",
  "session/restart":true,
  "session/countdownEndsAt":null,
  "session/terminationType":null,
  "session/terminationDetail":null,
  "session/spotStatus":Object.fromEntries((s.pursuitVehicleIds||[]).map(v=>[v,false])),
  ...instructionPatch("restart","RETURN TO STARTING LINE — PREPARE TO RESTART"),
  updatedAt:serverTimestamp()
 });
}

function pendingEntries(group={}){return Object.entries(group||{}).filter(([,item])=>item?.status==="pending")}
function renderChampionshipEventOptions(){const select=$("new-event-championship"),prior=select.value,events=Object.entries(competition.events||{}).filter(([,event])=>event.status!=="complete").sort((a,b)=>(a[1].date||"").localeCompare(b[1].date||""));select.innerHTML='<option value="">Unscheduled / standalone event</option>'+events.map(([id,event])=>`<option value="${escapeHtml(id)}">${escapeHtml(event.date||"TBA")} — ${escapeHtml(event.name)}</option>`).join("");if(events.some(([id])=>id===prior))select.value=prior;updateChampionshipEventPreview()}
function updateChampionshipEventPreview(){const id=$("new-event-championship").value,event=competition.events?.[id],entries=Object.values(competition.eventRegistrations?.[id]||{}).filter(entry=>entry.status==="registered"),vehicleCounts=entries.reduce((counts,entry)=>(counts[entry.vehicleId]=(counts[entry.vehicleId]||0)+1,counts),{}),conflicts=Object.entries(vehicleCounts).filter(([,count])=>count>1).map(([vehicleId])=>vehicleLabel(vehicleId));if(event){$("new-event-name").value=event.name;$("new-event-season").value=event.seasonId||currentSeasonId();$("new-event-points").value=event.pointsEvent===false?"non-points":"points";$("new-event-points").disabled=true;$("new-event-entries").innerHTML=`<strong>${event.pointsEvent===false?"Non-points event":"Championship points event"}</strong> • ${entries.length} registered${entries.length?` • ${entries.map(entry=>`${escapeHtml(entry.driverName)} / ${escapeHtml(entry.vehicleName)}`).join(" • ")}`:" • No driver entries yet."}${conflicts.length?`<br><b class="warning-text">Vehicle conflict: ${escapeHtml(conflicts.join(", "))}. Resolve assignments before starting.</b>`:""}`}else{$("new-event-points").disabled=false;$("new-event-entries").textContent="Choose whether this standalone event awards championship points."}}
function renderManagement(){
 const registrations=pendingEntries(requests.registrations),access=pendingEntries(requests.access),vehicleRequests=Object.entries(requests.vehicles||{}).flatMap(([uid,items])=>pendingEntries(items).map(([id,item])=>[`${uid}/${id}`,item]));
 const total=registrations.length+access.length+vehicleRequests.length;$("mra-request-count").textContent=`${total} pending`;
 $("registration-requests").innerHTML=`<h3>Driver Registrations</h3>`+(registrations.map(([uid,item])=>`<article class="management-card"><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.teamName)} • Requested ${escapeHtml(item.requestedMraNumber||"number assignment")}</span></div><label>MRA Number<input data-registration-number="${escapeHtml(uid)}" value="${escapeHtml(item.requestedMraNumber||"")}" maxlength="20"></label><div class="button-row"><button class="action primary-btn" data-approve-registration="${escapeHtml(uid)}">Approve</button><button class="action secondary-btn" data-reject-request="registrations/${escapeHtml(uid)}">Reject</button></div></article>`).join("")||'<p class="empty-state">No pending driver registrations.</p>');
 $("access-requests").innerHTML=`<h3>Team Device Access</h3>`+(access.map(([uid,item])=>`<article class="management-card"><div><strong>${escapeHtml(item.teamName||item.driverName)}</strong><span>${item.teamId?"Team device":`${escapeHtml(item.mraNumber)} • Legacy driver device`}</span></div><div class="button-row"><button class="action primary-btn" data-approve-access="${escapeHtml(uid)}">Approve Device</button><button class="action secondary-btn" data-reject-request="access/${escapeHtml(uid)}">Reject</button></div></article>`).join("")||'<p class="empty-state">No pending team-device requests.</p>');
 $("vehicle-requests").innerHTML=`<h3>Vehicle Submissions</h3>`+(vehicleRequests.map(([key,item])=>`<article class="management-card"><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.makeModel)}${item.competitionNumber?` • #${escapeHtml(item.competitionNumber)}`:""} • ${escapeHtml(item.driverName)}</span></div><div class="button-row"><button class="action primary-btn" data-approve-vehicle="${escapeHtml(key)}">Approve Vehicle</button><button class="action secondary-btn" data-reject-request="vehicles/${escapeHtml(key)}">Reject</button></div></article>`).join("")||'<p class="empty-state">No pending vehicle submissions.</p>');
 document.querySelectorAll("[data-approve-registration]").forEach(button=>button.onclick=()=>approveRegistration(button.dataset.approveRegistration));document.querySelectorAll("[data-approve-access]").forEach(button=>button.onclick=()=>approveAccess(button.dataset.approveAccess));document.querySelectorAll("[data-approve-vehicle]").forEach(button=>button.onclick=()=>approveVehicle(button.dataset.approveVehicle));document.querySelectorAll("[data-reject-request]").forEach(button=>button.onclick=()=>update(ref(db,`mfma/requests/${button.dataset.rejectRequest}`),{status:"rejected",reviewedAt:serverTimestamp()}));
 const seasons=new Set([currentSeasonId(),...Object.keys(competition.seasons||{}),...Object.keys(competition.archives||{})]),seasonSelect=$("standings-season"),prior=seasonSelect.value;seasonSelect.innerHTML=`<option value="career">Career</option>`+[...seasons].sort().reverse().map(id=>`<option>${escapeHtml(id)}</option>`).join("");if(prior==="career"||[...seasons].includes(prior))seasonSelect.value=prior;else seasonSelect.value=currentSeasonId();renderStandings();renderArchives();
}
async function approveRegistration(uid){if(!requireAuthenticatedWrite())return;const item=requests.registrations?.[uid],mraNumber=normalizeMraNumber(document.querySelector(`[data-registration-number="${CSS.escape(uid)}"]`)?.value),teamId=item?.teamId||slugify(item?.teamName),teamName=competition.teams?.[teamId]?.name;if(!item||!mraNumber){alert("Assign an MRA number before approval.");return}if(!OFFICIAL_TEAM_IDS.includes(teamId)||!teamName){alert("This registration is not assigned to one of the two official teams.");return}const driverId=`mra-${slugify(mraNumber)}`;if(competition.drivers?.[driverId]&&competition.drivers[driverId].name!==normalizeName(item.name)){alert("That MRA number is already assigned to another driver.");return}await update(ref(db,"mfma"),{[`competition/drivers/${driverId}`]:{name:normalizeName(item.name),mraNumber,teamId,teamName,status:"approved",approvedAt:serverTimestamp()},[`driverAccess/${uid}`]:{teamId,teamName,status:"approved",approvedAt:serverTimestamp()},[`requests/registrations/${uid}/teamId`]:teamId,[`requests/registrations/${uid}/teamName`]:teamName,[`requests/registrations/${uid}/status`]:"approved",[`requests/registrations/${uid}/approvedAt`]:serverTimestamp()})}
async function approveAccess(uid){if(!requireAuthenticatedWrite())return;const item=requests.access?.[uid],legacyDriver=competition.drivers?.[item?.driverId],teamId=item?.teamId||legacyDriver?.teamId;if(!item||competition.teams?.[teamId]?.status!=="approved")return;await update(ref(db,"mfma"),{[`driverAccess/${uid}`]:{teamId,teamName:competition.teams[teamId].name,status:"approved",approvedAt:serverTimestamp()},[`requests/access/${uid}/status`]:"approved",[`requests/access/${uid}/approvedAt`]:serverTimestamp()})}
async function approveVehicle(key){if(!requireAuthenticatedWrite())return;const [uid,id]=key.split("/"),item=requests.vehicles?.[uid]?.[id];if(!item)return;let vehicleId=slugify(item.name)||`vehicle-${id.slice(-6)}`;if(competition.vehicles?.[vehicleId])vehicleId=`${vehicleId}-${id.slice(-4)}`;await update(ref(db,"mfma"),{[`competition/vehicles/${vehicleId}`]:{name:normalizeName(item.name),makeModel:normalizeName(item.makeModel),competitionNumber:normalizeName(item.competitionNumber),ownerDriverId:item.driverId,status:"approved",approvedAt:serverTimestamp()},[`requests/vehicles/${uid}/${id}/status`]:"approved",[`requests/vehicles/${uid}/${id}/approvedAt`]:serverTimestamp()})}
function renderStandings(){const season=$("standings-season").value||currentSeasonId(),type=$("standings-type").value,entries=season==="career"?Object.values(competition.archives||{}).flatMap(value=>Object.entries(value||{})):Object.entries(competition.archives?.[season]||{}),adjustments=season==="career"?Object.assign({},...Object.values(competition.pointsAdjustments||{})):competition.pointsAdjustments?.[season],source=applyStandingsAdjustments(rebuildStandings(Object.fromEntries(entries)),adjustments),rows=sortedStandings(source?.[type]),configured=competition.seasons?.[season]?.points||DEFAULT_POINTS,sessionConfigured=competition.seasons?.[season]?.sessionPoints||DEFAULT_SESSION_POINTS,fair=configured[0]===5&&configured[1]===3,policy=season==="career"?"":`<section class="scoring-policy ${fair?"active":"needs-review"}"><div><strong>${fair?"Fair two-team policy active":"Scoring policy needs review"}</strong><span>Sessions ${sessionConfigured.join("–")} • At-large event ${configured.slice(0,2).join("–")} • Passenger cap ${PASSENGER_SEASON_CAP}/season • Lowest event score drops at 6 events</span></div>${fair?"":'<button id="adopt-fair-policy" class="action primary-btn" type="button">Adopt Fair Policy</button>'}</section>`;$("standings-list").innerHTML=policy+`<div class="standings-table"><div class="standings-head"><span>Pos</span><span>${type[0].toUpperCase()+type.slice(1)}</span><span>Breakdown</span><span>Points</span></div>${rows.map(row=>{const teamId=type==="teams"?row.id:type==="drivers"?competition.drivers?.[row.id]?.teamId:competition.vehicles?.[row.id]?.teamId,brand=teamBranding(teamId),breakdown=`${row.sessionPoints||0} session + ${row.eventPoints||0} event${row.participationPoints?` + ${row.participationPoints} participation`:""}${row.droppedPoints?` • ${row.droppedPoints} dropped`:""}`;return `<article style="--team-accent:${escapeHtml(brand.accent)}"><b>${row.championshipRank}${row.tied?"T":""}</b><span class="standing-name">${brand.emblem?`<img src="${escapeHtml(brand.emblem)}" alt="">`:""}<span>${escapeHtml(row.name)}${row.provisional?'<small class="provisional-tag">Provisional</small>':""}</span></span><span class="points-breakdown">${escapeHtml(breakdown)}</span><strong>${row.points||0}</strong></article>`}).join("")||"<p class=\"empty-state\">No archived results for this view.</p>"}</div>`;if($("adopt-fair-policy"))$("adopt-fair-policy").onclick=()=>adoptFairPolicy(season);renderPointsAdjustments(season,type)}
async function adoptFairPolicy(season){if(!requireAuthenticatedWrite()||!await requestConfirmation("Adopt Fair Scoring Policy",`Use session points of 2–1 and at-large event points of 5–3 for ${season}. Passenger points remain capped at three and the lowest at-large score drops after six events. Existing adjustments remain unchanged.`,"Adopt Policy"))return;const archives=competition.archives?.[season]||{},adjustments=competition.pointsAdjustments?.[season]||{},standings=applyStandingsAdjustments(rebuildStandings(archives),adjustments);await update(ref(db,"mfma/competition"),{[`seasons/${season}/points`]:DEFAULT_POINTS,[`seasons/${season}/sessionPoints`]:DEFAULT_SESSION_POINTS,[`seasons/${season}/scoringPolicy`] :"session-and-at-large-v2",[`drivers/mra-16/competitionRole`]:"primary",[`drivers/mra-3/competitionRole`]:"honorary",[`standings/${season}`]:standings})}
function adjustmentEntrants(type){if(type==="drivers")return competition.drivers||{};if(type==="teams")return Object.fromEntries(Object.entries(competition.teams||{}).filter(([id])=>OFFICIAL_TEAM_IDS.includes(id)));return vehicleCatalog()}
function renderPointsAdjustments(season,type){const form=$("points-adjustment-form"),disabled=season==="career",entrants=adjustmentEntrants(type),prior=$("points-adjustment-entrant").value;form.classList.toggle("hidden",disabled);$("points-adjustment-entrant").innerHTML=Object.entries(entrants).map(([id,item])=>`<option value="${escapeHtml(id)}">${escapeHtml(item.name||id)}</option>`).join("");if(entrants[prior])$("points-adjustment-entrant").value=prior;const ledger=Object.entries(competition.pointsAdjustments?.[season]||{}).sort((a,b)=>(b[1].createdAt||0)-(a[1].createdAt||0));$("points-adjustment-ledger").innerHTML=ledger.map(([id,item])=>`<article class="${item.status==="void"?"void-result":""}"><span><strong>${escapeHtml(item.entityName)}</strong><small>${escapeHtml(item.reason)} • ${escapeHtml(item.type||"drivers")} championship • ${escapeHtml(item.managerName||"MRA official")}${item.status==="void"?" • VOIDED":""}</small></span><b>${item.points>0?"+":""}${item.points}</b>${item.status==="void"?"<em>Voided</em>":`<button class="mini-btn" data-void-adjustment="${escapeHtml(id)}">Void</button>`}</article>`).join("");document.querySelectorAll("[data-void-adjustment]").forEach(button=>button.onclick=async()=>{if(await requestConfirmation("Void Points Adjustment","Remove this audited adjustment from the standings while preserving its record?","Void Adjustment"))await update(ref(db,`mfma/competition/pointsAdjustments/${season}/${button.dataset.voidAdjustment}`),{status:"void",voidedAt:serverTimestamp(),voidedBy:currentUser?.uid||null})})}
async function submitPointsAdjustment(event){event.preventDefault();const season=$("standings-season").value,type=$("standings-type").value,entityId=$("points-adjustment-entrant").value,entity=adjustmentEntrants(type)[entityId],points=Number($("points-adjustment-value").value),reason=normalizeName($("points-adjustment-reason").value);if(season==="career"||!entity||!Number.isInteger(points)||points===0||!reason)return alert("Choose an entrant and enter a non-zero whole-point adjustment with a reason.");if(!await requestConfirmation("Confirm Points Adjustment",`${points>0?"Add":"Remove"} ${Math.abs(points)} point${Math.abs(points)===1?"":"s"} for ${entity.name||entityId}. This affects only the ${type} championship and will be recorded under your MRA account.`,"Record Adjustment"))return;const id=`adjustment-${Date.now().toString(36)}`;await update(ref(db,`mfma/competition/pointsAdjustments/${season}/${id}`),{type,entityId,entityName:entity.name||entityId,points,reason,status:"active",managerUid:currentUser?.uid||null,managerName:displayUserName(currentUser),auditLabel:"MRA steward adjustment",createdAt:serverTimestamp()});event.target.reset();renderStandings()}
function renderArchives(){const events=Object.entries(competition.archives||{}).flatMap(([seasonId,season])=>Object.entries(season||{}).map(([eventId,event])=>({seasonId,eventId,event}))).sort((a,b)=>(b.event.endedAt||0)-(a.event.endedAt||0));$("race-archive-list").innerHTML=events.map(({seasonId,eventId,event})=>`<article class="archive-card ${event.status==="void"?"void-result":""}"><div><strong>${escapeHtml(event.name)}</strong><span>${escapeHtml(event.date)} • ${escapeHtml(event.seasonId)} • ${event.status==="void"?"VOID":event.pointsEvent===false?"Non-points":"Points event"}</span></div><ol>${(event.classification||[]).map(row=>`<li><span>${escapeHtml(row.driverName||row.vehicleName||"Unassigned")}</span><b>${event.status==="void"||event.pointsEvent===false?"No points":`${row.points} pts`}</b></li>`).join("")}</ol>${event.voidReason?`<p class="status-note">Void reason: ${escapeHtml(event.voidReason)}</p>`:""}${event.status!=="void"?`<button class="action secondary-btn" data-void-archive="${escapeHtml(seasonId)}/${escapeHtml(eventId)}" type="button">Void result &amp; remove points</button>`:""}</article>`).join("")||"<p class=\"empty-state\">No races have been archived.</p>";document.querySelectorAll("[data-void-archive]").forEach(button=>button.onclick=()=>voidArchivedResult(button.dataset.voidArchive))}
async function voidArchivedResult(key){if(!requireAuthenticatedWrite())return;const separator=key.indexOf("/"),seasonId=key.slice(0,separator),eventId=key.slice(separator+1),event=competition.archives?.[seasonId]?.[eventId];if(!event)return;const reason=normalizeName(await requestText("Void Official Result",`Record why ${event.name} is being voided. Its points will be removed while the audit record remains.`,"Reason for voiding result")||"");if(!reason)return;const archives={...(competition.archives?.[seasonId]||{}),[eventId]:{...event,status:"void",voidReason:reason,voidedAt:Date.now()}};await update(ref(db,"mfma"),{[`competition/archives/${seasonId}/${eventId}/status`]:"void",[`competition/archives/${seasonId}/${eventId}/voidReason`]:reason,[`competition/archives/${seasonId}/${eventId}/voidedAt`]:serverTimestamp(),[`competition/standings/${seasonId}`]:applyStandingsAdjustments(rebuildStandings(archives),competition.pointsAdjustments?.[seasonId])})}
function eventArchiveIssues(){
 if(!state?.event||state.event.testMode)return [];
 const issues=[],teamIds=Object.values(state.event.teamIds||{}),pointsEvent=state.event.pointsEvent!==false;
 if(teamIds.length!==2||teamIds.some(id=>!OFFICIAL_TEAM_IDS.includes(id))||new Set(teamIds).size!==2)issues.push("both official teams are not assigned");
 for(const teamId of teamIds){const participants=Object.values(state.event.driverParticipants||{}).filter(driver=>driver.teamId===teamId&&isScoringDriverEligible(driver.driverId,competition.drivers?.[driver.driverId])),selected=state.event.scoringDrivers?.[teamId]||participants[0]?.driverId;if(!isScoringDriverEligible(selected,competition.drivers?.[selected]))issues.push(`${competition.teams?.[teamId]?.name||teamId} has no eligible scoring driver`);else if(participants.length>1&&!state.event.scoringDrivers?.[teamId])issues.push(`${competition.teams?.[teamId]?.name||teamId} needs a selected scoring driver`)}
 if(pointsEvent){const teamKeys=Object.keys(state.event.teamNames||state.session?.teamNames||{}),circuitStatus=getCircuitStatus(state.event.circuit,teamKeys);if(!circuitStatus.isCircuitBalanced)issues.push("the pursuit and hiding roles are not balanced");if(!state.event.sessionResults?.length)issues.push("no official session has been finalized");if(Object.values(state.event.hazards||{}).some(item=>item?.status!=="resolved"))issues.push("a safety report remains unresolved");if(state.session?.whiteReview||state.session?.violationReview)issues.push("an MRA steward review remains unresolved")}
 return [...new Set(issues)];
}
async function discardInvalidEvent(){if(!requireAuthenticatedWrite()||!state?.event)return;const issues=eventArchiveIssues(),issueText=issues.length?`Current archive problems: ${issues.join("; ")}.`:"This event may be legally archivable, but Race Management may still end it without a result.";const reason=normalizeName(await requestText("End Without a Result",`${issueText} Record the reason for deleting the active event data.`,"Cancellation or invalidation reason")||"");if(!reason||!await requestConfirmation("Delete Active Event",`${state.event.name}\n\nReason: ${reason}\n\nAny live Sprint or session will stop immediately. No result or points will be archived. This cannot be undone.`,"Delete Event"))return;const endedState={systemState:"no-event",activeFlag:"clear",event:null,session:null,sprint:null,updatedAt:serverTimestamp()},updates={state:endedState};if(state.event.championshipEventId)Object.assign(updates,{[`competition/events/${state.event.championshipEventId}/status`]:"cancelled",[`competition/events/${state.event.championshipEventId}/registrationStatus`]:"closed",[`competition/events/${state.event.championshipEventId}/cancelReason`]:reason,[`competition/events/${state.event.championshipEventId}/cancelledAt`]:serverTimestamp()});try{await update(ref(db,"mfma"),updates)}catch(error){console.error("Unable to delete active event",error);alert(`Event deletion failed: ${error.message||"Database write rejected."}`)}}
async function archiveAndEndEvent(){
 if(!requireAuthenticatedWrite()||!state?.event)return;
 if(state.systemState==="sprint-live"){if(!await requestConfirmation("End Active Sprint","Verify eligible Sprint participation and continue to the official event archive review?","End Sprint"))return;await closeSprintForEventEnd()}
 if(!new Set(["standby","session-complete","provisional"]).has(state.systemState))return alert("The current session or qualifying run must be completed before an official result can be archived. End & Delete remains available if the event must stop without a result.");
 const teamIds=Object.values(state.event.teamIds||{});if(teamIds.length!==2||teamIds.some(id=>!OFFICIAL_TEAM_IDS.includes(id))||new Set(teamIds).size!==2)return alert("The result must contain the two official teams before it can be archived.");
 for(const teamId of teamIds){const participants=Object.values(state.event.driverParticipants||{}).filter(driver=>driver.teamId===teamId&&isScoringDriverEligible(driver.driverId,competition.drivers?.[driver.driverId]));if(participants.length>1&&!state.event.scoringDrivers?.[teamId])return alert(`Choose the scoring driver for ${competition.teams?.[teamId]?.name||teamId} in Driver Reports before archiving.`);const selected=state.event.scoringDrivers?.[teamId]||participants[0]?.driverId;if(!isScoringDriverEligible(selected,competition.drivers?.[selected]))return alert(`${competition.teams?.[teamId]?.name||teamId} needs an eligible primary or substitute scoring driver. Honorary members cannot receive finishing points.`)}
 const passengerCount=Object.keys(state.event.passengerParticipants||{}).length,pointsEvent=state.event.pointsEvent!==false;
 if(pointsEvent){const teamKeys=Object.keys(state.event.teamNames||state.session?.teamNames||{}),circuitStatus=getCircuitStatus(state.event.circuit,teamKeys),unresolved=Object.values(state.event.hazards||{}).filter(item=>item?.status!=="resolved");if(!circuitStatus.isCircuitBalanced)return alert("This points event is not balanced. Each team must complete both the pursuit and hiding roles before points can be archived.");if(!state.event.sessionResults?.length)return alert("No official session records are available. Finalize at least one session before archiving a points event.");if(unresolved.length)return alert("Resolve every open or acknowledged safety report before archiving this points event.");if(state.session?.whiteReview||state.session?.violationReview)return alert("Resolve the MRA steward review before archiving this points event.");const usedByTeam={};for(const result of state.event.sessionResults||[])for(const entrant of result.entrants||[]){if(entrant.teamId&&entrant.vehicleId)(usedByTeam[entrant.teamId]??=new Set()).add(entrant.vehicleId)}const unapproved=Object.entries(usedByTeam).filter(([teamId,ids])=>ids.size>1&&!state.event.vehicleReplacements?.[teamId]?.approved);if(unapproved.length)return alert(`An emergency vehicle replacement must be approved with a reason for ${unapproved.map(([teamId])=>competition.teams?.[teamId]?.name||teamId).join(", ")} before archiving.`)}
 const sprintCount=Object.keys(state.event.sprintParticipants||{}).length,passengerNotice=pointsEvent&&passengerCount?`\n\nThis includes one passenger participation point for ${passengerCount} registered ${passengerCount===1?"passenger":"passengers"}.`:"",sprintNotice=pointsEvent&&sprintCount?`\n\nThis includes one Sprint participation point for ${sprintCount} verified ${sprintCount===1?"driver":"drivers"}, subject to the ${SPRINT_SEASON_CAP}-point seasonal cap.`:"";
 const nonPointsNotice=pointsEvent?"":"\n\nNo driver, team, vehicle, or passenger points will be awarded.";
 const finalOutcomes={a:$("event-outcome-a").value,b:$("event-outcome-b").value};if(pointsEvent&&Object.values(finalOutcomes).filter(value=>value==="winner").length!==1)return alert("Choose exactly one event winner. The other team must be classified, DNF, DNS, disqualified, or no result.");const seasonId=state.event.seasonId||currentSeasonId(),eventId=`${new Date().toISOString().slice(0,10)}-${slugify(state.event.name)}-${Date.now().toString(36)}`,archive=buildEventArchive(state,competition,{seasonId,finalOutcomes});if(archive.classification.some(row=>row.outcome==="dnf"&&!(state.event.participationSessions?.[row.driverId]>0)))return alert("A DNF point requires that driver to complete at least one official session. Use DNS or No result instead.");const resultPreview=archive.classification.map(row=>`P${row.position} ${row.teamName}: ${row.driverName||"No driver"} / ${row.vehicleName} — ${row.outcome.replaceAll("-"," ")} — ${row.points} at-large pts`).join("\n");
 if(archive.classification.some(row=>!row.driverId||!row.teamId||!row.vehicleId))return alert("The result is missing a team, scoring driver, or vehicle. Review Driver Reports and session setup before archiving.");
 if(!await requestConfirmation("Archive and End Event",`${resultPreview}\n\nArchive this ${pointsEvent?"points":"non-points"} event and end it?${passengerNotice}${sprintNotice}${nonPointsNotice}`,"Archive Event"))return;
 const archives={...(competition.archives?.[seasonId]||{}),[eventId]:archive},standings=applyStandingsAdjustments(rebuildStandings(archives),competition.pointsAdjustments?.[seasonId]),endedState={systemState:"no-event",activeFlag:"clear",event:null,session:null,sprint:null,updatedAt:serverTimestamp()},updates={[`competition/seasons/${seasonId}/name`]:`${seasonId} Season`,[`competition/seasons/${seasonId}/points`]:(competition.seasons?.[seasonId]?.points||DEFAULT_POINTS).slice(0,2),[`competition/seasons/${seasonId}/sessionPoints`]:(competition.seasons?.[seasonId]?.sessionPoints||DEFAULT_SESSION_POINTS).slice(0,2),[`competition/archives/${seasonId}/${eventId}`]:archive,[`competition/standings/${seasonId}`]:standings,state:endedState};if(state.event.championshipEventId)Object.assign(updates,{[`competition/events/${state.event.championshipEventId}/status`]:"complete",[`competition/events/${state.event.championshipEventId}/registrationStatus`]:"closed",[`competition/events/${state.event.championshipEventId}/completedAt`]:serverTimestamp()});
 try{await update(ref(db,"mfma"),updates)}catch(error){console.error("Unable to archive event",error);if(await requestConfirmation("Archive Failed",`The event archive could not be saved: ${error.message||"database write rejected"}. End this event without saving its result?`,"End Without Archive"))await set(stateRef,endedState)}
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
 const reports=state?.event?.vehicleReports||{},passengers=Object.values(state?.event?.passengerParticipants||{}),drivers=Object.values(state?.event?.driverParticipants||{});
 const usedByTeam={};for(const result of state.event.sessionResults||[])for(const entrant of result.entrants||[]){if(entrant.teamId&&entrant.vehicleId)(usedByTeam[entrant.teamId]??=new Set()).add(entrant.vehicleId)}const replacements=Object.entries(usedByTeam).filter(([,ids])=>ids.size>1);
 $("occupant-panel").classList.toggle("hidden",!Object.keys(reports).length&&!passengers.length&&!drivers.length&&!replacements.length);$("occupant-list").innerHTML=drivers.map(driver=>{const role=driverCompetitionRole(driver.driverId,competition.drivers?.[driver.driverId]),eligible=isScoringDriverEligible(driver.driverId,competition.drivers?.[driver.driverId]),sessions=state.event.participationSessions?.[driver.driverId]||0;return `<article><strong>${escapeHtml(driver.driverName)} • ${escapeHtml(driver.teamName)}</strong><span>${escapeHtml(vehicleLabel(driver.vehicleId))} • MRA ${escapeHtml(driver.mraNumber)} • ${escapeHtml(role)}</span><small>${sessions} completed session${sessions===1?"":"s"}</small><button class="mini-btn" data-scoring-driver="${escapeHtml(driver.teamId)}/${escapeHtml(driver.driverId)}" ${eligible?"":"disabled"}>${eligible?(state.event.scoringDrivers?.[driver.teamId]===driver.driverId?"Scoring driver selected":"Use as scoring driver"):"Honorary — not scoring"}</button></article>`}).join("")+Object.entries(reports).map(([vehicleId,r])=>`<article><strong>${escapeHtml(vehicleLabel(vehicleId))}</strong><span>Current driver: ${escapeHtml(r.driverName||"—")}${r.mraNumber?` • ${escapeHtml(r.mraNumber)}`:""}</span><span>Current passenger: ${escapeHtml(r.passengerName||"—")}</span><small>${relativeTime(r.submittedAt)}</small></article>`).join("")+passengers.map(passenger=>{const sessions=state.event.participationSessions?.[passenger.driverId]||0;return `<article><strong>Passenger Participation</strong><span>${escapeHtml(passenger.driverName)} • ${escapeHtml(passenger.mraNumber)}</span><span>${state.event.pointsEvent===false?"Non-points event":sessions>0?`Verified point • seasonal maximum ${PASSENGER_SEASON_CAP}`:"Pending one completed session"}</span><small>${sessions} completed session${sessions===1?"":"s"} • Recorded by ${escapeHtml(competition.teams?.[passenger.recordedByTeamId]?.name||passenger.recordedByTeamId)}</small><button class="mini-btn" data-remove-passenger="${escapeHtml(passenger.driverId)}">Remove mistaken entry</button></article>`}).join("")+replacements.map(([teamId,ids])=>{const approval=state.event.vehicleReplacements?.[teamId];return `<article class="replacement-review"><strong>Vehicle Replacement • ${escapeHtml(competition.teams?.[teamId]?.name||teamId)}</strong><span>${[...ids].map(vehicleLabel).map(escapeHtml).join(" → ")}</span><small>${approval?.approved?`MRA approved • ${escapeHtml(approval.reason)}`:"Approval and reason required before points archive"}</small>${approval?.approved?"":`<button class="mini-btn" data-approve-replacement="${escapeHtml(teamId)}">Approve Emergency Replacement</button>`}</article>`}).join("");
 document.querySelectorAll("[data-scoring-driver]").forEach(button=>button.onclick=()=>{const [teamId,driverId]=button.dataset.scoringDriver.split("/");update(stateRef,{[`event/scoringDrivers/${teamId}`]:driverId,updatedAt:serverTimestamp()})});
 document.querySelectorAll("[data-remove-passenger]").forEach(button=>button.onclick=async()=>{if(await requestConfirmation("Remove Passenger Entry","Remove this passenger participation entry from the current event?","Remove Entry"))await update(stateRef,{[`event/passengerParticipants/${button.dataset.removePassenger}`]:null,updatedAt:serverTimestamp()})});
 document.querySelectorAll("[data-approve-replacement]").forEach(button=>button.onclick=async()=>{const teamId=button.dataset.approveReplacement,teamName=competition.teams?.[teamId]?.name||teamId,reason=normalizeName(await requestText("Approve Vehicle Replacement",`Record why ${teamName} may use an emergency replacement for championship scoring.`,"Replacement reason")||"");if(!reason||!await requestConfirmation("Confirm Vehicle Replacement",`Approve ${teamName}'s emergency replacement for championship scoring?\n\n${reason}`,"Approve Replacement"))return;await update(stateRef,{[`event/vehicleReplacements/${teamId}`]:{approved:true,reason,approvedBy:currentUser?.uid||null,approvedByName:displayUserName(currentUser),approvedAt:Date.now()},updatedAt:serverTimestamp()})});
 const hazards=Object.entries(state?.event?.hazards||{}).map(([id,hazard])=>({id,...hazard})).filter(h=>h.status!=="resolved").sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
 const canApplyFlag=new Set(["standby","sprint-live","session-live"]).has(state?.systemState);
 $("hazard-panel").classList.toggle("hidden",!hazards.length);$("hazard-list").innerHTML=hazards.map(h=>`<article class="hazard-alert ${escapeHtml(h.status)}"><div class="hazard-alert-head"><b>REQUEST • ${escapeHtml(vehicleLabel(h.vehicleId).toUpperCase())}</b><span>${h.status==="open"?"NEW":"ACKNOWLEDGED"}</span></div><strong>${h.requestSafetyCar?"Safety Car requested":"Red Flag requested"}</strong>${h.mraNumber?`<small>${escapeHtml(h.mraNumber)}</small>`:""}<div class="hazard-requests">${h.requestStopClock?"<b>RED FLAG</b>":""}${h.requestSafetyCar?"<b>SAFETY CAR</b>":""}</div>${canApplyFlag?"":"<small>Session action unavailable in the current state.</small>"}<div class="button-row">${h.status==="open"?`<button class="mini-btn" data-hazard-ack="${h.id}">Acknowledge</button>`:""}${h.status!=="resolved"?`<button class="mini-btn" data-hazard-resolve="${h.id}">Resolve</button>`:""}${canApplyFlag&&h.requestStopClock?`<button class="mini-btn" data-hazard-red="${h.id}">Red Flag</button>`:""}${canApplyFlag&&h.requestSafetyCar?`<button class="mini-btn" data-hazard-safety="${h.id}">Safety Car</button>`:""}</div></article>`).join("");
 document.querySelectorAll("[data-hazard-ack]").forEach(b=>b.onclick=()=>update(stateRef,{[`event/hazards/${b.dataset.hazardAck}/status`]:"acknowledged",[`event/hazards/${b.dataset.hazardAck}/acknowledgedAt`]:serverTimestamp()}));
 document.querySelectorAll("[data-hazard-resolve]").forEach(b=>b.onclick=()=>resolveHazard(b.dataset.hazardResolve));
 document.querySelectorAll("[data-hazard-red]").forEach(b=>b.onclick=()=>issueFlag("red"));document.querySelectorAll("[data-hazard-safety]").forEach(b=>b.onclick=()=>issueFlag("safety-car"));
}
function renderInstructionSync(){const panel=$("instruction-sync-panel"),current=state?.event?.currentInstruction;if(!current){panel.classList.add("hidden");return}const reports=Object.entries(state.event?.vehicleReports||{}),acks=state.event?.instructionAcks||{},rows=reports.map(([vehicleId,report])=>({vehicleId,report,acknowledged:Object.values(acks).some(ack=>ack?.instructionId===current.id&&ack.vehicleId===vehicleId)})),acknowledgedCount=rows.filter(row=>row.acknowledged).length;panel.classList.remove("hidden");$("instruction-sync-title").textContent=current.label||current.type.replaceAll("-"," ");$("instruction-sync-summary").textContent=rows.length?`${acknowledgedCount} of ${rows.length} signed-in Driver display${rows.length===1?"":"s"} acknowledged.`:"Waiting for a signed-in Driver display.";$("instruction-sync-list").innerHTML=rows.map(({vehicleId,report,acknowledged})=>`<span class="${acknowledged?"acknowledged":""}">${acknowledged?"✓ ":"○ "}${escapeHtml(vehicleLabel(vehicleId))} • ${escapeHtml(report.driverName||"Driver")}</span>`).join("")}
function render(){
 const mode=getRenderMode(state),has=mode!=="no-event",management=$("mra-management"),eventKey=state?.event?`${state.event.name||"event"}:${state.event.createdAt||state.event.date||"active"}`:null;document.body.dataset.mode=mode;document.body.classList.toggle("flag-controls-active",["standby","session-live","sprint-live"].includes(mode));E.noEvent.classList.toggle("hidden",has);E.eventArea.classList.toggle("hidden",!has);if(!has){management.open=true;managementEventKey=null}else if(managementEventKey!==eventKey){management.open=false;managementEventKey=eventKey}const safetyActive=safetyManagementActive(),currentSafetyMessage=safetyActive&&state.safetyMessage?.flag===state.activeFlag?state.safetyMessage.text||"":"";$("safety-message-open").classList.toggle("hidden",!safetyActive);$("safety-message-open").textContent=currentSafetyMessage?"Safety Info • Live":"Safety Info";if(!has)return;
 E.eventName.textContent=state.event.name;E.eventMeta.textContent=state.event.circuit?.format?state.event.circuit.format.replace("-","–"):"Awaiting first session";
 const testMode=mode==="test-mode",standby=mode==="standby",course=mode==="course-lap",sprintLive=mode==="sprint-live",qualifyingLive=mode==="qualifying-live",live=mode==="session-live"||mode==="awaiting-finding-start",awaiting=mode==="awaiting-finding-start",prov=mode==="provisional",complete=mode==="session-complete",staging=mode==="next-session-staging",countdown=mode==="next-session-countdown",safetyTerm=mode==="safety-car-termination",review=mode==="violation-review",whiteTerm=mode==="white-termination";
 showOnly(mode,{"test-mode":E.testMode,standby:E.standby,"course-lap":E.courseLap,"sprint-live":E.sprint,"qualifying-live":E.qualifying,"session-live":E.live,"awaiting-finding-start":E.live,provisional:E.provisional,"session-complete":E.provisional,"next-session-staging":E.nextStart,"next-session-countdown":E.nextStart,"safety-car-termination":E.termination,"violation-review":E.termination,"white-termination":E.termination});renderInstructionSync();
 $("event-head-panel").classList.toggle("hidden",testMode);$("hazard-panel").classList.toggle("hidden",testMode);$("occupant-panel").classList.toggle("hidden",testMode);
 E.setup.classList.toggle("hidden",!standby);$("event-score-panel").classList.toggle("hidden",!(standby||(live&&!awaiting)));
 const flagsAllowed=standby||sprintLive||(live&&!awaiting);$("quick-flag-panel").classList.toggle("hidden",!flagsAllowed);$("quick-flag-status").textContent=(state.activeFlag||"clear").replaceAll("-"," ").toUpperCase();
 const permittedFlags=standby?new Set(["yellow","move-over","red","safety-car","checkered","clear"]):sprintLive?new Set(["green","yellow","move-over","red","safety-car","checkered","clear"]):new Set(["green","yellow","move-over","red","safety-car","checkered"]);
 document.querySelectorAll("[data-quick-flag]").forEach(button=>{button.disabled=!permittedFlags.has(button.dataset.quickFlag);button.classList.toggle("active",button.dataset.quickFlag===state.activeFlag)});
 $("toolbar-event-name").textContent=state.event.name;$("toolbar-state").textContent=whiteTerm?"DISQUALIFICATION":review?"MRA STEWARD — INCIDENT UNDER INVESTIGATION":mode.replaceAll("-"," ").toUpperCase();$("toolbar-flag").textContent=(state.activeFlag||"clear").replaceAll("-"," ").toUpperCase();
 $("toolbar-timer").textContent=sprintLive?(state.sprint?.timerMode==="none"?"NO TIMER":fmt(sprintTime())):qualifyingLive?fmtQualifying(qualifyingTime(state.event.qualifying)):live?fmt(state.session?.remainingMs||0):review?"HELD":(prov||complete||safetyTerm||whiteTerm)?"ENDED":"--:--";
 renderScore("scoreboard");renderCircuit("sidebar-circuit");$("sidebar-status").textContent=awaiting?"Hiding complete — confirmation required":live?`${state.session?.format?.replaceAll("-"," ")||"Session"} • Session ${state.session?.number||""}`:state.event?.courseLap?.status==="complete"?"✓ Course Lap Complete":"Ready for competition";
 if(!testMode)renderReports();
 const archiveIssues=!testMode?eventArchiveIssues():[],canDiscard=!testMode;$("discard-invalid-event").classList.toggle("hidden",!canDiscard);$("archive-issues").classList.toggle("hidden",!archiveIssues.length);$("archive-issues").textContent=archiveIssues.length?`Cannot legally archive yet: ${archiveIssues.join("; ")}. You may still end and delete the event without a result.`:"";
 const dedicatedTermination=safetyTerm||review||whiteTerm,hideOutcomes=sprintLive||qualifyingLive||course||live||staging||countdown||dedicatedTermination;$("standby-button").classList.toggle("hidden",sprintLive||qualifyingLive||course||live||prov||complete||staging||countdown||dedicatedTermination);$("end-event").classList.toggle("hidden",testMode);$("official-outcomes").classList.toggle("hidden",hideOutcomes||state.event.pointsEvent===false);const outcomeNames=state.event.teamNames||state.session?.teamNames||{},eventKey=`${state.event.name}|${state.event.sessionResults?.length||0}`;for(const side of ["a","b"]){$("outcome-label-"+side).firstChild.textContent=`${outcomeNames[side]||`Team ${side.toUpperCase()}`} `;const select=$("event-outcome-"+side);if(select.dataset.eventKey!==eventKey){const scores=state.event.scores||{},winner=Number(scores[side]||0)>Number(scores[side==="a"?"b":"a"]||0);select.value=winner?"winner":"classified";select.dataset.eventKey=eventKey}}
 if(standby||course){
  const lap=state.event?.courseLap||{};
  if(standby)renderSprintRoster();
  const qualifyingWinner=state.event?.qualifying?.winner;$("qualifying-summary").classList.toggle("hidden",!standby||!qualifyingWinner);$("qualifying-summary").textContent=qualifyingWinner?`Qualifying winner: ${qualifyingWinner.driverName} • ${fmtQualifying(qualifyingWinner.timeMs)} • ${QUALIFYING_TRACKS[state.event.qualifying.trackLength]} track • Shelly`:"";
  $("standby-course-lap").classList.toggle("hidden",!standby||lap.required===false);
  $("standby-course-lap-status").textContent=lap.status==="complete"?"Course Lap Complete":"Course Lap Required";
  $("start-course-lap").classList.toggle("hidden",!standby||lap.status==="active"||lap.status==="complete");
  $("complete-course-lap").classList.toggle("hidden",lap.status!=="active");
  E.courseLapStatus.textContent="Course lap in progress. Follow the Safety Car; no overtaking.";
 }
 if(safetyTerm||review||whiteTerm){
  $("review-resume").classList.toggle("hidden",!review);$("review-disqualify").classList.toggle("hidden",!review);$("review-no-result").classList.toggle("hidden",!review);$("termination-standby").classList.toggle("hidden",review);$("termination-restart").classList.toggle("hidden",review);
  E.terminationTitle.textContent=safetyTerm?"Safety Car Termination":review?"MRA Steward — Incident Under Investigation":"Disqualification";
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
 if(qualifyingLive){const qualifying=state.event.qualifying||{},laps=rankedQualifyingLaps(qualifying.laps),fastest=laps[0];$("qualifying-track-label").textContent=QUALIFYING_TRACKS[qualifying.trackLength]||qualifying.trackLength||"—";$("qualifying-live-track").value=`${QUALIFYING_TRACKS[qualifying.trackLength]||"—"} • Shelly`;$("qualifying-driver-name").textContent=qualifying.currentDriverName||"Choose driver";$("qualifying-timer-status").textContent=qualifying.running?"RUNNING":"READY";$("qualifying-start-run").disabled=Boolean(qualifying.running);$("qualifying-finish-run").disabled=!qualifying.running;$("qualifying-live-driver").disabled=Boolean(qualifying.running);if(competition.drivers?.[qualifying.currentDriverId])$("qualifying-live-driver").value=qualifying.currentDriverId;$("qualifying-fastest").textContent=fastest?`${fastest.driverName} • ${fmtQualifying(fastest.timeMs)}`:"No valid time";$("qualifying-results").innerHTML=laps.map((lap,index)=>`<article><b>${index+1}</b><span><strong>${escapeHtml(lap.driverName)}</strong><small>MRA ${escapeHtml(lap.mraNumber||"—")} • Shelly</small></span><strong>${fmtQualifying(lap.timeMs)}</strong><button class="mini-btn" data-invalid-lap="${escapeHtml(lap.id)}">Invalidate</button></article>`).join("")||'<p class="empty-state">No valid qualifying laps recorded.</p>';document.querySelectorAll("[data-invalid-lap]").forEach(button=>button.onclick=()=>invalidateQualifyingLap(button.dataset.invalidLap))}
 if(live){const s=state.session,spotsEnabled=s.phase==="finding";E.phase.textContent=s.phase==="hiding"?"HIDING":awaiting?"HIDING COMPLETE":"FINDING";E.timer.textContent=fmt(s.remainingMs);E.sessionLabel.textContent=`Session ${s.number}`;E.roles.textContent=`${s.teamNames[s.pursuitTeam]} pursuing • ${s.teamNames[s.evadingTeam]} evading`;E.active.textContent=signals[state.activeFlag]?.label||state.activeFlag;E.badge.textContent=awaiting?"AWAITING RACE DIRECTOR":s.running?"SESSION LIVE":"SESSION PAUSED";E.findingStart.classList.toggle("hidden",!awaiting);$("live-signal-panel").classList.toggle("hidden",awaiting);$("live-flag-panel").classList.toggle("hidden",awaiting);$("live-spots-panel").classList.toggle("hidden",awaiting);E.spots.innerHTML=(s.pursuitVehicleIds||[]).map(v=>`<button class="spot ${s.spotStatus?.[v]?"confirmed":""}" data-spot="${v}" ${s.spotStatus?.[v]||!spotsEnabled?"disabled":""}><span>${escapeHtml(vehicleLabel(v))}</span><strong>${s.spotStatus?.[v]?"SPOT CONFIRMED":spotsEnabled?"CONFIRM VALID RADIO SPOT":"FINDING NOT STARTED"}</strong></button>`).join("");E.spots.querySelectorAll("[data-spot]").forEach(b=>b.onclick=()=>confirmSpot(b.dataset.spot))}
 if(live)$("restart-at-line").classList.toggle("hidden",state.activeFlag!=="red");
 if(prov||complete){
  E.provisionalDetail.textContent=state.session.provisionalReason||"Session complete";
  E.resultTitle.textContent=complete?"Official Checkered":"Provisional Checkered";
  E.finalize.classList.toggle("hidden",complete);
  $("return-to-start-order").classList.toggle("hidden",state.activeFlag==="return-to-start");
  E.next.classList.toggle("hidden",!complete||state.activeFlag!=="return-to-start");
  $("post-white").classList.remove("hidden");
  const nextIndex=(state.event.circuit?.roleIndex||0)+1+(state.event.circuit?.nextRolesSwapped?1:0),nextPursuit=nextIndex%2===0?"a":"b",nextEvading=nextPursuit==="a"?"b":"a",names=state.session.teamNames||{};
  $("next-role-preview").textContent=`Next session: ${names[nextEvading]||nextEvading} hides • ${names[nextPursuit]||nextPursuit} finds`;
  renderScore("between-scoreboard");
  renderCircuit("circuit-progress");
 }
 if(staging||countdown){const restart=Boolean(state.session?.restart);$("next-start-panel").querySelector("h2").textContent=restart?"Restart at Starting Line":"Proceed to Starting Line";$("start-next-countdown").classList.toggle("hidden",countdown);$("next-start-guidance").textContent=countdown?`${restart?"Restart":"Start"} sequence active. Green and the hiding timer begin when all red lights go out.`:`${restart?"Restart order issued":"Proceed order issued"}. Wait until the hiding team is stopped behind the line.`;if(countdown)countdownDots($("control-start-dots"),state.session.countdownEndsAt);else $("control-start-dots").innerHTML=""}
}

document.querySelectorAll("[data-type]").forEach(b=>b.onclick=()=>{document.querySelectorAll("[data-type]").forEach(x=>x.classList.remove("active"));b.classList.add("active");sessionType=b.dataset.type;$("vehicle-vehicle-setup").classList.toggle("hidden",sessionType!=="vehicle-vehicle");$("vehicle-foot-setup").classList.toggle("hidden",sessionType!=="vehicle-foot");if(sessionType==="vehicle-foot"){E.hide.value=120;E.find.value=300;renderVF()}else{E.hide.value=60;E.find.value=120;renderVVSelectors()}});
$("vv-team-1").onchange=updateRoleSummary;$("vv-team-2").onchange=updateRoleSummary;$("vv-team-id-1").onchange=updateRoleSummary;$("vv-team-id-2").onchange=updateRoleSummary;
$("vf-team-a").onchange=updateRoleSummary;$("vf-team-b").onchange=updateRoleSummary;$("vf-vehicle").onchange=renderVF;$("swap-teams").onclick=()=>{roleIndex=roleIndex%2===0?1:0;updateRoleSummary()};
$("create-event").onclick=()=>{$("event-dialog").showModal();renderChampionshipEventOptions()};$("close-dialog").onclick=()=>$("event-dialog").close();$("event-form").onsubmit=e=>{e.preventDefault();createEvent()};$("new-event-championship").onchange=updateChampionshipEventPreview;
$("start-test-mode").onclick=startTestMode;$("end-test-mode").onclick=async()=>{if(await requestConfirmation("End Test Mode","Clear every test signal and return the network to No Active Event?","End Test Mode"))await endTestMode()};document.querySelectorAll("[data-test-flag]").forEach(button=>button.onclick=()=>issueTestSignal(button.dataset.testFlag));
$("end-event").onclick=archiveAndEndEvent;
$("discard-invalid-event").onclick=discardInvalidEvent;
$("standby-button").onclick=()=>{if(state?.systemState!=="sprint-live")update(stateRef,{systemState:"standby",activeFlag:"clear",session:null,updatedAt:serverTimestamp()})};$("start-session").onclick=startSession;
$("start-sprint").onclick=startSprint;$("terminate-sprint").onclick=async()=>{if(await requestConfirmation("Terminate MFMA Sprint","End the Sprint, verify eligible participation, and return to Standby?","Terminate Sprint"))await terminateSprint()};
$("start-qualifying").onclick=startQualifying;$("qualifying-live-driver").onchange=selectQualifyingDriver;$("qualifying-start-run").onclick=startQualifyingRun;$("qualifying-finish-run").onclick=finishQualifyingRun;$("qualifying-reset-run").onclick=resetQualifyingRun;$("end-qualifying").onclick=endQualifying;
$("sprint-timer-mode").onchange=setSprintTimerMode;$("sprint-duration").onchange=configureSprintDuration;$("sprint-start-timer").onclick=startSprintTimer;$("sprint-pause-timer").onclick=pauseSprintTimer;$("sprint-reset-timer").onclick=resetSprintTimer;
$("sprint-add-time").onclick=()=>adjustSprintTimer(Math.max(0,Number($("sprint-adjustment").value)||0)*1000);$("sprint-subtract-time").onclick=()=>adjustSprintTimer(-Math.max(0,Number($("sprint-adjustment").value)||0)*1000);$("sprint-set-time").onclick=setSprintTimer;
document.querySelectorAll("[data-sprint-flag]").forEach(b=>b.onclick=()=>issueFlag(b.dataset.sprintFlag));
document.querySelectorAll("[data-quick-flag]").forEach(b=>b.onclick=()=>issueFlag(b.dataset.quickFlag));
$("start-finding").onclick=startFinding;
document.querySelectorAll("[data-flag]").forEach(b=>b.onclick=()=>issueFlag(b.dataset.flag));
$("restart-at-line").onclick=restartTerminatedSession;
$("post-white").onclick=openWhiteDialog;document.querySelectorAll("[data-violation-open]").forEach(button=>button.onclick=openWhiteDialog);$("close-white").onclick=closeViolationDialog;$("violation-type").onchange=syncViolationForm;$("penalty-type").onchange=()=>$("time-penalty-options").classList.toggle("hidden",$("penalty-type").value!=="time");$("white-form").onsubmit=e=>{e.preventDefault();resolveWhiteForm()};syncViolationForm();
$("swap-next-roles").onclick=swapNextRoles;$("return-to-start-order").onclick=issueReturnToStart;$("finalize-result").onclick=finalizeResult;$("next-session").onclick=advanceNextSession;$("start-next-countdown").onclick=startNextCountdown;$("return-standby").onclick=()=>update(stateRef,{systemState:"standby",activeFlag:"clear",session:null,updatedAt:serverTimestamp()});$("show-scoreboard").onclick=()=>update(stateRef,{showScoreboard:true,updatedAt:serverTimestamp()});


$("start-course-lap").onclick=startCourseLap;
$("complete-course-lap").onclick=completeCourseLap;
$("termination-standby").onclick=returnFromTermination;
$("termination-restart").onclick=restartTerminatedSession;
$("review-resume").onclick=resumeViolationReview;$("review-disqualify").onclick=openDisqualificationReview;$("review-no-result").onclick=noResultViolationReview;
$("safety-message-open").onclick=openSafetyMessage;$("close-safety-message").onclick=()=>$("safety-message-dialog").close();$("safety-message-form").onsubmit=e=>{e.preventDefault();saveSafetyMessage($("safety-message-input").value)};$("clear-safety-message").onclick=()=>saveSafetyMessage("");document.querySelectorAll("[data-safety-preset]").forEach(button=>button.onclick=()=>{$("safety-message-input").value=button.dataset.safetyPreset;$("safety-message-input").focus()});
document.querySelectorAll("[data-management-tab]").forEach(button=>button.onclick=()=>{document.querySelectorAll("[data-management-tab]").forEach(item=>item.classList.toggle("active",item===button));document.querySelectorAll(".management-view").forEach(view=>view.classList.toggle("hidden",view.id!==`management-${button.dataset.managementTab}`))});$("standings-season").onchange=renderStandings;$("standings-type").onchange=renderStandings;$("points-adjustment-form").onsubmit=submitPointsAdjustment;

$("white-review-overlay").onclick=e=>{
 if(e.target===$("white-review-overlay")){
  $("white-review-overlay").classList.add("hidden");
  document.body.classList.remove("modal-open");
 }
};
$("text-entry-form").onsubmit=event=>{event.preventDefault();const value=normalizeName($("text-entry-input").value);if(value)finishTextEntry(value)};$("text-entry-close").onclick=()=>finishTextEntry();$("text-entry-cancel").onclick=()=>finishTextEntry();$("text-entry-dialog").addEventListener("cancel",event=>{event.preventDefault();finishTextEntry()});
$("confirmation-form").onsubmit=event=>{event.preventDefault();finishConfirmation(true)};$("confirmation-close").onclick=()=>finishConfirmation(false);$("confirmation-cancel").onclick=()=>finishConfirmation(false);$("confirmation-dialog").addEventListener("cancel",event=>{event.preventDefault();finishConfirmation(false)});

onValue(stateRef,s=>{const previous=state;state=s.val()||{systemState:"no-event"};playStateTransition(previous,state);scheduleWarningReturn();scheduleNextStart();const newHazards=newOpenHazardIds(previous,state);if(newHazards.length){try{playSound("hazard")}catch{}if(new Set(["clear","green","move-over"]).has(state.activeFlag||"clear"))issueFlag("yellow").catch(error=>console.error("Unable to call immediate yellow",error))}setConn("connected","Connected");roleIndex=state.event?.circuit?.roleIndex||roleIndex;if(!state.event){$("toolbar-event-name").textContent="Race Control";$("toolbar-state").textContent="NO EVENT";$("toolbar-flag").textContent="CLEAR";$("toolbar-timer").textContent="--:--"}render()},e=>{setConn("error","Connection error");console.error(e)});
onValue(competitionRef,snapshot=>{competition=snapshot.val()||{};renderVehicleSetup();renderQualifyingDriverOptions();renderManagement();renderChampionshipEventOptions();if(state)render()});$("new-event-season").value=currentSeasonId();renderVehicleSetup();renderQualifyingDriverOptions();renderManagement();renderChampionshipEventOptions();setInterval(()=>{tick();sprintTick();qualifyingTick();if(state?.systemState==="next-session-countdown")countdownDots($("control-start-dots"),state.session.countdownEndsAt)},50);
