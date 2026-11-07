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

async function isolatedSounds(tag,extraWindow={}){
 const storage=new Map();global.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};global.window={AudioContext:FakeAudioContext,...extraWindow};const source=fs.readFileSync('sounds.js','utf8');return import(`data:text/javascript;base64,${Buffer.from(source+'\n// '+tag).toString('base64')}`);
}

test("withdrawing any active flag to Clear cancels its notes and reminder immediately",async()=>{
 const sounds=await isolatedSounds('withdraw all flags');await sounds.enableSounds();
 try{for(const flag of ['yellow','red','safety-car','mechanical-incident','move-over','under-review','disqualification']){const active={systemState:'session-live',activeFlag:flag,session:{phase:'finding'}};await sounds.playCurrentState(active);assert(sounds.getActiveSoundState().oscillators>0);await sounds.playStateTransition(active,{...active,activeFlag:'clear'});assert.deepEqual(sounds.getActiveSoundState(),{oscillators:0,gains:0,timeouts:0,intervals:0},`${flag} withdrawal must cancel all playback`)}}finally{sounds.stopSounds()}
});

test("unrelated snapshots preserve a current warning while withdrawing Grip stops its callout",async()=>{
 let cancelled=0;global.SpeechSynthesisUtterance=class{};const speech={cancel:()=>cancelled++,resume(){},getVoices:()=>[],speak(){},speaking:true};const sounds=await isolatedSounds('grip withdrawal',{speechSynthesis:speech});await sounds.enableSounds();
 try{const active={systemState:'session-live',activeFlag:'clear',gripCondition:{type:'rain'},session:{phase:'finding'}};await sounds.playCurrentState(active);const before=sounds.getActiveSoundState();await sounds.playStateTransition(active,{...active,updatedAt:200,event:{hazards:{test:{status:'open'}}}});assert.deepEqual(sounds.getActiveSoundState(),before);const cancelBefore=cancelled;await sounds.playStateTransition(active,{...active,gripCondition:null});assert(cancelled>cancelBefore);assert.deepEqual(sounds.getActiveSoundState(),{oscillators:0,gains:0,timeouts:0,intervals:0})}finally{sounds.stopSounds()}
});

test("a delayed AudioContext resume cannot revive a withdrawn flag",async()=>{
 const sounds=await isolatedSounds('withdraw during resume');await sounds.enableSounds();sounds.stopSounds();const context=FakeAudioContext.latest;context.state='suspended';let finishResume;context.resume=()=>new Promise(resolve=>finishResume=()=>{context.state='running';resolve()});
 try{const clear={systemState:'session-live',activeFlag:'clear'},yellow={...clear,activeFlag:'yellow'},pending=sounds.playStateTransition(clear,yellow);await sounds.playStateTransition(yellow,clear);finishResume();assert.equal(await pending,null);assert.deepEqual(sounds.getActiveSoundState(),{oscillators:0,gains:0,timeouts:0,intervals:0})}finally{sounds.stopSounds()}
});

test("removing Grip restores Yellow without keeping the Grip voice",async()=>{
 const sounds=await isolatedSounds('yellow grip withdrawal');await sounds.enableSounds();try{const active={systemState:'session-live',activeFlag:'yellow',gripCondition:{type:'rain'}};assert.equal(await sounds.playCurrentState(active),'yellowGrip');assert.equal(await sounds.playStateTransition(active,{...active,gripCondition:null}),'yellow');assert.equal(sounds.getActiveSoundState().intervals,1)}finally{sounds.stopSounds()}
});

test("late media failure cannot speak Grip after its withdrawal",async()=>{
 let rejectMedia,speaks=0;class DeferredMedia extends FakeMediaAudio{async play(){this.paused=false;this.playCount++;if(this.playCount===1)return;return new Promise((resolve,reject)=>rejectMedia=reject)}}global.SpeechSynthesisUtterance=class{};
 const sounds=await isolatedSounds('late grip fallback',{Audio:DeferredMedia,speechSynthesis:{getVoices:()=>[],resume(){},speak(){speaks++},cancel(){}}});await sounds.enableSounds();try{const active={systemState:'session-live',activeFlag:'clear',gripCondition:{type:'rain'}};await sounds.playCurrentState(active);await sounds.playStateTransition(active,{...active,gripCondition:null});rejectMedia(Error('Playback canceled'));await new Promise(resolve=>setImmediate(resolve));assert.equal(speaks,0);assert.equal(FakeMediaAudio.latest.paused,true);assert.equal(sounds.getActiveSoundState().intervals,0)}finally{sounds.stopSounds()}
});

