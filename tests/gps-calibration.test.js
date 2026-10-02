import test from "node:test";
import assert from "node:assert/strict";
import {calibrationExport,summarizeCalibrationSamples} from "../gps-calibration.js";

test("stationary GPS samples produce an averaged calibration point",()=>{
 const samples=Array.from({length:8},(_,index)=>({latitude:41.299+index*0.000001,longitude:-93.274-index*0.000001,accuracy:10+index%2,speed:0,timestamp:1000+index}));
 const summary=summarizeCalibrationSamples(samples);
 assert.equal(summary.sampleCount,8);assert.equal(summary.stationary,true);assert.equal(summary.ready,true);assert.equal(summary.quality,"precise");assert(Math.abs(summary.latitude-41.299)<0.00002);assert(Math.abs(summary.longitude+93.274)<0.00002);
});

test("moving or inaccurate samples cannot be saved as calibration",()=>{
 const moving=Array.from({length:6},(_,index)=>({latitude:41.299+index*.0001,longitude:-93.274,accuracy:10,speed:2,timestamp:index}));
 assert.equal(summarizeCalibrationSamples(moving).ready,false);
 const poor=Array.from({length:6},(_,index)=>({latitude:41.299,longitude:-93.274,accuracy:80,speed:0,timestamp:index}));
 assert.equal(summarizeCalibrationSamples(poor).ready,false);
});

test("calibration export is versioned and retains saved points",()=>{
 const payload=calibrationExport([{label:"Starting Zone",latitude:41.2,longitude:-93.2}]);
 assert.equal(payload.schema,"mfma-gps-calibration-v1");assert.equal(payload.pointCount,1);assert.equal(payload.points[0].label,"Starting Zone");assert.match(payload.exportedAt,/T/);
});
