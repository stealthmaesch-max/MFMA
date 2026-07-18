import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js?v=40";
import { personnel, vehicles } from "./personnel.js?v=40";
import { signals } from "./signals.js?v=40";
import { getRenderMode } from "./display-state.js?v=44";

const app=initializeApp(firebaseConfig);
const db=getDatabase(app);
const stateRef=ref(db,"mfma/state");
const $=id=>document.getElementById(id);
let state=null;

function fmt(ms){
 const total=Math.max(0,Math.ceil(ms/1000));
 return `${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`;
}

function liveRemaining(){
 const s=state?.session;
 if(!s)return 0;
 if(!s.running)return s.remainingMs;
 const factor=s.flag==="yellow"?0.5:1;
 return Math.max(0,s.remainingMs-(Date.now()-(s.lastTickAt||Date.now()))*factor);
}
function sprintTime(){
 const s=state?.sprint;
 if(!s||s.timerMode==="none")return 0;
 const delta=s.running?Math.max(0,Date.now()-(s.lastTickAt||Date.now())):0;
 return s.timerMode==="count-up"?Math.max(0,(s.elapsedMs||0)+delta):Math.max(0,(s.remainingMs||0)-delta);
}

function render(){
 const connection=$("fan-connection");
 connection.className="pill connected";
 connection.querySelector("span:last-child").textContent="Connected";

 const mode=getRenderMode(state);
 const visibility={
  "no-event":[],standby:[],"course-lap":[],"sprint-live":["fan-timer-panel"],
  "session-live":["fan-timer-panel","fan-score-panel","fan-circuit-panel","fan-assignments-panel"],
  "awaiting-finding-start":["fan-timer-panel"],provisional:["fan-score-panel","fan-circuit-panel"],
  "session-complete":["fan-score-panel","fan-circuit-panel"],"safety-car-termination":[],"white-termination":[]
 };
 ["fan-timer-panel","fan-score-panel","fan-circuit-panel","fan-assignments-panel"].forEach(id=>$(id).classList.toggle("hidden",!visibility[mode]?.includes(id)));
 if(mode==="no-event"){
  $("fan-event").textContent="No Active Event";
  $("fan-state").textContent="Waiting for Race Control.";
  $("fan-flag").textContent="OFF AIR";
  $("fan-phase").textContent="STANDBY";
  $("fan-timer").textContent="--:--";
  $("fan-session").textContent="";
  $("fan-roles").textContent="";
  $("fan-scoreboard").innerHTML="<p>No scores available.</p>";
  $("fan-circuit").innerHTML="<p>No circuit in progress.</p>";
  $("fan-assignments").innerHTML="<p>No participants assigned.</p>";
  return;
 }

 const event=state.event;
 const s=state.session;
 const names=s?.teamNames||event.teamNames||{};
 $("fan-event").textContent=event.name;
 $("fan-state").textContent=state.systemState.replaceAll("-"," ").toUpperCase();
 const operationalFlag=["standby","sprint-live"].includes(state.systemState)?(state.activeFlag||"clear"):null;
 $("fan-flag").textContent=(operationalFlag==="clear"?(state.systemState==="sprint-live"?"CLEAR":"STANDBY"):operationalFlag?operationalFlag.replaceAll("-"," "):(signals[state.activeFlag]?.label||state.activeFlag||"STANDBY")).toUpperCase();

 if(mode==="course-lap"){
  $("fan-state").textContent="COURSE LAP";$("fan-flag").textContent="SAFETY CAR";return;
 }
 if(mode==="sprint-live"){
  $("fan-state").textContent="MFMA SPRINT";$("fan-phase").textContent="MFMA SPRINT";$("fan-timer").textContent=state.sprint?.timerMode==="none"?"NO TIMER":fmt(sprintTime());$("fan-session").textContent="";$("fan-roles").textContent="";
  return;
 }

 $("fan-phase").textContent=s?(s.phase==="awaiting-finding-start"?"HIDING COMPLETE • AWAITING RACE DIRECTOR":s.phase.toUpperCase()):"STANDBY";
 $("fan-timer").textContent=s?fmt(liveRemaining()):"--:--";
 $("fan-session").textContent=s?`Session ${s.number}`:"";
 $("fan-roles").textContent=s?`PURSUIT: ${names[s.pursuitTeam]||"—"} • EVADING: ${names[s.evadingTeam]||"—"}`:"";

 if(mode==="standby"){const complete=event.courseLap?.status==="complete";$("fan-state").textContent=complete?"STANDBY • COURSE LAP COMPLETE":"STANDBY";return}
 if(mode==="awaiting-finding-start"){$("fan-session").textContent=`Session ${s.number}`;$("fan-roles").textContent="";return}
 if(mode==="safety-car-termination"||mode==="white-termination"){$("fan-phase").textContent=mode.replaceAll("-"," ").toUpperCase();$("fan-flag").textContent=mode==="white-termination"?"WHITE":"SAFETY CAR";return}

 const scores=event.scores||{};
 const sorted=Object.keys(scores).map(key=>({key,name:names[key]||key.toUpperCase(),score:Number(scores[key]||0)})).sort((a,b)=>b.score-a.score);
 $("fan-scoreboard").innerHTML=sorted.map((entry,index)=>`<div class="score fan-score"><span>${index+1}. ${entry.name}</span><strong>${entry.score}</strong></div>`).join("")||"<p>No score yet.</p>";

 const roles=event.circuit?.roles||{};
 $("fan-circuit").innerHTML=Object.keys(names).map(key=>`<div class="progress-card"><strong>${names[key]}</strong><span>Pursuit ${roles[key]?.pursuit?"✓":"○"}</span><span>Evading ${roles[key]?.evading?"✓":"○"}</span></div>`).join("")||"<p>No role history yet.</p>";

 const setup=s?.setup;
 if(!setup){
  $("fan-assignments").innerHTML="<p>No live session assignments.</p>";
 }else if(setup.vehicleTeams){
  $("fan-assignments").innerHTML=Object.entries(setup.vehicleTeams).map(([vehicleId,team])=>`
   <article class="assignment">
    <p class="eyebrow">${vehicles[vehicleId]?.name||vehicleId} Team</p>
    <h3>${vehicles[vehicleId]?.name||vehicleId}</h3>
    <p>Driver: ${personnel[team.driver]?.name||"Unassigned"}</p>
    <p>Passengers: ${(team.passengers||[]).map(id=>personnel[id]?.name).filter(Boolean).join(", ")||"None"}</p>
   </article>`).join("");
 }else{
  $("fan-assignments").innerHTML=`
   <article class="assignment"><p class="eyebrow">Pursuit Team</p><h3>${names[s.pursuitTeam]||"Pursuit"}</h3><p>Vehicle: ${vehicles[setup.pursuitVehicle]?.name||"—"}</p><p>Driver: ${personnel[setup.pursuitDriver]?.name||"Unassigned"}</p></article>
   <article class="assignment"><p class="eyebrow">Evading Team</p><h3>${names[s.evadingTeam]||"Evading"}</h3><p>On foot</p></article>`;
 }
}

onValue(stateRef,snapshot=>{
 state=snapshot.val()||{};
 render();
},error=>{
 const connection=$("fan-connection");
 connection.className="pill error";
 connection.querySelector("span:last-child").textContent="Connection error";
 console.error(error);
});

setInterval(()=>{
 if(state?.systemState==="sprint-live")$("fan-timer").textContent=state.sprint?.timerMode==="none"?"NO TIMER":fmt(sprintTime());
 if(state?.session&&state.systemState==="session-live")$("fan-timer").textContent=fmt(liveRemaining());
},250);
