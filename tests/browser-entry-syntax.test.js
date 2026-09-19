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
