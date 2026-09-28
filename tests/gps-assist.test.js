import test from "node:test";
import assert from "node:assert/strict";
import {distanceToZone,geographicToTrackPoint,locateTrackPosition} from "../gps-assist.js";

test("GPS calibration maps the three supplied site anchors",()=>{
 const start=geographicToTrackPoint(41.298980556,-93.275166667),nw=geographicToTrackPoint(41.299719444,-93.275155556),ne=geographicToTrackPoint(41.299966667,-93.273577778);
 assert.deepEqual([Math.round(start.x),Math.round(start.y)],[64,244]);
 assert.deepEqual([Math.round(nw.x),Math.round(nw.y)],[29,92]);
 assert.deepEqual([Math.round(ne.x),Math.round(ne.y)],[459,89]);
 assert.equal(locateTrackPosition(41.298980556,-93.275166667,5).zoneId,"sector-1");
 assert.equal(distanceToZone(start,"sector-1"),0);
});

test("additional venue landmarks locally correct the GPS map",()=>{
 const points=[
  [41.299327778,-93.273658333,371,217],
  [41.298855556,-93.274475,342,337],
  [41.299363889,-93.274405556,239,187],
  [41.299791667,-93.274333333,303,71]
 ];
 for(const [lat,lon,x,y] of points){const actual=geographicToTrackPoint(lat,lon);assert.deepEqual([Math.round(actual.x),Math.round(actual.y)],[x,y])}
});
