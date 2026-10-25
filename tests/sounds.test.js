const assert=require("assert");
const fs=require("fs");
const test=require("node:test");

class AudioParam{
 setValueAtTime(){}
 exponentialRampToValueAtTime(){}
 cancelScheduledValues(){}
}

class FakeGain{
 constructor(){this.gain=new AudioParam()}
 connect(){return this}
 disconnect(){}
}

class FakeOscillator{
 constructor(context){this.context=context;this.frequency=new AudioParam();this.onended=null;this.stopped=false}
 connect(){return this}
 disconnect(){}
 start(at){this.startedAt=at}
 stop(at){this.stopped=true;this.stoppedAt=at}
 finish(){this.onended?.()}
}

class FakeAudioContext{
 constructor(){this.currentTime=10;this.state="running";this.destination={};this.oscillators=[];FakeAudioContext.latest=this}
 createOscillator(){const oscillator=new FakeOscillator(this);this.oscillators.push(oscillator);return oscillator}
 createGain(){return new FakeGain()}
 addEventListener(){}
 async resume(){this.state="running"}
}

class FakeMediaAudio{
 constructor(src){this.src=src;this.currentTime=0;this.volume=1;this.muted=false;this.paused=true;this.playCount=0;FakeMediaAudio.latest=this}
 async play(){this.paused=false;this.playCount++;return undefined}
 pause(){this.paused=true}
}

test("preview repetitions replace prior playback and clean up completely",async()=>{
 const storage=new Map();
 global.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
 global.window={AudioContext:FakeAudioContext};
 const source=fs.readFileSync("sounds.js","utf8");
 const sounds=await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
 await sounds.enableSounds();

 sounds.playSound("yellow");
 assert.deepEqual(sounds.getActiveSoundState(),{oscillators:6,gains:6,timeouts:0,intervals:1},"Yellow schedules a clean sequence and persistent reminder");

 sounds.playSound("red");
 assert.deepEqual(sounds.getActiveSoundState(),{oscillators:10,gains:10,timeouts:0,intervals:1},"Red replaces Yellow with a firm persistent alarm");

 sounds.playSound("safetyCar");
 assert.deepEqual(sounds.getActiveSoundState(),{oscillators:8,gains:8,timeouts:0,intervals:1},"Safety Car replaces Red with a clean persistent command");
 sounds.stopSounds();
 assert.deepEqual(sounds.getActiveSoundState(),{oscillators:0,gains:0,timeouts:0,intervals:0},"Stop Sound cancels Safety Car immediately");

 sounds.replayLastSound();
 assert.equal(sounds.getActiveSoundState().oscillators,8,"Replay reproduces the complete Safety Car sequence");
 FakeAudioContext.latest.oscillators.slice(-8).forEach(oscillator=>oscillator.finish());
 assert.deepEqual(sounds.getActiveSoundState(),{oscillators:0,gains:0,timeouts:0,intervals:1},"Natural playback completion keeps only the reminder timer");
 sounds.stopSounds();
});

