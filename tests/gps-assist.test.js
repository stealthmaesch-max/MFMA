import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {TRACK_ZONE_POLYGONS,distanceToZone,distanceToRecordedBoundary,geographicToTrackPoint,gpsConfidence,gpsWarningRadius,locateTrackPosition,smoothGpsFix} from "../gps-assist.js";
import {RECORDED_BOUNDARY_COORDINATES,RECORDED_BOUNDARY_INFO} from "../course-boundary.js";

test("active perimeter preserves all coordinates from the approved uploaded GeoJSON",()=>{
 const source=JSON.parse(readFileSync(new URL('../assets/course-boundary/recorded-2026-11-07.geojson',import.meta.url),'utf8'));
 assert.deepEqual(RECORDED_BOUNDARY_COORDINATES,source.geometry.coordinates[0]);assert.equal(RECORDED_BOUNDARY_INFO.pointCount,105);assert.equal(RECORDED_BOUNDARY_COORDINATES.length,106);assert.deepEqual(RECORDED_BOUNDARY_COORDINATES[0],RECORDED_BOUNDARY_COORDINATES.at(-1));
 for(const [lon,lat]of RECORDED_BOUNDARY_COORDINATES)assert.equal(distanceToRecordedBoundary(lat,lon),0);
});
test("recorded north and east edges replace the smaller old calibration boundary",()=>{
 for(const [lat,lon]of [[41.30005,-93.2739],[41.2995,-93.2733]])assert.equal(locateTrackPosition(lat,lon,5).zoneId,'course-boundary');
 assert.equal(locateTrackPosition(41.2995,-93.2756,5).zoneId,null);assert(distanceToRecordedBoundary(41.2995,-93.2756)>20);assert(distanceToRecordedBoundary(41.2995,-93.2756)<25);
});
test("GPS distance uses the measured coordinates independently of drawing positions",()=>{
 assert.equal(distanceToZone({latitude:41.299363889,longitude:-93.274405556,x:1e9,y:1e9},'course-boundary'),0);
 assert(distanceToZone({latitude:41.2995,longitude:-93.2756,x:239,y:187},'course-boundary')>20);
 assert.equal(distanceToZone({latitude:NaN,longitude:-93.274,x:239,y:187},'course-boundary'),Infinity);
});

test("GPS calibration maps the three supplied site anchors",()=>{
 const start=geographicToTrackPoint(41.298980556,-93.275166667),nw=geographicToTrackPoint(41.299719444,-93.275155556),ne=geographicToTrackPoint(41.299966667,-93.273577778);
 assert.deepEqual([Math.round(start.x),Math.round(start.y)],[64,244]);
 assert.deepEqual([Math.round(nw.x),Math.round(nw.y)],[29,92]);
 assert.deepEqual([Math.round(ne.x),Math.round(ne.y)],[361,35]);
 assert.equal(locateTrackPosition(41.298980556,-93.275166667,5).zoneId,"course-boundary");
 assert.equal(distanceToZone(start,"course-boundary"),0);
});

test("additional venue landmarks locally correct the GPS map",()=>{
 const points=[
  [41.299327778,-93.273658333,371,217],
  [41.298855556,-93.274475,125,337],
  [41.299363889,-93.274405556,239,187],
  [41.299791667,-93.274333333,230,80]
 ];
 for(const [lat,lon,x,y] of points){const actual=geographicToTrackPoint(lat,lon);assert.deepEqual([Math.round(actual.x),Math.round(actual.y)],[x,y])}
});

test("the GPS model has one continuous outer boundary and rejects invalid fixes",()=>{
 assert.deepEqual(Object.keys(TRACK_ZONE_POLYGONS),["course-boundary"]);
 for(const point of [{x:300,y:130},{x:239,y:187}])assert.equal(distanceToZone(point,"course-boundary"),0);
 assert(distanceToZone({x:80,y:290},"course-boundary")>0,"the old drawing does not expand the recorded perimeter");
 assert.equal(geographicToTrackPoint(NaN,0),null);
 assert.equal(geographicToTrackPoint(91,0),null);
 const fix=locateTrackPosition(41.298980556,-93.275166667,5);
 assert.equal(distanceToZone(fix,"course-boundary"),0);
 assert.equal(distanceToZone(fix,"sector-6"),Infinity);
});

test("GPS confidence expands warnings safely as data quality falls",()=>{
 assert.equal(gpsConfidence(8,1000),"precise");
 assert.equal(gpsConfidence(25,1000),"approximate");
 assert.equal(gpsConfidence(55,1000),"poor");
 assert.equal(gpsConfidence(8,16000),"stale");
 assert.equal(gpsWarningRadius(8,1000),15);
 assert.equal(gpsWarningRadius(25,1000),35);
 assert.equal(gpsWarningRadius(55,1000),Infinity);
 assert.equal(gpsWarningRadius(8,16000),Infinity);
 const next={x:10,y:10,latitude:2,longitude:2,accuracy:10,timestamp:Date.now()},previous={x:0,y:0,latitude:0,longitude:0,accuracy:10,timestamp:Date.now()-1000};
 const smoothed=smoothGpsFix(previous,next);assert(smoothed.x>0&&smoothed.x<10);assert(smoothed.latitude>0&&smoothed.latitude<2);
});

