export const ADVANCED_STYLES = {
    conservative: '보수적',
    balanced: '균형',
    active: '적극적',
    very_active: '매우 적극적',
};

export const ADVANCED_ELEMENTS = {
    social: '일상·교류',
    exploration: '탐험·발견',
    objective: '사건·목표',
    investigation: '추리·수사',
    threat: '위협·전투',
    horror: '공포·초자연',
    intrigue: '암투·공작',
    relationship: '관계·치정',
};

export const ADVANCED_DEFAULT_ELEMENTS = Object.keys(ADVANCED_ELEMENTS);

export const BUILTIN_WORLDS = [
    { id: 'current', name: '프리셋 기본 세계관 사용', hint: 'No preset or lorebook text is supplied to Jev here. Infer world constraints only from the recent roleplay and explicitly supplied character context; do not assume unseen world rules. Route progression without adding or replacing setting facts.', prompt: '' },
    { id: 'fantasy', name: '범용 판타지', hint: 'Fantasy world logic; established magic, peoples, institutions, travel, economy, religion, and technology control what is possible.', prompt: `<FANTASY_WORLD>
Use established magic, peoples, institutions, travel, economy, religion, technology, and social order as practical world rules. Do not import unrelated fantasy systems or grant convenient magic, knowledge, access, creatures, or resources without support.
</FANTASY_WORLD>` },
    { id: 'urban-supernatural', name: '현대 판타지·초자연', hint: 'Modern society with setting-supported hidden or public supernatural forces; secrecy, institutions, evidence, and ordinary infrastructure still matter.', prompt: `<URBAN_SUPERNATURAL_WORLD>
Keep supernatural forces consistent with their established visibility, rules, access, costs, and limits inside ordinary modern society. Preserve secrecy, evidence, institutions, technology, law, and public reaction; do not grant convenient occult knowledge or solutions.
</URBAN_SUPERNATURAL_WORLD>` },
    { id: 'science-fiction', name: 'SF·미래', hint: 'Science-fiction setting; established technology, infrastructure, distance, institutions, and material limits govern access and consequences.', prompt: `<SCIENCE_FICTION_WORLD>
Use established technology, infrastructure, distance, resources, institutions, and scientific limits as material constraints. Do not grant unexplained devices, universal access, instant expertise, or convenient technical solutions.
</SCIENCE_FICTION_WORLD>` },
    { id: 'superhero', name: '슈퍼히어로', hint: 'Superhero setting; powers, identities, organizations, law, publicity, collateral effects, and power limitations matter.', prompt: `<SUPERHERO_WORLD>
Keep powers, identities, organizations, law, public knowledge, collateral effects, and technological limits consistent with the active setting. Powers create access and consequences but do not grant unrelated knowledge, effortless solutions, or automatic authority.
</SUPERHERO_WORLD>` },
    { id: 'zombie', name: '좀비·감염', hint: 'Zombie or infection survival; infection, detection, movement, shelter, supplies, groups, and practical survival pressure apply.', prompt: `<ZOMBIE_WORLD>
Keep infection, transmission, detection, movement, injury, and death rules consistent with the established setting. Let noise, population density, routes, shelter, supplies, fatigue, and survivor groups produce practical consequences. Do not invent immunity, easy cures, arbitrary hordes, or guaranteed infection without established cause.
</ZOMBIE_WORLD>` },
    { id: 'post-apocalypse', name: '포스트아포칼립스', hint: 'Post-apocalyptic setting; damaged infrastructure, scarcity, settlement politics, travel, repair, and persistent consequences matter.', prompt: `<POST_APOCALYPTIC_WORLD>
Keep infrastructure, scarcity, travel, communication, repair, settlement politics, and environmental danger consistent with the established collapse. Resources and safety require plausible access and cost; do not create arbitrary deprivation, rescue, or intact services for convenience.
</POST_APOCALYPTIC_WORLD>` },
    { id: 'occult', name: '심령·퇴마', hint: 'Occult haunting and exorcism; manifestations, curses, possession, ritual knowledge, rules, costs, and evidence must remain consistent.', prompt: `<OCCULT_WORLD>
Keep manifestations, possession, curses, rituals, and exorcism bound to consistent causes, signs, access, costs, and limits. Reveal rules through events and evidence; do not grant convenient spiritual knowledge, instant cleansing, or new exceptions merely to resolve the scene.
</OCCULT_WORLD>` },
    { id: 'creature', name: '크리처·괴물', hint: 'Creature or monster setting; senses, ecology, habits, territory, capabilities, limits, and material traces determine encounters.', prompt: `<CREATURE_WORLD>
Keep creatures governed by established senses, ecology, habits, territory, capabilities, and limits. Let traces, access, contact, pursuit, injury, and retreat follow material causes; do not invent perfect tracking, instant weaknesses, or attacks without a route.
</CREATURE_WORLD>` },
    { id: 'historical', name: '시대·역사 배경', hint: 'Historical or period setting; the active era controls technology, communication, travel, institutions, law, custom, medicine, and knowledge.', prompt: `<HISTORICAL_WORLD>
Keep technology, communication, transport, institutions, law, medicine, material life, and social assumptions appropriate to the established place and period. Do not import modern access, language, values, procedures, or knowledge without support.
</HISTORICAL_WORLD>` },
    { id: 'campus', name: '현대 대학·캠퍼스', hint: 'Modern university or campus life; infer the country, institution, academic calendar, and current season from active setting before using local conventions.', prompt: `<MODERN_CAMPUS_WORLD>
Use the established country, institution, year, academic calendar, campus layout, housing, courses, assessment, clubs, sports, finances, and student culture. Infer missing details conservatively from location and date. For US settings, keep semesters or quarters, residence life, Greek life, homecoming, and college-football seasons aligned with the specific school; for UK settings, keep terms, halls or colleges, societies, tutorials, and examination periods aligned with the specific institution. Do not mix national systems, invent elite access, or turn ordinary campus life into a compulsory event. Let classes, assignments, friendships, activities, and routines progress naturally when no larger event is active.
</MODERN_CAMPUS_WORLD>` },
];

