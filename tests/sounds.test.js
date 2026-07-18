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

test("preview repetitions replace prior playback and clean up completely",async()=>{
 const storage=new Map();
 global.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
 global.window={AudioContext:FakeAudioContext};
 const source=fs.readFileSync("sounds.js","utf8");
 const sounds=await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
 await sounds.enableSounds();

 sounds.playSound("yellow");
 assert.deepEqual(sounds.getActiveSoundState(),{oscillators:6,gains:6,timeouts:0,intervals:0},"Yellow schedules exactly three two-tone cycles");

 sounds.playSound("red");
 assert.deepEqual(sounds.getActiveSoundState(),{oscillators:8,gains:8,timeouts:0,intervals:0},"Red replaces Yellow with exactly four two-tone cycles");

 sounds.playSound("safetyCar");
 assert.deepEqual(sounds.getActiveSoundState(),{oscillators:10,gains:10,timeouts:0,intervals:0},"Safety Car replaces Red with exactly five cycles");
 sounds.stopSounds();
 assert.deepEqual(sounds.getActiveSoundState(),{oscillators:0,gains:0,timeouts:0,intervals:0},"Stop Sound cancels Safety Car immediately");

 sounds.replayLastSound();
 assert.equal(sounds.getActiveSoundState().oscillators,10,"Replay reproduces the complete Safety Car sequence");
 FakeAudioContext.latest.oscillators.slice(-10).forEach(oscillator=>oscillator.finish());
 assert.deepEqual(sounds.getActiveSoundState(),{oscillators:0,gains:0,timeouts:0,intervals:0},"Natural playback completion releases every tracked resource");
});

test("urgent definitions expose the required repeat counts",async()=>{
 global.localStorage={getItem:()=>null,setItem:()=>{}};
 global.window={AudioContext:FakeAudioContext};
 const source=fs.readFileSync("sounds.js","utf8");
 const sounds=await import(`data:text/javascript;base64,${Buffer.from(source+"\n// definitions").toString("base64")}`);
 assert.equal(sounds.soundDefinitions.yellow.repetitions,3);
 assert.equal(sounds.soundDefinitions.red.repetitions,4);
 assert.equal(sounds.soundDefinitions.safetyCar.repetitions,5);
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
 assert.equal(transition({systemState:"session-live",session:{phase:"hiding"}},{systemState:"session-live",session:{phase:"awaiting-finding-start"}}),"awaitingFinding");
 assert.equal(transition({systemState:"session-live",session:{phase:"awaiting-finding-start"}},{systemState:"session-live",session:{phase:"finding"}}),"findingStart");
 assert.equal(transition({systemState:"session-live"},{systemState:"provisional",activeFlag:"checkered",session:{provisionalReason:"Finding period expired"}}),"timerExpired");
 assert.equal(transition({systemState:"standby"},{systemState:"sprint-live",sprint:{active:true}}),"sprintStart");
 assert.equal(transition({systemState:"sprint-live",sprint:{timerMode:"count-down",remainingMs:900}},{systemState:"sprint-live",sprint:{timerMode:"count-down",remainingMs:0}}),"sprintTimerZero");
 assert.equal(transition({systemState:"sprint-live"},{systemState:"standby",activeFlag:"clear"}),"sprintTerminated");
});
