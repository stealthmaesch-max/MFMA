import test from "node:test";
import assert from "node:assert/strict";
import { changeTrial, LIGHTS_MS, trialDisplay, trialRemaining, trialTeamAction } from "../mutual-spotting.js";

const teams = {a: "monarch", b: "parakeet"};
const open = () => changeTrial(null, "open", 1000, {teams});
function startHeat(state, now) {
 state = changeTrial(state, "lights", now);
 state = changeTrial(state, "advance", now += LIGHTS_MS);
 assert.equal(state.trial.phase, "finding");
 state = changeTrial(state, "advance", now += state.trial.findMs);
 assert.equal(state.activeFlag, "red");
 assert.equal(changeTrial(state, "advance", now + 10000), undefined);
 state = changeTrial(state, "lights", now);
 return changeTrial(state, "advance", now + LIGHTS_MS);
}

test("Safety Car leads to two standing starts with adjustable timers and Red between them", () => {
 let state = open();
 assert.equal(state.activeFlag, "safety-car");
 assert.equal(state.event.pointsEvent, false);
 assert.equal(changeTrial(state, "green", 2000), undefined);
 state = changeTrial(state, "configure", 1500, {findMs: 12000, heatMs: 45000});
 state = changeTrial(state, "lights", 2000);
 assert.equal(state.trial.phase, "find-lights");
 assert.equal(changeTrial(state, "advance", 11999), undefined);
 state = changeTrial(state, "advance", 12000);
 assert.match(trialDisplay(state, 12000)[2], /15 MPH MAX/);
 assert.equal(trialRemaining(state.trial, 12000), 12000);
 assert.equal(trialDisplay(state, 24000)[0], "red");
 state = changeTrial(state, "advance", 24000);
 assert.equal(state.activeFlag, "red");
 state = changeTrial(state, "lights", 30000);
 state = changeTrial(state, "advance", 40000);
 assert.equal(state.trial.phase, "live");
 assert.equal(trialRemaining(state.trial, 40000), 45000);
 state = changeTrial(state, "yellow", 50000);
 state = changeTrial(state, "safety-car", 52000);
 assert.equal(trialRemaining(state.trial, 56000), 34000);
 state = changeTrial(state, "green", 56000);
 assert.equal(state.trial.deadline, 90000);
});

test("a spot immediately displays Checkered and acknowledgment moves to Yellow reset", () => {
 let state = startHeat(open(), 1000);
 const now = state.trial.deadline - 500;
 assert.equal(trialTeamAction(state, teams.a, now), "spot");
 assert.equal(trialTeamAction(state, teams.a, state.trial.deadline), undefined);
 state.trial.spot = {teamId: teams.a, at: now};
 assert.equal(trialDisplay(state, now)[0], "checkered");
 assert.equal(trialTeamAction(state, teams.a, now), undefined);
 assert.equal(trialTeamAction(state, teams.b, now + 1000), "ack");
 state.trial.ack = {teamId: teams.b, at: now + 1000};
 assert.equal(trialDisplay(state, now + 1000)[0], "yellow");
 assert.equal(changeTrial(state, "draw", now + 1000), undefined);
 state = changeTrial(state, "advance", now + 1000);
 assert.deepEqual(state.trial.results, {1: "a"});
 assert.equal(state.trial.phase, "reset");
 assert.equal(state.activeFlag, "yellow");
 state = changeTrial(state, "formation", now + 2000);
 assert.equal(state.trial.heat, 2);
 assert.equal(state.trial.attempt, 2);
 assert.equal(state.trial.spot, null);
});

test("Red stays in force if it interrupts an acknowledged spot", () => {
 let state = startHeat(open(), 1000);
 const now = state.trial.deadline - 500;
 state.trial.spot = {teamId: teams.a, at: now};
 state.trial.ack = {teamId: teams.b, at: now + 100};
 state = changeTrial(state, "red", now + 150);
 assert.equal(trialDisplay(state, now + 200)[0], "red");
 assert.equal(changeTrial(state, "advance", now + 200), undefined);
 assert.equal(changeTrial(state, "yellow", now + 200).trial.results[1], "a");
});

