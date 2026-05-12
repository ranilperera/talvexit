import type { GenerateScopeInput } from '@onys/shared';

// ─── Price guidance by domain ─────────────────────────────────────────────────

const DOMAIN_PRICE_GUIDANCE: Record<string, string> = {
  FIREWALL:       'AUD 400–2,000 typical range. $950 for policy review + hardening.',
  NETWORKING:     'AUD 500–3,000. Complexity varies enormously with network size.',
  DATABASE:       'AUD 600–4,000. Performance tuning and migrations at the higher end.',
  CLOUD_AZURE:    'AUD 800–5,000. Landing zones and enterprise migrations at top.',
  LINUX:          'AUD 300–1,500. Server hardening and automation tasks.',
  WINDOWS_ADMIN:  'AUD 300–1,500. AD, GPO, and server administration.',
  CYBERSECURITY:  'AUD 1,500–8,000. Pen tests and compliance audits at the higher end.',
  DEVOPS:         'AUD 800–4,000. CI/CD pipelines and IaC.',
  STORAGE:        'AUD 500–3,000. NAS/SAN migrations and backup configuration.',
  VIRTUALIZATION: 'AUD 600–2,500. VMware and Hyper-V tasks.',
  OFFICE_365:     'AUD 300–1,200. Tenant migrations and security configuration.',
  BACKUP:         'AUD 400–1,800. Backup solution design and implementation.',
  AI_INTEGRATION: 'AUD 1,000–6,000. Model integration and data pipelines.',
  SYSTEM_ADMIN:   'AUD 300–2,000. General sysadmin tasks.',
};

// ─── buildFullScopePrompt ─────────────────────────────────────────────────────

export function buildFullScopePrompt(
  input: GenerateScopeInput & {
    currency?: string;
  },
): { system: string; user: string } {
  const domainHint = input.domain_hint ?? 'UNKNOWN';
  const priceGuidance =
    DOMAIN_PRICE_GUIDANCE[domainHint] ?? 'AUD 400–2,000 typical range.';

  const ctx = input.context ?? {};

  const system = `You are an expert IT project scoper for onys.online, a professional IT services marketplace operating in Australia. Your role is to take a customer's natural language requirement and produce a precise, professional, commercially realistic scope document.

OUTPUT RULES — CRITICAL:
1. Return ONLY valid JSON. No preamble, no explanation, no markdown code fences.
2. The JSON must exactly match this structure with these exact field names.
3. All string values must be professional and specific — no vague language.
4. Prices are suggestions only. The expert will adjust based on their own judgement.

REQUIRED JSON STRUCTURE:
{
  "title": "string — 10 to 120 chars, specific and professional",
  "domain": "one of: FIREWALL|NETWORKING|DATABASE|CLOUD_AZURE|LINUX|WINDOWS_ADMIN|CYBERSECURITY|DEVOPS|STORAGE|VIRTUALIZATION|OFFICE_365|BACKUP|AI_INTEGRATION|SYSTEM_ADMIN",
  "objective": "string — 50+ chars. One paragraph describing the measurable outcome.",
  "in_scope": ["array of 3–8 specific activities that WILL be performed"],
  "out_of_scope": ["array of 3–6 items explicitly NOT included — prevents scope creep"],
  "assumptions": ["array of 2–5 conditions the customer must satisfy for work to proceed"],
  "prerequisites": ["array of 0–4 items the customer must provide before work begins"],
  "deliverables": ["array of 2–5 concrete, verifiable outputs the customer will receive"],
  "currency": "AUD",
  "price": number — positive integer, minimum 50, realistic for this domain and scope,
  "hours_min": integer between 1 and 160,
  "hours_max": integer between 1 and 160 and >= hours_min,
  "milestone_count": 1
}

PRICING GUIDANCE for ${domainHint}: ${priceGuidance}
IMPORTANT: Price is a starting point suggestion. The expert will review and adjust.`;

  const userParts: string[] = [
    `Customer requirement:\n${input.requirement_text}`,
  ];

  if (ctx.os) userParts.push(`Operating system / platform: ${ctx.os}`);
  if (ctx.tools) userParts.push(`Existing tools / software: ${ctx.tools}`);
  if (ctx.environment) userParts.push(`Environment details: ${ctx.environment}`);
  if (ctx.constraints) userParts.push(`Constraints / timeline: ${ctx.constraints}`);
  if (domainHint !== 'UNKNOWN') userParts.push(`Domain: ${domainHint}`);
  if (input.currency && input.currency !== 'AUD') {
    userParts.push(
      `Customer preferred currency: ${input.currency} — price field should be in ${input.currency}`,
    );
  }

  userParts.push('\nGenerate the scope JSON now.');

  return {
    system,
    user: userParts.join('\n'),
  };
}

// ─── buildSectionRegenPrompt ──────────────────────────────────────────────────

const SECTION_INSTRUCTIONS: Record<string, string> = {
  in_scope:      'Return JSON: { "in_scope": ["array of 3–8 specific activities"] }',
  out_of_scope:  'Return JSON: { "out_of_scope": ["array of 3–6 exclusion items"] }',
  assumptions:   'Return JSON: { "assumptions": ["array of 2–5 assumptions"] }',
  prerequisites: 'Return JSON: { "prerequisites": ["array of 0–4 prerequisites"] }',
  deliverables:  'Return JSON: { "deliverables": ["array of 2–5 concrete deliverables"] }',
  price:         'Return JSON: { "price": number, "currency": "AUD" }',
  hours:         'Return JSON: { "hours_min": integer, "hours_max": integer }',
  title:         'Return JSON: { "title": "string 10–120 chars" }',
  objective:     'Return JSON: { "objective": "string 50+ chars" }',
};

export function buildSectionRegenPrompt(
  section: string,
  currentScope: Record<string, unknown>,
  feedback?: string,
): { system: string; user: string } {
  const instruction =
    SECTION_INSTRUCTIONS[section] ?? `Return JSON with updated "${section}" field.`;

  const system = `You are regenerating ONE section of an IT project scope for onys.online.
Return ONLY valid JSON for the requested section. No other fields. No markdown.
${instruction}`;

  const feedbackLine = feedback
    ? `\nCustomer feedback for this regeneration: ${feedback}`
    : '';

  const user = `Current scope context:
Title: ${currentScope.title}
Domain: ${currentScope.domain}
Objective: ${currentScope.objective}
Current ${section}: ${JSON.stringify(currentScope[section])}
${feedbackLine}
Regenerate the "${section}" section now.`;

  return { system, user };
}