test("clearing Return to Course cancels its queued hits without stopping the primary flag",async()=>{
 const sounds=await isolatedSounds('scoped supplemental stop');await sounds.enableSounds();try{sounds.playSound('yellow');const primary=sounds.getActiveSoundState();sounds.playSupplementalSound('returnCourse');assert.equal(sounds.getActiveSoundState().oscillators,primary.oscillators+3);assert.equal(sounds.stopSupplementalSound('returnCourse'),true);assert.deepEqual(sounds.getActiveSoundState(),primary);assert.equal(sounds.stopSupplementalSound('returnCourse'),false)}finally{sounds.stopSounds()}
});

test("Test Mode Clear stops an explicit sound preview even when the displayed flag was already Clear",async()=>{
 const sounds=await isolatedSounds('test preview withdrawal');await sounds.enableSounds();try{const previous={systemState:'test-mode',activeFlag:'clear',event:{testDisplay:'clear',testSound:{id:1,name:'yellow'}}};sounds.playSound('yellow');await sounds.playStateTransition(previous,{...previous,event:{testDisplay:'clear',testSound:null}});assert.deepEqual(sounds.getActiveSoundState(),{oscillators:0,gains:0,timeouts:0,intervals:0})}finally{sounds.stopSounds()}
});

test("withdrawing Checkered to Clear does not restart a completed-session cue",async()=>{
 const sounds=await isolatedSounds('clear completed signal');await sounds.enableSounds();try{const previous={systemState:'provisional',activeFlag:'checkered',session:{provisionalReason:'Finding period expired'}};sounds.playSound('checkered');assert.equal(await sounds.playStateTransition(previous,{...previous,activeFlag:'clear'}),null);assert.deepEqual(sounds.getActiveSoundState(),{oscillators:0,gains:0,timeouts:0,intervals:0})}finally{sounds.stopSounds()}
});

