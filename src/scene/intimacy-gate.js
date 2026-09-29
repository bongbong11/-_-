const choice = value => String(value?.choice ?? value ?? '').trim();

export function sceneGateRequest({model,transcript,previous='normal',people=[]}) {
    const messageIds=[...new Set([...String(transcript).matchAll(/^\[(\d+)\] (?:USER|CHARACTER)/gm)].map(match=>match[1]))];
    const questions={
        scene_level:{type:'choice',instructions:'Classify only the CURRENT scene, not the highest intensity in recent history. A past event, proposal, fantasy, OOC instruction, kiss, or sexual tension is not ongoing sexual activity. Choose unclear when the evidence cannot establish a level.',criteria:{'0':'Ordinary scene.','1':'Attraction, desire, or sexual tension in dialogue or thought.','2':'Affectionate contact including kissing, without explicit sexual activity.','3':'Explicit sexual activity has actually begun in this scene.','4':'Explicit sexual activity is currently continuing.','unclear':'Current level cannot be established.'}},
        scene_phase:{type:'choice',instructions:`Previous confirmed route: ${previous}. Classify whether the actual ongoing interaction is active, briefly paused, clearly ended, or ordinary. A pause to talk or rest inside the same interaction is not an ending. Mere absence of description, a location change, or elapsed turns is not enough to end it. A possibility of resuming is not enough to keep a completed scene active. Judge this independently of the level question.`,criteria:{normal:'No sexual activity has begun in the current interaction.',active:'Explicit sexual activity is actually being performed.',paused:'The same sexual interaction is briefly paused for talk, rest, or preparation.',ended:'The activity was completed or the current purpose has shifted to another activity.',unclear:'Insufficient or conflicting evidence.'}},
        scene_evidence:{type:'choice',instructions:'Select the one supplied RP message that best supports the current scene phase and level. Do not cite OOC, an imagined action, or an absent message.',criteria:{none:'No message reliably supports a transition.',...Object.fromEntries(messageIds.map(id=>[id,`RP message [${id}]`]))}},
    };
    for(const [index,person] of people.entries())questions[`scene_participant_${index}`]={type:'choice',instructions:`Is registered ${person.name} actually participating in the current interaction? Do not equate mere mention with participation. Judge this independently of other answers.`,criteria:{yes:'Currently participating.',no:'Absent, mentioned, or only background.',unclear:'Cannot determine.'}};
    return {model,state:{scope:'Classify current scene continuity only. Do not propose actions, character traits, or a new scene.',recent_roleplay:transcript,previous_route:previous,registered_people:people.map(person=>({id:person.id,name:person.name,aliases:person.aliases||[]}))},questions};
}

export function resolveSceneGate(answers,request,previous='normal') {
    const level=choice(answers?.scene_level), phase=choice(answers?.scene_phase), evidence=choice(answers?.scene_evidence);
    const validEvidence=evidence!=='none' && Object.hasOwn(request.questions.scene_evidence.criteria,evidence);
    let route=previous==='paused'?'paused':'normal';
    let transition='';
    if(phase==='active' && ['3','4'].includes(level) && validEvidence) {
        if(route!=='paused')transition='entered';
        route='paused';
    } else if(route==='paused' && phase==='paused' && validEvidence) {
        route='paused';
    } else if(route==='paused' && phase==='ended' && validEvidence && !['3','4'].includes(level)) {
        route='normal';transition='exited';
    }
    const participantIds=[];
    for(const [index,person] of (request.state.registered_people||[]).entries())if(choice(answers?.[`scene_participant_${index}`])==='yes')participantIds.push(person.id);
    return {route,transition,level:['0','1','2','3','4'].includes(level)?Number(level):null,phase,evidence:validEvidence?evidence:null,participantIds};
}
