import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const display=readFileSync(new URL("../display.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../display.html",import.meta.url),"utf8");
const serviceWorker=readFileSync(new URL("../sw.js",import.meta.url),"utf8");

test("Driver Portal requests and visibly tracks the Screen Wake Lock",()=>{
 assert.match(display,/navigator\.wakeLock\.request\("screen"\)/);
 assert.match(display,/display\.dataset\.wakeLock=value/);
 assert.match(display,/wake&&!wake\.released/);
 assert.match(display,/document\.visibilityState!=="visible"/);
});

test("wake lock is reacquired after Safari resumes and retried on interaction",()=>{
 assert.match(display,/addEventListener\("pageshow",\(\)=>\{awake\(\);replayPersistentDriverAudio\(\)\}\)/);
 assert.match(display,/addEventListener\("visibilitychange",\(\)=>\{if\(document\.hidden\)/);
 assert.match(display,/addEventListener\("pointerdown",awake,\{passive:true\}\)/);
 assert.match(display,/addEventListener\?\.\("release"/);
 assert.match(display,/function releaseWakeLock\(\)/);
});

test("deployed Driver shell versions the wake-lock implementation",()=>{
 assert.match(html,/display\.js\?v=130/);
 assert.match(serviceWorker,/mfma-driver-shell-v22/);
 assert.match(serviceWorker,/display\.js\?v=130/);
});
