import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getDatabase, ref, onValue, get, update, push, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js?v=40";
import { signals } from "./signals.js?v=71";
import { getRenderMode } from "./display-state.js?v=63";
import { enableSounds, getSoundStatus, onSoundStatus, playStateTransition } from "./sounds.js?v=70";
import { cleanOccupantReport, cleanHazardReport } from "./report-model.js?v=52";
import { approvedVehicles, findDriver, normalizeMraNumber, normalizeName, currentSeasonId, rebuildStandings } from "./competition-model.js?v=75";
const app=initializeApp(firebaseConfig),db=getDatabase(app),auth=getAuth(app),stateRef=ref(db,"mfma/state");
const $=id=>document.getElementById(id);let state=null,wake=null;
const display=$("display"),status=$("display-status"),statusText=status.querySelector("span:last-child"),statusView=$("status-view"),liveView=$("live-view"),title=$("status-title"),detail=$("status-detail"),kicker=$("status-kicker"),sessionLine=$("display-session"),timer=$("display-timer"),label=$("label"),instruction=$("instruction"),theme=document.querySelector('meta[name="theme-color"]'),standbyLeaderboard=$("standby-leaderboard");
const soundButton=$("display-sound");
const vehicleSelect=$("driver-vehicle"),tools=$("driver-tools"),PROFILE_KEY="mfma-driver-profile";
function readDriverProfile(){try{const profile=JSON.parse(localStorage.getItem(PROFILE_KEY)||"null");return profile?.driverId&&profile?.mraNumber&&profile?.driverName&&profile?.vehicleId?profile:null}catch{return null}}
let driverProfile=readDriverProfile(),selectedVehicle=driverProfile?.vehicleId||localStorage.getItem("mfma-driver-vehicle")||"ranger",competition={};
let driverUser=null,driverAuthPromise=null,crewEditing=false,lastReportKey="",resolvedTimer=null,accessUnsubscribe=null,currentBinding=null;
const safetyManagementFlags=new Set(["yellow","move-over","red","safety-car","return-to-start","infraction-warning","under-review","disqualification"]);
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]);
let visualSignal=null;
function applyDisplayClass(className,signal){
 if(signal!==visualSignal&&display.classList.contains("flash")&&className.includes(" flash")){
  display.classList.remove("flash");void display.offsetWidth;
 }
 display.className=className;visualSignal=signal;
}
function fmt(ms){const t=Math.max(0,Math.ceil(ms/1000));return `${String(Math.floor(t/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`}
function sprintTime(s=state?.sprint){if(!s||s.timerMode==="none")return 0;const delta=s.running?Math.max(0,Date.now()-(s.lastTickAt||Date.now())):0;return s.timerMode==="count-up"?Math.max(0,(s.elapsedMs||0)+delta):Math.max(0,(s.remainingMs||0)-delta)}
async function awake(){try{if("wakeLock"in navigator)wake=await navigator.wakeLock.request("screen")}catch(_){}}
function showStatus(t,d,k="MFMA DIGITAL FLAG NETWORK"){
 statusView.classList.remove("hidden");liveView.classList.add("hidden");
 title.textContent=t;detail.textContent=d;kicker.textContent=k;
 standbyLeaderboard.classList.add("hidden");standbyLeaderboard.innerHTML="";
 applyDisplayClass("display flag-clear","status");theme.content="#0d1117";
}
function showLive(){const sig=signals[state.activeFlag]||signals.clear,s=state.session,awaiting=s.phase==="awaiting-finding-start";statusView.classList.add("hidden");liveView.classList.remove("hidden");applyDisplayClass(`display ${sig.className}${sig.flash?" flash":""}`,`${state.systemState}:${state.activeFlag}:${s.phase}`);label.textContent=awaiting?"HIDING COMPLETE":sig.label;instruction.textContent=awaiting?"Awaiting Race Director.":sig.instruction;theme.content=sig.theme;sessionLine.textContent=awaiting?`SESSION ${s.number} • AWAITING FINDING START`:`SESSION ${s.number} • ${s.phase.toUpperCase()} • PURSUIT: ${s.teamNames[s.pursuitTeam]} • EVADING: ${s.teamNames[s.evadingTeam]}`;timer.textContent=fmt(s.remainingMs)}
function showStandbyFlag(){
 const flag=state.activeFlag||"clear",sig=signals[flag]||signals.clear;
 if(flag==="clear"){showStatus("STANDBY","Event active. No session is live.",state.event.name);return}
 const copy={yellow:["CAUTION","OPERATIONAL SIGNAL"],"move-over":["MOVE OVER","ALLOW FASTER VEHICLE TO PASS"],red:["STOP","AWAIT RACE CONTROL INSTRUCTIONS"],"safety-car":["SAFETY CAR","FOLLOW SAFETY CAR • NO OVERTAKING"],"infraction-warning":["INFRACTION WARNING","WHITE + FOLDED YELLOW"],disqualification:["DISQUALIFIED","RETURN TO STARTING ZONE"],checkered:["CHECKERED","OPERATIONAL SIGNAL"]}[flag]||[sig.label,sig.instruction];
 statusView.classList.add("hidden");liveView.classList.remove("hidden");applyDisplayClass(`display ${sig.className}${sig.flash?" flash":""}`,`standby:${flag}`);
 label.textContent=copy[0];instruction.textContent=copy[1];sessionLine.textContent=`${state.event.name} • STANDBY`;timer.textContent="--:--";theme.content=sig.theme;
}
function showSprint(){
 const flag=state.activeFlag||"clear",sig=signals[flag]||signals.clear,s=state.sprint||{};
 const labels={clear:"CLEAR",green:"GREEN",yellow:"YELLOW","move-over":"MOVE OVER",red:"RED","safety-car":"SAFETY CAR","infraction-warning":"INFRACTION WARNING",disqualification:"DISQUALIFIED",checkered:"CHECKERED"};
 statusView.classList.add("hidden");liveView.classList.remove("hidden");applyDisplayClass(`display ${sig.className}${sig.flash?" flash":""}`,`sprint:${flag}`);
 label.textContent=labels[flag]||flag.toUpperCase();instruction.textContent=flag==="safety-car"?"FOLLOW SAFETY CAR • NO OVERTAKING":"MFMA SPRINT • OPERATIONAL SIGNAL";sessionLine.textContent="MFMA SPRINT";timer.textContent=s.timerMode==="none"?"NO TIMER":fmt(sprintTime(s));theme.content=sig.theme;
}
function renderStartDots(){const endsAt=state.session?.countdownEndsAt||Date.now(),elapsed=Math.max(0,10000-(endsAt-Date.now())),lit=elapsed<9300?Math.min(5,Math.floor(elapsed/1500)+1):0;timer.innerHTML=Array.from({length:5},(_,index)=>`<span class="${index<lit?"lit":"out"}"><i></i><i></i></span>`).join("")}
function renderSafetyManagement(){const managed=safetyManagementFlags.has(state?.activeFlag),message=managed&&state.safetyMessage?.flag===state.activeFlag?String(state.safetyMessage.text||"").trim():"",panel=$("safety-management"),brand=$("display-brand-logo");panel.classList.toggle("hidden",!message);$("safety-message").textContent=message;panel.classList.toggle("has-message",Boolean(message));brand.src=managed?"assets/branding/mra-logo.png":"assets/branding/mfma-logo.png";brand.alt=managed?"MFMA Race Authority":"MFMA"}
function render(){const mode=getRenderMode(state),enforcement=new Set(["violation-review","white-termination"]).has(mode);timer.classList.toggle("dot-timer",mode==="next-session-countdown");$("steward-brand").classList.toggle("hidden",!enforcement);renderSafetyManagement();if(mode==="no-event"){showStatus("NO ACTIVE EVENT","Race Control has not opened an event.");return}if(mode==="standby"){showStandbyFlag();return}if(mode==="sprint-live"){showSprint();return}if(mode==="course-lap"){
 showStatus("SAFETY CAR","COURSE FAMILIARIZATION LAP • FOLLOW SAFETY CAR • NO OVERTAKING",state.event.name);
 applyDisplayClass("display flag-safety-car flash","course-lap");
 return
}
if(mode==="session-live"||mode==="awaiting-finding-start"){showLive();return}
if(mode==="next-session-staging"||mode==="next-session-countdown"){
 const sig=signals["proceed-to-start"],restart=Boolean(state.session?.restart);statusView.classList.add("hidden");liveView.classList.remove("hidden");applyDisplayClass(`display ${mode==="next-session-countdown"?"flag-start-lights":sig.className}`,mode);label.textContent=restart?"RESTART":sig.label;instruction.textContent=mode==="next-session-countdown"?"TEAM SET • GREEN WHEN ALL RED LIGHTS GO OUT":restart?"RETURN TO STARTING LINE • PREPARE TO RESTART":sig.instruction;sessionLine.textContent=`SESSION ${state.session?.number||""} • ${restart?"RESTART":"NEXT HIDING TEAM"}`;if(mode==="next-session-countdown")renderStartDots();else timer.textContent="WAIT";theme.content=mode==="next-session-countdown"?"#171a1f":sig.theme;return
}
if(mode==="safety-car-termination"){
 statusView.classList.add("hidden");liveView.classList.remove("hidden");
 applyDisplayClass("display flag-safety-car flash","safety-car-termination");
 label.textContent="SAFETY CAR";
 instruction.textContent="SESSION TERMINATED • FOLLOW SAFETY CAR • NO OVERTAKING";
 sessionLine.textContent=`SESSION ${state.session?.number||""} • TERMINATED`;
 timer.textContent="ENDED";theme.content="#050505";return
}
if(mode==="violation-review"||mode==="white-termination"){
 statusView.classList.add("hidden");liveView.classList.remove("hidden");
 applyDisplayClass(`display flag-white ${mode==="white-termination"?"flag-disqualified":"flag-under-review"}`,mode);
 label.textContent=mode==="violation-review"?"MRA STEWARD":"DISQUALIFIED";
 instruction.textContent=mode==="violation-review"?"INCIDENT UNDER INVESTIGATION":state.session?.provisionalReason||"RETURN TO STARTING ZONE";
 sessionLine.textContent=`SESSION ${state.session?.number||""}`;
 timer.textContent="ENDED";theme.content="#ffffff";return
}
if(mode==="provisional"||mode==="session-complete"){
 const sig=signals[state.activeFlag]||signals.checkered,s=state.session;
 statusView.classList.add("hidden");liveView.classList.remove("hidden");
 applyDisplayClass(`display ${sig.className}${sig.flash?" flash":""}`,`${mode}:${state.activeFlag}`);
 label.textContent=sig.label;
 instruction.textContent=new Set(["return-to-start","infraction-warning"]).has(state.activeFlag)?sig.instruction:mode==="session-complete"?"OFFICIAL SESSION RESULT":(s?.provisionalReason||sig.instruction);
 sessionLine.textContent=`SESSION ${s?.number||""} • PURSUIT: ${s?.teamNames?.[s.pursuitTeam]||"—"} • EVADING: ${s?.teamNames?.[s.evadingTeam]||"—"}`;
 timer.textContent="ENDED";theme.content=sig.theme;return
}}
function tick(){if(state?.systemState==="next-session-countdown"){renderStartDots();return}if(state?.systemState==="sprint-live"){timer.textContent=state.sprint?.timerMode==="none"?"NO TIMER":fmt(sprintTime());return}if(!state?.session||state.systemState!=="session-live")return;if(!state.session.running){timer.textContent=fmt(state.session.remainingMs);return}const factor=state.session.flag==="yellow"?0.5:1;timer.textContent=fmt(Math.max(0,state.session.remainingMs-(Date.now()-(state.session.lastTickAt||Date.now()))*factor))}
function loadVehicleReports(){
 const report=state?.event?.vehicleReports?.[selectedVehicle]||{};
 const reportKey=`${selectedVehicle}:${report.submittedAt||""}`;
 if(!crewEditing&&reportKey!==lastReportKey){$("passenger-name").value=report.passengerName||driverProfile?.passengerName||"";lastReportKey=reportKey}
 const profileNames=driverProfile?[driverProfile.teamName||"Independent",driverProfile.passengerName&&`Passenger: ${driverProfile.passengerName}`].filter(Boolean).join(" • "):"Driver profile";$("portal-driver-name").textContent=driverProfile?.driverName||"Signed In";$("portal-mra-number").textContent=driverProfile?.mraNumber||"Legacy profile";$("crew-names").textContent=profileNames;$("crew-action").textContent="Manage";
 const role=state?.session?.pursuitVehicleIds?.includes(selectedVehicle)?"Pursuit":state?.session?.evadingVehicleIds?.includes(selectedVehicle)?"Evading":"Standby";
 $("driver-role").textContent=role;
 const hazards=Object.values(state?.event?.hazards||{}).filter(h=>h.vehicleId===selectedVehicle).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
 const hazard=hazards.find(item=>item.status!=="resolved")||hazards[0];clearTimeout(resolvedTimer);
 if(!hazard){$("driver-hazard-status").innerHTML="";return}
 const text=hazard.status==="open"?"Sent to Race Control • Awaiting acknowledgment":hazard.status==="acknowledged"?"Acknowledged by Race Control":"Resolved";
 $("driver-hazard-status").innerHTML=`<div class="hazard-status-pill ${escapeHtml(hazard.status)}"><strong>Hazard Report</strong><span>${text}</span></div>`;
 if(hazard.status==="resolved")resolvedTimer=setTimeout(()=>{$("driver-hazard-status").innerHTML=""},4000);
}
function showDriverPortal(show){$("driver-signin").classList.toggle("hidden",!show);tools.classList.toggle("hidden",show);if(show)setTimeout(()=>$("signin-driver").focus(),0)}
function renderVehicleOptions(){const catalog=approvedVehicles(competition.vehicles),ids=Object.keys(catalog),prior=selectedVehicle;if(!ids.includes(selectedVehicle))selectedVehicle=ids[0]||"ranger";vehicleSelect.innerHTML=ids.map(id=>`<option value="${escapeHtml(id)}">${escapeHtml(catalog[id].name||id)}</option>`).join("");vehicleSelect.value=ids.includes(prior)?prior:selectedVehicle}
function storeDriverProfile(profile){driverProfile=profile;selectedVehicle=profile.vehicleId||selectedVehicle;renderVehicleOptions();vehicleSelect.value=selectedVehicle;localStorage.setItem(PROFILE_KEY,JSON.stringify({...profile,vehicleId:selectedVehicle}));localStorage.setItem("mfma-driver-vehicle",selectedVehicle)}
async function submitDriverProfile(){if(!state?.event||!driverProfile)return;await ensureDriverAuth();const report={...cleanOccupantReport(driverProfile.driverName,driverProfile.passengerName,serverTimestamp())};if(driverProfile.driverId)Object.assign(report,{driverId:driverProfile.driverId,mraNumber:driverProfile.mraNumber,teamId:driverProfile.teamId||"independent",teamName:driverProfile.teamName||"Independent"});await update(ref(db,`mfma/state/event/vehicleReports/${driverProfile.vehicleId}`),report)}
function syncStoredDriverProfile(){const remote=state?.event?.vehicleReports?.[driverProfile?.vehicleId];if(!driverProfile||!state?.event||(remote?.driverName===driverProfile.driverName&&remote?.passengerName===(driverProfile.passengerName||"")))return;submitDriverProfile().catch(error=>console.error("Unable to sync Driver Portal profile",error))}
vehicleSelect.onchange=async()=>{selectedVehicle=vehicleSelect.value;localStorage.setItem("mfma-driver-vehicle",selectedVehicle);if(driverProfile){storeDriverProfile({...driverProfile,vehicleId:selectedVehicle});try{await submitDriverProfile()}catch(error){$("occupant-status").textContent=friendlyWriteError(error)}}loadVehicleReports()};
function setCrewEditing(open){crewEditing=open;$("occupant-form").classList.toggle("hidden",!open);$("crew-toggle").setAttribute("aria-expanded",String(open));if(open)$("passenger-name").focus()}
function ensureDriverAuth(){
 if(driverUser)return Promise.resolve(driverUser);
 if(!driverAuthPromise)driverAuthPromise=signInAnonymously(auth).then(credential=>{driverUser=credential.user;return driverUser}).catch(error=>{driverAuthPromise=null;throw error});
 return driverAuthPromise;
}
function friendlyWriteError(error){console.error("Firebase Driver report write failed",error);return error?.code==="auth/unauthorized-domain"?"Driver reports are not authorized from this site.":error?.code?.includes("permission-denied")||error?.code?.includes("permission_denied")?"Could not send report to Race Control. Connection or permission error.":"Could not send report to Race Control. Check your connection and try again."}
$("crew-toggle").onclick=()=>setCrewEditing(true);$("crew-cancel").onclick=()=>setCrewEditing(false);
$("occupant-form").onsubmit=async event=>{event.preventDefault();const button=$("crew-submit");$("occupant-status").textContent="";button.disabled=true;button.textContent="Saving…";try{const passenger=normalizeName($("passenger-name").value);storeDriverProfile({...driverProfile,vehicleId:selectedVehicle,passengerName:passenger});if(state?.event)await submitDriverProfile();setCrewEditing(false);loadVehicleReports();$("occupant-status").textContent=state?.event?"Updated with Race Control":"Profile updated";setTimeout(()=>{$("occupant-status").textContent=""},2500)}catch(error){$("occupant-status").textContent=friendlyWriteError(error)}finally{button.disabled=false;button.textContent="Save Crew"}};
async function requestDriverAccess(){const name=normalizeName($("signin-driver").value),mraNumber=normalizeMraNumber($("signin-mra").value),match=findDriver(competition.drivers,name,mraNumber);if(!match)throw new Error("No approved driver matches that name and MRA number.");const user=await ensureDriverAuth(),[driverId,driver]=match,binding=(await get(ref(db,`mfma/driverAccess/${user.uid}`))).val();localStorage.removeItem("mfma-driver-signed-out");if(binding?.status==="approved"&&binding.driverId===driverId){storeDriverProfile({driverId,driverName:driver.name,mraNumber:driver.mraNumber,teamId:driver.teamId||"independent",teamName:driver.teamName||"Independent",vehicleId:selectedVehicle,passengerName:""});showDriverPortal(false);loadVehicleReports();return}await update(ref(db,`mfma/requests/access/${user.uid}`),{uid:user.uid,driverId,driverName:driver.name,mraNumber:driver.mraNumber,status:"pending",requestedAt:serverTimestamp()});throw new Error("Access request sent. MRA approval is required for this device.")}
$("driver-signin-form").onsubmit=async event=>{event.preventDefault();const button=$("driver-signin-submit"),statusLine=$("driver-signin-status");statusLine.textContent="";button.disabled=true;button.textContent="Checking…";try{await requestDriverAccess()}catch(error){statusLine.textContent=error.message||friendlyWriteError(error)}finally{button.disabled=false;button.textContent="Continue"}};
$("show-registration").onclick=()=>{$("driver-signin-form").classList.add("hidden");$("driver-registration-form").classList.remove("hidden");$("registration-name").focus()};$("show-signin").onclick=()=>{$("driver-registration-form").classList.add("hidden");$("driver-signin-form").classList.remove("hidden");$("signin-driver").focus()};
$("driver-registration-form").onsubmit=async event=>{event.preventDefault();const statusLine=$("registration-status");try{const user=await ensureDriverAuth(),name=normalizeName($("registration-name").value),teamName=normalizeName($("registration-team").value),requestedMraNumber=normalizeMraNumber($("registration-number").value);await update(ref(db,`mfma/requests/registrations/${user.uid}`),{uid:user.uid,name,teamName,requestedMraNumber,status:"pending",requestedAt:serverTimestamp()});statusLine.textContent="Registration sent to MRA Race Management for approval."}catch(error){statusLine.textContent=friendlyWriteError(error)}};
$("driver-sign-out").onclick=()=>{driverProfile=null;currentBinding=null;localStorage.removeItem(PROFILE_KEY);localStorage.setItem("mfma-driver-signed-out","1");$("signin-driver").value="";$("signin-mra").value="";showDriverPortal(true)};
async function submitHazardRequest(kind,button){
 const safetyCar=kind==="safety-car",label=safetyCar?"Safety Car":"Red Flag";
 if(!state?.event){$("driver-hazard-status").textContent="No active event.";return}
 document.querySelectorAll("[data-hazard-request]").forEach(item=>item.disabled=true);button.textContent="Sending…";
 try{await ensureDriverAuth();const hazardRef=push(ref(db,"mfma/state/event/hazards"));const report=cleanHazardReport({vehicleId:selectedVehicle,description:`${label} requested`,requestStopClock:!safetyCar,requestSafetyCar:safetyCar},serverTimestamp());if(driverProfile?.driverId)Object.assign(report,{driverId:driverProfile.driverId,mraNumber:driverProfile.mraNumber});await update(hazardRef,report)}
 catch(error){$("driver-hazard-status").textContent=friendlyWriteError(error)}
 finally{document.querySelectorAll("[data-hazard-request]").forEach(item=>item.disabled=false);button.textContent=`Request ${label}`}
}
document.querySelectorAll("[data-hazard-request]").forEach(button=>button.onclick=()=>submitHazardRequest(button.dataset.hazardRequest,button));
function closePortalSheet(){$("portal-sheet").classList.add("hidden")}
function openStats(){const seasonId=currentSeasonId(),row=competition?.standings?.[seasonId]?.drivers?.[driverProfile?.driverId]||{},allArchives=Object.values(competition?.archives||{}).flatMap(season=>Object.entries(season||{})),career=rebuildStandings(Object.fromEntries(allArchives)).drivers?.[driverProfile?.driverId]||{},archives=allArchives.map(([,event])=>event).filter(event=>event.classification?.some(entry=>entry.driverId===driverProfile?.driverId)).sort((a,b)=>(b.endedAt||0)-(a.endedAt||0));$("portal-sheet-title").textContent=driverProfile.driverName;$("portal-sheet-content").innerHTML=`<h3>${seasonId} Season</h3><div class="portal-stat-grid"><article><strong>${row.points||0}</strong><span>Points</span></article><article><strong>${row.wins||0}</strong><span>Wins</span></article><article><strong>${row.podiums||0}</strong><span>Podiums</span></article><article><strong>${row.events||0}</strong><span>Events</span></article></div><h3>Career</h3><div class="portal-stat-grid"><article><strong>${career.points||0}</strong><span>Points</span></article><article><strong>${career.wins||0}</strong><span>Wins</span></article><article><strong>${career.podiums||0}</strong><span>Podiums</span></article><article><strong>${career.events||0}</strong><span>Events</span></article></div><h3>Prior Races</h3><div class="portal-history">${archives.map(event=>{const result=event.classification.find(entry=>entry.driverId===driverProfile.driverId);return `<article><span><strong>${escapeHtml(event.name)}</strong><small>${escapeHtml(event.date||"")} • ${escapeHtml(event.seasonId||"")}</small></span><b>P${result.position} • ${result.points} pts</b></article>`}).join("")||"<p>No archived races yet.</p>"}</div>`;$("portal-sheet").classList.remove("hidden")}
function openVehicleRequest(){$("portal-sheet-title").textContent="Submit a Vehicle";$("portal-sheet-content").innerHTML=`<form id="vehicle-request-form" class="portal-sheet-form"><p>Race Management reviews every vehicle before it becomes available for competition.</p><label>Vehicle Name<input id="vehicle-request-name" required maxlength="50"></label><label>Make / Model<input id="vehicle-request-model" required maxlength="60"></label><label>Competition Number <small>(optional)</small><input id="vehicle-request-number" maxlength="12"></label><button class="action primary-btn" type="submit">Send for MRA Approval</button><p id="vehicle-request-status" class="report-status"></p></form>`;$("portal-sheet").classList.remove("hidden");$("vehicle-request-form").onsubmit=async event=>{event.preventDefault();try{const user=await ensureDriverAuth(),requestRef=push(ref(db,`mfma/requests/vehicles/${user.uid}`));await update(requestRef,{uid:user.uid,driverId:driverProfile.driverId,driverName:driverProfile.driverName,name:normalizeName($("vehicle-request-name").value),makeModel:normalizeName($("vehicle-request-model").value),competitionNumber:normalizeName($("vehicle-request-number").value),status:"pending",requestedAt:serverTimestamp()});$("vehicle-request-status").textContent="Vehicle sent to MRA Race Management for approval."}catch(error){$("vehicle-request-status").textContent=friendlyWriteError(error)}}}
$("view-driver-stats").onclick=openStats;$("open-vehicle-request").onclick=openVehicleRequest;$("close-portal-sheet").onclick=closePortalSheet;$("portal-sheet").onclick=event=>{if(event.target===$("portal-sheet"))closePortalSheet()};
function renderSoundStatus({state:audioState}){soundButton.textContent=audioState==="enabled"?"Sound On":"Enable Sound";soundButton.dataset.state=audioState}
soundButton.onclick=async()=>{try{await enableSounds()}catch(error){console.warn("Unable to enable display sounds",error)}renderSoundStatus(getSoundStatus())};
onSoundStatus(renderSoundStatus);
onValue(stateRef,s=>{const previous=state;state=s.val()||{systemState:"no-event"};playStateTransition(previous,state);status.className="display-status live";statusText.textContent="LIVE";render();loadVehicleReports();syncStoredDriverProfile()},e=>{status.className="display-status error";statusText.textContent="ERROR";showStatus("CONNECTION ERROR","Unable to reach Race Control.")});
function activateApprovedBinding(){const driver=competition.drivers?.[currentBinding?.driverId];if(currentBinding?.status!=="approved"||!driver||driverProfile||localStorage.getItem("mfma-driver-signed-out"))return;storeDriverProfile({driverId:currentBinding.driverId,driverName:driver.name,mraNumber:driver.mraNumber,teamId:driver.teamId||"independent",teamName:driver.teamName||"Independent",vehicleId:selectedVehicle,passengerName:""});showDriverPortal(false);loadVehicleReports()}
onValue(ref(db,"mfma/competition"),snapshot=>{competition=snapshot.val()||{};renderVehicleOptions();if(driverProfile?.driverId){const driver=competition.drivers?.[driverProfile.driverId];if(driver)storeDriverProfile({...driverProfile,driverName:driver.name,mraNumber:driver.mraNumber,teamId:driver.teamId||"independent",teamName:driver.teamName||"Independent"})}activateApprovedBinding();loadVehicleReports()});
onAuthStateChanged(auth,user=>{driverUser=user;currentBinding=null;if(accessUnsubscribe){accessUnsubscribe();accessUnsubscribe=null}if(!user){ensureDriverAuth().catch(error=>console.error("Anonymous Driver authentication failed",error));return}accessUnsubscribe=onValue(ref(db,`mfma/driverAccess/${user.uid}`),snapshot=>{currentBinding=snapshot.val();activateApprovedBinding()})});
if(driverProfile){$("signin-driver").value=driverProfile.driverName;$("signin-mra").value=driverProfile.mraNumber||""}renderVehicleOptions();showDriverPortal(!driverProfile);awake();setInterval(tick,250);
