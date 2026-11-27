export const MUTUAL_SPOTTING_MODE = "mutual-spotting";
export const GREEN_LIMIT_MPH = 15;
export const HEAT_COUNT = 4;
export function plannedHeatCount(trial) {
 const count = trial?.plannedHeats;
 return Number.isSafeInteger(count) && count >= 2 && count % 2 === 0 ? count : HEAT_COUNT;
}

export function completedHeatCount(trial) {
 const entries = Object.entries(trial?.results || {}).sort((a, b) => Number(a[0]) - Number(b[0]));
 if (entries.some(([key, result], index) => key !== String(index + 1) || !['a', 'b', 'draw'].includes(result))) return 0;
 return entries.length;
}
export const LIGHTS_MS = 10000;
const DEFAULT_FIND_MS = 60000;
const DEFAULT_HEAT_MS = 180000;
const STOP_FLAGS = ["red", "safety-car", "mechanical-incident"];
const LIGHT_PHASES = ["find-lights", "heat-lights"];
const MOVING_PHASES = ["finding", "live"];

export function trialRemaining(trial, now) {
 if (trial.deadline == null) return trial.remainingMs || 0;
 const clockNow = trial.phase === "live" && trial.spot ? trial.spot.at : now;
 return Math.max(0, trial.deadline - clockNow) * (trial.clockRate || 1);
}

export function trialTeamAction(state, teamId, now) {
 const {trial, activeFlag} = state || {};
 if (state?.systemState !== MUTUAL_SPOTTING_MODE || !trial?.teams ||
     !Object.values(trial.teams).includes(teamId) || trial.phase !== "live") return;
 if (trial.spot) {
  if (!trial.ack && trial.spot.teamId !== teamId) return "ack";
 } else if (["green", "yellow"].includes(activeFlag) && trial.deadline > now) return "spot";
}

export function changeTrial(state, action, now, options = {}) {
 if (action === "open") {
  if (state && state.systemState !== "no-event") return;
  return {
   systemState: MUTUAL_SPOTTING_MODE, activeFlag: "safety-car",
   event: {name: "Mutual Spotting Trial", pointsEvent: false, ...options.event, createdAt: now},
   trial: {heat: 1, phase: "formation", attempt: 1, teams: options.teams,
    findMs: DEFAULT_FIND_MS, heatMs: DEFAULT_HEAT_MS, startStyle: "standing",
    flexibleHeats: true, plannedHeats: HEAT_COUNT}
  };
 }
 if (state?.systemState !== MUTUAL_SPOTTING_MODE || !state.trial) return;
 const {activeFlag: flag, trial} = state;
 const {phase, heat, spot, ack} = trial;
 const remaining = trialRemaining(trial, now);
 const change = (activeFlag, patch) => ({...state, activeFlag, trial: {...trial, ...patch}});
 const finish = result => change(STOP_FLAGS.includes(flag) ? flag : "yellow", {
  phase: !trial.flexibleHeats && heat === HEAT_COUNT && result ? "complete" : "reset", deadline: null, remainingMs: 0,
  replay: !result, results: result ? {...trial.results, [heat]: result} : trial.results || null
 });
 if (action === 'extend' && ['formation', 'reset', 'complete'].includes(phase)) {
  const plannedHeats = Math.max(plannedHeatCount(trial), heat + heat % 2) + 2;
  if (!Number.isSafeInteger(plannedHeats)) return;
  return change(flag, {plannedHeats, flexibleHeats: true, ...(phase === 'complete' ? {phase: 'reset'} : {})});
 }
 if (action === 'finish' && phase === 'reset' && !trial.replay) {
  const completed = completedHeatCount(trial);
  if (completed < 2 || completed % 2 !== 0 || completed !== heat) return;
  return change(flag, {phase: 'complete', finalizedHeatCount: completed, deadline: null, remainingMs: 0});
 }
 if (action === "close" && !state.event.eventFormat && (flag === "red" || ["reset", "complete"].includes(phase))) {
  return {systemState: "no-event", activeFlag: "clear"};
 }
 if (action === "configure" && ["formation", "start-hold", "reset"].includes(phase)) {
  const {findMs, heatMs, startStyle = trial.startStyle || "standing", plannedHeats = plannedHeatCount(trial)} = options;
  if (![findMs, heatMs].every(ms => Number.isInteger(ms) && ms >= 1000 && ms <= 3600000)) return;
  if (!["standing", "safety-car"].includes(startStyle)) return;
  if (!Number.isSafeInteger(plannedHeats) || plannedHeats < Math.max(2, heat + heat % 2) || plannedHeats % 2 !== 0) return;
  return change(phase === "formation" && startStyle === "safety-car" ? "safety-car" : flag,
   {findMs, heatMs, startStyle, plannedHeats});
 }
 if (STOP_FLAGS.includes(action)) {
  if (LIGHT_PHASES.includes(phase)) {
   return change(action, {phase: phase === "find-lights" ? "formation" : "start-hold", deadline: null, remainingMs: 0});
  }
  return change(action, {remainingMs: remaining, deadline: null});
 }
 if (action === "formation" && phase === "reset") {
  if (trial.flexibleHeats && !trial.replay && heat >= plannedHeatCount(trial)) return;
  return change("safety-car", {phase: "formation", heat: trial.replay ? heat : heat + 1,
   attempt: trial.attempt + 1, replay: false, spot: null, ack: null, deadline: null, remainingMs: 0});
 }
 if (action === "release" && phase === "formation" && trial.startStyle === "safety-car" && flag === "safety-car") {
  return change("green", {phase: "finding", clockRate: 1, deadline: now + trial.findMs});
 }
 if (action === "lights" && (phase === "start-hold" || (phase === "formation" && trial.startStyle !== "safety-car"))) {
  const entrants = trial.entrants || options.entrants;
  if (phase === "start-hold" && state.event.eventFormat && !entrants) return;
  return change("red", {phase: phase === "formation" ? "find-lights" : "heat-lights", deadline: now + LIGHTS_MS, remainingMs: 0, clockRate: 1, ...(entrants ? {entrants} : {})});
 }
 if (action === "advance") {
  if (phase === "live" && spot && ack && !STOP_FLAGS.includes(flag)) {
   return finish(spot.teamId === trial.teams.a ? "a" : "b");
  }
  if (trial.deadline == null || remaining > 0) return;
  if (phase === "find-lights") return change("green", {phase: "finding", clockRate: 1, deadline: now + trial.findMs});
  if (phase === "heat-lights") return change("green", {phase: "live", clockRate: 1, deadline: now + trial.heatMs});
  if (phase === "finding") return change("red", {phase: "start-hold", deadline: null, remainingMs: 0});
  return;
 }
 if (phase === "live" && !ack && ((spot && ["draw", "replay"].includes(action)) ||
     (!spot && action === "draw" && remaining === 0))) return finish(action === "draw" ? "draw" : null);
 if (phase === "live" && spot && ack && action === "yellow") {
  const result = spot.teamId === trial.teams.a ? "a" : "b";
  return change("yellow", {phase: !trial.flexibleHeats && heat === HEAT_COUNT ? "complete" : "reset",
   deadline: null, remainingMs: 0, results: {...trial.results, [heat]: result}});
 }
 if (MOVING_PHASES.includes(phase) && !spot && remaining > 0) {
  if (action === "green" && flag !== "green") {
   return change("green", {deadline: now + remaining, remainingMs: remaining, clockRate: 1});
  }
  if (action === "yellow" && flag === "green") {
   return change("yellow", {deadline: now + remaining * 2, remainingMs: remaining, clockRate: 0.5});
  }
 }
}

