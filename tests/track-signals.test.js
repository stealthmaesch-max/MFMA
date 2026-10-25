import test from "node:test";
import assert from "node:assert/strict";
import {COURSE_BOUNDARY_ID,TRACK_SECTORS,activeTrackSignals,cleanTrackSignals,hasGripSignal,trackOutlineMarkup} from "../track-signals.js";

test("course mapping exposes one outer boundary without sectors",()=>{
 assert.equal(COURSE_BOUNDARY_ID,"course-boundary");
 assert.deepEqual(TRACK_SECTORS,[{id:"course-boundary",label:"BOUNDARY",name:"MFMA Grounds"}]);
 const markup=trackOutlineMarkup();
 assert.match(markup,/data-course-boundary="true"/);
 assert.match(markup,/aria-label="MFMA outer course boundary"/);
 assert.doesNotMatch(markup,/data-track-sector|sector-labels|field-zone|site-buildings|common-routes/);
});

test("legacy local sector signals are ignored while global Grip remains separate",()=>{
 const legacy={"sector-1":{type:"yellow",issuedAt:1},"sector-2":{type:"rain",issuedAt:2}};
 assert.deepEqual(cleanTrackSignals(legacy),{});
 assert.deepEqual(activeTrackSignals(legacy),[]);
 assert.equal(hasGripSignal(legacy),false);
});
