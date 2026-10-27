import {enableSounds,getSoundStatus,onSoundStatus,playSound,replayLastSound,soundDefinitions,soundLabels,stopSounds} from "./sounds.js?v=95";

const enableButton=document.getElementById("sound-lab-enable");
const status=document.getElementById("sound-lab-status");
document.getElementById("sound-lab-grid").innerHTML=Object.keys(soundDefinitions).map((name,index)=>`<button type="button" data-preview-sound="${name}"><span>${String(index+1).padStart(2,"0")}</span><strong>${soundLabels[name]||name.replace(/([A-Z])/g," $1")}</strong><small>${soundDefinitions[name].description||"Production sound"}</small></button>`).join("");
const previewButtons=[...document.querySelectorAll("[data-preview-sound]")];

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
  playSound(button.dataset.previewSound);
  previewButtons.forEach(candidate=>candidate.classList.toggle("is-playing",candidate===button));
  status.textContent=`Playing ${button.querySelector("strong").textContent}.`;
 }catch(error){status.textContent=error?.message||"Tap Enable Audio first."}
}));
document.getElementById("sound-lab-replay").addEventListener("click",()=>{try{replayLastSound();status.textContent="Replaying the last candidate."}catch(error){status.textContent=error.message}});
document.getElementById("sound-lab-stop").addEventListener("click",()=>{stopSounds();previewButtons.forEach(button=>button.classList.remove("is-playing"));status.textContent="Sound stopped."});

onSoundStatus(renderAudioState);
renderAudioState(getSoundStatus());
