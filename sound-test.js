import {enableSounds,getDesignedSoundSequence,getProductionSoundCandidate,getSoundStatus,normalizeDesignedSound,onSoundStatus,playDesignedSound,playSound,replayLastSound,soundDefinitions,soundLabels,stopSounds} from "./sounds.js?v=97";

const enableButton=document.getElementById("sound-lab-enable");
const status=document.getElementById("sound-lab-status");
document.getElementById("sound-lab-grid").innerHTML=Object.keys(soundDefinitions).map((name,index)=>`<article><button type="button" class="production-preview" data-preview-sound="${name}"><span>${String(index+1).padStart(2,"0")}</span><strong>${soundLabels[name]||name.replace(/([A-Z])/g," $1")}</strong><small>${soundDefinitions[name].description||"Production sound"}</small></button><button type="button" class="production-edit" data-edit-sound="${name}">Edit as Candidate</button></article>`).join("");
const previewButtons=[...document.querySelectorAll("[data-preview-sound]")];
const editSoundButtons=[...document.querySelectorAll("[data-edit-sound]")];
const candidatePresets=[
 {name:"Attention Double",description:"Clear two-note attention cue",frequency:880,endFrequency:1240,durationMs:170,gapMs:90,pulses:2,repetitions:1,direction:"alternate",waveform:"triangle",gainPercent:85,cycleGapMs:0,reminderMs:0},
 {name:"Aviation Chime",description:"Smooth, authoritative cabin notice",frequency:740,endFrequency:1110,durationMs:310,gapMs:120,pulses:2,repetitions:1,direction:"alternate",waveform:"sine",gainPercent:90,cycleGapMs:0,reminderMs:0},
 {name:"Caution Alternator",description:"Persistent high-low caution alarm",frequency:930,endFrequency:1280,durationMs:210,gapMs:95,pulses:2,repetitions:4,direction:"alternate",waveform:"triangle",gainPercent:100,cycleGapMs:160,reminderMs:5000},
 {name:"Critical Stop",description:"Rapid sharp stop command",frequency:720,endFrequency:1180,durationMs:145,gapMs:55,pulses:2,repetitions:6,direction:"alternate",waveform:"square",gainPercent:100,cycleGapMs:80,reminderMs:3000},
 {name:"Safety Car Cadence",description:"Measured repeating neutralization alarm",frequency:1180,endFrequency:790,durationMs:230,gapMs:100,pulses:2,repetitions:5,direction:"alternate",waveform:"triangle",gainPercent:100,cycleGapMs:190,reminderMs:5000},
 {name:"Boundary Return",description:"Annoying triple return-to-course alarm",frequency:1420,endFrequency:1080,durationMs:390,gapMs:130,pulses:3,repetitions:2,direction:"fall",waveform:"square",gainPercent:100,cycleGapMs:240,reminderMs:3000},
 {name:"Mechanical Alert",description:"Heavy alternating inspection order",frequency:610,endFrequency:1040,durationMs:260,gapMs:80,pulses:4,repetitions:3,direction:"alternate",waveform:"sawtooth",gainPercent:100,cycleGapMs:180,reminderMs:4000},
 {name:"Move Over Sweep",description:"Distinct descending traffic command",frequency:1480,endFrequency:760,durationMs:430,gapMs:130,pulses:2,repetitions:3,direction:"fall",waveform:"triangle",gainPercent:100,cycleGapMs:220,reminderMs:4500},
 {name:"Escalating Triple",description:"Three-stage urgency build",frequency:620,endFrequency:1460,durationMs:220,gapMs:70,pulses:3,repetitions:3,direction:"rise",waveform:"triangle",gainPercent:95,cycleGapMs:210,reminderMs:0},
 {name:"Positive Confirm",description:"Short clean confirmation",frequency:830,endFrequency:1160,durationMs:130,gapMs:55,pulses:2,repetitions:1,direction:"alternate",waveform:"sine",gainPercent:70,cycleGapMs:0,reminderMs:0},
 {name:"Timer Pulse",description:"Mechanical countdown expiration",frequency:320,endFrequency:320,durationMs:120,gapMs:100,pulses:5,repetitions:1,direction:"steady",waveform:"sawtooth",gainPercent:85,cycleGapMs:0,reminderMs:0},
 {name:"Finish Sequence",description:"Decisive checkered sequence",frequency:1120,endFrequency:690,durationMs:240,gapMs:100,pulses:3,repetitions:2,direction:"fall",waveform:"triangle",gainPercent:95,cycleGapMs:260,reminderMs:0}
];
const presetList=document.getElementById("sound-preset-list");
presetList.innerHTML=candidatePresets.map((preset,index)=>`<article data-preset-index="${index}"><div><strong>${preset.name}</strong><small>${preset.description}</small></div><div><button type="button" data-preset-action="preview">Preview</button><button type="button" data-preset-action="load">Use Preset</button></div></article>`).join("");
const storageKey="mfma-sound-designer-v1";
const fields={name:"designer-name",frequency:"designer-frequency",endFrequency:"designer-end-frequency",durationMs:"designer-duration",gapMs:"designer-gap",pulses:"designer-pulses",repetitions:"designer-repetitions",direction:"designer-direction",waveform:"designer-waveform",gainPercent:"designer-gain",cycleGapMs:"designer-cycle-gap",reminderMs:"designer-reminder"};
const outputFields={frequency:["designer-frequency-value"," Hz"],endFrequency:["designer-end-frequency-value"," Hz"],durationMs:["designer-duration-value"," ms"],gapMs:["designer-gap-value"," ms"],pulses:["designer-pulses-value",""],repetitions:["designer-repetitions-value",""],gainPercent:["designer-gain-value","%"],cycleGapMs:["designer-cycle-gap-value"," ms"]};
const designerStatus=document.getElementById("designer-status"),savedList=document.getElementById("saved-sounds-list"),savedCount=document.getElementById("saved-count");
let editingId=null,savedDesigns=readSavedDesigns(),designerReminder=null;

