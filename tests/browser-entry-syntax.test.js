const test=require("node:test"),{execFileSync}=require("node:child_process"),assert=require("node:assert/strict");

for(const file of ["control.js","display.js","fan.js","operations.js"]){
 test(`${file} parses as valid browser JavaScript`,()=>assert.doesNotThrow(()=>execFileSync(process.execPath,["--check",file],{stdio:"pipe"})));
}

test("Race Control does not treat an anonymous Driver session as MRA authentication",()=>{
 const source=require("node:fs").readFileSync("control.js","utf8");
 assert.match(source,/Boolean\(user&&!user\.isAnonymous\)/);
 assert.doesNotMatch(source,/available-ranger/);
});