export function trialDisplay(state, now) {
 const {trial, activeFlag: flag} = state;
 const {phase, spot, ack} = trial;
 const remaining = trialRemaining(trial, now);
 if (LIGHT_PHASES.includes(phase)) return ["red", "STANDING START", "HOLD POSITION UNTIL GREEN"];
 const findingExpired = phase === "finding" && trial.deadline != null && remaining === 0;
 if ((flag === "red" && phase === "start-hold") ||
     (findingExpired && ["green", "yellow"].includes(flag))) {
  return ["red", "STARTING-SPOT TIME ENDED", "STOP SAFELY • AWAIT HEAT LIGHTS"];
 }
 if (flag === "red") return [flag, "STOP", "STOP SAFELY • AWAIT RACE DIRECTOR"];
 if (flag === "safety-car") {
  const instruction = phase === "formation" && trial.startStyle === "safety-car" ? "AWAIT GREEN RELEASE"
   : phase === "formation" ? "AWAIT STANDING START" : "NO SPOTTING • TIMER PAUSED";
  return [flag, "SAFETY CAR", `FOLLOW OFFICIAL VEHICLE • NO OVERTAKING • ${instruction}`];
 }
 if (flag === "mechanical-incident") return [flag, "MECHANICAL INCIDENT", "STOP COMPETITION • AWAIT MRA INSTRUCTIONS"];
 if (phase === "reset" || (phase === "live" && ack)) return ["yellow", "YELLOW RESET", "7 MPH MAX • NO SPOTTING • FOLLOW RACE DIRECTOR"];
 if (phase === "complete") return ["yellow", state.event?.pointsEvent ? "EVENT COMPLETE" : "TRIAL COMPLETE", "7 MPH MAX • AWAIT MOVEMENT ORDER"];
 if (phase === "live" && spot) return ["checkered", "CHECKERED • SPOT RECORDED", "END COMPETITION • AWAIT ACKNOWLEDGMENT"];
 if (phase === "live" && remaining === 0) return ["checkered", "CHECKERED • TIME EXPIRED", "END COMPETITION • AWAIT RACE DIRECTOR"];
 if (flag === "yellow") return ["yellow", "YELLOW CAUTION", "7 MPH MAX • TIMER RUNS AT HALF SPEED"];
 return ["green", phase === "finding" ? "FIND A STARTING SPOT" : "BOTH TEAMS SPOTTING",
  `${GREEN_LIMIT_MPH} MPH MAX • NO COMPETITIVE OVERTAKING`];
}
