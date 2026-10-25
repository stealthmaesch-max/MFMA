import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {evaluateSpeedCompliance} from "../speed-compliance.js";

const fix=(mph,accuracy=6,timestamp=1000)=>({speed:mph/2.236936,accuracy,timestamp});

test("Yellow requires eight mph or less after five seconds and three reliable fixes",()=>{
 let state=evaluateSpeedCompliance({},"yellow",fix(12,6,1000),1000);
 state=evaluateSpeedCompliance(state,"yellow",fix(11,6,3000),3000);
 state=evaluateSpeedCompliance(state,"yellow",fix(10,6,6100),6100);
 assert.equal(state.status,"candidate");assert.equal(state.candidate.limitMph,8);assert.equal(state.candidate.signal,"yellow");
 assert.equal(evaluateSpeedCompliance(state,"yellow",fix(8,6,6200),6200).status,"compliant");
});

test("Red requires a full stop threshold of one mph",()=>{
 let state=evaluateSpeedCompliance({},"red",fix(4,5,1000),1000);
 state=evaluateSpeedCompliance(state,"red",fix(3,5,3500),3500);
 state=evaluateSpeedCompliance(state,"red",fix(2,5,6100),6100);
 assert.equal(state.status,"candidate");assert.equal(state.candidate.limitMph,1);
 assert.equal(evaluateSpeedCompliance(state,"red",fix(.8,5,6200),6200).status,"compliant");
});

test("poor, stale, or missing speed data cannot create a report",()=>{
 for(const [sample,times] of [[fix(20,30,1000),[1000,4000,7000]],[fix(20,5,1000),[12000,15000,18000]],[{accuracy:5,timestamp:1000,speed:null},[1000,4000,7000]]]){
  let state={};for(const now of times)state=evaluateSpeedCompliance(state,"yellow",sample,now);
  assert.equal(state.status,"unavailable");assert.equal(state.candidate,null);
 }
});

test("only one report is created during a continuous signal occurrence",()=>{
 let state={};for(const now of [1000,3500,6100])state=evaluateSpeedCompliance(state,"yellow",fix(15,5,now),now);
 assert(state.candidate);state=evaluateSpeedCompliance(state,"yellow",fix(16,5,7000),7000);assert.equal(state.candidate,null);assert.equal(state.reported,true);
 state=evaluateSpeedCompliance(state,"green",fix(16,5,8000),8000);assert.equal(state.status,"inactive");
 state=evaluateSpeedCompliance(state,"yellow",fix(16,5,9000),9000);assert.equal(state.reported,false);
});

test("Test Mode renders signals but cannot create GPS compliance reports",()=>{
 const display=readFileSync(new URL("../display.js",import.meta.url),"utf8");
 assert.match(display,/state\.systemState!=="test-mode"/);
 assert.match(display,/mode==="test-mode"\?`TEST •/);
});
