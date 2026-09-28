import test from "node:test";
import assert from "node:assert/strict";
import {TRACK_SECTORS,activeTrackSignals,cleanTrackSignals,hasGripSignal,trackOutlineMarkup} from "../track-signals.js";

test("track outline exposes central north and south as independently addressable zones",()=>{
 assert.equal(TRACK_SECTORS.length,12);
 assert.deepEqual(TRACK_SECTORS.map(sector=>sector.name),["Starting Zone","West Grounds","Northwest Grounds","North Grounds","Northeast Grounds","East Grounds","South Grounds","Central North","Central South","West Field","North Field","East Field"]);
 const markup=trackOutlineMarkup();
 for(const sector of TRACK_SECTORS)assert.match(markup,new RegExp(`data-track-sector="${sector.id}"`));
 for(const landmark of ["site-start","site-grass","field-zone","site-buildings","common-routes"])assert.match(markup,new RegExp(`class="${landmark}`));
 assert.doesNotMatch(markup,/site-bin/);
 assert.match(markup,/Buildings are legal hiding locations, not through routes/);
});

test("track signals retain valid local flags and reject unknown values",()=>{
 const raw={"sector-1":{type:"yellow",issuedAt:1},"sector-2":{type:"rain",issuedAt:2},"sector-3":{type:"unknown"},outside:{type:"debris"}};
 assert.deepEqual(cleanTrackSignals(raw),{"sector-1":{type:"yellow",issuedAt:1},"sector-2":{type:"rain",issuedAt:2}});
 const active=activeTrackSignals(raw);
 assert.deepEqual(active.map(signal=>[signal.id,signal.type]),[["sector-1","yellow"],["sector-2","rain"]]);
 assert.equal(hasGripSignal(raw),true);
 assert.equal(hasGripSignal({"sector-1":{type:"yellow"}}),false);
 assert.deepEqual(cleanTrackSignals({"sector-1":{type:"double-yellow"}}),{},"undefined Double Yellow is rejected");
});
