const ENABLED_KEY="mfma-sounds-enabled";
const VOLUME_KEY="mfma-sounds-volume";

export const soundLabels={
 green:"Green",
 yellow:"Yellow",
 red:"Red",
 safetyCar:"Safety Car",
 white:"White",
 checkered:"Checkered",
 clear:"Clear / Standby",
 courseLapStart:"Course Lap Start",
 awaitingFinding:"Awaiting Finding",
 findingStart:"Finding Start",
 timerExpired:"Timer Expired",
 sprintStart:"Sprint Start",
 sprintTimerZero:"Sprint Timer Zero",
 sprintTerminated:"Sprint Terminated"
};

let context=null;
let volume=readNumber(VOLUME_KEY,.65);
let lastSound=null;
let activeNodes=new Set();
const listeners=new Set();

function readNumber(key,fallback){
 try{const value=Number(localStorage.getItem(key));return Number.isFinite(value)?Math.min(1,Math.max(0,value)):fallback}catch{return fallback}
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

function oscillator(frequency,start,duration,{type="sine",gain=.22,endFrequency=null}={}){
 const osc=context.createOscillator(),amp=context.createGain(),now=context.currentTime;
 osc.type=type;osc.frequency.setValueAtTime(frequency,now+start);
 if(endFrequency)osc.frequency.exponentialRampToValueAtTime(endFrequency,now+start+duration);
 const peak=Math.max(.0001,gain*volume);
 amp.gain.setValueAtTime(.0001,now+start);
 amp.gain.exponentialRampToValueAtTime(peak,now+start+.015);
 amp.gain.exponentialRampToValueAtTime(.0001,now+start+duration);
 osc.connect(amp).connect(context.destination);activeNodes.add(osc);
 osc.onended=()=>activeNodes.delete(osc);osc.start(now+start);osc.stop(now+start+duration+.02);
}

function playTestTone(){stopSounds();oscillator(660,0,.09,{gain:.16});oscillator(880,.1,.14,{gain:.16})}

const patterns={
 green:()=>{oscillator(523,0,.1,{gain:.2});oscillator(659,.1,.16,{gain:.22})},
 yellow:()=>{oscillator(440,0,.14,{type:"triangle",gain:.2});oscillator(440,.23,.14,{type:"triangle",gain:.2})},
 red:()=>{oscillator(196,0,.42,{type:"sawtooth",gain:.25,endFrequency:130})},
 safetyCar:()=>{oscillator(330,0,.2,{type:"square",gain:.18});oscillator(196,.22,.34,{type:"square",gain:.22})},
 white:()=>{oscillator(740,0,.16,{gain:.17});oscillator(622,.18,.2,{gain:.17})},
 checkered:()=>{[523,659,784,1047].forEach((frequency,index)=>oscillator(frequency,index*.085,.15,{type:"triangle",gain:.18}))},
 clear:()=>{oscillator(440,0,.14,{gain:.12});oscillator(330,.13,.22,{gain:.1})},
 courseLapStart:()=>{oscillator(147,0,.28,{type:"triangle",gain:.2});oscillator(196,.26,.3,{type:"triangle",gain:.2})},
 awaitingFinding:()=>{oscillator(523,0,.12,{gain:.12});oscillator(659,.2,.18,{gain:.12})},
 findingStart:()=>{oscillator(659,0,.09,{type:"square",gain:.16});oscillator(880,.09,.18,{type:"square",gain:.18})},
 timerExpired:()=>{[0,.18,.36].forEach((start,index)=>oscillator(220-index*35,start,.14,{type:"sawtooth",gain:.23}))},
 sprintStart:()=>{[440,660,880].forEach((frequency,index)=>oscillator(frequency,index*.075,.14,{type:"square",gain:.16}))},
 sprintTimerZero:()=>{[0,.13,.26,.39].forEach((start,index)=>oscillator(index%2?180:270,start,.11,{type:"square",gain:.23}))},
 sprintTerminated:()=>{[523,392,262].forEach((frequency,index)=>oscillator(frequency,index*.13,.2,{type:"triangle",gain:.17}))}
};

export function stopSounds(){
 for(const node of activeNodes){try{node.onended=null;node.stop()}catch{}}
 activeNodes.clear();
}

export function playSound(name){
 if(!patterns[name])throw new Error(`Unknown sound: ${name}`);
 if(!context||context.state!=="running"){notify();throw new Error("Tap to Enable Sounds");}
 stopSounds();lastSound=name;patterns[name]();return name;
}

export function replayLastSound(){
 if(!lastSound)throw new Error("Preview a sound first.");
 return playSound(lastSound);
}
