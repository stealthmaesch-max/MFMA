const ENABLED_KEY="mfma-sounds-enabled";
const VOLUME_KEY="mfma-sounds-volume";
const MIN_GAIN=.0001;

export const soundLabels={
 green:"Green",yellow:"Yellow",red:"Red",safetyCar:"Safety Car",white:"White",checkered:"Checkered",clear:"Clear / Standby",courseLapStart:"Course Lap Start",awaitingFinding:"Awaiting Finding",findingStart:"Finding Start",timerExpired:"Timer Expired",sprintStart:"Sprint Start",sprintTimerZero:"Sprint Timer Zero",sprintTerminated:"Sprint Terminated"
};

let context=null;
let volume=readNumber(VOLUME_KEY,.65);
let lastSound=null;
const activeOscillators=new Set();
const activeGains=new Set();
const activeTimeouts=new Set();
const activeIntervals=new Set();
const listeners=new Set();

function readNumber(key,fallback){
 try{const stored=localStorage.getItem(key);if(stored===null)return fallback;const value=Number(stored);return Number.isFinite(value)?Math.min(1,Math.max(0,value)):fallback}catch{return fallback}
}

function wasEnabled(){try{return localStorage.getItem(ENABLED_KEY)==="true"}catch{return false}}

function status(){
 if(!context)return wasEnabled()?{state:"suspended",message:"Previously enabled — tap to resume sounds"}:{state:"disabled",message:"Tap to Enable Sounds"};
 if(context.state==="running")return {state:"enabled",message:"Sounds enabled"};
 return {state:context.state==="suspended"?"suspended":"blocked",message:"Tap to Enable Sounds"};
}

function notify(){const value=status();listeners.forEach(listener=>listener(value))}

export function getSoundStatus(){return status()}
export function getVolume(){return volume}
export function onSoundStatus(listener){listeners.add(listener);listener(status());return()=>listeners.delete(listener)}

export function setVolume(value){
 volume=Math.min(1,Math.max(0,Number(value)||0));
 try{localStorage.setItem(VOLUME_KEY,String(volume))}catch{}
}

function createContext(){
 const AudioContextClass=window.AudioContext||window.webkitAudioContext;
 if(!AudioContextClass)throw new Error("Web Audio is not supported on this device.");
 context=new AudioContextClass();
 context.addEventListener?.("statechange",notify);
}

export async function enableSounds(){
 try{
  if(!context)createContext();
  if(context.state!=="running")await context.resume();
  if(context.state!=="running")throw new Error("Audio playback is blocked. Tap to enable sounds.");
  try{localStorage.setItem(ENABLED_KEY,"true")}catch{}
  playTestTone();notify();return status();
 }catch(error){notify();throw error}
}

export function scheduleTone(frequency,start,duration,{type="sine",gain=.14,endFrequency=null,attack=.012,release=.045}={}){
 const oscillator=context.createOscillator();
 const gainNode=context.createGain();
 const begins=context.currentTime+start;
 const ends=begins+duration;
 oscillator.type=type;
 oscillator.frequency.setValueAtTime(frequency,begins);
 if(endFrequency)oscillator.frequency.exponentialRampToValueAtTime(endFrequency,ends);
 const peak=Math.max(MIN_GAIN,Math.min(.24,gain)*volume);
 gainNode.gain.setValueAtTime(MIN_GAIN,begins);
 gainNode.gain.exponentialRampToValueAtTime(peak,begins+Math.min(attack,duration/3));
 gainNode.gain.setValueAtTime(peak,Math.max(begins,ends-release));
 gainNode.gain.exponentialRampToValueAtTime(MIN_GAIN,ends);
 oscillator.connect(gainNode).connect(context.destination);
 activeOscillators.add(oscillator);activeGains.add(gainNode);
 oscillator.onended=()=>{
  activeOscillators.delete(oscillator);activeGains.delete(gainNode);
  try{oscillator.disconnect();gainNode.disconnect()}catch{}
 };
 oscillator.start(begins);oscillator.stop(ends+.01);
 return ends-context.currentTime;
}

export function schedulePattern(pattern,offset=0){
 let end=offset;
 for(const tone of pattern){const {start=0,duration,...options}=tone;scheduleTone(tone.frequency,offset+start,duration,options);end=Math.max(end,offset+start+duration)}
 return end;
}

export function repeatPattern(pattern,repetitions,cycleDuration,offset=0){
 let end=offset;
 for(let index=0;index<repetitions;index++)end=Math.max(end,schedulePattern(pattern,offset+index*cycleDuration));
 return end;
}

const yellowCaution=[
 {frequency:554,start:0,duration:.18,type:"triangle",gain:.17},
 {frequency:740,start:.24,duration:.18,type:"triangle",gain:.17}
];
const redAlarm=[
 {frequency:247,start:0,duration:.18,type:"sawtooth",gain:.18,endFrequency:185,attack:.006},
 {frequency:165,start:.2,duration:.22,type:"square",gain:.15,endFrequency:123,attack:.006}
];
const safetyCarWarning=[
 {frequency:784,start:0,duration:.27,type:"square",gain:.13},
 {frequency:294,start:.34,duration:.38,type:"square",gain:.15}
];

