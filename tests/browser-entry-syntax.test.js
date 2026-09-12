const test=require("node:test"),{execFileSync}=require("node:child_process"),assert=require("node:assert/strict");

for(const file of ["control.js","display.js","fan.js","operations.js"]){
 test(`${file} parses as valid browser JavaScript`,()=>assert.doesNotThrow(()=>execFileSync(process.execPath,["--check",file],{stdio:"pipe"})));
}