function readSavedDesigns(){try{const value=JSON.parse(localStorage.getItem(storageKey)||"[]");return Array.isArray(value)?value:[]}catch{return []}}
function persistDesigns(){localStorage.setItem(storageKey,JSON.stringify(savedDesigns))}
function currentDesign(){const raw={};for(const [key,id] of Object.entries(fields)){const element=document.getElementById(id);raw[key]=element.type==="range"?Number(element.value):element.value}return {...normalizeDesignedSound(raw),name:String(raw.name||"").trim()||"Untitled Candidate"}}
function setForm(design={}){const normalized={...normalizeDesignedSound(design),name:design.name||""};for(const [key,id] of Object.entries(fields)){const element=document.getElementById(id);element.value=normalized[key]??""}refreshOutputs()}
function refreshOutputs(){for(const [key,[id,suffix]] of Object.entries(outputFields))document.getElementById(id).textContent=`${document.getElementById(fields[key]).value}${suffix}`}
function safeName(name,extension){return `${String(name||"MFMA-sound").replace(/[^a-z0-9_-]+/gi,"-").replace(/^-|-$/g,"")||"MFMA-sound"}.${extension}`}
function downloadBlob(blob,filename){const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}

function renderSavedDesigns(){
 savedCount.textContent=String(savedDesigns.length);
 if(!savedDesigns.length){savedList.innerHTML='<p class="saved-empty">No candidates saved yet.</p>';return}
 savedList.innerHTML=savedDesigns.map(design=>`<article class="saved-sound" data-saved-id="${design.id}"><div><strong>${escapeHtml(design.name)}</strong><small>${design.frequency}–${design.endFrequency} Hz • ${design.pulses} pulses × ${design.repetitions} • ${design.waveform}</small></div><div><button type="button" data-saved-action="preview">Preview</button><button type="button" data-saved-action="edit">Edit</button><button type="button" data-saved-action="wav">WAV</button><button type="button" data-saved-action="delete" class="danger">Delete</button></div></article>`).join("");
}
function escapeHtml(value){return String(value).replace(/[&<>'"]/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[character])}
async function ensureDesignerAudio(){if(getSoundStatus().state!=="enabled")renderAudioState(await enableSounds())}
function stopDesignerPreview(){if(designerReminder){clearInterval(designerReminder);designerReminder=null}stopSounds()}
async function previewDesign(design=currentDesign()){try{stopDesignerPreview();await ensureDesignerAudio();playDesignedSound(design);if(design.reminderMs>0)designerReminder=setInterval(()=>{try{playDesignedSound(design)}catch{}},design.reminderMs);designerStatus.textContent=`Playing ${design.name}${design.reminderMs>0?` • repeats every ${design.reminderMs/1000} seconds until Stop`:""}.`;}catch(error){designerStatus.textContent=error?.message||"Audio could not be played."}}

function saveCurrentDesign(){
 const design=currentDesign(),now=new Date().toISOString();
 if(editingId){const index=savedDesigns.findIndex(item=>item.id===editingId);if(index>=0)savedDesigns[index]={...design,id:editingId,updatedAt:now};else editingId=null}
 if(!editingId){editingId=globalThis.crypto?.randomUUID?.()||`sound-${Date.now()}`;savedDesigns.unshift({...design,id:editingId,updatedAt:now})}
 persistDesigns();renderSavedDesigns();designerStatus.textContent=`Saved “${design.name}” on this device.`;
}
function newDesign(){editingId=null;setForm({});designerStatus.textContent="New candidate. Saved designs remain available below.";document.getElementById(fields.name).focus()}

function encodeWav(design){
 const {tones,durationSeconds}=getDesignedSoundSequence(design),sampleRate=44100,length=Math.ceil(durationSeconds*sampleRate),samples=new Float32Array(length);
 for(const tone of tones){const start=Math.floor(tone.start*sampleRate),end=Math.min(length,Math.ceil((tone.start+tone.duration)*sampleRate));for(let index=start;index<end;index++){const elapsed=(index/sampleRate)-tone.start,progress=elapsed/tone.duration,frequency=tone.endFrequency?tone.frequency*Math.pow(tone.endFrequency/tone.frequency,progress):tone.frequency,phase=2*Math.PI*frequency*elapsed;let wave=Math.sin(phase);if(tone.type==="square")wave=wave>=0?1:-1;else if(tone.type==="triangle")wave=2*Math.asin(Math.sin(phase))/Math.PI;else if(tone.type==="sawtooth")wave=2*((elapsed*frequency)%1)-1;const envelope=Math.min(1,progress/.04,(1-progress)/.09);samples[index]+=wave*Math.max(0,envelope)*Math.min(.95,.72*(design.gainPercent/100))}}
 const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer),write=(offset,text)=>[...text].forEach((character,index)=>view.setUint8(offset+index,character.charCodeAt(0)));write(0,"RIFF");view.setUint32(4,36+samples.length*2,true);write(8,"WAVE");write(12,"fmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,"data");view.setUint32(40,samples.length*2,true);samples.forEach((sample,index)=>view.setInt16(44+index*2,Math.max(-1,Math.min(1,sample))*0x7fff,true));return new Blob([buffer],{type:"audio/wav"});
}
async function saveWav(design=currentDesign()){
 const fileName=safeName(design.name,"wav"),blob=encodeWav(design),file=new File([blob],fileName,{type:"audio/wav"});
 try{if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:design.name});designerStatus.textContent=`Shared ${fileName}. Choose Save to Files to keep it on iPad.`;return}}catch(error){if(error?.name==="AbortError")return}
 downloadBlob(blob,fileName);designerStatus.textContent=`Downloaded ${fileName}.`;
}