export const soundDefinitions={
 green:{description:"single rising start cue",play:()=>schedulePattern([{frequency:523,start:0,duration:.11,type:"triangle",gain:.16},{frequency:784,start:.1,duration:.2,type:"triangle",gain:.18}])},
 yellow:{description:"3× caution",repetitions:3,play:()=>repeatPattern(yellowCaution,3,1.05)},
 red:{description:"4× urgent",repetitions:4,play:()=>repeatPattern(redAlarm,4,.82)},
 safetyCar:{description:"5× repeating",repetitions:5,play:()=>repeatPattern(safetyCarWarning,5,1.15)},
 white:{description:"neutral attention",play:()=>schedulePattern([{frequency:988,start:0,duration:.1,type:"sine",gain:.12},{frequency:880,start:.14,duration:.18,type:"sine",gain:.11}])},
 checkered:{description:"finish flourish",play:()=>schedulePattern([523,659,784,1047].map((frequency,index)=>({frequency,start:index*.09,duration:.2,type:"triangle",gain:.13})))},
 clear:{description:"soft reset",play:()=>schedulePattern([{frequency:392,start:0,duration:.12,type:"sine",gain:.09},{frequency:294,start:.11,duration:.23,type:"sine",gain:.08}])},
 courseLapStart:{description:"formal start",play:()=>schedulePattern([{frequency:262,start:0,duration:.22,type:"triangle",gain:.13},{frequency:262,start:.3,duration:.12,type:"triangle",gain:.12},{frequency:392,start:.46,duration:.25,type:"triangle",gain:.14}])},
 awaitingFinding:{description:"confirmation prompt",play:()=>schedulePattern([{frequency:440,start:0,duration:.13,type:"sine",gain:.09},{frequency:554,start:.19,duration:.2,type:"sine",gain:.1}])},
 findingStart:{description:"sharp start cue",play:()=>schedulePattern([{frequency:1175,start:0,duration:.07,type:"square",gain:.12,attack:.004},{frequency:880,start:.08,duration:.16,type:"square",gain:.14,attack:.004}])},
 timerExpired:{description:"mechanical triple pulse",play:()=>repeatPattern([{frequency:233,start:0,duration:.13,type:"sawtooth",gain:.15,attack:.004}],3,.24)},
 sprintStart:{description:"energetic rise",play:()=>schedulePattern([392,587,880].map((frequency,index)=>({frequency,start:index*.1,duration:.18,type:"triangle",gain:.14})))},
 sprintTimerZero:{description:"alternating sprint buzzer",play:()=>repeatPattern([{frequency:330,start:0,duration:.09,type:"square",gain:.15},{frequency:440,start:.12,duration:.09,type:"square",gain:.14}],3,.34)},
 sprintTerminated:{description:"descending end cue",play:()=>schedulePattern([659,440,262].map((frequency,index)=>({frequency,start:index*.15,duration:.23,type:"triangle",gain:.13})))},
};

function playTestTone(){stopSounds();schedulePattern([{frequency:660,start:0,duration:.08,gain:.1},{frequency:880,start:.09,duration:.12,gain:.1}])}

export function stopSounds(){
 for(const timeout of activeTimeouts)clearTimeout(timeout);
 for(const interval of activeIntervals)clearInterval(interval);
 activeTimeouts.clear();activeIntervals.clear();
 for(const oscillator of activeOscillators){try{oscillator.onended=null;oscillator.stop();oscillator.disconnect()}catch{}}
 for(const gainNode of activeGains){try{gainNode.gain.cancelScheduledValues(context?.currentTime||0);gainNode.disconnect()}catch{}}
 activeOscillators.clear();activeGains.clear();
}

export function getActiveSoundState(){
 return {oscillators:activeOscillators.size,gains:activeGains.size,timeouts:activeTimeouts.size,intervals:activeIntervals.size};
}

export function soundForStateTransition(previous,current){
 if(!previous||!current)return null;
 const previousMode=previous.systemState;
 const currentMode=current.systemState;
 if(previousMode==="sprint-live"&&currentMode!=="sprint-live")return "sprintTerminated";
 if(previousMode!=="sprint-live"&&currentMode==="sprint-live")return "sprintStart";
 if(currentMode==="sprint-live"&&previous.sprint?.timerMode==="count-down"&&(previous.sprint?.remainingMs||0)>0&&(current.sprint?.remainingMs||0)<=0)return "sprintTimerZero";
 if(previousMode!=="course-lap"&&currentMode==="course-lap")return "courseLapStart";
 const previousPhase=previous.session?.phase;
 const currentPhase=current.session?.phase;
 if(previousPhase!=="awaiting-finding-start"&&currentPhase==="awaiting-finding-start")return "awaitingFinding";
 if(previousPhase==="awaiting-finding-start"&&currentPhase==="finding")return "findingStart";
 if(currentMode==="provisional"&&current.session?.provisionalReason==="Finding period expired")return "timerExpired";
 if(previous.activeFlag!==current.activeFlag){
  const flagSounds={green:"green",yellow:"yellow",red:"red","safety-car":"safetyCar",white:"white",checkered:"checkered",clear:"clear"};
  return flagSounds[current.activeFlag]||null;
 }
 return null;
}

export async function playStateTransition(previous,current){
 const sound=soundForStateTransition(previous,current);
 if(!sound||!context)return null;
 if(context.state!=="running"){
  try{await context.resume()}catch{return null}
  if(context.state!=="running")return null;
 }
 playSound(sound);return sound;
}

export function playSound(name){
 const definition=soundDefinitions[name];
 if(!definition)throw new Error(`Unknown sound: ${name}`);
 if(!context||context.state!=="running"){notify();throw new Error("Tap to Enable Sounds");}
 stopSounds();lastSound=name;definition.play();return name;
}

export function replayLastSound(){
 if(!lastSound)throw new Error("Preview a sound first.");
 return playSound(lastSound);
}
