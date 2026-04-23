import type { VacancyAnalysis } from '../types'

/**
 * A coarse professional archetype that determines how the rewriter should
 * talk about the candidate. Detected deterministically from the vacancy
 * analysis (no extra LLM call) so the pipeline stays cheap and predictable.
 *
 * Keep the set small — each archetype must have a meaningfully different
 * playbook. If a vacancy is ambiguous, return 'other' and fall back to the
 * generic rewrite guidance.
 */
export type RoleArchetype =
  | 'engineering'
  | 'design'
  | 'product'
  | 'marketing'
  | 'data'
  | 'ops'
  | 'other'

export interface ArchetypePlaybook {
  archetype: RoleArchetype
  label: string
  /** One-line description that is injected into the rewrite prompt. */
  summaryAngle: string
  /** Bullet-writing guidance specific to this archetype. */
  bulletStyle: string
  /** Concrete signals an ATS / HR will look for. */
  mustMention: string[]
  /** Phrases / clichés that devalue a resume of this archetype. */
  avoid: string[]
}

const PLAYBOOKS: Record<RoleArchetype, ArchetypePlaybook> = {
  engineering: {
    archetype: 'engineering',
    label: 'Engineering',
    summaryAngle:
      'Engineering seniority + primary stack + domain (web / mobile / data / infra). Mention scale only if supported by facts (users, req/s, data volume).',
    bulletStyle:
      'Start with an action verb (shipped, built, refactored, migrated, automated, optimised). Name the stack / tools inline. Prefer concrete technical scope ("Node.js / Postgres", "iOS / Swift", "Kubernetes / Helm") over vague skills. If a performance / reliability / scale number is in facts, include it.',
    mustMention: [
      'primary language(s) and runtime(s)',
      'frameworks / libraries actually used',
      'data stores / infra / deployment targets',
      'testing / CI practices when present in facts'
    ],
    avoid: [
      'Passive phrases ("was responsible for")',
      'Soft generalities ("worked on various features")',
      'Non-technical buzzwords ("synergised")'
    ]
  },
  design: {
    archetype: 'design',
    label: 'Design',
    summaryAngle:
      'Design craft + product area (web / mobile / B2B SaaS / e-commerce) + process depth (research → wireframes → hi-fi → handoff). Mention accessibility / design-system work when supported.',
    bulletStyle:
      'Frame each bullet as a design outcome with the process behind it (user research, wireframing, prototyping, usability testing, handoff). Name tools inline (Figma, Sketch, Adobe CC) only when facts support them. Mention deliverable type (design system, UI kit, landing page, dashboard, onboarding flow).',
    mustMention: [
      'design tools actually used',
      'process stages the candidate owns (research → test)',
      'deliverables / artefacts shipped',
      'collaboration with engineering / product (handoff, specs)'
    ],
    avoid: [
      'Generic words like "beautiful" or "pixel-perfect" without substance',
      'Claiming user-testing numbers that facts do not contain',
      'Role titles in the skills array ("UI/UX Designer", "Brand Designer")'
    ]
  },
  product: {
    archetype: 'product',
    label: 'Product',
    summaryAngle:
      'Product scope + stage (0→1, growth, platform) + audience (B2B / consumer / internal). Emphasise outcomes over output.',
    bulletStyle:
      'Bullets open with the outcome driven or decision made, followed by what was shipped to achieve it. Mention stakeholders (eng, design, GTM, sales). Reference frameworks / rituals only when facts confirm them (OKRs, RICE, discovery interviews, A/B tests).',
    mustMention: [
      'business metric(s) moved (only if in facts)',
      'customer / user segment addressed',
      'cross-functional leadership (which functions, team size)',
      'roadmap ownership / prioritisation'
    ],
    avoid: [
      'Claiming specific lifts without a number in facts',
      'Ownership overstatement when facts describe a contributor role'
    ]
  },
  marketing: {
    archetype: 'marketing',
    label: 'Marketing / Growth',
    summaryAngle:
      'Growth discipline (performance / content / lifecycle / brand / SEO / social) + channels owned + audience. State seniority clearly.',
    bulletStyle:
      'Bullets name the channel (paid search, paid social, email, organic, content, partnerships), the action taken, and the result. Name tools (GA4, HubSpot, Mailchimp, Meta Ads, Google Ads, Ahrefs) when supported by facts.',
    mustMention: [
      'channels owned / contributed to',
      'campaigns / programmes run',
      'tooling (analytics, MAP, ad platforms) from facts',
      'audience / vertical'
    ],
    avoid: [
      'KPI lifts not traceable to facts',
      'Buzzword stacks ("multi-channel synergistic funnels")'
    ]
  },
  data: {
    archetype: 'data',
    label: 'Data / Analytics',
    summaryAngle:
      'Data focus (analytics / DS / ML / BI) + tools + primary business questions answered. Mention modelling techniques only when used.',
    bulletStyle:
      'Bullets pair a business question or data problem with the technique and tooling used (SQL, Python, dbt, Airflow, scikit-learn, Tableau, Looker, Power BI). State the audience the output served (exec, product, ops).',
    mustMention: [
      'query / modelling language(s)',
      'BI / visualisation tooling from facts',
      'decisions enabled / dashboards shipped',
      'modelling techniques only if facts confirm them'
    ],
    avoid: [
      'Claiming ML when facts show only analytics / reporting',
      'Inventing accuracy / AUC / precision numbers'
    ]
  },
  ops: {
    archetype: 'ops',
    label: 'Operations / Project',
    summaryAngle:
      'Scope of operations or projects managed + team size + methodology (Agile, Scrum, Kanban, Waterfall) when supported.',
    bulletStyle:
      'Bullets describe the process set up or improved, the team coordinated, and the outcome (time, cost, throughput). Mention tools (Jira, Asana, Monday, Confluence, Notion) when supported by facts.',
    mustMention: [
      'team / stakeholder coordination scope',
      'methodology and rituals actually run',
      'tooling used',
      'operational metric improved (only if in facts)'
    ],
    avoid: [
      'Vague coordination language without scope',
      'Claiming certifications (PMP / Scrum Master) not in facts'
    ]
  },
  other: {
    archetype: 'other',
    label: 'General',
    summaryAngle:
      'Role seniority, domain, and key supported capabilities. Mirror the vacancy’s own framing.',
    bulletStyle:
      'Start with an action verb. Name tools and artefacts. Include numbers only when facts support them.',
    mustMention: [
      'domain / seniority',
      'tools actually used (from facts)',
      'clearest outcome supported by facts'
    ],
    avoid: [
      'Passive voice',
      'Unsupported KPIs / percentages'
    ]
  }
}

