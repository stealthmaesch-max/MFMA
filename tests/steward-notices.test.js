import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const control=readFileSync(new URL("../control.js",import.meta.url),"utf8");
const display=readFileSync(new URL("../display.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../control.html",import.meta.url),"utf8");
const competition=readFileSync(new URL("../competition-model.js",import.meta.url),"utf8");
const sounds=readFileSync(new URL("../sounds.js",import.meta.url),"utf8");

test("Steward notices preserve the active flag and timer",()=>{
 const issue=control.slice(control.indexOf("async function issueStewardNotice"),control.indexOf("async function resolveStewardNotice"));
 assert.match(control,/event\/stewardNotices/);
 assert.match(control,/event\/activeStewardNotice/);
 assert.doesNotMatch(issue,/activeFlag|systemState|session\/remainingMs/);
 assert.match(control,/expiresAt:issuedAt\+5000/);
});

test("incident records support both public five-second outcomes",()=>{
 assert.match(html,/Incident Noted/);
 assert.match(control,/Investigation Pending Post-Session/);
 assert.match(control,/No Further Investigation/);
 assert.match(display,/INVESTIGATION PENDING POST-SESSION/);
 assert.match(display,/NO FURTHER INVESTIGATION/);
 assert.match(display,/setTimeout\(\(\)=>panel\.classList\.add\("hidden"\),remaining\)/);
 assert.match(competition,/stewardNotices:event\.stewardNotices\|\|null/);
});

test("each new Steward notice has a concise spoken Driver callout",()=>{
 assert.match(display,/speakStewardNotice\(notice\)/);
 assert.match(display,/playSound\("stewardNotice"\)/);
 assert.match(sounds,/export function speakStewardNotice/);
 assert.match(sounds,/stewardNotice:\{description:"one-shot MRA Steward attention cue"/);
 assert.doesNotMatch(sounds,/stewardNotice:\{[^}]*reminderMs/);
 assert.match(sounds,/noted:"Incident noted"/);
 assert.match(sounds,/pending:"Investigation pending post session"/);
 assert.match(sounds,/closed:"No further investigation"/);
 assert.match(sounds,/message\.rate=\.96/);
 assert.match(sounds,/message\.volume=Math\.max\(\.92,volume\)/);
 assert.match(sounds,/setTimeout\(\(\)=>\{activeTimeouts\.delete\(callout\)/);
});
