const assert=require("assert");
const fs=require("fs");
const test=require("node:test");

const control=fs.readFileSync("control.js","utf8");
const controlHtml=fs.readFileSync("control.html","utf8");
const fan=fs.readFileSync("fan.js","utf8");
const operations=fs.readFileSync("operations.js","utf8");
const personnel=fs.readFileSync("personnel.js","utf8");
const styles=fs.readFileSync("styles.css","utf8");

function functionSource(name){
 const start=control.indexOf(`function ${name}(`);
 assert(start>=0,`${name} exists`);
 const brace=control.indexOf("{",start);
 let depth=0;
 for(let i=brace;i<control.length;i++){
  if(control[i]==="{")depth++;
  if(control[i]==="}"&&--depth===0)return control.slice(start,i+1);
 }
 throw new Error(`Could not parse ${name}`);
}

test("new session setup contains vehicle data without person assignments",()=>{
 const setupSource=functionSource("collectSetup");
 for(const field of ["driver","passenger","assignedDriver","assignedPassenger","driverId","passengerId","vehicleTeams"]){
  assert(!setupSource.toLowerCase().includes(field.toLowerCase()),`collectSetup omits legacy ${field}`);
 }
 assert.match(setupSource,/vehicleIds:ids/);
 assert.match(setupSource,/pursuitVehicleIds/);
 assert.match(setupSource,/evadingVehicleId/);
});

test("assignment selectors and person-based validation are removed",()=>{
 for(const source of [controlHtml,control,personnel]){
  for(const term of ["data-vv-driver","data-passenger","vf-driver","vf-passengers","pursuitDriver"]){
   assert(!source.includes(term),`${term} is absent`);
  }
 }
 const validation=functionSource("validate");
 assert(!/driver|passenger|personnel|assigned twice/i.test(validation));
 assert.match(validation,/Choose two different vehicle teams/);
});

test("legacy assignment objects remain readable but their people are ignored",()=>{
 for(const source of [fan,operations]){
  assert.match(source,/Object\.keys\(setup\.vehicleTeams\)/,"legacy vehicleTeams keys still recover vehicle identities");
  assert(!/\.driver|\.passengers|pursuitDriver|personnel\[/i.test(source),"legacy people are never rendered or required");
 }
});

test("Race Director sound control stays compact and reachable on mobile",()=>{
 assert.match(controlHtml,/<div class="header-account">[\s\S]*?id="control-sound"[\s\S]*?id="account-pill"/);
 assert.match(control,/audioState==="enabled"\?"Sound On":"Enable Sounds"/);
 assert.match(styles,/\.sound-toggle\{[\s\S]*?min-height:44px/);
 assert.match(styles,/\.control-toolbar\s*\{[\s\S]*?position:\s*sticky/);
 assert.match(styles,/padding-top:\s*max\(6px, env\(safe-area-inset-top\)\)/);
 assert.match(styles,/max\(12px, env\(safe-area-inset-bottom\)\)/);
 assert.match(styles,/html, body \{ width: 100%; max-width: 100%; overflow-x: hidden; \}/);
});