/** Lower-cased keyword lists per archetype. Match on role title first, then
 * fall back to tools + responsibilities. Keep groups narrow enough that a
 * single strong hit is decisive.
 */
const TITLE_KEYWORDS: Record<Exclude<RoleArchetype, 'other'>, RegExp[]> = {
  engineering: [
    /\bengineer\b/, /\bdeveloper\b/, /\bprogrammer\b/, /\bsoftware\b/,
    /\bback[- ]?end\b/, /\bfront[- ]?end\b/, /\bfull[- ]?stack\b/,
    /\bdevops\b/, /\bsre\b/, /\breliability\b/, /\bqa\b/,
    /\bios\b/, /\bandroid\b/, /\bmobile dev/, /\bembedded\b/,
    /\barchitect\b/, /\bразработчик\b/, /\bинженер\b/, /\bпрограміст\b/,
    /\bрозробник\b/
  ],
  design: [
    /\bdesigner\b/, /\bux\b/, /\bui\b/, /\bux\/ui\b/, /\bui\/ux\b/,
    /\bvisual\b/, /\bbrand\b/, /\bgraphic\b/, /\bproduct designer\b/,
    /\bдизайнер\b/, /\bдизайн\b/
  ],
  product: [
    /\bproduct manager\b/, /\bproduct owner\b/, /\bproduct lead\b/,
    /\bhead of product\b/, /\bpm\b/, /\bпродакт\b/, /\bменеджер продукт/
  ],
  marketing: [
    /\bmarketing\b/, /\bgrowth\b/, /\bseo\b/, /\bsmm\b/, /\bsocial media\b/,
    /\bcontent manager\b/, /\bcopywriter\b/, /\bppc\b/, /\bperformance marketing\b/,
    /\bbrand manager\b/, /\bmarketolog\b/, /\bмаркет/, /\bсмм\b/
  ],
  data: [
    /\bdata analyst\b/, /\bdata scientist\b/, /\bdata engineer\b/,
    /\banalytics\b/, /\bbi\b/, /\bmachine learning\b/, /\bml engineer\b/,
    /\baналітик\b/, /\bаналитик данных\b/, /\bдата инженер\b/
  ],
  ops: [
    /\bproject manager\b/, /\bprogramme manager\b/, /\bprogram manager\b/,
    /\bscrum master\b/, /\bdelivery manager\b/, /\boperations manager\b/,
    /\bпроджект\b/, /\bменеджер проектов\b/, /\bпроєктний менеджер\b/
  ]
}