test("urgent definitions expose the required repeat counts",async()=>{
 global.localStorage={getItem:()=>null,setItem:()=>{}};
 global.window={AudioContext:FakeAudioContext};
 const source=fs.readFileSync("sounds.js","utf8");
 const sounds=await import(`data:text/javascript;base64,${Buffer.from(source+"\n// definitions").toString("base64")}`);
 assert.equal(sounds.getVolume(),1,"missing volume storage uses full internal output");
 assert.equal(sounds.soundDefinitions.yellow.repetitions,3);
 assert.equal(sounds.soundDefinitions.grip.repetitions,3);
 assert.equal(sounds.soundDefinitions.grip.reminderMs,4200);
 assert.equal(sounds.soundDefinitions.yellowGrip.reminderMs,5600);
 assert.equal(sounds.soundDefinitions.safetyCarGrip.reminderMs,5000);
 assert.match(source,/natural=.*enhanced.*premium.*natural/i);
 assert.match(source,/male=.*evan.*daniel.*aaron.*alex.*tom.*guy.*reed.*male/i);
 assert.match(source,/message\.rate=1\.02;message\.pitch=\.93/);
 assert.equal(sounds.soundDefinitions.moveOver.repetitions,3);
 assert.equal(sounds.soundDefinitions.red.repetitions,4);
 assert.equal(sounds.soundDefinitions.mechanical.repetitions,4);
 assert.equal(sounds.soundDefinitions.mechanical.reminderMs,4000);
 assert.equal(sounds.soundDefinitions.safetyCar.repetitions,5);
 assert.equal(sounds.soundDefinitions.yellow.reminderMs,6500);
 assert.equal(sounds.soundDefinitions.moveOver.reminderMs,4500);
 assert.equal(sounds.soundDefinitions.red.reminderMs,4000);
 assert.equal(sounds.soundDefinitions.safetyCar.reminderMs,5000);
 assert.equal(sounds.soundDefinitions.white.reminderMs,7000);
 assert.equal(sounds.soundDefinitions.proAttention.description,"clean electric double-beep");
 assert.equal(sounds.soundDefinitions.proCaution.description,"alternating electric caution alarm");
 assert.equal(sounds.soundDefinitions.proSafetyCar.description,"four-beat electric Safety Car alarm");
 assert.equal(sounds.soundDefinitions.proCritical.description,"rapid electric critical alarm");
 assert.equal(sounds.soundDefinitions.proMoveOver.description,"descending electric passing command");
 assert.equal(sounds.soundDefinitions.proGreen.description,"bright electric release sequence");
 assert.equal(sounds.soundDefinitions.proFinish.description,"decisive electric finish sequence");
 assert.equal(sounds.soundDefinitions.proConfirm.description,"short electric confirmation");
 assert.equal(sounds.soundDefinitions.returnCourse.description,"three-hit high-pitch boundary alarm");
 assert.equal(sounds.soundDefinitions.penalty.description,"persistent penalty-imposed alarm");
 assert.equal(sounds.soundDefinitions.gpsDegraded.description,"single GPS reliability warning");
 assert.equal(sounds.soundDefinitions.connectionLost.description,"urgent lost-link double alarm");
 assert.equal(sounds.soundDefinitions.returnToStart.reminderMs,6500);
 assert.equal(sounds.soundDefinitions.proceedToLine.description,"rising proceed command");
 assert.equal(sounds.soundDefinitions.instructionAck.description,"short instruction confirmation");
 await sounds.enableSounds();
 sounds.playSound("startLights");
 assert.equal(sounds.getActiveSoundState().oscillators,5,"the five red-light pairs each receive one synchronized tone");
 sounds.stopSounds();
});

test("production flag transitions play once and resume an enabled context",async()=>{
 global.localStorage={getItem:()=>null,setItem:()=>{}};
 global.window={AudioContext:FakeAudioContext};
 const source=fs.readFileSync("sounds.js","utf8");
 const sounds=await import(`data:text/javascript;base64,${Buffer.from(source+"\n// production playback").toString("base64")}`);
 await sounds.enableSounds();
 const base={systemState:"standby",activeFlag:"clear"};
 const cases=[["green",3],["yellow",6],["grip-deterioration",3,"grip"],["return-to-start",6,"returnToStart"],["proceed-to-start",3,"proceedToLine"],["move-over",6],["red",10],["mechanical-incident",10,"mechanical"],["safety-car",8],["infraction-warning",3,"white"],["under-review",3,"white"],["disqualification",6,"penalty"],["checkered",3]];
 for(const [flag,oscillators,expectedSound] of cases){
  const current={systemState:"standby",activeFlag:flag};
  FakeAudioContext.latest.state="suspended";
  assert.equal(await sounds.playStateTransition(base,current),expectedSound||(flag==="safety-car"?"safetyCar":flag==="move-over"?"moveOver":flag));
  assert.equal(FakeAudioContext.latest.state,"running","the enabled AudioContext resumes before playback");
  assert.equal(sounds.getActiveSoundState().oscillators,oscillators,`${flag} schedules exactly one complete sequence`);
  assert.equal(await sounds.playStateTransition(current,{...current}),null,"an unchanged Firebase snapshot stays silent");
  assert.equal(sounds.getActiveSoundState().oscillators,oscillators,"an unchanged snapshot does not replay or replace audio");
 sounds.stopSounds();
 }
 const green={systemState:"sprint-live",activeFlag:"green"},grip={...green,trackSignals:{"sector-2":{type:"rain",issuedAt:1}}};
 assert.equal(await sounds.playStateTransition(green,grip),"grip","a local grip advisory sounds without replacing Green");
 assert.equal(sounds.getActiveSoundState().intervals,1,"the local Grip reminder remains persistent");
 assert.equal(await sounds.playStateTransition(grip,green),"green","clearing Grip restores the underlying primary sound");
 const yellowGrip={...grip,activeFlag:"yellow"},safetyCarGrip={...grip,activeFlag:"safety-car"};
 assert.equal(await sounds.playStateTransition(grip,yellowGrip),"yellowGrip","Yellow remains part of the combined Grip warning");
 assert.equal(await sounds.playStateTransition(yellowGrip,safetyCarGrip),"safetyCarGrip","Safety Car remains part of the combined Grip warning");
 const globalGrip={...green,gripCondition:{type:"rain",issuedAt:2}};
 assert.equal(await sounds.playStateTransition(green,globalGrip),"grip","global Grip sounds without any sector signal");
 assert.equal(await sounds.playCurrentState(globalGrip),"grip","an already-active global Grip warning replays when Driver audio is enabled or resumed");
 sounds.stopSounds();
});

