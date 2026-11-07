const test=require('node:test'),assert=require('node:assert/strict');
const model=import('../boundary-recording.js');
const point=(x,y,t=100000)=>({latitude:41+y/111320,longitude:-93+x/(111320*Math.cos(41*Math.PI/180)),accuracy:5,speed:1,timestamp:t});
async function outline(){const m=await model;let draft=m.newBoundaryDraft(100000);for(const [i,[x,y]]of [[0,0],[20,0],[20,20],[0,20],[0,5]].entries())draft=m.recordBoundaryFix(draft,point(x,y,100000+i*10000),100000+i*10000).draft;return draft}
test('perimeter recording rejects inaccurate, stale, invalid and fast-moving fixes',async()=>{
 const m=await model,draft=m.newBoundaryDraft();for(const fix of [{...point(0,0),accuracy:30},{...point(0,0),latitude:91},{...point(0,0),speed:6},{...point(0,0),timestamp:50000}])assert.equal(m.recordBoundaryFix(draft,fix,100000).draft,draft);
});
test('recording spaces points and rejects sudden GPS jumps without altering saved points',async()=>{
 const m=await model,first=m.recordBoundaryFix(m.newBoundaryDraft(),point(0,0),100000).draft;assert.equal(first.points.length,1);assert.equal(m.recordBoundaryFix(first,point(1,1,101000),101000).draft,first);assert.equal(m.recordBoundaryFix(first,point(100,0,101000),101000).draft,first);
});
test('a walked loop produces a reviewable polygon in longitude latitude order',async()=>{
 const m=await model,draft=await outline(),review=m.reviewBoundaryDraft(draft),exported=m.exportBoundaryDraft(draft);assert.equal(draft.points.length,5);assert.equal(review.ready,true);assert(review.area>300);assert.equal(exported.appliedToCompetition,false);assert.equal(exported.status,'draft-review-required');assert.deepEqual(exported.geojson.geometry.coordinates[0][0],[-93,41]);assert.deepEqual(exported.geojson.geometry.coordinates[0].at(-1),[-93,41]);
});
test('incomplete walks can be backed up but cannot export a closed polygon',async()=>{
 const m=await model,draft=m.recordBoundaryFix(m.newBoundaryDraft(),point(0,0),100000).draft,exported=m.exportBoundaryDraft(draft);assert.equal(exported.geojson,null);assert.equal(exported.review.ready,false);assert.equal(exported.points.length,1);
});
test('a recording interruption across a missing edge blocks polygon export',async()=>{
 const m=await model,draft=await outline();draft.points[2]={...point(50,20,120000),breakBefore:true};assert.equal(m.reviewBoundaryDraft(draft).ready,false);assert(m.reviewBoundaryDraft(draft).warnings.some(x=>/gap/.test(x)));
});
test('crossing outlines are flagged for review',async()=>{
 const m=await model,draft=m.newBoundaryDraft();draft.points=[[0,0],[30,30],[0,30],[30,0],[1,1]].map(([x,y],i)=>point(x,y,100000+i*10000));assert(m.reviewBoundaryDraft(draft).warnings.some(x=>/crosses/.test(x)));assert.equal(m.exportBoundaryDraft(draft).geojson,null);
});
test('exported drafts restore without activating or trusting arbitrary polygon data',async()=>{
 const m=await model,draft=await outline(),restored=m.readBoundaryDraft(m.exportBoundaryDraft(draft));assert.equal(restored.points.length,draft.points.length);assert.equal(restored.geojson,undefined);assert.equal(restored.appliedToCompetition,undefined);assert.throws(()=>m.readBoundaryDraft({schema:'other',points:[]}));assert.throws(()=>m.readBoundaryDraft({...draft,points:[point(0,0),point(1,0)]}));assert.throws(()=>m.readBoundaryDraft({...draft,points:[{...point(0,0),longitude:200}]}));
});