const EVENT_TABLES = {
    social: [
        ['세계의 일상 행사', 'A setting-appropriate class, shift, ceremony, market, performance, meal, training session, or gathering becomes immediately available.', 'Participate, observe, prepare, or decline without turning the activity into compulsory conflict.', 'The activity has timing, etiquette, access, or another participant\'s interest.', 'Let one ordinary world activity begin or materially move forward; use it to expose lived culture or character choices rather than filler.', 'ensemble'],
        ['뜻밖의 좋은 기회', 'A plausible invitation, opening, favor, reward, or welcome contact reaches the scene.', 'Decide how to use or answer the opportunity.', 'The benefit has a concrete limit, timing, obligation, or tradeoff.', 'Offer one genuinely favorable development grounded in the setting. Do not convert it into automatic success or romance.', 'major'],
        ['공동 활동의 변화', 'An ongoing routine, lesson, duty, celebration, or social occasion changes through another participant\'s decision.', 'Respond to the changed activity or social expectation.', 'Ignoring it changes access, reputation, comfort, or the next exchange.', 'Move a shared activity through one concrete change with distinct reactions rather than a generic crowd response.', 'ensemble'],
        ['공공장소의 작은 소동', 'A proportionate accident, misunderstanding, performance, dispute, or practical need draws local attention.', 'Choose whether and how to become involved.', 'Intervention and nonintervention have different small consequences.', 'Introduce one bounded social disturbance that fits the place and can resolve without becoming a major crisis.', 'group'],
    ],
    exploration: [
        ['새로운 접근 경로', 'A route, entrance, vehicle, guide, clearance, or change in conditions opens access to an established place or objective.', 'Choose whether and how to use the access.', 'The route carries a cost, limit, exposure, or timing condition.', 'Open one setting-valid route and make its practical conditions matter. Do not teleport participants or erase established barriers.', 'group'],
        ['목표와 연결된 발견', 'A location, object, trace, record, or resource connects to an active interest.', 'Examine, recover, use, or leave the discovery.', 'Time, ownership, safety, uncertainty, or competing access limits the choice.', 'Reveal one actionable discovery with a concrete use and one unresolved implication.', 'none'],
        ['환경 변화', 'Weather, terrain, infrastructure, magic, technology, or local activity changes the usable space.', 'Adapt the route, timing, equipment, or immediate plan.', 'The change creates different costs rather than a single forced answer.', 'Make one environmental change alter access or perception without replacing the current objective.', 'group'],
        ['금지되거나 잊힌 구역', 'An established boundary, neglected section, hidden facility, sealed room, or culturally restricted place becomes relevant.', 'Find legitimate access, risk intrusion, gather information, or withdraw.', 'Authority, danger, evidence, or local rules make entry consequential.', 'Present one explorable place through concrete access and consequence, not a decorative lore dump.', 'gatekeeper'],
    ],
    objective: [
        ['조건이 붙은 의뢰', 'A person or institution with a plausible reason presents a concrete request, duty, or opportunity.', 'Accept, negotiate, refuse, delegate, or pursue an alternative.', 'The objective has a specific stake, limit, and consequence for refusal.', 'Introduce one objective through an interested actor, not a game interface. Leave participation and method unresolved for {{user}}.', 'major'],
        ['돌발 사고와 대응', 'A setting-valid failure, collision, loss, disappearance, breakdown, or public incident affects the current area.', 'Stabilize, investigate, exploit, report, or leave the situation.', 'Delay changes harm, evidence, access, or responsibility.', 'Cause one concrete incident with an identifiable immediate effect and response window. Do not predetermine {{user}}\'s involvement.', 'group'],
        ['기존 목표의 조건 변화', 'New information, a deadline, a missing resource, or another party changes an active objective.', 'Revise the plan or accept the new cost.', 'The prior approach remains possible only with a new limitation.', 'Change one condition of the active objective without discarding its prior progress.', 'ensemble'],
        ['회수·호송·구조 필요', 'A person, object, message, or resource must reach safety or a destination for a setting-supported reason.', 'Secure access and carry out the first necessary step.', 'Movement exposes a route, duty, rival claim, or practical vulnerability.', 'Create one bounded recovery, escort, delivery, or rescue objective with a clear completion condition.', 'group'],
    ],
    investigation: [
        ['핵심 모순', 'Two established facts, statements, records, or physical traces cannot both be complete.', 'Test which part is false, missing, or misunderstood.', 'The relevant source may change behavior or restrict access.', 'Expose one precise actionable contradiction without supplying the final answer.', 'ensemble'],
        ['사라질 수 있는 증거', 'A relevant trace, record, witness, object, or location is at credible risk of alteration or loss.', 'Preserve, document, follow, or prioritize the evidence.', 'Only part of the available information can be secured in time.', 'Put one clue at concrete risk and preserve what is missed; do not invent a solution after the fact.', 'witness'],
        ['조건부 증언', 'A person with limited relevant knowledge has a reason to fear, bargain, lie, or withhold.', 'Meet the condition, verify another way, pressure, protect, or leave.', 'Each approach changes trust, accuracy, and future access.', 'Use a bounded witness whose knowledge has a source and gaps. One disclosure may narrow the truth without resolving it.', 'major'],
        ['용의자·이해관계자의 선제 행동', 'Someone who notices the inquiry protects an interest through a plausible move.', 'Identify, intercept, interpret, or respond to the move.', 'Delay changes evidence, access, reputation, or another person\'s safety.', 'Let an interested party take one non-omniscient preemptive action and show its trace or consequence without confirming guilt.', 'major'],
    ],
    threat: [
        ['안전선 침범', 'A person, force, hazard, or established threat gains a plausible route into a place treated as safe.', 'Recognize and answer the breach.', 'The first response changes position, exposure, injury, or control of the space.', 'Break apparent safety through one concrete causal route. Execute contact or attack only at the selected move intensity.', 'threat'],
        ['추적과 차단', 'An interested opponent or danger follows an established trace, route, signal, obligation, or exposure.', 'Evade, confront, misdirect, negotiate, or reach safety.', 'Distance, terrain, equipment, witnesses, and prior losses constrain both sides.', 'Turn pursuit into one readable change of position or access; do not grant perfect tracking or escape.', 'threat'],
        ['적대적 접촉', 'A setting-valid opponent, patrol, rival, unit, or dangerous party crosses the current objective.', 'Identify intentions and make the first response.', 'Misreading the contact affects safety, mission, information, or reputation.', 'Introduce one hostile or uncertain contact with practical access and a concrete immediate demand or action.', 'group'],
        ['전장의 조건 변화', 'Terrain, command, supply, reinforcement, civilian movement, equipment, or visibility changes an active confrontation.', 'Adapt tactics, position, priorities, or retreat.', 'No side can preserve every objective and resource.', 'Change one combat condition and make participants act on it; preserve position, capability, fatigue, and injury.', 'group'],
    ],
    horror: [
        ['규칙을 드러내는 징후', 'A sensory, physical, behavioral, or documentary sign follows the selected world\'s threat logic.', 'Notice, misread, test, avoid, or investigate it.', 'The sign is actionable but does not explain the complete threat.', 'Introduce one concrete sign that narrows how the threat operates. Do not repeat generic unease or reveal the full answer.', 'threat'],
        ['직접 접촉', 'An established or newly generated threat obtains a plausible line of contact.', 'Respond to its immediate behavior or effect.', 'Access, knowledge, distance, and the threat\'s limits determine what it can do.', 'Make the threat materially contact the scene without granting omniscience, arbitrary power, or automatic defeat.', 'threat'],
        ['감염·빙의·저주의 발현', 'A previously available exposure, condition, object, place, or rule produces a bodily or behavioral effect.', 'Recognize, contain, conceal, investigate, or seek help.', 'Time, uncertainty, stigma, danger, or incomplete knowledge complicates response.', 'Manifest one setting-supported effect from an established or newly introduced cause; keep agency, responsibility, and physical limits intact.', 'major'],
        ['추적자·살인자의 접근', 'A human or humanlike pursuer gains access through observation, routine, betrayal, records, or a physical route.', 'Detect, evade, confront, protect, or misdirect.', 'The pursuer has limited knowledge, ability, time, and risk.', 'Advance stalking or pursuit through a plausible access point. Do not use teleportation, omniscience, or endless warnings instead of action.', 'threat'],
        ['퇴마·봉쇄의 조건', 'Evidence reveals a possible ritual, prohibition, weakness, containment method, or required specialist.', 'Verify and prepare the method or reject it.', 'Knowledge, materials, authority, timing, risk, or sacrifice limits execution.', 'Reveal one incomplete but testable response condition; do not grant instant cleansing or a convenient final solution.', 'gatekeeper'],
    ],
    intrigue: [
        ['선별된 정보 유출', 'An actor releases a true, altered, or incomplete piece of information to change leverage.', 'Trace, counter, exploit, verify, or endure the reaction.', 'The source risks exposure and the audience has independent interests.', 'Advance one scheme through a selective leak with a target, audience, and plausible access. Keep private knowledge bounded.', 'ensemble'],
        ['조건부 거래와 회유', 'An actor offers access, protection, office, money, silence, or allegiance for a concrete price.', 'Accept, counter, expose, refuse, or seek another route.', 'Every answer changes at least one alliance, obligation, or exposure.', 'Make one strategic offer alter leverage without guaranteeing loyalty or success.', 'major'],
        ['이간·누명·희생양', 'An actor redirects blame or suspicion through a prepared discrepancy, witness, record, rumor, or procedural move.', 'Test, resist, exploit, or redirect the claim.', 'Public response and institutional procedure can outpace the truth.', 'Execute one bounded framing or division tactic with evidence that can be challenged; do not make everyone credulous.', 'ensemble'],
        ['절차와 권한을 이용한 압박', 'A faction uses office, law, custom, schedule, command, or access rules against a target.', 'Comply, appeal, bargain, bypass, or openly resist.', 'Each route changes standing, time, resources, or exposure.', 'Turn established authority into one concrete restriction or demand rather than abstract political atmosphere.', 'group'],
        ['역공작과 충성 시험', 'A faction tests loyalty or feeds controlled information to identify a leak, rival, or uncertain ally.', 'Recognize, participate, refuse, or counter the test.', 'The test can damage trust even when its premise is wrong.', 'Advance one counter-scheme through limited information and separate motives; no group mind or omniscient mastermind.', 'ensemble'],
    ],
    relationship: [
        ['경쟁자의 현실적 개입', 'A person with an established or plausible relationship interest enters through ordinary access.', 'Respond to the changed social pressure without predetermining anyone\'s feelings.', 'Attention, history, status, secrecy, or obligation creates competing incentives.', 'Use one relationship rival or competing claim as external pressure. Do not manufacture love, jealousy, or possession without support.', 'major'],
        ['숨긴 관계·사실의 노출 위험', 'A witness, schedule, object, message, public event, or institutional rule can reveal a relevant relationship fact.', 'Conceal, explain, disclose, redirect, or accept exposure.', 'Every response changes trust, reputation, access, or obligation.', 'Create one evidence-based exposure risk; do not use impossible intuition or automatic public knowledge.', 'ensemble'],
        ['가문·조직·사회적 의무', 'A family, faction, workplace, school, title, contract, or custom places a concrete demand on a relationship.', 'Negotiate priorities, comply, refuse, delay, or find another arrangement.', 'The demand has real authority or consequence but cannot decide {{user}}\'s response.', 'Apply one external obligation that pressures the relationship without substituting social convention for genuine emotion.', 'group'],
        ['관계 선택이 필요한 상황', 'Established conduct creates a moment where one participant must state or enact a boundary, priority, claim, refusal, or commitment.', 'Let the non-user character make their supported move and leave {{user}}\'s answer open.', 'Avoidance, candor, and refusal carry different immediate consequences.', 'Create one concrete relationship pressure point without forcing reciprocity, reconciliation, rupture, or a new status.', 'major'],
    ],
};

