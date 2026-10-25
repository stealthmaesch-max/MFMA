import test from "node:test";
import assert from "node:assert/strict";
import {GPS_DIAGNOSTIC_WINDOW,summarizeGpsDiagnostics} from "../gps-diagnostics.js";

test("GPS diagnostics summarize the recent accepted accuracy window",()=>{
 const summary=summarizeGpsDiagnostics([{accuracy:6},{accuracy:8},{accuracy:10},{accuracy:12},{accuracy:20}]);
 assert.equal(summary.sampleCount,5);assert.equal(summary.best,6);assert.equal(summary.median,10);assert.equal(summary.worst,20);assert.equal(summary.acceptedPercent,80);assert.equal(summary.ready,true);
});

test("GPS diagnostics reject invalid samples and limit history",()=>{
 const samples=[{accuracy:null},{accuracy:-1},...Array.from({length:GPS_DIAGNOSTIC_WINDOW+5},(_,index)=>({accuracy:index+1}))];
 const summary=summarizeGpsDiagnostics(samples);
 assert.equal(summary.sampleCount,GPS_DIAGNOSTIC_WINDOW);assert.equal(summary.best,6);assert.equal(summary.worst,35);assert.equal(summary.ready,false);
});
