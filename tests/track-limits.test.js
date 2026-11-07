import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {evaluateTrackLimitFix,shouldWarnTrackLimit,nearestOpenZone,TRACK_LIMITS_COOLDOWN_MS,TRACK_LIMITS_MAX_FIX_GAP_MS} from "../track-limits.js";

const inside={x:64,y:244,latitude:41.298980556,longitude:-93.275166667,accuracy:5,timestamp:1000};
const outside={x:-80,y:244,latitude:41.298980556,longitude:-93.2765,accuracy:5,timestamp:1000};

test("track limits uses one calibrated outer boundary",()=>{
 const nearest=nearestOpenZone(inside,["course-boundary"]);
 assert.equal(nearest.zoneId,"course-boundary");assert.equal(nearest.distance,0);
});

test("track limits requires three precise fixes sustained for four seconds",()=>{
 let state=evaluateTrackLimitFix({},outside,["course-boundary"],1000);assert.equal(state.status,"checking");
 state=evaluateTrackLimitFix(state,{...outside,timestamp:3000},["course-boundary"],3000);assert.equal(state.status,"checking");
 state=evaluateTrackLimitFix(state,{...outside,timestamp:5000},["course-boundary"],5000);assert.equal(state.status,"candidate");assert.equal(state.candidate.nearestZoneId,"course-boundary");assert.equal(state.candidate.sampleCount,3);assert(state.candidate.distance>state.candidate.accuracy);
});

test("poor accuracy, brief excursions, and cooldown cannot create duplicate reports",()=>{
 assert.equal(evaluateTrackLimitFix({}, {...outside,accuracy:22},["course-boundary"],1000).status,"unavailable");
 let state=evaluateTrackLimitFix({},outside,["course-boundary"],1000);state=evaluateTrackLimitFix(state,{...outside,timestamp:3000},["course-boundary"],3000);state=evaluateTrackLimitFix(state,inside,["course-boundary"],3500);assert.equal(state.status,"inside");assert.equal(state.outsideCount,0);
 state={outsideCount:2,outsideSince:1000,lastReportedAt:5000};state=evaluateTrackLimitFix(state,{...outside,timestamp:7000},["course-boundary"],7000);assert.equal(state.status,"checking");
 state=evaluateTrackLimitFix({...state,lastReportedAt:7000-TRACK_LIMITS_COOLDOWN_MS},{...outside,timestamp:9000},["course-boundary"],9000);assert.equal(state.status,"candidate");
});

test("an interrupted GPS sequence cannot confirm a boundary report",()=>{
 let state=evaluateTrackLimitFix({},outside,["course-boundary"],1000);
 state=evaluateTrackLimitFix(state,{...outside,timestamp:3000},["course-boundary"],3000);
 state=evaluateTrackLimitFix(state,{...outside,timestamp:3000+TRACK_LIMITS_MAX_FIX_GAP_MS+1},["course-boundary"],3000+TRACK_LIMITS_MAX_FIX_GAP_MS+1);
 assert.equal(state.status,"checking");assert.equal(state.outsideCount,1);assert.equal(state.candidate,null);
});

test("a poor GPS fix interrupts the consecutive precise-fix sequence",()=>{
 let state=evaluateTrackLimitFix({},outside,['course-boundary'],1000);state=evaluateTrackLimitFix(state,{...outside,timestamp:3000},['course-boundary'],3000);
 state=evaluateTrackLimitFix(state,{...outside,accuracy:40,timestamp:4000},['course-boundary'],4000);assert.equal(state.outsideCount,0);assert.equal(state.candidate,null);
 state=evaluateTrackLimitFix(state,{...outside,timestamp:5000},['course-boundary'],5000);assert.equal(state.outsideCount,1);assert.equal(state.candidate,null);
});
test("Return to Course requires fresh precise outside fixes and yields to stop orders",()=>{
 const state={outsideCount:2,status:'checking'};assert.equal(shouldWarnTrackLimit(state,outside,1000),true);assert.equal(shouldWarnTrackLimit({...state,outsideCount:1},outside,1000),false);
 assert.equal(shouldWarnTrackLimit(state,outside,12000),false);assert.equal(shouldWarnTrackLimit(state,{...outside,accuracy:30},1000),false);assert.equal(shouldWarnTrackLimit({...state,status:'inside'},outside,1000),false);
 for(const signal of ['red','mechanical-incident','under-review','disqualification','checkered','return-to-start','proceed-to-start'])assert.equal(shouldWarnTrackLimit(state,outside,1000,signal),false);
});

test("failed report delivery does not silence a valid outside-boundary warning",async()=>{
 const source=readFileSync(new URL('../display.js',import.meta.url),'utf8'),code=source.slice(source.indexOf('async function submitTrackLimitCandidate'),source.indexOf('function renderTrackLimitWarning'));
 const context=vm.createContext({trackLimitReportPending:false,driverProfile:{driverId:'test'},state:{event:{}},trackLimitState:{outsideCount:3,status:'candidate'},ensureDriverAuth:async()=>{throw Error('Offline')},console:{warn(){}},renderTrackLimitsControl(){}});vm.runInContext(code,context);await vm.runInContext('submitTrackLimitCandidate({}, {})',context);
 assert.equal(context.trackLimitState.status,'candidate');assert.equal(context.trackLimitState.reportFailed,true);assert.equal(shouldWarnTrackLimit(context.trackLimitState,outside,1000),true);
});
