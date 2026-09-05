const assert=require("node:assert");
const fs=require("node:fs");
const test=require("node:test");

test("Move Over is available in every authoritative Race Director flag surface",()=>{
 const html=fs.readFileSync("control.html","utf8");
 assert.equal((html.match(/data-quick-flag="move-over"/g)||[]).length,1);
 assert.equal((html.match(/data-sprint-flag="move-over"/g)||[]).length,1);
 assert.equal((html.match(/data-flag="move-over"/g)||[]).length,2);
});

test("Move Over uses the shared signal model and blue-yellow visual treatment",async()=>{
 const {signals}=await import(new URL("../signals.js",`file://${__filename}`));
 assert.deepEqual(signals["move-over"],{className:"flag-move-over",label:"MOVE OVER",instruction:"ALLOW FASTER VEHICLE TO PASS",flash:true,theme:"#0756a5"});
 const css=fs.readFileSync("styles.css","utf8");
 assert.match(css,/\.flag-move-over,\.flag\.move-over \{background:linear-gradient\(to bottom,#0756a5 0 40%,#ffd719 40% 60%,#0756a5 60% 100%\)/);
});

test("Live Move Over changes only the displayed signal",()=>{
 const control=fs.readFileSync("control.js","utf8");
 assert.match(control,/if\(flag==="move-over"&&state\.systemState==="session-live"\)\{await update\(stateRef,\{activeFlag:"move-over",updatedAt:serverTimestamp\(\)\}\);return\}/);
});
