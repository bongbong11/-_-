import { STATE_OPEN, STATE_CLOSE, extractStateBlock } from './state-contract.js';

export function mainOutputStatePrompt(roster) {
    if (!roster.length) return '';
    const people = roster.map(person => `${person.code}=${person.name}${person.trackArousal ? ' (a,c,moods)' : ' (moods only)'}`).join('; ');
    return `<SCENE_READER_STATE_CAPTURE>\nAfter the IC reply append machine metadata: ${STATE_OPEN}CODE|a38|c60|anger25@Name${STATE_CLOSE}. One line per person who actually speaks, acts, or has a viewpoint: ${people}. Replace the example with actual 0–100 values. a=sexual arousal, c=self-control; include both only for a,c people. Other fields: anger, joy, fear, sadness; omit zero moods. @Name is optional per feeling and only when its target is clear, even offscene. Never default to the user. If no listed person participates, omit the block. No prose after it. Percentages do not establish action, consent, or relationship change.\n</SCENE_READER_STATE_CAPTURE>`;
}

export function collectMainOutputState(raw, roster) {
    return extractStateBlock(raw, roster);
}
