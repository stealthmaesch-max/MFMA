import {enableSounds,getSoundStatus,onSoundStatus,playSound,replayLastSound,stopSounds} from "./sounds.js?v=94";

const enableButton=document.getElementById("sound-lab-enable");
const status=document.getElementById("sound-lab-status");
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
