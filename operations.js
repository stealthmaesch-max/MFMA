import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js?v=40";
import { personnel, vehicles } from "./personnel.js?v=40";
import { getRenderMode } from "./display-state.js?v=44";
const app=initializeApp(firebaseConfig),db=getDatabase(app),stateRef=ref(db,"mfma/state");
const $=id=>document.getElementById(id);let state=null;
function fmt(ms){const t=Math.max(0,Math.ceil(ms/1000));return `${String(Math.floor(t/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`}
function sprintTime(){const s=state?.sprint;if(!s||s.timerMode==="none")return 0;const delta=s.running?Math.max(0,Date.now()-(s.lastTickAt||Date.now())):0;return s.timerMode==="count-up"?Math.max(0,(s.elapsedMs||0)+delta):Math.max(0,(s.remainingMs||0)-delta)}
function setVisible(mode){
 const visible={"no-event":[],standby:[],"course-lap":["ops-special"],"sprint-live":["ops-timer-panel"],"session-live":["ops-timer-panel","ops-score-panel","ops-circuit-panel","ops-assignments-panel"],"awaiting-finding-start":["ops-special"],provisional:["ops-score-panel","ops-circuit-panel"],"session-complete":["ops-score-panel","ops-circuit-panel"],"safety-car-termination":["ops-special"],"white-termination":["ops-special"]}[mode]||[];
 ["ops-timer-panel","ops-special","ops-score-panel","ops-circuit-panel","ops-assignments-panel"].forEach(id=>$(id).classList.toggle("hidden",!visible.includes(id)));
}
function render(){
 const c=$("ops-connection");c.className="pill connected";c.querySelector("span:last-child").textContent="Connected";
 const mode=getRenderMode(state);setVisible(mode);
 if(mode==="no-event"){$("ops-event").textContent="No Active Event";$("ops-state").textContent="Waiting for Race Control.";return}
 $("ops-event").textContent=state.event.name;$("ops-state").textContent=mode.replaceAll("-"," ").toUpperCase();
 const s=state.session;
 if(mode==="standby"){$("ops-state").textContent=state.event.courseLap?.status==="complete"?"STANDBY • COURSE LAP COMPLETE":"STANDBY";return}
 if(mode==="course-lap"){$("ops-special-title").textContent="Safety Car Familiarization Lap";$("ops-special-detail").textContent=state.event.safetyCarOvertake?.active?"Safety Car overtake authorized for all drivers.":"Follow the Official Vehicle. Do not overtake.";return}
 if(mode==="sprint-live"){$("ops-phase").textContent=`MFMA SPRINT • ${(state.activeFlag||"clear").replaceAll("-"," ").toUpperCase()}`;$("ops-timer").textContent=state.sprint?.timerMode==="none"?"NO TIMER":fmt(sprintTime());$("ops-session").textContent="";$("ops-roles").textContent="";return}
 if(mode==="awaiting-finding-start"){$("ops-special-title").textContent="Awaiting Finding Start";$("ops-special-detail").textContent="Hiding complete. Waiting for Race Director confirmation.";return}
 if(mode==="safety-car-termination"||mode==="white-termination"){$("ops-special-title").textContent=mode==="white-termination"?"White Flag Termination":"Safety Car Termination";$("ops-special-detail").textContent=s?.terminationDetail||s?.provisionalReason||"Session terminated.";return}
 if(mode==="session-live"){$("ops-phase").textContent=`${s.phase.toUpperCase()} • ${(state.activeFlag||"clear").replaceAll("-"," ").toUpperCase()}`;$("ops-timer").textContent=fmt(s.remainingMs);$("ops-session").textContent=`Session ${s.number}`;$("ops-roles").textContent=`PURSUIT: ${s.teamNames?.[s.pursuitTeam]||"—"} • EVADING: ${s.teamNames?.[s.evadingTeam]||"—"}`}
 const names=s?.teamNames||state.event.teamNames||{},scores=state.event.scores||{},roles=state.event.circuit?.roles||{};
 $("ops-scoreboard").innerHTML=Object.keys(scores).map(k=>`<div class="score"><span>${names[k]||k}</span><strong>${scores[k]}</strong></div>`).join("")||"<p>No score yet.</p>";
 $("ops-circuit").innerHTML=Object.keys(names).map(k=>`<div class="progress-card"><strong>${names[k]}</strong><span>Pursuit ${roles[k]?.pursuit?"✓":"○"}</span><span>Evading ${roles[k]?.evading?"✓":"○"}</span></div>`).join("");
 const setup=s?.setup;if(mode!=="session-live"||!setup)return;
 if(setup.vehicleTeams)$("ops-assignments").innerHTML=Object.entries(setup.vehicleTeams).map(([v,t])=>`<article class="assignment"><h3>${vehicles[v]?.name||v} Team</h3><p>Driver: ${personnel[t.driver]?.name||"Unassigned"}</p><p>Passengers: ${(t.passengers||[]).map(p=>personnel[p]?.name).filter(Boolean).join(", ")||"None"}</p></article>`).join("");
 else $("ops-assignments").innerHTML=`<article class="assignment"><h3>${s.teamNames[s.pursuitTeam]}</h3><p>Pursuit vehicle: ${vehicles[setup.pursuitVehicle]?.name||"—"}</p><p>Driver: ${personnel[setup.pursuitDriver]?.name||"Unassigned"}</p></article><article class="assignment"><h3>${s.teamNames[s.evadingTeam]}</h3><p>Evading on foot</p></article>`;
}
onValue(stateRef,s=>{state=s.val()||{};render()},e=>console.error(e));
setInterval(()=>{if(state?.systemState==="sprint-live")$("ops-timer").textContent=state.sprint?.timerMode==="none"?"NO TIMER":fmt(sprintTime());if(state?.session&&getRenderMode(state)==="session-live"&&state.session.running){const factor=state.session.flag==="yellow"?0.5:1;$("ops-timer").textContent=fmt(Math.max(0,state.session.remainingMs-(Date.now()-(state.session.lastTickAt||Date.now()))*factor))}},250);