function renderAudioState({state,message}){
 const enabled=state==="enabled";
 enableButton.textContent=enabled?"Audio Enabled":"Enable Audio";
 enableButton.dataset.state=state;
 enableButton.setAttribute("aria-pressed",String(enabled));
 status.textContent=message;
 previewButtons.forEach(button=>button.disabled=!enabled);
}

async function enableAudio(){
 try{renderAudioState(await enableSounds())}
 catch(error){status.textContent=error?.message||"Audio could not be enabled on this device."}
}

enableButton.addEventListener("click",enableAudio);
previewButtons.forEach(button=>button.addEventListener("click",()=>{
 try{
  stopDesignerPreview();
  playSound(button.dataset.previewSound);
  previewButtons.forEach(candidate=>candidate.classList.toggle("is-playing",candidate===button));
  status.textContent=`Playing ${button.querySelector("strong").textContent}.`;
 }catch(error){status.textContent=error?.message||"Tap Enable Audio first."}
}));
editSoundButtons.forEach(button=>button.addEventListener("click",()=>{try{editingId=null;const design=getProductionSoundCandidate(button.dataset.editSound);setForm(design);designerStatus.textContent=`Loaded ${soundLabels[button.dataset.editSound]||button.dataset.editSound} as a new editable candidate. The live sound is unchanged.`;scrollTo({top:document.querySelector(".sound-designer").offsetTop-12,behavior:"smooth"})}catch(error){designerStatus.textContent=error?.message||"This production sound could not be loaded."}}));
presetList.addEventListener("click",event=>{const button=event.target.closest("button[data-preset-action]"),card=button?.closest("[data-preset-index]");if(!button||!card)return;const preset=candidatePresets[Number(card.dataset.presetIndex)];if(button.dataset.presetAction==="preview")previewDesign(preset);else{editingId=null;setForm(preset);designerStatus.textContent=`Loaded “${preset.name}” into the editor. Adjust it, then save your candidate.`;scrollTo({top:document.querySelector(".sound-designer").offsetTop-12,behavior:"smooth"})}});
document.getElementById("sound-lab-replay").addEventListener("click",()=>{try{replayLastSound();status.textContent="Replaying the last candidate."}catch(error){status.textContent=error.message}});
document.getElementById("sound-lab-stop").addEventListener("click",()=>{stopDesignerPreview();previewButtons.forEach(button=>button.classList.remove("is-playing"));status.textContent="Sound stopped."});

