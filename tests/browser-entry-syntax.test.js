const test=require("node:test"),{execFileSync}=require("node:child_process"),assert=require("node:assert/strict");

for(const file of ["control.js","display.js","fan.js","operations.js","championship.js"]){
 test(`${file} parses as valid browser JavaScript`,()=>assert.doesNotThrow(()=>execFileSync(process.execPath,["--check",file],{stdio:"pipe"})));
}

test("Race Control does not treat an anonymous Driver session as MRA authentication",()=>{
 const source=require("node:fs").readFileSync("control.js","utf8");
 assert.match(source,/Boolean\(user&&!user\.isAnonymous\)/);
 assert.doesNotMatch(source,/available-ranger/);
});

test("championship supports one authorized manager account with a linked driver role",()=>{
 const source=require("node:fs").readFileSync("championship.js","utf8");
 const html=require("node:fs").readFileSync("championship.html","utf8");
 assert.match(source,/function linkManagerDriver/);
 assert.match(source,/mfma\/driverAccess\/\$\{user\.uid\}/);
 assert.match(source,/mode="driver"/);
 assert.match(html,/id="champ-role-switch"/);
 assert.match(html,/id="manager-driver-dialog"/);
});

test("Race Control exposes Points Management without a collapsed default",()=>{
 const html=require("node:fs").readFileSync("control.html","utf8");
 assert.match(html,/id="mra-management"[^>]*open/);
 assert.match(html,/>Points Management</);
 assert.match(html,/Use a negative adjustment to remove points/);
});

test("official outcomes replace the obsolete tied-score archive blocker",()=>{const control=require("node:fs").readFileSync("control.js","utf8");assert.doesNotMatch(control,/Resolve the finishing order before archiving/);assert.match(control,/Choose exactly one event winner/)});

test("isolated Test Mode cannot create competition records",()=>{
 const fs=require("node:fs"),control=fs.readFileSync("control.js","utf8"),html=fs.readFileSync("control.html","utf8"),display=fs.readFileSync("display.js","utf8");
 assert.match(html,/id="start-test-mode"/);assert.match(html,/id="test-mode-panel"/);assert.match(control,/state\?\.systemState!=="test-mode"\|\|!state\.event\?\.testMode/);assert.match(control,/systemState:"no-event",activeFlag:"clear",event:null,session:null,sprint:null/);assert.match(display,/DISPLAY \/ SOUND VERIFICATION • NOT AN ACTIVE EVENT/);
});

test("Sprint points require a pre-start roster and a verified minute",()=>{const fs=require("node:fs"),control=fs.readFileSync("control.js","utf8"),html=fs.readFileSync("control.html","utf8");assert.match(html,/id="sprint-roster"/);assert.match(control,/\[data-sprint-driver\]:checked/);assert.match(control,/durationMs>=60000/);assert.match(control,/event\/sprintParticipants/)});

test("event ending and non-archive deletion remain available throughout an event",()=>{const fs=require("node:fs"),control=fs.readFileSync("control.js","utf8"),html=fs.readFileSync("control.html","utf8");assert.match(html,/End &amp; Delete Invalid Event/);assert.match(control,/function eventArchiveIssues/);assert.match(control,/const archiveIssues=!testMode\?eventArchiveIssues\(\):\[\],canDiscard=!testMode/);assert.doesNotMatch(control,/discardInvalidEvent\(\).*state\.systemState==="sprint-live"/);assert.match(control,/closeSprintForEventEnd/);assert.match(control,/No result or points will be archived/);assert.match(control,/cancelReason/)});

test("Race Control buttons avoid unsupported native dialogs and rerender after registry load",()=>{const fs=require("node:fs"),control=fs.readFileSync("control.js","utf8"),html=fs.readFileSync("control.html","utf8");assert.doesNotMatch(control,/\b(?:prompt|confirm)\s*\(/);assert.match(html,/id="text-entry-dialog"/);assert.match(html,/id="confirmation-dialog"/);assert.match(control,/function requestText/);assert.match(control,/function requestConfirmation/);assert.match(control,/renderChampionshipEventOptions\(\);if\(state\)render\(\)/)});