test("unresolved fourth heat can replay before completing the trial", () => {
 let state = open();
 let now = 1000;
 for (let i = 1; i < 4; i++) {
  state = startHeat(state, now);
  now = state.trial.deadline;
  state = changeTrial(state, "draw", now);
  state = changeTrial(state, "formation", ++now);
 }
 state = startHeat(state, now);
 state.trial.spot = {teamId: teams.a, at: state.trial.deadline - 500};
 state = changeTrial(state, "replay", state.trial.deadline);
 assert.equal(state.trial.phase, "reset");
 state = changeTrial(state, "formation", ++now);
 assert.equal(state.trial.heat, 4);
 state = startHeat(state, now);
 state = changeTrial(state, "draw", state.trial.deadline);
 assert.equal(state.trial.phase, "complete");
});

test("Safety Car rolling release starts the adjustable finding timer and keeps the heat lights", () => {
 let state = open();
 state = changeTrial(state, "configure", 1200, {findMs: 23000, heatMs: 72000, startStyle: "safety-car"});
 assert.equal(changeTrial(state, "lights", 1300), undefined);
 state = changeTrial(state, "release", 2000);
 assert.equal(state.trial.phase, "finding");
 assert.equal(trialRemaining(state.trial, 2000), 23000);
 state = changeTrial(state, "advance", 25000);
 assert.equal(state.activeFlag, "red");
 state = changeTrial(state, "lights", 26000);
 assert.equal(state.trial.phase, "heat-lights");
 state = changeTrial(state, "advance", 36000);
 assert.equal(trialRemaining(state.trial, 36000), 72000);
});

test("official rounds lock entrants before heat one and cannot be closed as a trial", () => {
 let state = changeTrial(null, "open", 1000, {teams, event: {eventFormat: "mutual-spotting", pointsEvent: true}});
 state = changeTrial(state, "lights", 1000);
 state = changeTrial(state, "advance", 11000);
 state = changeTrial(state, "advance", 71000);
 assert.equal(changeTrial(state, "lights", 72000), undefined);
 assert.equal(changeTrial(state, "close", 72000), undefined);
 const entrants = {a: {teamId: teams.a, driverId: "a", vehicleId: "ranger"}, b: {teamId: teams.b, driverId: "b", vehicleId: "shelly"}};
 state = changeTrial(state, "lights", 72000, {entrants});
 assert.deepEqual(state.trial.entrants, entrants);
});

test("Mutual Spotting display distinguishes start holds, caution, and Safety Car release", () => {
 let state = open();
 state = changeTrial(state, "configure", 1500, {findMs: 12000, heatMs: 45000, startStyle: "safety-car"});
 assert.match(trialDisplay(state, 1500)[2], /AWAIT GREEN RELEASE/);
 state = changeTrial(state, "release", 2000);
 assert.match(trialDisplay(state, 14000)[2], /AWAIT HEAT LIGHTS/);
 state = changeTrial(state, "advance", 14000);
 assert.match(trialDisplay(state, 14000)[2], /AWAIT HEAT LIGHTS/);
 state = changeTrial(state, "lights", 15000);
 state = changeTrial(state, "advance", 25000);
 state = changeTrial(state, "yellow", 26000);
 assert.match(trialDisplay(state, 26000)[2], /7 MPH MAX • TIMER RUNS AT HALF SPEED/);
 state = changeTrial(state, "safety-car", 27000);
 assert.match(trialDisplay(state, 27000)[2], /NO SPOTTING • TIMER PAUSED/);
 state = changeTrial(state, "red", 28000);
 assert.equal(trialDisplay(state, 28000)[2], "STOP SAFELY • AWAIT RACE DIRECTOR");
});