Object.values(fields).forEach(id=>document.getElementById(id).addEventListener("input",refreshOutputs));
document.getElementById("designer-preview").addEventListener("click",()=>previewDesign());
document.getElementById("designer-stop").addEventListener("click",()=>{stopDesignerPreview();designerStatus.textContent="Preview stopped."});
document.getElementById("designer-save").addEventListener("click",saveCurrentDesign);
document.getElementById("designer-new").addEventListener("click",newDesign);
document.getElementById("designer-wav").addEventListener("click",()=>saveWav());
savedList.addEventListener("click",event=>{const button=event.target.closest("button[data-saved-action]"),card=button?.closest("[data-saved-id]");if(!button||!card)return;const design=savedDesigns.find(item=>item.id===card.dataset.savedId);if(!design)return;const action=button.dataset.savedAction;if(action==="preview")previewDesign(design);if(action==="edit"){editingId=design.id;setForm(design);designerStatus.textContent=`Editing “${design.name}”.`;scrollTo({top:document.querySelector(".sound-designer").offsetTop-12,behavior:"smooth"})}if(action==="wav")saveWav(design);if(action==="delete"&&confirm(`Delete “${design.name}” from this device?`)){savedDesigns=savedDesigns.filter(item=>item.id!==design.id);if(editingId===design.id)editingId=null;persistDesigns();renderSavedDesigns();designerStatus.textContent=`Deleted “${design.name}”.`}});
document.getElementById("designer-export").addEventListener("click",()=>{const backup={format:"MFMA Sound Lab",version:1,exportedAt:new Date().toISOString(),candidates:savedDesigns};downloadBlob(new Blob([JSON.stringify(backup,null,2)],{type:"application/json"}),`MFMA-Sound-Lab-${new Date().toISOString().slice(0,10)}.json`);designerStatus.textContent="Backup exported. Save it to Files or iCloud Drive."});
document.getElementById("designer-import").addEventListener("change",async event=>{const file=event.target.files?.[0];if(!file)return;try{const backup=JSON.parse(await file.text()),items=Array.isArray(backup)?backup:backup.candidates;if(!Array.isArray(items))throw new Error("This is not an MFMA Sound Lab backup.");const imported=items.map(item=>({...normalizeDesignedSound(item),name:String(item.name||"Imported Candidate"),id:String(item.id||globalThis.crypto?.randomUUID?.()||`sound-${Date.now()}-${Math.random()}`),updatedAt:item.updatedAt||new Date().toISOString()}));const byId=new Map(savedDesigns.map(item=>[item.id,item]));imported.forEach(item=>byId.set(item.id,item));savedDesigns=[...byId.values()];persistDesigns();renderSavedDesigns();designerStatus.textContent=`Imported ${imported.length} candidate${imported.length===1?"":"s"}.`}catch(error){designerStatus.textContent=error?.message||"Backup could not be imported."}finally{event.target.value=""}});

onSoundStatus(renderAudioState);
renderAudioState(getSoundStatus());
refreshOutputs();renderSavedDesigns();
