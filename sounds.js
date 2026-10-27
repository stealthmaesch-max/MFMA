const ENABLED_KEY="mfma-sounds-enabled";
const VOLUME_KEY="mfma-sounds-volume";
const MIN_GAIN=.0001;
const GRIP_MEDIA_URL="./assets/audio/grip-callout.m4a?v=1";

export const soundLabels={
 green:"Green",yellow:"Yellow",grip:"Grip Deterioration",yellowGrip:"Yellow + Grip",safetyCarGrip:"Safety Car + Grip",moveOver:"Move Over",red:"Red",safetyCar:"Safety Car",hazard:"Driver Hazard",stewardNotice:"MRA Steward Notice",returnCourse:"Return to Course",gpsDegraded:"GPS Degraded",connectionLost:"Connection Lost",returnToStart:"Return to Start",proceedToLine:"Proceed to Line",penalty:"Penalty Imposed",white:"Violation",checkered:"Checkered",clear:"Clear / Standby",qualifyingHalfway:"Qualifying Halfway",startLights:"Start Lights",courseLapStart:"Course Lap Start",awaitingFinding:"Awaiting Finding",findingStart:"Finding Start",timerExpired:"Timer Expired",sprintStart:"Sprint Start",sprintTimerZero:"Sprint Timer Zero",sprintTerminated:"Sprint Terminated",proAttention:"Cab Attention",proCaution:"Cab Caution",proSafetyCar:"Cab Safety Car",proCritical:"Cab Critical",proMoveOver:"Cab Move Over",proGreen:"Cab Green",proFinish:"Cab Finish",proConfirm:"Cab Confirm"
};

let context=null;
let volume=readNumber(VOLUME_KEY,1);
let lastSound=null;
let gripUtterance=null;
let stewardUtterance=null;
let gripMedia=null;
let gripMediaUnlocked=false;
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

function ensureGripMedia(){
 if(gripMedia||typeof window.Audio!=="function")return gripMedia;
 gripMedia=new window.Audio(GRIP_MEDIA_URL);gripMedia.preload="auto";gripMedia.playsInline=true;
 return gripMedia;
}

async function unlockGripMedia(){
 const media=ensureGripMedia();if(!media)return false;
 media.muted=true;media.currentTime=0;
 try{await media.play();media.pause();media.currentTime=0;gripMediaUnlocked=true;return true}
 catch{return false}
 finally{media.muted=false}
}

export async function enableSounds(){
 try{
  if(!context)createContext();
  const mediaUnlock=unlockGripMedia();
  if(context.state!=="running")await context.resume();
  if(context.state!=="running")throw new Error("Audio playback is blocked. Tap to enable sounds.");
  await mediaUnlock;
  try{localStorage.setItem(ENABLED_KEY,"true")}catch{}
  playTestTone();notify();return status();
 }catch(error){notify();throw error}
}