test("Return to Course supplemental alarm schedules three audible hits and stops cleanly",async()=>{
 const storage=new Map();global.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};global.window={AudioContext:FakeAudioContext};
 const source=fs.readFileSync('sounds.js','utf8'),sounds=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#return-course`);await sounds.enableSounds();sounds.stopSounds();assert.equal(sounds.playSupplementalSound('returnCourse'),'returnCourse');assert.equal(sounds.getActiveSoundState().oscillators,3);sounds.stopSounds();assert.equal(sounds.getActiveSoundState().oscillators,0);
});

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
 assert.deepEqual(sounds.getActiveSoundState(),{oscillators:20,gains:20,timeouts:0,intervals:1},"Red replaces Yellow with a firm persistent alarm");

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
 assert.equal(sounds.soundDefinitions.red.repetitions,5);
 assert.equal(sounds.soundDefinitions.mechanical.repetitions,3);
 assert.equal(sounds.soundDefinitions.mechanical.reminderMs,4500);
 assert.equal(sounds.soundDefinitions.safetyCar.repetitions,4);
 assert.equal(sounds.soundDefinitions.yellow.reminderMs,6500);
 assert.equal(sounds.soundDefinitions.moveOver.reminderMs,4500);
 assert.equal(sounds.soundDefinitions.red.reminderMs,4000);
 assert.equal(sounds.soundDefinitions.safetyCar.reminderMs,5000);
 assert.equal(sounds.soundDefinitions.white.reminderMs,7000);
 assert.equal(sounds.soundDefinitions.proAttention.description,"clean electric double-beep");
 assert.match(sounds.soundDefinitions.proCaution.description,/classic MFMA caution contour/);
 assert.match(sounds.soundDefinitions.proSafetyCar.description,/classic high-low Safety Car/);
 assert.match(sounds.soundDefinitions.proCritical.description,/original low red tones/);
 assert.match(sounds.soundDefinitions.proMoveOver.description,/classic descending passing command/);
 assert.match(sounds.soundDefinitions.proGreen.description,/original MFMA rising release contour/);
 assert.match(sounds.soundDefinitions.proFinish.description,/original four-note finish rise/);
 assert.equal(sounds.soundDefinitions.proConfirm.description,"short electric confirmation");
 assert.equal(sounds.soundDefinitions.returnCourse.description,"three-hit high-pitch boundary alarm");
 assert.equal(sounds.soundDefinitions.penalty.description,"persistent penalty-imposed alarm");
 assert.equal(sounds.soundDefinitions.gpsDegraded.description,"single GPS reliability warning");
 assert.equal(sounds.soundDefinitions.connectionLost.description,"urgent lost-link double alarm");
 assert.equal(sounds.soundDefinitions.returnToStart.reminderMs,6500);
 assert.equal(sounds.soundDefinitions.proceedToLine.description,"rising proceed command");
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
 const cases=[["green",3],["yellow",6],["grip-deterioration",3,"grip"],["return-to-start",6,"returnToStart"],["proceed-to-start",3,"proceedToLine"],["move-over",6],["red",20],["mechanical-incident",12,"mechanical"],["safety-car",8],["under-review",3,"white"],["disqualification",6,"penalty"],["checkered",4]];
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
  assert.match(source,/const previous=state;state=(?:standardizeTeamNames\()?s\.val\(\)\|\|/,"Firebase snapshots preserve the previous immutable value");
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
 assert.equal(transition({systemState:"session-live",activeFlag:"yellow"},{systemState:"standby",activeFlag:"clear"}),null,"Clear and Standby do not add an unnecessary sound");
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

test("Driver reliability cues do not replace primary safety audio",()=>{
 const display=fs.readFileSync("display.js","utf8");
 assert.match(display,/playSupplementalSound\("gpsDegraded"\)/);
 assert.match(display,/playSupplementalSound\("connectionLost"\)/);
 assert.match(display,/playSupplementalSound\("instructionAck"\)/);
 assert.doesNotMatch(display,/playSound\("instructionAck"\)/);
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

test("Sound Lab exposes every production sound definition",()=>{
 const html=fs.readFileSync("sound-test.html","utf8"),script=fs.readFileSync("sound-test.js","utf8");
 assert.match(html,/id="sound-lab-grid"/);assert.match(script,/Object\.keys\(soundDefinitions\)/);assert.match(script,/soundLabels\[name\]/);assert.match(script,/data-preview-sound=/);
});

test("Sound Designer saves reusable candidates and portable backups",()=>{
 const html=fs.readFileSync("sound-test.html","utf8"),script=fs.readFileSync("sound-test.js","utf8"),sounds=fs.readFileSync("sounds.js","utf8");
 for(const id of ["designer-preview","designer-save","designer-wav","designer-export","designer-import","saved-sounds-list"])assert.match(html,new RegExp(`id="${id}"`));
 assert.match(script,/mfma-sound-designer-v1/);assert.match(script,/localStorage\.setItem\(storageKey/);assert.match(script,/MFMA Sound Lab/);assert.match(script,/audio\/wav/);assert.match(script,/navigator\.share/);
 assert.match(script,/data-edit-sound/);assert.match(script,/getProductionSoundCandidate/);
 assert.match(html,/id="sound-preset-list"/);assert.match(script,/const candidatePresets=\[/);assert.match(script,/Attention Double/);assert.match(script,/Critical Stop/);assert.match(script,/Aviation Chime/);assert.match(script,/data-preset-action/);
 assert.match(html,/id="classic-sound-list"/);assert.match(sounds,/export const classicSoundDefinitions/);assert.match(sounds,/classicYellow/);assert.match(sounds,/classicSafetyCar/);assert.match(script,/playClassicSound/);assert.match(script,/getClassicSoundCandidate/);
 assert.match(sounds,/export function normalizeDesignedSound/);assert.match(sounds,/export function playDesignedSound/);assert.match(sounds,/export function getProductionSoundCandidate/);
});

test("Stop and Mechanical Incident remain persistent but deliberately distinct",async()=>{
 global.localStorage={getItem:()=>null,setItem:()=>{}};global.window={AudioContext:FakeAudioContext};
 const source=fs.readFileSync("sounds.js","utf8"),sounds=await import(`data:text/javascript;base64,${Buffer.from(source+"\n// distinct critical signals").toString("base64")}`);
 await sounds.enableSounds();
 sounds.playSound("red");const red=sounds.getActiveSoundState();sounds.playSound("mechanical");const mechanical=sounds.getActiveSoundState();
 assert.notDeepEqual(mechanical,red);assert.notEqual(sounds.soundDefinitions.mechanical.reminderMs,sounds.soundDefinitions.red.reminderMs);assert.match(sounds.soundDefinitions.mechanical.description,/proceed-to-shop/);sounds.stopSounds();
});