const MOVE_PROMPTS = {
    quiet: '',
    seed: 'Introduce only the first concrete sign, opportunity, or pressure. Let it affect perception or immediate choice without forcing full engagement.',
    advance: 'Advance one causal step through an actual action, decision, access change, or consequence.',
    obstacle: 'Apply one relevant obstacle or cost that changes the available approach without replacing the active objective.',
    reveal: 'Reveal one limited actionable fact. Preserve remaining uncertainty and do not explain the whole situation.',
    contact: 'Bring the active person, group, force, or threat into material contact through established access and limits.',
    attack: 'Execute one readable attack or direct hostile action with position, means, perception, defense, and consequences; do not dictate {{user}}\'s response.',
    aftermath: 'Carry one concrete result into injuries, resources, access, reputation, relationships, location, or the next available action.',
};

const CAST_PROFILES = {
    major: [
        ['주요 인물', 'pursue a concrete personal objective', 'a specific stake can change their position', 'bounded competence and access'],
        ['핵심 관계자', 'control a decision, fact, resource, or obligation', 'their standing or responsibility is exposed', 'knowledge limited by role and experience'],
    ],
    ensemble: [
        ['장면 앙상블', 'three compact participants with different immediate interests', 'alliances and public reactions may shift', 'only the one or two causally relevant people act at length'],
        ['이해관계자 묶음', 'several participants pursue separate gains, fears, or duties', 'their choices affect one another', 'no group mind, equal-airtime list, or shared hidden knowledge'],
    ],
    group: [
        ['기능 집단', 'act toward one shared operational purpose', 'morale, orders, resources, or cohesion can change', 'use a spokesperson only when dialogue is needed'],
        ['소규모 조직 단위', 'carry out a bounded institutional, social, or tactical function', 'authority and coordination have practical limits', 'do not create full profiles for every member'],
    ],
    crowd: [
        ['군중·엑스트라', 'supply lived population, public pressure, movement, or witnesses', 'reactions divide into a majority, minority, and occasional outlier', 'no individual backstories or persistent profiles'],
        ['배경 인원', 'make the place socially occupied and responsive', 'density and movement affect access or attention', 'keep them brief and discard after the scene'],
    ],
    gatekeeper: [
        ['접근 통제자', 'control entry, permission, procedure, or specialist knowledge', 'a rule, price, duty, fear, or interest can change access', 'never become a convenient complete solution'],
    ],
    witness: [
        ['제한된 목격자', 'contribute one sourced observation', 'fear, bias, loyalty, or incomplete perception affects disclosure', 'do not infer private or offscreen facts'],
    ],
    threat: [
        ['위협 존재', 'pursue a concrete drive through setting-valid access', 'loss, risk, hunger, territory, duty, ideology, or fixation sustains action', 'senses, knowledge, ability, and movement remain limited'],
    ],
};