test("production listeners retain state history and restart changed flash signals",()=>{
 const control=fs.readFileSync("control.js","utf8");
 const display=fs.readFileSync("display.js","utf8");
 const css=fs.readFileSync("styles.css","utf8");
 for(const source of [control,display]){
  assert.match(source,/const previous=state;state=s\.val\(\)\|\|/,"Firebase snapshots preserve the previous immutable value");
  assert.match(source,/playStateTransition\(previous,state\)/,"each production listener evaluates the authoritative transition");
 }
 assert.match(display,/signal!==visualSignal&&display\.classList\.contains\("flash"\)/,"changed flashing signals restart their animation instance");
 assert.match(display,/void display\.offsetWidth/,"the old animation style is flushed before flash is reapplied");
 assert.match(css,/animation:\s*signalFlash \.5s steps\(1,end\) infinite/,"signal flashing remains infinite");
});

test("Firebase state transitions resolve to authoritative signals",async()=>{
 global.localStorage={getItem:()=>null,setItem:()=>{}};
 global.window={AudioContext:FakeAudioContext};
 const source=fs.readFileSync("sounds.js","utf8");
 const sounds=await import(`data:text/javascript;base64,${Buffer.from(source+"\n// transitions").toString("base64")}`);
 const transition=(previous,current)=>sounds.soundForStateTransition(previous,current);
 assert.equal(transition(null,{systemState:"standby",activeFlag:"clear"}),null,"initial snapshot stays silent");
 assert.equal(transition({systemState:"standby",activeFlag:"clear"},{systemState:"session-live",activeFlag:"green"}),"green");
 assert.equal(transition({systemState:"session-live",activeFlag:"green"},{systemState:"session-live",activeFlag:"yellow"}),"yellow");
 assert.equal(transition({systemState:"standby"},{systemState:"course-lap",activeFlag:"safety-car"}),"courseLapStart");
 assert.equal(transition({systemState:"next-session-staging",activeFlag:"proceed-to-start"},{systemState:"next-session-countdown",activeFlag:"proceed-to-start"}),"startLights");
 assert.equal(transition({systemState:"standby",activeFlag:"clear"},{systemState:"next-session-countdown",activeFlag:"proceed-to-start"}),"startLights","Session 1 uses the same start-light sound");
 assert.equal(transition({systemState:"session-live",session:{phase:"hiding"}},{systemState:"session-live",session:{phase:"awaiting-finding-start"}}),"awaitingFinding");
 assert.equal(transition({systemState:"session-live",session:{phase:"awaiting-finding-start"}},{systemState:"session-live",session:{phase:"finding"}}),"findingStart");
 assert.equal(transition({systemState:"session-live"},{systemState:"provisional",activeFlag:"checkered",session:{provisionalReason:"Finding period expired"}}),"timerExpired");
 assert.equal(transition({systemState:"standby"},{systemState:"sprint-live",sprint:{active:true}}),"sprintStart");
 assert.equal(transition({systemState:"sprint-live",sprint:{timerMode:"count-down",remainingMs:900}},{systemState:"sprint-live",sprint:{timerMode:"count-down",remainingMs:0}}),"sprintTimerZero");
 assert.equal(transition({systemState:"sprint-live"},{systemState:"standby",activeFlag:"clear"}),"sprintTerminated");
 assert.equal(transition({systemState:"qualifying-live",activeFlag:"green"},{systemState:"qualifying-live",activeFlag:"qualifying-halfway"}),"qualifyingHalfway","the Driver receives the crossed Green and Checkered halfway cue");
});

