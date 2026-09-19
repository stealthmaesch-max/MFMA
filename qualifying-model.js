export const QUALIFYING_TRACKS={short:"Short",medium:"Medium",long:"Long"};

export function qualifyingTime(qualifying={},now=Date.now()){
 const elapsed=Math.max(0,Number(qualifying.elapsedMs)||0);
 return qualifying.running?elapsed+Math.max(0,now-(qualifying.lastTickAt||now)):elapsed;
}

export function rankedQualifyingLaps(laps={}){
 return Object.entries(laps||{}).map(([id,lap])=>({id,...lap,timeMs:Number(lap?.timeMs)||0})).filter(lap=>lap.status!=="invalid"&&lap.timeMs>0).sort((a,b)=>a.timeMs-b.timeMs||a.recordedAt-b.recordedAt);
}

export function fastestQualifyingLap(laps={}){return rankedQualifyingLaps(laps)[0]||null}