function pick(list, random = Math.random) {
    return list[Math.floor(random() * list.length)];
}

export function advancedChance(style) {
    return { conservative: 18, balanced: 35, active: 58, very_active: 75 }[style] || 35;
}

export function rollAdvancedEvent(element, { random = Math.random, worldId = 'current', worldName = '현재 설정 따름', supernatural = false } = {}) {
    const sourceTable = EVENT_TABLES[element] || EVENT_TABLES.objective;
    const allowsSupernatural = supernatural || ['fantasy', 'urban-supernatural', 'occult'].includes(worldId);
    const table = element === 'horror' && !allowsSupernatural
        ? sourceTable.filter((_, index) => ![2, 4].includes(index)) : sourceTable;
    const [title, trigger, goal, pressure, prompt, cast] = pick(table, random);
    return {
        id: `advanced-event-${Date.now()}-${Math.floor(random() * 10000)}`,
        source: 'advanced',
        worldId,
        worldName,
        element,
        title,
        trigger,
        goal,
        pressure,
        resolution: 'The event ends only after its concrete objective produces an established result or the user ends it.',
        prompt,
        cast,
        status: 'active',
        createdAt: new Date().toISOString(),
    };
}

export function rollAdvancedEntity(event, { random = Math.random, existing = [] } = {}) {
    if (!event || event.cast === 'none') return { entity: null, reused: false };
    const candidates = existing.filter((item) => item.worldId === event.worldId && (item.element === event.element || item.form === event.cast));
    if (candidates.length && random() < 0.68) {
        const entity = { ...pick(candidates, random), lastUsedAt: new Date().toISOString() };
        return { entity, reused: true };
    }
    const [label, purpose, stake, constraint] = pick(CAST_PROFILES[event.cast] || CAST_PROFILES.group, random);
    const entity = {
        id: `advanced-entity-${Date.now()}-${Math.floor(random() * 10000)}`,
        worldId: event.worldId,
        element: event.element,
        form: event.cast,
        label,
        purpose,
        stake,
        constraint,
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
    };
    return { entity, reused: false };
}

