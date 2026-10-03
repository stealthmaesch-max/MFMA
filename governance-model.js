export const RULE_VOTE_TYPES={"season-amendment":"Mid-season rule amendment","session-suspension":"Current-session rule suspension"};
export const RULE_VOTE_CHOICES=new Set(["yes","no","abstain"]);

export function evaluateRuleVote(input={}){
 const type=input.type,teamIds=[...new Set(input.eligibleTeamIds||[])],votes=input.votes||{},issues=[];
 if(!RULE_VOTE_TYPES[type])issues.push("Choose a valid motion type.");
 if(!input.ruleReference?.trim())issues.push("Identify the exact Sporting Code rule.");
 if(!input.motion?.trim())issues.push("Record the proposed amendment or suspension.");
 if(!input.rationale?.trim())issues.push("Record the reason for the motion.");
 if(teamIds.length<2)issues.push("Both recognized teams must be included in the roll call.");
 for(const teamId of teamIds){const vote=votes[teamId]||{};if(!vote.representative?.trim())issues.push(`Record the representative for ${vote.teamName||teamId}.`);if(!RULE_VOTE_CHOICES.has(vote.choice))issues.push(`Record a vote for ${vote.teamName||teamId}.`)}
 if(!input.stewardAuthorized)issues.push("MRA Steward authorization is required.");
 if(type==="session-suspension"){
  if(!input.hasActiveSession)issues.push("A rule can be suspended only during an active, paused session.");
  if(!input.sessionPaused)issues.push("Pause the session before conducting the roll call.");
  if(!input.safetyCertified)issues.push("Safety and mandatory signal rules cannot be suspended.");
 }
 const unanimous=teamIds.length>0&&teamIds.every(teamId=>votes[teamId]?.choice==="yes");
 const passed=issues.length===0&&unanimous;
 return {passed,unanimous,issues,status:passed?(type==="session-suspension"?"in-force":"adopted"):"rejected"};
}
