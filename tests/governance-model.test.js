import test from "node:test";
import assert from "node:assert/strict";
import {evaluateRuleVote} from "../governance-model.js";

const base={type:"season-amendment",ruleReference:"Article 8.2",motion:"Replace the current procedure.",rationale:"Clarify competition administration.",eligibleTeamIds:["monarch","parakeet"],votes:{monarch:{teamName:"Monarch",representative:"Representative A",choice:"yes"},parakeet:{teamName:"Parakeet",representative:"Representative B",choice:"yes"}},stewardAuthorized:true};

test("a mid-season amendment requires a unanimous authorized roll call",()=>{const result=evaluateRuleVote(base);assert.equal(result.passed,true);assert.equal(result.status,"adopted")});
test("no or abstain votes reject a motion while preserving a valid record",()=>{const result=evaluateRuleVote({...base,votes:{...base.votes,parakeet:{...base.votes.parakeet,choice:"abstain"}}});assert.equal(result.passed,false);assert.equal(result.status,"rejected");assert.equal(result.issues.length,0)});
test("a session suspension requires a paused session and safety certification",()=>{const result=evaluateRuleVote({...base,type:"session-suspension",hasActiveSession:true,sessionPaused:true,safetyCertified:true});assert.equal(result.passed,true);assert.equal(result.status,"in-force");const unsafe=evaluateRuleVote({...base,type:"session-suspension",hasActiveSession:true,sessionPaused:false,safetyCertified:false});assert.equal(unsafe.passed,false);assert.match(unsafe.issues.join(" "),/Pause the session/);assert.match(unsafe.issues.join(" "),/Safety/)});