export function buildAdvancedQuestions({ preferences, hasEvent = false, worldHint = '', eventTitle = '', eventElement = '' }) {
    if (!preferences.advancedEnabled) return {};
    const enabled = Array.isArray(preferences.advancedElements) && preferences.advancedElements.length
        ? preferences.advancedElements.filter((key) => ADVANCED_ELEMENTS[key])
        : ADVANCED_DEFAULT_ELEMENTS;
    const elementCriteria = { none: 'No enabled element should be used in this response.' };
    for (const key of enabled) elementCriteria[key] = `${ADVANCED_ELEMENTS[key]} is the single best fit for the available causal route and current scene.`;
    if (hasEvent && ADVANCED_ELEMENTS[eventElement] && !elementCriteria[eventElement]) {
        elementCriteria[eventElement] = `${ADVANCED_ELEMENTS[eventElement]} is the stored primary event's fixed element; it may continue even if new events of this element are now disabled.`;
    }
    return {
        advanced_entry: {
            type: 'choice',
            instructions: "Judge whether the selected world's rules and the actual scene permit an advanced development. Explicit foreshadowing is not required: location, ordinary chance, a faction's access, an earlier consequence, or a world condition may provide a plausible route. Apparent safety does not guarantee immunity. Reject a route when world compatibility, physical access, causal opportunity, or scene capacity is genuinely absent. This question identifies eligibility, not an event that has already occurred.",
            criteria: {
                closed: 'No setting-valid cause, access route, or scene capacity exists for a new advanced development.',
                latent: 'The scene looks calm or focused elsewhere, but a setting-valid event could enter through a concrete world, location, faction, consequence, or chance route.',
                open: 'Exploration, an active event, danger, inquiry, faction movement, or another immediate cause directly supports advanced progression now.',
            },
        },
        advanced_route: {
            type: 'choice',
            instructions: `If a stored advanced event exists, decide whether it should take one concrete step now or remain stored without an injection. If none exists, choose create only when the entry is eligible and the scene has room; creation still requires the configured probability roll. A failed roll does not forbid an independent direct response or progress within another established thread. Do not silently replace or finish a stored event. ${hasEvent ? `Stored event: ${eventTitle}.` : 'No stored event exists.'}`,
            criteria: {
                none: 'Use no advanced event instruction this response.',
                continue: hasEvent ? 'The stored event should materially act, develop, or produce a consequence now.' : 'Do not select: no stored event exists.',
                create: hasEvent ? 'Do not select: a stored event already exists.' : 'A new event is causally eligible and the scene has room for the configured probability roll.',
            },
        },
        advanced_cause: {
            type: 'choice',
            instructions: 'Identify the narrowest causal route supporting the selected advanced route. Select none when no advanced route is used.',
            criteria: {
                none: 'No advanced route is used or no causal basis exists.',
                existing: 'An active goal, event, threat, clue, relationship pressure, or unresolved thread already supplies the cause.',
                world: 'A persistent rule or ordinary condition of the selected world supplies the cause.',
                location: 'The current place, route, access point, environment, schedule, or material condition supplies the cause.',
                faction: 'A person, organization, institution, group, or opponent has motive and access to act.',
                consequence: 'An earlier choice, delay, exposure, promise, injury, loss, or success now produces a result.',
                chance: 'An ordinary chance encounter or accident is plausible here without importing a new world rule.',
            },
        },
        advanced_element: {
            type: 'choice',
            instructions: `For a new event, choose at most one enabled content element from the current scene and selected world. When continuing the stored event, keep its fixed element${hasEvent && ADVANCED_ELEMENTS[eventElement] ? ` (${ADVANCED_ELEMENTS[eventElement]})` : ''}. The choice controls event material, not prose genre or preset atmosphere. Ignore the saved basic RP progression type while advanced progression is enabled.`,
            criteria: elementCriteria,
        },
        advanced_move: {
            type: 'choice',
            instructions: 'Choose one bounded step for the selected event. A seed is a concrete first sign, not a full attack. Contact and attack require actual means, access, and opportunity. An executed cause may require an aftermath even when no new threat enters. Keep the selected move proportionate to the current scene and leave unresolved USER participation open.',
            criteria: {
                quiet: 'Keep the event or world activity stored without an advanced injection this response.',
                seed: 'Introduce only a first concrete sign, opportunity, or pressure.',
                advance: 'Move the active matter one causal step through action or changed access.',
                obstacle: 'Apply one relevant cost, obstruction, or complication.',
                reveal: 'Provide one limited actionable fact or discovery.',
                contact: 'Bring the relevant person, group, force, or threat into material contact.',
                attack: 'A direct hostile action has plausible access, means, and immediate opportunity.',
                aftermath: 'An already executed action now requires a concrete result or consequence.',
            },
        },
    };
}

export function buildAdvancedInjection({ decisions, eventProfile }) {
    if (!eventProfile || !['create', 'continue'].includes(decisions.advanced_route)) return '';
    const move = decisions.advanced_move || 'advance';
    if (move === 'quiet') return '';
    const lines = [
        eventProfile.prompt,
        MOVE_PROMPTS[move] || MOVE_PROMPTS.advance,
    ];
    const entity = eventProfile.entity;
    if (entity && ['contact','attack','advance','obstacle'].includes(move)) lines.push(`Cast form: ${entity.form}. Purpose: ${entity.purpose}. Stake: ${entity.stake}. Constraint: ${entity.constraint}.`);
    return `<ADVANCED_PROGRESSION element="${eventProfile.element}" move="${move}" cause="${decisions.advanced_cause || 'existing'}">
${lines.join('\n')}
</ADVANCED_PROGRESSION>`;
}
