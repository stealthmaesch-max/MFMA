import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js?v=38";
import { personnel, vehicles } from "./personnel.js?v=38";
import { signals } from "./signals.js?v=38";

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

function render(){
 const connection=$("fan-connection");
 connection.className="pill connected";
 connection.querySelector("span:last-child").textContent="Connected";

 if(!state?.event||state.systemState==="no-event"){
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
 $("fan-flag").textContent=(signals[state.activeFlag]?.label||state.activeFlag||"STANDBY").toUpperCase();

 $("fan-phase").textContent=s?s.phase.toUpperCase():"STANDBY";
 $("fan-timer").textContent=s?fmt(liveRemaining()):"--:--";
 $("fan-session").textContent=s?`Session ${s.number}`:"";
 $("fan-roles").textContent=s?`PURSUIT: ${names[s.pursuitTeam]||"—"} • EVADING: ${names[s.evadingTeam]||"—"}`:"";

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
 if(state?.session&&state.systemState==="session-live")$("fan-timer").textContent=fmt(liveRemaining());
},250);