export function scheduleTone(frequency,start,duration,{type="sine",gain=.14,endFrequency=null,attack=.012,release=.045,maxGain=.32}={}){
 const oscillator=context.createOscillator();
 const gainNode=context.createGain();
 const begins=context.currentTime+start;
 const ends=begins+duration;
 oscillator.type=type;
 oscillator.frequency.setValueAtTime(frequency,begins);
 if(endFrequency)oscillator.frequency.exponentialRampToValueAtTime(endFrequency,ends);
 const peak=Math.max(MIN_GAIN,Math.min(maxGain,gain)*volume);
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

function preferredGripVoice(){const voices=window.speechSynthesis?.getVoices?.()||[],english=voices.filter(voice=>/^en([_-]|$)/i.test(voice.lang||"")),natural=/\b(enhanced|premium|natural)\b/i,male=/\b(evan|daniel|aaron|alex|tom|guy|reed|male)\b/i;return english.find(voice=>natural.test(voice.name)&&male.test(voice.name))||english.find(voice=>male.test(voice.name))||english.find(voice=>natural.test(voice.name))||english.find(voice=>voice.localService)||english[0]||null}
function speakGripFallback(){try{const speech=window.speechSynthesis;if(!speech||typeof SpeechSynthesisUtterance==="undefined")return;speech.resume?.();const message=new SpeechSynthesisUtterance("Grip. Grip. Grip.");gripUtterance=message;message.voice=preferredGripVoice();message.lang=message.voice?.lang||"en-US";message.rate=1.02;message.pitch=.93;message.volume=Math.max(.88,volume);message.onend=message.onerror=()=>{if(gripUtterance===message)gripUtterance=null};speech.speak(message);const retry=setTimeout(()=>{activeTimeouts.delete(retry);if(gripUtterance===message&&!speech.speaking&&!speech.pending){try{speech.speak(message)}catch{}}},250);activeTimeouts.add(retry)}catch{gripUtterance=null}}
function speakGrip(){const media=ensureGripMedia();if(!media||!gripMediaUnlocked){speakGripFallback();return}try{media.pause();media.currentTime=0;media.volume=Math.max(.9,volume);const playback=media.play();if(playback?.catch)playback.catch(speakGripFallback)}catch{speakGripFallback()}}

export function speakStewardNotice(notice={}){
 if(!context||context.state!=="running")return false;
 try{
  const speech=window.speechSynthesis;if(!speech||typeof SpeechSynthesisUtterance==="undefined")return false;
  const messages={noted:"Incident noted",pending:"Investigation pending post session",closed:"No further investigation"},team=String(notice.teamName||"").trim();
  const message=new SpeechSynthesisUtterance(`${messages[notice.type]||"M R A Steward notice"}.${team?` ${team}.`:""}`);
  stewardUtterance=message;message.voice=preferredGripVoice();message.lang=message.voice?.lang||"en-US";message.rate=.96;message.pitch=.94;message.volume=Math.max(.92,volume);message.onend=message.onerror=()=>{if(stewardUtterance===message)stewardUtterance=null};
  const callout=setTimeout(()=>{activeTimeouts.delete(callout);if(stewardUtterance!==message)return;speech.resume?.();speech.speak(message)},450);activeTimeouts.add(callout);return true;
 }catch{stewardUtterance=null;return false}
}

export const soundDefinitions={
 proAttention:{description:"clean electric double-beep",play:()=>schedulePattern([{frequency:1050,start:0,duration:.19,type:"triangle",gain:.5,attack:.002,release:.035,maxGain:.56},{frequency:1320,start:.23,duration:.23,type:"triangle",gain:.52,attack:.002,release:.04,maxGain:.56}])},
 proCaution:{description:"alternating electric caution alarm",play:()=>repeatPattern([{frequency:980,start:0,duration:.2,type:"triangle",gain:.52,attack:.002,release:.035,maxGain:.56},{frequency:1260,start:.25,duration:.2,type:"triangle",gain:.52,attack:.002,release:.035,maxGain:.56}],3,.58)},
 proSafetyCar:{description:"four-beat electric Safety Car alarm",play:()=>repeatPattern([{frequency:1220,start:0,duration:.2,type:"triangle",gain:.54,attack:.002,release:.035,maxGain:.58},{frequency:820,start:.24,duration:.23,type:"triangle",gain:.54,attack:.002,release:.04,maxGain:.58}],4,.56)},
 proCritical:{description:"rapid electric critical alarm",play:()=>repeatPattern([{frequency:760,start:0,duration:.15,type:"square",gain:.48,attack:.001,release:.025,maxGain:.52},{frequency:1120,start:.18,duration:.16,type:"square",gain:.48,attack:.001,release:.025,maxGain:.52}],5,.39)},
 proMoveOver:{description:"descending electric passing command",play:()=>repeatPattern([{frequency:1450,start:0,duration:.25,type:"triangle",gain:.53,endFrequency:980,attack:.002,release:.04,maxGain:.57},{frequency:920,start:.29,duration:.27,type:"triangle",gain:.53,endFrequency:720,attack:.002,release:.045,maxGain:.57}],3,.65)},
 proGreen:{description:"bright electric release sequence",play:()=>schedulePattern([{frequency:780,start:0,duration:.17,type:"triangle",gain:.46,attack:.002,release:.03,maxGain:.52},{frequency:1080,start:.15,duration:.2,type:"triangle",gain:.5,attack:.002,release:.035,maxGain:.55},{frequency:1450,start:.33,duration:.27,type:"triangle",gain:.54,attack:.002,release:.045,maxGain:.58}])},
 proFinish:{description:"decisive electric finish sequence",play:()=>schedulePattern([{frequency:1120,start:0,duration:.2,type:"triangle",gain:.5,attack:.002,release:.035,maxGain:.55},{frequency:1120,start:.24,duration:.2,type:"triangle",gain:.5,attack:.002,release:.035,maxGain:.55},{frequency:720,start:.5,duration:.43,type:"triangle",gain:.55,attack:.002,release:.065,maxGain:.59}])},
 proConfirm:{description:"short electric confirmation",play:()=>schedulePattern([{frequency:920,start:0,duration:.12,type:"sine",gain:.38,attack:.002,release:.025,maxGain:.44},{frequency:1180,start:.14,duration:.16,type:"sine",gain:.42,attack:.002,release:.03,maxGain:.48}])},
 returnCourse:{description:"three-hit high-pitch boundary alarm",play:()=>repeatPattern([{frequency:1080,start:0,duration:.5,type:"square",gain:.5,endFrequency:900,attack:.001,release:.055,maxGain:.55}],3,.65)},
 gpsDegraded:{description:"single GPS reliability warning",play:()=>schedulePattern([{frequency:1180,start:0,duration:.16,type:"square",gain:.44,attack:.002,release:.035,maxGain:.48},{frequency:820,start:.21,duration:.22,type:"square",gain:.46,attack:.002,release:.05,maxGain:.5},{frequency:620,start:.48,duration:.3,type:"square",gain:.48,attack:.002,release:.07,maxGain:.52}])},
 connectionLost:{description:"urgent lost-link double alarm",play:()=>repeatPattern([{frequency:1320,start:0,duration:.2,type:"square",gain:.48,endFrequency:880,attack:.001,release:.04,maxGain:.52},{frequency:660,start:.25,duration:.28,type:"square",gain:.5,attack:.001,release:.06,maxGain:.54}],2,.62)},
 returnToStart:{description:"persistent descending return command",reminderMs:6500,play:()=>repeatPattern([{frequency:1175,start:0,duration:.22,type:"triangle",gain:.48,attack:.003,release:.05,maxGain:.52},{frequency:784,start:.27,duration:.28,type:"triangle",gain:.5,attack:.003,release:.065,maxGain:.54},{frequency:523,start:.61,duration:.36,type:"triangle",gain:.51,attack:.003,release:.08,maxGain:.55}],2,1.08)},
 proceedToLine:{description:"rising proceed command",play:()=>schedulePattern([{frequency:523,start:0,duration:.2,type:"triangle",gain:.44,attack:.003,release:.045,maxGain:.48},{frequency:784,start:.2,duration:.23,type:"triangle",gain:.47,attack:.003,release:.05,maxGain:.51},{frequency:1175,start:.43,duration:.32,type:"triangle",gain:.5,attack:.003,release:.07,maxGain:.54}])},
 penalty:{description:"persistent penalty-imposed alarm",reminderMs:5500,play:()=>repeatPattern([{frequency:1240,start:0,duration:.16,type:"square",gain:.5,attack:.001,release:.03,maxGain:.54},{frequency:930,start:.2,duration:.18,type:"square",gain:.5,attack:.001,release:.035,maxGain:.54},{frequency:620,start:.43,duration:.3,type:"square",gain:.52,attack:.001,release:.065,maxGain:.56}],2,.84)},
 hazard:{description:"clean dispatch alert",reminderMs:3000,play:()=>schedulePattern([{frequency:880,start:0,duration:.16,type:"triangle",gain:.42,attack:.003,maxGain:.46},{frequency:659,start:.21,duration:.2,type:"triangle",gain:.44,attack:.003,maxGain:.48},{frequency:880,start:.46,duration:.18,type:"triangle",gain:.42,attack:.003,maxGain:.46}])},
 stewardNotice:{description:"one-shot MRA Steward attention cue",play:()=>schedulePattern([{frequency:988,start:0,duration:.14,type:"triangle",gain:.4,attack:.003,maxGain:.44},{frequency:1319,start:.19,duration:.2,type:"triangle",gain:.44,attack:.003,maxGain:.48}])},
 green:{description:"bright cab-style electric release sequence",play:()=>soundDefinitions.proGreen.play()},
 yellow:{description:"alternating cab-style electric caution alarm",repetitions:3,reminderMs:6500,play:()=>soundDefinitions.proCaution.play()},
 grip:{description:"repeating surface grip warning with spoken callout",repetitions:3,reminderMs:4200,play:()=>{speakGrip();return repeatPattern([{frequency:880,start:0,duration:.18,type:"triangle",gain:.48,attack:.003,maxGain:.52},{frequency:880,start:.32,duration:.18,type:"triangle",gain:.48,attack:.003,maxGain:.52},{frequency:880,start:.64,duration:.18,type:"triangle",gain:.48,attack:.003,maxGain:.52}],1,1)}},
 yellowGrip:{description:"persistent Yellow with spoken grip advisory",repetitions:3,reminderMs:5600,play:()=>{speakGrip();return soundDefinitions.proCaution.play()}},
 safetyCarGrip:{description:"persistent Safety Car with spoken grip advisory",repetitions:5,reminderMs:5000,play:()=>{speakGrip();return soundDefinitions.proSafetyCar.play()}},
 moveOver:{description:"descending cab-style passing command",repetitions:3,reminderMs:4500,play:()=>soundDefinitions.proMoveOver.play()},
 red:{description:"rapid cab-style critical stop alarm",repetitions:4,reminderMs:4000,play:()=>soundDefinitions.proCritical.play()},
 mechanical:{description:"rapid cab-style critical stop alarm",repetitions:4,reminderMs:4000,play:()=>soundDefinitions.proCritical.play()},
 safetyCar:{description:"four-beat cab-style Safety Car alarm",repetitions:5,reminderMs:5000,play:()=>soundDefinitions.proSafetyCar.play()},
 white:{description:"loud persistent infraction command",reminderMs:7000,play:()=>schedulePattern([{frequency:1319,start:0,duration:.21,type:"triangle",gain:.48,attack:.003,release:.055,maxGain:.52},{frequency:988,start:.26,duration:.27,type:"triangle",gain:.48,attack:.003,release:.065,maxGain:.52},{frequency:1319,start:.59,duration:.24,type:"triangle",gain:.5,attack:.003,release:.06,maxGain:.54}])},
 checkered:{description:"decisive cab-style finish sequence",play:()=>soundDefinitions.proFinish.play()},
 qualifyingHalfway:{description:"qualifying halfway marker",play:()=>schedulePattern([{frequency:784,start:0,duration:.16,type:"triangle",gain:.22},{frequency:1047,start:.2,duration:.2,type:"triangle",gain:.25},{frequency:784,start:.46,duration:.2,type:"triangle",gain:.22}])},
 clear:{description:"soft reset",play:()=>schedulePattern([{frequency:392,start:0,duration:.12,type:"sine",gain:.09},{frequency:294,start:.11,duration:.23,type:"sine",gain:.08}])},
 startLights:{description:"five synchronized start-light tones",play:()=>schedulePattern(Array.from({length:5},(_,index)=>({frequency:440,start:index*1.5,duration:.2,type:"triangle",gain:.17,attack:.008,release:.06})))},
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
 try{window.speechSynthesis?.cancel()}catch{}
 if(gripMedia){try{gripMedia.pause();gripMedia.currentTime=0}catch{}}
 gripUtterance=null;stewardUtterance=null;
 for(const timeout of activeTimeouts)clearTimeout(timeout);
 for(const interval of activeIntervals)clearInterval(interval);
 activeTimeouts.clear();activeIntervals.clear();
 for(const oscillator of activeOscillators){try{oscillator.onended=null;oscillator.stop();oscillator.disconnect()}catch{}}
 for(const gainNode of activeGains){try{gainNode.gain.cancelScheduledValues(context?.currentTime||0);gainNode.disconnect()}catch{}}
 activeOscillators.clear();activeGains.clear();
}

export function silencePersistentSound(name){
 if(lastSound!==name)return false;
 stopSounds();lastSound=null;return true;
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
 if(previousMode!=="next-session-countdown"&&currentMode==="next-session-countdown")return "startLights";
 const previousPhase=previous.session?.phase;
 const currentPhase=current.session?.phase;
 if(previousPhase!=="awaiting-finding-start"&&currentPhase==="awaiting-finding-start")return "awaitingFinding";
 if(previousPhase==="awaiting-finding-start"&&currentPhase==="finding")return "findingStart";
 if(currentMode==="provisional"&&current.session?.provisionalReason==="Finding period expired")return "timerExpired";
 const flagSounds={green:"green",yellow:"yellow","grip-deterioration":"grip","return-to-start":"returnToStart","proceed-to-start":"proceedToLine","move-over":"moveOver",red:"red","mechanical-incident":"mechanical","safety-car":"safetyCar","infraction-warning":"white","under-review":"white",disqualification:"penalty",checkered:"checkered","qualifying-halfway":"qualifyingHalfway",clear:"clear"},hasGrip=new Set(["rain","debris"]).has(current.gripCondition?.type)||Object.values(current.trackSignals||{}).some(signal=>new Set(["rain","debris"]).has(signal?.type)),layeredGripSound=hasGrip?(current.activeFlag==="safety-car"?"safetyCarGrip":current.activeFlag==="yellow"?"yellowGrip":current.activeFlag==="green"||current.activeFlag==="clear"?"grip":null):null;
 if(previous.activeFlag!==current.activeFlag){
  return layeredGripSound||flagSounds[current.activeFlag]||null;
 }
 const signature=value=>Object.entries(value||{}).filter(([,signal])=>signal?.type).map(([sector,signal])=>`${sector}:${signal.type}`).sort().join("|"),previousTrack=`${previous.gripCondition?.type||""}|${signature(previous.trackSignals)}`,currentTrack=`${current.gripCondition?.type||""}|${signature(current.trackSignals)}`;
 if(previousTrack!==currentTrack){if(layeredGripSound)return layeredGripSound;if(hasGrip)return current.activeFlag==="red"?"red":"grip";const hasLocalYellow=Object.values(current.trackSignals||{}).some(signal=>signal?.type==="yellow");if(hasLocalYellow)return current.activeFlag==="safety-car"?"safetyCar":"yellow";return flagSounds[current.activeFlag]||"clear"}
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

export async function playCurrentState(current){
 if(!current||!context)return null;
 const baseline={...current,activeFlag:"__none__",gripCondition:null,trackSignals:{}};
 return playStateTransition(baseline,current);
}

export function playSound(name){
 const definition=soundDefinitions[name];
 if(!definition)throw new Error(`Unknown sound: ${name}`);
 if(!context||context.state!=="running"){notify();throw new Error("Tap to Enable Sounds");}
 stopSounds();lastSound=name;definition.play();
 if(definition.reminderMs){const interval=setInterval(()=>{if(lastSound===name&&context?.state==="running")definition.play()},definition.reminderMs);activeIntervals.add(interval)}
 return name;
}

export function playSupplementalSound(name){
 const definition=soundDefinitions[name];
 if(!definition)throw new Error(`Unknown sound: ${name}`);
 if(!context||context.state!=="running"){notify();throw new Error("Tap to Enable Sounds")}
 definition.play();return name;
}

export function replayLastSound(){
 if(!lastSound)throw new Error("Preview a sound first.");
 return playSound(lastSound);
}
