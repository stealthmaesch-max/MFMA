import test from "node:test";
import assert from "node:assert/strict";
import {TRACK_SECTORS,activeTrackSignals,cleanTrackSignals,hasGripSignal,trackOutlineMarkup} from "../track-signals.js";

test("track outline exposes six independently addressable sectors",()=>{
 assert.equal(TRACK_SECTORS.length,6);
 assert.deepEqual(TRACK_SECTORS.map(sector=>sector.name),["Starting Zone","West Side","North Loop","East Side","South Grass Run","Central Crossover"]);
 const markup=trackOutlineMarkup();
 for(const sector of TRACK_SECTORS)assert.match(markup,new RegExp(`data-track-sector="${sector.id}"`));
 for(const landmark of ["site-start","site-grass","site-building","site-bin"])assert.match(markup,new RegExp(`class="${landmark}"`));
});

test("track signals retain valid local flags and reject unknown values",()=>{
 const raw={"sector-1":{type:"yellow",issuedAt:1},"sector-2":{type:"rain",issuedAt:2},"sector-3":{type:"unknown"},outside:{type:"debris"}};
 assert.deepEqual(cleanTrackSignals(raw),{"sector-1":{type:"yellow",issuedAt:1},"sector-2":{type:"rain",issuedAt:2}});
 const active=activeTrackSignals(raw);
 assert.deepEqual(active.map(signal=>[signal.id,signal.type]),[["sector-1","yellow"],["sector-2","rain"]]);
 assert.equal(hasGripSignal(raw),true);
 assert.equal(hasGripSignal({"sector-1":{type:"double-yellow"}}),false);
});
