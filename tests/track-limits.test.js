import test from "node:test";
import assert from "node:assert/strict";
import {evaluateTrackLimitFix,nearestOpenZone,TRACK_LIMITS_COOLDOWN_MS} from "../track-limits.js";

const inside={x:64,y:244,latitude:41.298980556,longitude:-93.275166667,accuracy:5,timestamp:1000};
const outside={x:-80,y:244,latitude:41.298980556,longitude:-93.2765,accuracy:5,timestamp:1000};

test("nearest legal zone uses the calibrated venue geometry",()=>{
 const nearest=nearestOpenZone(inside,["sector-1","sector-2"]);
 assert.equal(nearest.zoneId,"sector-1");assert.equal(nearest.distance,0);
});

test("track limits requires three precise fixes sustained for four seconds",()=>{
 let state=evaluateTrackLimitFix({},outside,["sector-1"],1000);assert.equal(state.status,"checking");
 state=evaluateTrackLimitFix(state,{...outside,timestamp:3000},["sector-1"],3000);assert.equal(state.status,"checking");
 state=evaluateTrackLimitFix(state,{...outside,timestamp:5000},["sector-1"],5000);assert.equal(state.status,"candidate");assert.equal(state.candidate.sampleCount,3);assert(state.candidate.distance>state.candidate.accuracy);
});

test("poor accuracy, brief excursions, and cooldown cannot create duplicate reports",()=>{
 assert.equal(evaluateTrackLimitFix({}, {...outside,accuracy:22},["sector-1"],1000).status,"unavailable");
 let state=evaluateTrackLimitFix({},outside,["sector-1"],1000);state=evaluateTrackLimitFix(state,{...outside,timestamp:3000},["sector-1"],3000);state=evaluateTrackLimitFix(state,inside,["sector-1"],3500);assert.equal(state.status,"inside");assert.equal(state.outsideCount,0);
 state={outsideCount:2,outsideSince:1000,lastReportedAt:5000};state=evaluateTrackLimitFix(state,{...outside,timestamp:7000},["sector-1"],7000);assert.equal(state.status,"checking");
 state=evaluateTrackLimitFix({...state,lastReportedAt:7000-TRACK_LIMITS_COOLDOWN_MS},{...outside,timestamp:9000},["sector-1"],9000);assert.equal(state.status,"candidate");
});
