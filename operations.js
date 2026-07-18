import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
import { personnel, vehicles } from "./personnel.js";
const app=initializeApp(firebaseConfig),db=getDatabase(app),stateRef=ref(db,"mfma/state");
const $=id=>document.getElementById(id);let state=null;
function fmt(ms){const t=Math.max(0,Math.ceil(ms/1000));return `${String(Math.floor(t/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`}
function sprintTime(){const s=state?.sprint;if(!s||s.timerMode==="none")return 0;const delta=s.running?Math.max(0,Date.now()-(s.lastTickAt||Date.now())):0;return s.timerMode==="count-up"?Math.max(0,(s.elapsedMs||0)+delta):Math.max(0,(s.remainingMs||0)-delta)}
function render(){
 const c=$("ops-connection");c.className="pill connected";c.querySelector("span:last-child").textContent="Connected";
 if(!state?.event){$("ops-event").textContent="No Active Event";$("ops-state").textContent="";return}
 $("ops-event").textContent=state.event.name;$("ops-state").textContent=state.systemState.replace("-"," ").toUpperCase();
 if(state.systemState==="sprint-live"){
  const flag=(state.activeFlag||"clear").replaceAll("-"," ").toUpperCase();$("ops-state").textContent="MFMA SPRINT";$("ops-phase").textContent=`MFMA SPRINT • ${flag}`;$("ops-timer").textContent=state.sprint?.timerMode==="none"?"NO TIMER":fmt(sprintTime());$("ops-session").textContent="";$("ops-roles").textContent="";$("ops-scoreboard").innerHTML="<p>Sprint does not affect event scores.</p>";$("ops-circuit").innerHTML="<p>Sprint has no circuit role progress.</p>";$("ops-special").classList.add("hidden");$("ops-assignments").innerHTML="<p>No Sprint teams or pursuit/evading roles.</p>";return;
 }
 const s=state.session,phase=s?.phase==="awaiting-finding-start"?"HIDING COMPLETE • AWAITING RACE DIRECTOR":s?.phase.toUpperCase(),flag=(state.activeFlag||"clear").replaceAll("-"," ").toUpperCase();$("ops-phase").textContent=s?`${phase} • ${flag}`:flag==="CLEAR"?"STANDBY":`STANDBY • ${flag}`;$("ops-timer").textContent=s?fmt(s.remainingMs):"--:--";$("ops-session").textContent=s?`Session ${s.number}`:"";$("ops-roles").textContent=s?`PURSUIT: ${s.teamNames?.[s.pursuitTeam]||"—"} • EVADING: ${s.teamNames?.[s.evadingTeam]||"—"}`:"";
 const scores=state.event.scores||{},names=s?.teamNames||{};$("ops-scoreboard").innerHTML=Object.keys(scores).map(k=>`<div class="score"><span>${names[k]||k}</span><strong>${scores[k]}</strong></div>`).join("")||"<p>No score yet.</p>";
 const roles=state.event.circuit?.roles||{};$("ops-circuit").innerHTML=Object.keys(names).map(k=>`<div class="progress-card"><strong>${names[k]}</strong><span>Pursuit ${roles[k]?.pursuit?"✓":"○"}</span><span>Evading ${roles[k]?.evading?"✓":"○"}</span></div>`).join("");
 const special=$("ops-special"),specialTitle=$("ops-special-title"),specialDetail=$("ops-special-detail");
 special.classList.toggle("hidden",!["course-lap","safety-car-termination","white-termination"].includes(state.systemState));
 if(state.systemState==="course-lap"){specialTitle.textContent="Safety Car Familiarization Lap";specialDetail.textContent=state.event?.safetyCarOvertake?.active?"Safety Car overtake authorized for all drivers.":"All vehicles follow the Official Vehicle. Do not overtake."}
 if(state.systemState==="safety-car-termination"){specialTitle.textContent=state.event?.safetyCarOvertake?.active?"Safety Car Overtake Authorized":"Safety Car Termination";specialDetail.textContent=state.event?.safetyCarOvertake?.active?"All drivers may overtake the Safety Car when safe.":"Session terminated. Follow the Official Vehicle. Do not overtake."}
 if(state.systemState==="white-termination"){specialTitle.textContent="White Flag Termination";specialDetail.textContent=state.session?.provisionalReason||"Team disqualified."}
 const setup=s?.setup;if(!setup){$("ops-assignments").innerHTML="<p>No session configured.</p>";return}
 if(setup.vehicleTeams){$("ops-assignments").innerHTML=Object.entries(setup.vehicleTeams).map(([v,t])=>`<article class="assignment"><h3>${vehicles[v].name} Team</h3><p>Driver: ${personnel[t.driver]?.name||"Unassigned"}</p><p>Passengers: ${(t.passengers||[]).map(p=>personnel[p].name).join(", ")||"None"}</p></article>`).join("")}
 else{$("ops-assignments").innerHTML=`<article class="assignment"><h3>${s.teamNames[s.pursuitTeam]}</h3><p>Pursuit vehicle: ${vehicles[setup.pursuitVehicle]?.name}</p><p>Driver: ${personnel[setup.pursuitDriver]?.name||"Unassigned"}</p></article><article class="assignment"><h3>${s.teamNames[s.evadingTeam]}</h3><p>Evading on foot</p></article>`}
}
onValue(stateRef,s=>{state=s.val()||{};render()},e=>console.error(e));setInterval(()=>{if(state?.systemState==="sprint-live")$("ops-timer").textContent=state.sprint?.timerMode==="none"?"NO TIMER":fmt(sprintTime());if(state?.session&&state.systemState==="session-live"&&state.session.running){const factor=state.session.flag==="yellow"?0.5:1;$("ops-timer").textContent=fmt(Math.max(0,state.session.remainingMs-(Date.now()-(state.session.lastTickAt||Date.now()))*factor))}},250);
