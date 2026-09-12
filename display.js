import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getDatabase, ref, onValue, update, push, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js?v=40";
import { signals } from "./signals.js?v=71";
import { getRenderMode } from "./display-state.js?v=63";
import { enableSounds, getSoundStatus, onSoundStatus, playStateTransition } from "./sounds.js?v=70";
import { cleanOccupantReport, cleanHazardReport } from "./report-model.js?v=52";
const app=initializeApp(firebaseConfig),db=getDatabase(app),auth=getAuth(app),stateRef=ref(db,"mfma/state");
const $=id=>document.getElementById(id);let state=null,wake=null;
const display=$("display"),status=$("display-status"),statusText=status.querySelector("span:last-child"),statusView=$("status-view"),liveView=$("live-view"),title=$("status-title"),detail=$("status-detail"),kicker=$("status-kicker"),sessionLine=$("display-session"),timer=$("display-timer"),label=$("label"),instruction=$("instruction"),theme=document.querySelector('meta[name="theme-color"]'),standbyLeaderboard=$("standby-leaderboard");
const soundButton=$("display-sound");
const vehicleSelect=$("driver-vehicle"),tools=$("driver-tools");
let selectedVehicle=localStorage.getItem("mfma-driver-vehicle")||"ranger";vehicleSelect.value=selectedVehicle;
let driverUser=null,driverAuthPromise=null,crewEditing=false,lastReportKey="",resolvedTimer=null;
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
function render(){const mode=getRenderMode(state);timer.classList.toggle("dot-timer",mode==="next-session-countdown");if(mode==="no-event"){showStatus("NO ACTIVE EVENT","Race Control has not opened an event.");return}if(mode==="standby"){showStandbyFlag();return}if(mode==="sprint-live"){showSprint();return}if(mode==="course-lap"){
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
 applyDisplayClass("display flag-white",mode);
 label.textContent=mode==="violation-review"?"UNDER REVIEW":"DISQUALIFIED";
 instruction.textContent=mode==="violation-review"?"RETURN TO STARTING ZONE • AWAIT RACE DIRECTOR":state.session?.provisionalReason||"RETURN TO STARTING ZONE";
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
 if(!crewEditing&&reportKey!==lastReportKey){$("driver-name").value=report.driverName||"";$("passenger-name").value=report.passengerName||"";lastReportKey=reportKey}
 $("crew-names").textContent=report.driverName?[report.driverName,report.passengerName].filter(Boolean).join(" • "):"Add driver & passenger";
 $("crew-action").textContent=report.driverName?"Edit":"›";
 const role=state?.session?.pursuitVehicleIds?.includes(selectedVehicle)?"Pursuit":state?.session?.evadingVehicleIds?.includes(selectedVehicle)?"Evading":"Standby";
 $("driver-role").textContent=role;
 const hazards=Object.values(state?.event?.hazards||{}).filter(h=>h.vehicleId===selectedVehicle).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
 const hazard=hazards.find(item=>item.status!=="resolved")||hazards[0];clearTimeout(resolvedTimer);
 if(!hazard){$("driver-hazard-status").innerHTML="";return}
 const text=hazard.status==="open"?"Sent to Race Control • Awaiting acknowledgment":hazard.status==="acknowledged"?"Acknowledged by Race Control":"Resolved";
 $("driver-hazard-status").innerHTML=`<div class="hazard-status-pill ${escapeHtml(hazard.status)}"><strong>Hazard Report</strong><span>${text}</span></div>`;
 if(hazard.status==="resolved")resolvedTimer=setTimeout(()=>{$("driver-hazard-status").innerHTML=""},4000);
}
vehicleSelect.onchange=()=>{selectedVehicle=vehicleSelect.value;localStorage.setItem("mfma-driver-vehicle",selectedVehicle);loadVehicleReports()};
function setCrewEditing(open){crewEditing=open;$("occupant-form").classList.toggle("hidden",!open);$("crew-toggle").setAttribute("aria-expanded",String(open));if(open)$("driver-name").focus()}
function ensureDriverAuth(){
 if(driverUser)return Promise.resolve(driverUser);
 if(!driverAuthPromise)driverAuthPromise=signInAnonymously(auth).then(credential=>{driverUser=credential.user;return driverUser}).catch(error=>{driverAuthPromise=null;throw error});
 return driverAuthPromise;
}
function friendlyWriteError(error){console.error("Firebase Driver report write failed",error);return error?.code==="auth/unauthorized-domain"?"Driver reports are not authorized from this site.":error?.code?.includes("permission-denied")||error?.code?.includes("permission_denied")?"Could not send report to Race Control. Connection or permission error.":"Could not send report to Race Control. Check your connection and try again."}
$("crew-toggle").onclick=()=>setCrewEditing(true);$("crew-cancel").onclick=()=>setCrewEditing(false);
$("occupant-form").onsubmit=async event=>{event.preventDefault();const button=$("crew-submit");$("occupant-status").textContent="";if(!state?.event){$("occupant-status").textContent="No active event";return}button.disabled=true;button.textContent="Sending…";try{await ensureDriverAuth();const report=cleanOccupantReport($("driver-name").value,$("passenger-name").value,serverTimestamp());await update(ref(db,`mfma/state/event/vehicleReports/${selectedVehicle}`),report);setCrewEditing(false);$("occupant-status").textContent="Sent to Race Control";setTimeout(()=>{$("occupant-status").textContent=""},2500)}catch(error){$("occupant-status").textContent=friendlyWriteError(error)}finally{button.disabled=false;button.textContent="Submit"}};
async function submitHazardRequest(kind,button){
 const safetyCar=kind==="safety-car",label=safetyCar?"Safety Car":"Red Flag";
 if(!state?.event){$("driver-hazard-status").textContent="No active event.";return}
 document.querySelectorAll("[data-hazard-request]").forEach(item=>item.disabled=true);button.textContent="Sending…";
 try{await ensureDriverAuth();const hazardRef=push(ref(db,"mfma/state/event/hazards"));const report=cleanHazardReport({vehicleId:selectedVehicle,description:`${label} requested`,requestStopClock:!safetyCar,requestSafetyCar:safetyCar},serverTimestamp());await update(hazardRef,report)}
 catch(error){$("driver-hazard-status").textContent=friendlyWriteError(error)}
 finally{document.querySelectorAll("[data-hazard-request]").forEach(item=>item.disabled=false);button.textContent=`Request ${label}`}
}
document.querySelectorAll("[data-hazard-request]").forEach(button=>button.onclick=()=>submitHazardRequest(button.dataset.hazardRequest,button));
function renderSoundStatus({state:audioState}){soundButton.textContent=audioState==="enabled"?"Sound On":"Enable Sound";soundButton.dataset.state=audioState}
soundButton.onclick=async()=>{try{await enableSounds()}catch(error){console.warn("Unable to enable display sounds",error)}renderSoundStatus(getSoundStatus())};
onSoundStatus(renderSoundStatus);
onValue(stateRef,s=>{const previous=state;state=s.val()||{systemState:"no-event"};playStateTransition(previous,state);status.className="display-status live";statusText.textContent="LIVE";render();loadVehicleReports()},e=>{status.className="display-status error";statusText.textContent="ERROR";showStatus("CONNECTION ERROR","Unable to reach Race Control.")});
onAuthStateChanged(auth,user=>{driverUser=user;if(!user)ensureDriverAuth().catch(error=>console.error("Anonymous Driver authentication failed",error))});
awake();setInterval(tick,250);