test("GPS errors clear the watcher and old callbacks cannot revive it",()=>{
 const source=readFileSync(new URL("../display.js",import.meta.url),"utf8");
 const code=source.slice(source.indexOf("let gpsGeneration=0;"),source.indexOf("setInterval(()=>{if(gpsFix"));
 let success,failure,cleared=[],updates=0;
 const context=vm.createContext({gpsWatchId:null,gpsFix:null,lastNearbySignal:"",trackLimitsEnabled:false,TRACK_LIMITS_KEY:"test",localStorage:{setItem(){},removeItem(){}},
  navigator:{geolocation:{watchPosition(ok,fail){success=ok;failure=fail;return 42},clearWatch(id){cleared.push(id)}}},
  $:()=>({querySelector:()=>({textContent:""})}),updateGpsReadout:()=>updates++,renderTrackLimitsControl(){},processTrackLimitFix(){},renderCalibration(){},
  locateTrackPosition:()=>({x:1,y:2})});
 vm.runInContext(code,context);
 vm.runInContext("toggleGpsAssist()",context);
 failure({code:2});
 assert.deepEqual(cleared,[42]);
 assert.equal(context.gpsWatchId,null);
 success({coords:{},timestamp:Date.now()});
 assert.equal(context.gpsFix,null);
 assert(updates>0);
});

test("GPS emphasis does not replace Red or Safety Car audio",()=>{
 const source=readFileSync(new URL("../display.js",import.meta.url),"utf8");
 const code=source.slice(source.indexOf("function updateGpsEmphasis()"),source.indexOf("function updateGpsReadout()"));
 let plays=0;
 const context=vm.createContext({gpsFix:{timestamp:Date.now(),accuracy:5},lastNearbySignal:"",lastGpsQuality:null,
  state:{activeFlag:"red",trackSignals:{}},activeTrackSignals:()=>[{id:"sector-1",type:"rain",grip:true}],
  driverZoneOpen:()=>true,distanceToZone:()=>0,gpsConfidence,gpsWarningRadius,$:()=>({classList:{toggle(){}}}),
  document:{hidden:false},playSupplementalSound:()=>{},playCurrentState:()=>{plays++;return Promise.resolve()}});
 vm.runInContext(code,context);
 for(const flag of ["red","safety-car","under-review"]){context.state.activeFlag=flag;context.lastNearbySignal="";vm.runInContext("updateGpsEmphasis()",context)}
 assert.equal(plays,0);
 context.state.activeFlag="green";context.lastNearbySignal="";vm.runInContext("updateGpsEmphasis()",context);assert.equal(plays,1);
 context.gpsFix.timestamp=Date.now()-20000;context.lastNearbySignal="";vm.runInContext("updateGpsEmphasis()",context);assert.equal(plays,1);
});

test("Driver Portal exposes limited-connection safety fallbacks",()=>{
 const source=readFileSync(new URL("../display.js",import.meta.url),"utf8"),worker=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
 assert.match(source,/POOR — ALL WARNINGS SHOWN/);
 assert.match(source,/Waiting for connection • not yet received by MRA/);
 assert.match(source,/retryPendingActions/);
 assert.match(source,/serviceWorker\.register/);
 assert.match(source,/gpsFix\.speed\*2\.236936/);
 assert.match(readFileSync(new URL("../display.html",import.meta.url),"utf8"),/id="driver-speed"/);
 assert.match(worker,/event\.request\.mode==="navigate"/);
 assert.match(worker,/url\.origin!==self\.location\.origin&&!sdk/);
});

test("public sectors stay hidden while the review-only boundary detector remains available",()=>{
 const source=readFileSync(new URL("../display.js",import.meta.url),"utf8"),html=readFileSync(new URL("../display.html",import.meta.url),"utf8"),control=readFileSync(new URL("../control.js",import.meta.url),"utf8");
 assert.match(source,/const PUBLIC_TRACK_SECTORS=false/);
 assert.match(source,/if\(!PUBLIC_TRACK_SECTORS\)\{\$\("track-advisory"\)\?\.remove\(\);return\}/);
 assert.match(html,/id="driver-course-open" class="dock-action hidden"/);
 assert.match(html,/id="driver-speed" class="driver-speed hidden"/);
 assert.match(html,/id="track-limits-control"/);
 assert.match(source,/evaluateTrackLimitFix/);
 assert.match(html,/id="track-limit-warning"/);
 assert.match(source,/playSupplementalSound\("returnCourse"\)/);
 assert.match(source,/shouldWarnTrackLimit\(trackLimitState,gpsFix,now,state\?\.activeFlag\)/);
 assert.match(source,/now-lastBoundarySoundAt>=3000/);
 assert.match(html,/GPS OBSERVATION • MRA REVIEW REQUIRED/);
 assert.match(control,/NO AUTOMATIC PENALTIES/);
 assert.match(source,/function renderGlobalGripAdvisory/);
 assert.match(source,/state\?\.gripCondition\?\.type\|\|legacy/);
});
