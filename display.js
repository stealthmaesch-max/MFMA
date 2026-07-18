import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js?v=40";
import { signals } from "./signals.js?v=40";
const app=initializeApp(firebaseConfig),db=getDatabase(app),stateRef=ref(db,"mfma/state");
const $=id=>document.getElementById(id);let state=null,wake=null;
const display=$("display"),status=$("display-status"),statusText=status.querySelector("span:last-child"),statusView=$("status-view"),liveView=$("live-view"),title=$("status-title"),detail=$("status-detail"),kicker=$("status-kicker"),sessionLine=$("display-session"),timer=$("display-timer"),label=$("label"),instruction=$("instruction"),theme=document.querySelector('meta[name="theme-color"]'),standbyLeaderboard=$("standby-leaderboard");
function fmt(ms){const t=Math.max(0,Math.ceil(ms/1000));return `${String(Math.floor(t/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`}
async function awake(){try{if("wakeLock"in navigator)wake=await navigator.wakeLock.request("screen")}catch(_){}}
function showStatus(t,d,k="MFMA DIGITAL FLAG NETWORK"){
 statusView.classList.remove("hidden");liveView.classList.add("hidden");
 title.textContent=t;detail.textContent=d;kicker.textContent=k;
 standbyLeaderboard.classList.add("hidden");standbyLeaderboard.innerHTML="";
 display.className="display flag-clear";theme.content="#0d1117";
}
function renderStandbyLeaderboard(){
 const scores=state.event?.scores||{};
 const names=state.event?.teamNames||state.session?.teamNames||{};
 const entries=Object.keys(scores).map(key=>({
  key,
  name:names[key]||key.toUpperCase(),
  score:Number(scores[key]||0)
 })).sort((a,b)=>b.score-a.score);
 if(!entries.length)return;
 standbyLeaderboard.innerHTML=`<div class="driver-leaderboard-title">LEADERBOARD</div>`+
  entries.map((entry,index)=>`<div class="driver-score-row"><span>${index+1}</span><strong>${entry.name}</strong><b>${entry.score}</b></div>`).join("");
 standbyLeaderboard.classList.remove("hidden");
}
function showLive(){const sig=signals[state.activeFlag]||signals.clear,s=state.session,awaiting=s.phase==="awaiting-finding-start";statusView.classList.add("hidden");liveView.classList.remove("hidden");display.className=`display ${sig.className}${sig.flash?" flash":""}`;label.textContent=awaiting?"HIDING COMPLETE":sig.label;instruction.textContent=awaiting?"Awaiting Race Director.":sig.instruction;theme.content=sig.theme;sessionLine.textContent=`SESSION ${s.number} • ${awaiting?"AWAITING FINDING START":s.phase.toUpperCase()} • PURSUIT: ${s.teamNames[s.pursuitTeam]} • EVADING: ${s.teamNames[s.evadingTeam]}`;timer.textContent=fmt(s.remainingMs)}
function render(){if(!state?.event||state.systemState==="no-event"){showStatus("NO ACTIVE EVENT","Race Control has not opened an event.");return}if(state.systemState==="standby"){showStatus("STANDBY","Event active. No session is live.",state.event.name);renderStandbyLeaderboard();return}if(state.systemState==="course-lap"){
 const overtake=state.event?.safetyCarOvertake;
 if(overtake?.active){
  showStatus("OVERTAKE SAFETY CAR","AUTHORIZED BY RACE DIRECTOR • PROCEED WITH CAUTION",state.event.name);display.classList.add("overtake-flash");
 }else{
  showStatus("SAFETY CAR","COURSE FAMILIARIZATION LAP • FOLLOW OFFICIAL VEHICLE • NO OVERTAKING",state.event.name);
 }
 display.className="display flag-safety-car";
 return
}
if(state.systemState==="session-live"){showLive();return}
if(state.systemState==="safety-car-termination"){
 statusView.classList.add("hidden");liveView.classList.remove("hidden");
 display.className="display flag-safety-car flash";
 const overtake=state.event?.safetyCarOvertake;
 label.textContent=overtake?.active?"OVERTAKE SAFETY CAR":"SAFETY CAR";
 instruction.textContent=overtake?.active?"AUTHORIZED BY RACE DIRECTOR • PROCEED WITH CAUTION":"SESSION TERMINATED • FOLLOW OFFICIAL VEHICLE • DO NOT OVERTAKE";
 sessionLine.textContent=`SESSION ${state.session?.number||""} • PURSUIT: ${state.session?.teamNames?.[state.session.pursuitTeam]||"—"} • EVADING: ${state.session?.teamNames?.[state.session.evadingTeam]||"—"}`;
 timer.textContent="ENDED";theme.content="#050505";return
}
if(state.systemState==="white-termination"){
 statusView.classList.add("hidden");liveView.classList.remove("hidden");
 display.className="display flag-white flash";
 label.textContent="DISQUALIFIED";
 instruction.textContent=state.session?.provisionalReason||"RETURN TO STARTING ZONE";
 sessionLine.textContent=`SESSION ${state.session?.number||""}`;
 timer.textContent="ENDED";theme.content="#ffffff";return
}
if(state.systemState==="provisional"||state.systemState==="session-complete"){
 const sig=signals[state.activeFlag]||signals.checkered,s=state.session;
 statusView.classList.add("hidden");liveView.classList.remove("hidden");
 display.className=`display ${sig.className}${sig.flash?" flash":""}`;
 label.textContent=sig.label;
 instruction.textContent=state.systemState==="session-complete"?"OFFICIAL SESSION RESULT":(s?.provisionalReason||sig.instruction);
 sessionLine.textContent=`SESSION ${s?.number||""} • PURSUIT: ${s?.teamNames?.[s.pursuitTeam]||"—"} • EVADING: ${s?.teamNames?.[s.evadingTeam]||"—"}`;
 timer.textContent="ENDED";theme.content=sig.theme;return
}}
function tick(){if(!state?.session||state.systemState!=="session-live")return;if(!state.session.running){timer.textContent=fmt(state.session.remainingMs);return}const factor=state.session.flag==="yellow"?0.5:1;timer.textContent=fmt(Math.max(0,state.session.remainingMs-(Date.now()-(state.session.lastTickAt||Date.now()))*factor))}
onValue(stateRef,s=>{state=s.val()||{systemState:"no-event"};status.className="display-status live";statusText.textContent="LIVE";render()},e=>{status.className="display-status error";statusText.textContent="ERROR";showStatus("CONNECTION ERROR","Unable to reach Race Control.")});
awake();setInterval(tick,250);