const TOOL_KEYWORDS: Record<Exclude<RoleArchetype, 'other'>, RegExp[]> = {
  engineering: [
    /\bnode\.?js\b/, /\breact\b/, /\bvue\b/, /\bangular\b/, /\bnext\.?js\b/,
    /\btypescript\b/, /\bjavascript\b/, /\bpython\b/, /\bjava\b/, /\bgolang\b/,
    /\bkotlin\b/, /\bswift\b/, /\bc\+\+\b/, /\bc#\b/, /\b\.net\b/,
    /\bdocker\b/, /\bkubernetes\b/, /\bk8s\b/, /\bterraform\b/,
    /\baws\b/, /\bgcp\b/, /\bazure\b/,
    /\bpostgres\b/, /\bmysql\b/, /\bredis\b/, /\bmongo/
  ],
  design: [
    /\bfigma\b/, /\bsketch\b/, /\badobe xd\b/, /\billustrator\b/, /\bphotoshop\b/,
    /\bindesign\b/, /\bafter effects\b/, /\binvision\b/, /\bwireframe/,
    /\bprototyp/, /\bdesign system\b/, /\bdesign-?system\b/, /\bui kit\b/,
    /\bux research\b/, /\busability\b/
  ],
  product: [
    /\bokrs?\b/, /\brice\b/, /\bdiscovery interview/, /\bproduct discovery\b/,
    /\bjtbd\b/, /\bjobs to be done\b/, /\ba\/b test/, /\bfeature flag/
  ],
  marketing: [
    /\bgoogle ads\b/, /\bmeta ads\b/, /\bfacebook ads\b/, /\bga4\b/,
    /\bgoogle analytics\b/, /\bhubspot\b/, /\bmailchimp\b/, /\bahrefs\b/,
    /\bsemrush\b/, /\bcopy ?writing\b/, /\bemail marketing\b/, /\blifecycle\b/
  ],
  data: [
    /\bsql\b/, /\bdbt\b/, /\bairflow\b/, /\bsnowflake\b/, /\btableau\b/,
    /\blooker\b/, /\bpower ?bi\b/, /\bpandas\b/, /\bscikit\b/, /\btensorflow\b/,
    /\bpytorch\b/, /\bkaggle\b/
  ],
  ops: [
    /\bjira\b/, /\bconfluence\b/, /\basana\b/, /\bmonday\b/, /\btrello\b/,
    /\bscrum\b/, /\bkanban\b/, /\bagile\b/, /\bpmp\b/
  ]
}

const ARCHETYPES_IN_ORDER: Array<Exclude<RoleArchetype, 'other'>> = [
  'engineering',
  'design',
  'product',
  'data',
  'marketing',
  'ops'
]

/**
 * Deterministic archetype detection. Scores each candidate archetype on:
 *   - role title matches (weight 3)
 *   - tool matches (weight 2) — taken from vacancy.tools + vacancy.domainTerms
 *   - responsibility / mustHave phrase matches (weight 1)
 * Returns the top archetype, or 'other' if nothing scores.
 */
export function detectRoleArchetype(vacancy: VacancyAnalysis): RoleArchetype {
  const title = (vacancy.roleTitle || '').toLowerCase()
  const tools = [
    ...(vacancy.tools ?? []),
    ...(vacancy.domainTerms ?? [])
  ]
    .join(' ')
    .toLowerCase()
  const resp = [
    ...(vacancy.responsibilities ?? []),
    ...(vacancy.mustHave ?? []),
    ...(vacancy.preferred ?? [])
  ]
    .join(' ')
    .toLowerCase()

  const scores: Record<Exclude<RoleArchetype, 'other'>, number> = {
    engineering: 0,
    design: 0,
    product: 0,
    marketing: 0,
    data: 0,
    ops: 0
  }

  for (const a of ARCHETYPES_IN_ORDER) {
    for (const rx of TITLE_KEYWORDS[a]) if (rx.test(title)) scores[a] += 3
    for (const rx of TOOL_KEYWORDS[a]) if (rx.test(tools)) scores[a] += 2
    for (const rx of TOOL_KEYWORDS[a]) if (rx.test(resp)) scores[a] += 1
  }

  let best: Exclude<RoleArchetype, 'other'> | null = null
  let bestScore = 0
  for (const a of ARCHETYPES_IN_ORDER) {
    if (scores[a] > bestScore) {
      best = a
      bestScore = scores[a]
    }
  }
  // Require at least one title hit OR two tool hits; otherwise 'other'.
  return best && bestScore >= 2 ? best : 'other'
}

export function playbookFor(archetype: RoleArchetype): ArchetypePlaybook {
  return PLAYBOOKS[archetype]
}

/**
 * The text block injected into the rewrite prompt. Kept compact so it does
 * not displace the existing hard constraints / integration check.
 */
export function archetypeGuidanceBlock(archetype: RoleArchetype): string {
  const p = PLAYBOOKS[archetype]
  return [
    `### ROLE ARCHETYPE: ${p.label}`,
    '',
    `Summary angle: ${p.summaryAngle}`,
    '',
    `Bullet style: ${p.bulletStyle}`,
    '',
    `Must mention (only when supported by facts):`,
    ...p.mustMention.map((m) => `  - ${m}`),
    '',
    `Avoid:`,
    ...p.avoid.map((m) => `  - ${m}`)
  ].join('\n')
}