test("enabling Driver audio replays an already-active warning",async()=>{
 global.localStorage={getItem:()=>null,setItem:()=>{}};global.window={AudioContext:FakeAudioContext};
 const source=fs.readFileSync("sounds.js","utf8"),sounds=await import(`data:text/javascript;base64,${Buffer.from(source+"\n// current warning").toString("base64")}`);await sounds.enableSounds();
 assert.equal(await sounds.playCurrentState({systemState:"session-live",activeFlag:"safety-car",session:{phase:"finding"}}),"safetyCar");sounds.stopSounds();
});

test("Grip speech is retained, resumed, and retried for iOS reliability",()=>{
 const source=fs.readFileSync("sounds.js","utf8"),display=fs.readFileSync("display.js","utf8");
 assert.match(source,/let gripUtterance=null/);
 assert.match(source,/speech\.resume\?\.\(\)/);
 assert.match(source,/!speech\.speaking&&!speech\.pending/);
 assert.match(display,/replayPersistentDriverAudio/);
 assert.match(display,/addEventListener\("pageshow",\(\)=>\{awake\(\);replayPersistentDriverAudio\(\)\}\)/);
});

test("Driver reliability and acknowledgement cues do not replace primary safety audio",()=>{
 const display=fs.readFileSync("display.js","utf8");
 assert.match(display,/playSupplementalSound\("gpsDegraded"\)/);
 assert.match(display,/playSupplementalSound\("connectionLost"\)/);
 assert.match(display,/playSupplementalSound\("instructionAck"\)/);
 assert.match(display,/playSupplementalSound\("stewardNotice"\)/);
 assert.doesNotMatch(display,/playSound\("stewardNotice"\)/);
});

test("Driver Grip uses a preloaded and user-unlocked iOS media callout",async()=>{
 global.localStorage={getItem:()=>null,setItem:()=>{}};global.window={AudioContext:FakeAudioContext,Audio:FakeMediaAudio};
 const source=fs.readFileSync("sounds.js","utf8"),sounds=await import(`data:text/javascript;base64,${Buffer.from(source+"\n// media callout").toString("base64")}`);
 await sounds.enableSounds();
 assert.match(FakeMediaAudio.latest.src,/assets\/audio\/grip-callout\.m4a/);assert.equal(FakeMediaAudio.latest.playCount,1,"the user gesture primes the media element");
 const current={systemState:"session-live",activeFlag:"green",gripCondition:{type:"rain",issuedAt:1},session:{phase:"finding"}};
 assert.equal(await sounds.playCurrentState(current),"grip");assert.equal(FakeMediaAudio.latest.playCount,2,"the active Grip warning uses the unlocked media callout");
 assert(fs.statSync("assets/audio/grip-callout.m4a").size>1000,"the bundled callout asset is present");sounds.stopSounds();
});

test("Sound Lab titles preview the actual production sounds",()=>{
 const html=fs.readFileSync("sound-test.html","utf8");
 for(const [sound,title] of [["green","Green"],["yellow","Yellow"],["grip","Grip Deterioration"],["safetyCar","Safety Car"],["moveOver","Move Over"],["red","Stop"],["mechanical","Mechanical Incident"],["checkered","Checkered"],["white","MRA Steward Investigation"],["penalty","Penalty Issued"]]){
  assert.match(html,new RegExp(`data-preview-sound="${sound}"[^>]*><span>\\d+</span><strong>${title}</strong>`));
 }
 assert.doesNotMatch(html,/data-preview-sound="pro(?:Attention|Caution|SafetyCar|Critical|MoveOver|Green|Finish|Confirm)"/);
});

test("Stop and Mechanical Incident use the identical critical alarm",async()=>{
 global.localStorage={getItem:()=>null,setItem:()=>{}};global.window={AudioContext:FakeAudioContext};
 const source=fs.readFileSync("sounds.js","utf8"),sounds=await import(`data:text/javascript;base64,${Buffer.from(source+"\n// matching critical signals").toString("base64")}`);
 await sounds.enableSounds();
 sounds.playSound("red");const red=sounds.getActiveSoundState();sounds.playSound("mechanical");const mechanical=sounds.getActiveSoundState();
 assert.deepEqual(mechanical,red);assert.equal(sounds.soundDefinitions.mechanical.reminderMs,sounds.soundDefinitions.red.reminderMs);sounds.stopSounds();
});
