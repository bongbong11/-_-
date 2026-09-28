// The prompt text in this file is the wording agreed with the user.
export const PROFILE_SYSTEM = `Convert the supplied character sheet into a small pool of durable RP execution rules.

Do not summarize the biography. Extract only rules that materially affect how this specific person behaves, relates, knows, or speaks.

Avoid stereotypes. Occupation, status, intelligence, age, class, or background must not become a universal personality or speech style. A lawyer does not use legal language in every conversation; a soldier does not frame ordinary life in military terms; expertise appears only when the subject and situation actually call for it.

Use these kinds only:

- \`behavior\`: durable decision, priority, refusal, control, protection, or response tendencies.
- \`relationship\`: behavior that specifically changes toward one person or group.
- \`knowledge\`: bounded knowledge, competence, authority, access, or delegation. Distinguish what the person may know, what they can actually do, and what information or resources they can access. Familiarity does not imply mastery; profession does not imply expertise in every adjacent field.
- \`speech\`: how this person actually communicates. Professional terminology or technical explanation should appear only when relevant to the subject, audience, and this person's habits. Knowledge does not require lecturing or exhaustive explanation.

Infer ordinary lived experience only when it reasonably follows from this person's stated background. Missing sheet detail is not proof of incompetence, but it does not authorize exceptional expertise, credentials, access, or history.

Do not invent hidden facts, exceptional credentials, unusual access, secret history, or current RP state.

Do not store current emotions, current suspicions, recent events, temporary goals, or next-turn actions.

Each rule must:

- contain one main idea;
- be directly usable in an RP prompt;
- remain character-specific;
- normally be one short sentence;
- avoid generic anti-metagaming instructions already applicable to everyone.

Keep only useful rules. A sparse sheet may produce 0–3 items; maximum 10. Zero is valid. Do not fill categories or reach a target count.

Return JSON only:

{
  "items": [
    {
      "id": "c1",
      "kind": "behavior|relationship|knowledge|speech",
      "topic": "short_stable_topic",
      "target": "",
      "rule": "Short English execution rule."
    }
  ]
}

\`target\` is required only for \`relationship\`; otherwise use an empty string.`;

export const CHARACTER_LIVE_SYSTEM = `Select stored rules for this registered person only when they would materially change the NEXT RP response.

Judge necessity from the current RP, this person's actual participation, established relationships and continuity, and the specific issue being handled. A rule is not needed merely because its topic or a similar word appears in the chat.

Choose zero rules when ordinary characterization is sufficient. Choose at most two distinct rule IDs. Do not select a rule to fill a quota, repeat an existing scene instruction, or restate a general rule already supplied by the preset.

A stored rule is a durable character boundary, not proof of this person's current emotion, current knowledge, or next action. Later established RP continuity may change how the rule applies.

Use only supplied IDs. Do not rewrite a rule or create a new one. Keep observation of what has happened separate from a proposal for what this person should do next.`;

export const PROFILE_SELECT = CHARACTER_LIVE_SYSTEM;
export const CONTEXT_SELECT = 'Choose one current or continuity item only if it materially affects this person in the next response. A world fact is not automatically this person\'s knowledge. Choose none when nothing needs emphasis.';
export const DIRECTION_SELECT = 'Choose one character-consistent response direction from the actual scene and legitimate information. This is a proposal, not an established action. Choose none when no extra direction is needed.';
export const ACCESS_INSTRUCTION = `For this person and this specific information, identify the narrowest acquisition route established by the sheet, verified continuity, or RP evidence.

Model-visible material, another person's knowledge, intimacy, intelligence, profession, status, intuition, or a convenient deduction cannot by itself provide access. Preserve the difference between a world fact, a report, a belief, a suspicion, and a past state whose present validity is unknown.`;
export const ACCESS_CHOICES = {
    none: 'No legitimate acquisition route is established. This does not prove permanent ignorance.',
    observed: 'This person directly perceived or experienced it, within actual sensory and attention limits.',
    reported: 'This person was told or received a report. Preserve who reported it, when, and the report\'s uncertainty; hearing a claim does not prove its truth.',
    inferred: 'This person can form a bounded suspicion from accessible clues. Do not turn suspicion into exact hidden knowledge or a confirmed fact.',
    public: 'The information was publicly or ordinarily available to this person at the relevant time.',
    stored_knowledge: 'This exact information was previously established as acquired by this person.',
    profile_supported: 'This person\'s lived experience or role supports general subject knowledge, but not a hidden case-specific fact.',
    private_access: 'Established authority or access supports this exact private information.',
};
export const PRESENCE_CHOICES = {
    absent: 'No meaningful role in the next response.',
    background: 'Present or continuity-relevant, but no independent beat is needed.',
    active: 'A concrete response, choice, action, refusal, concealment, or intervention is warranted.',
};
