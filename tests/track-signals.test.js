import test from "node:test";
import assert from "node:assert/strict";
import {TRACK_SECTORS,activeTrackSignals,cleanTrackSignals,hasGripSignal,trackOutlineMarkup} from "../track-signals.js";

test("track outline exposes eight independently addressable sectors",()=>{
 assert.equal(TRACK_SECTORS.length,8);
 assert.deepEqual(TRACK_SECTORS.map(sector=>sector.name),["Starting Zone","West Grass","Northwest Approach","North Loop","Northeast Return","East Side","South Grass","Central Crossovers"]);
 const markup=trackOutlineMarkup();
 for(const sector of TRACK_SECTORS)assert.match(markup,new RegExp(`data-track-sector="${sector.id}"`));
 for(const landmark of ["site-start","site-grass"])assert.match(markup,new RegExp(`class="${landmark}"`));
 assert.doesNotMatch(markup,/site-building|site-bin/);
 const sector5=markup.match(/data-track-sector="sector-5" d="([^"]+)"/)?.[1];assert(sector5);assert.doesNotMatch(sector5,/\sM/,"S5 is one continuous northeast return, not two separate paths");
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
