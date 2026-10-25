export const GPS_DIAGNOSTIC_WINDOW=30;

function validAccuracy(sample){
 const value=Number(sample?.accuracy);
 return Number.isFinite(value)&&value>0?value:null;
}

export function summarizeGpsDiagnostics(samples=[]){
 const accuracies=samples.slice(-GPS_DIAGNOSTIC_WINDOW).map(validAccuracy).filter(value=>value!==null).sort((a,b)=>a-b);
 if(!accuracies.length)return {sampleCount:0,best:null,median:null,worst:null,acceptedCount:0,acceptedPercent:0,ready:false};
 const acceptedCount=accuracies.filter(value=>value<=15).length;
 return {sampleCount:accuracies.length,best:accuracies[0],median:accuracies[Math.floor(accuracies.length/2)],worst:accuracies.at(-1),acceptedCount,acceptedPercent:Math.round(acceptedCount/accuracies.length*100),ready:accuracies.length>=5&&acceptedCount/accuracies.length>=.8};
}
