import {RECORDED_BOUNDARY_INFO} from "./course-boundary.js?v=2";
import {distanceToRecordedBoundary} from "./gps-assist.js?v=8";
import {evaluateTrackLimitFix,shouldWarnTrackLimit} from "./track-limits.js?v=4";
import {enableSounds,onSoundStatus,playSupplementalSound,stopSupplementalSound,stopSounds} from "./sounds.js?v=100";
const _=id=>document.getElementById(id);let fix=null,detector={},watch=null,generation=0,previewUntil=0,wasWarning=false,lastAlarmAt=0,wake=null,starting=false;
_("boundary-test-version").textContent=`Active perimeter: ${RECORDED_BOUNDARY_INFO.recordedOn} • ${RECORDED_BOUNDARY_INFO.pointCount} recorded points`;
onSoundStatus(sound=>_("boundary-test-sound").textContent=sound.state==='enabled'?'Sound on':'Sound off • tap Preview warning to enable');
function render(){
 const now=Date.now(),fresh=fix&&now-fix.timestamp<=10000,preview=previewUntil>now,warning=preview||watch!==null&&shouldWarnTrackLimit(detector,fix,now),distance=fix?distanceToRecordedBoundary(fix.latitude,fix.longitude):Infinity;
 _("boundary-test-start").disabled=watch!==null||starting;_("boundary-test-stop").disabled=watch===null&&!preview&&!starting;_("boundary-test-warning").classList.toggle('hidden',!warning);_("boundary-test-warning-label").textContent=preview?'ALARM PREVIEW':'LOCAL GPS TEST';
 _("boundary-test-distance").textContent=Number.isFinite(distance)?`Outside distance ${Math.round(distance)} m`:'Boundary distance —';_("boundary-test-accuracy").textContent=fix?`GPS ±${Math.round(fix.accuracy)} m`:'Accuracy —';_("boundary-test-samples").textContent=`${detector.outsideCount||0} outside fixes`;
 if(watch!==null)_("boundary-test-position").textContent=!fresh?'Waiting for fresh GPS':detector.status==='unavailable'?'GPS accuracy too low':detector.status==='inside'?(distance===0?'Inside recorded boundary':'Near edge • within GPS tolerance'):'Outside recorded boundary';
 if(warning&&(!wasWarning||now-lastAlarmAt>=3000)){lastAlarmAt=now;try{playSupplementalSound('returnCourse')}catch{}}if(!warning){if(wasWarning)stopSupplementalSound("returnCourse");lastAlarmAt=0}wasWarning=warning;
}
async function soundOn(){try{await enableSounds()}catch{_("boundary-test-sound").textContent='Sound unavailable • check browser audio permissions'}}
function stop(message='Test stopped. No reports were sent.'){
 generation++;starting=false;if(watch!==null)navigator.geolocation?.clearWatch(watch);watch=null;fix=null;detector={};previewUntil=0;stopSounds();if(wake){wake.release().catch(()=>{});wake=null}_("boundary-test-position").textContent='GPS not started';_("boundary-test-status").textContent=message;render();
}
_("boundary-test-start").onclick=async()=>{
 if(watch!==null||starting)return;if(!navigator.geolocation){_("boundary-test-status").textContent='Location is unavailable in this browser.';return}starting=true;const token=++generation;render();await soundOn();if(token!==generation||document.hidden){starting=false;render();return}starting=false;fix=null;detector={};previewUntil=0;_("boundary-test-status").textContent='GPS test running. Keep this page open.';
 watch=navigator.geolocation.watchPosition(position=>{if(token!==generation)return;fix={latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,timestamp:position.timestamp};detector=evaluateTrackLimitFix(detector,fix,['course-boundary'],Date.now());render()},error=>{if(token!==generation)return;stop(error.code===1?'Location permission denied. Allow precise location and retry.':'GPS unavailable. Move outdoors and retry.')},{enableHighAccuracy:true,maximumAge:0,timeout:15000});
 try{const lock=await navigator.wakeLock?.request('screen');if(token===generation&&watch!==null&&!document.hidden)wake=lock;else await lock?.release()}catch{}render();
};
_("boundary-test-stop").onclick=()=>stop();_("boundary-test-preview").onclick=async()=>{const token=generation;await soundOn();if(token!==generation||document.hidden)return;previewUntil=Date.now()+4500;wasWarning=false;render()};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop('Paused when the page was hidden. Tap Start GPS test to resume.')});window.addEventListener('pagehide',()=>stop());setInterval(render,250);render();
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js?v=3').catch(()=>{});
