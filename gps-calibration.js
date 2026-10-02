const EARTH_METRES=6371000;

function validSample(sample){
 return Number.isFinite(sample?.latitude)&&Number.isFinite(sample?.longitude)&&Number.isFinite(sample?.accuracy)&&sample.accuracy>0;
}

export function distanceMetres(a,b){
 const lat1=a.latitude*Math.PI/180,lat2=b.latitude*Math.PI/180,dLat=lat2-lat1,dLon=(b.longitude-a.longitude)*Math.PI/180;
 const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
 return 2*EARTH_METRES*Math.asin(Math.min(1,Math.sqrt(h)));
}

export function summarizeCalibrationSamples(samples){
 const usable=(samples||[]).filter(validSample).slice(-20);
 if(!usable.length)return {sampleCount:0,ready:false,stationary:false};
 let weightSum=0,latitude=0,longitude=0;
 for(const sample of usable){const weight=1/Math.max(3,sample.accuracy)**2;weightSum+=weight;latitude+=sample.latitude*weight;longitude+=sample.longitude*weight}
 const center={latitude:latitude/weightSum,longitude:longitude/weightSum};
 const accuracies=usable.map(sample=>sample.accuracy).sort((a,b)=>a-b),accuracy=accuracies[Math.floor(accuracies.length/2)],spread=Math.max(...usable.map(sample=>distanceMetres(center,sample))),moving=usable.some(sample=>Number.isFinite(sample.speed)&&sample.speed>1.5),stationary=!moving&&spread<=12;
 return {...center,accuracy,spread,sampleCount:usable.length,stationary,ready:usable.length>=5&&stationary&&accuracy<=50,quality:accuracy<=15?"precise":accuracy<=35?"approximate":"poor",startedAt:usable[0].timestamp||null,endedAt:usable.at(-1).timestamp||null};
}

export function calibrationExport(points){
 return {schema:"mfma-gps-calibration-v1",exportedAt:new Date().toISOString(),pointCount:(points||[]).length,points:points||[]};
}
