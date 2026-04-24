const FAL_ENDPOINT =
  import.meta.env.VITE_FAL_ENDPOINT ?? 'https://fal.run/fal-ai/any-llm'
const BUILD_KEY = (import.meta.env.VITE_FAL_KEY as string | undefined) ?? ''

export function getDefaultKey(): string {
  return BUILD_KEY
}

export function getDefaultModel(): string {
  return (
    (import.meta.env.VITE_FAL_MODEL as string | undefined) ??
    'anthropic/claude-sonnet-4.5'
  )
}

// Model identifiers that fal.ai any-llm no longer accepts.
// Keep this list in sync with the 422 "literal_error" rejection list returned
// by `https://fal.run/fal-ai/any-llm`. If we see one of these in localStorage,
// we transparently migrate the user to the current default so the pipeline
// keeps working without them having to re-enter Settings.
const DEPRECATED_MODELS: ReadonlySet<string> = new Set([
  'google/gemini-flash-1.5-8b',
  'google/gemini-flash-1.5',
  'google/gemini-pro-1.5',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-3.5-haiku',
  'anthropic/claude-3-haiku',
  'meta-llama/llama-3.1-8b-instruct',
  'meta-llama/llama-3.1-70b-instruct',
  'fal-ai/any-llm/openai/gpt-4o'
])

export function isDeprecatedModel(model: string | undefined | null): boolean {
  if (!model) return true
  return DEPRECATED_MODELS.has(model)
}

export interface LlmRequest {
  systemPrompt: string
  prompt: string
  model: string
  apiKey: string
  jsonMode?: boolean
  temperature?: number
}

export interface LlmResponse {
  text: string
  raw: unknown
}

export async function callLlm(req: LlmRequest): Promise<LlmResponse> {
  if (!req.apiKey) {
    throw new Error('Missing fal.ai API key. Add it in Settings.')
  }

  const body: Record<string, unknown> = {
    model: req.model,
    prompt: req.prompt,
    system_prompt: req.systemPrompt,
    reasoning: false
  }
  if (typeof req.temperature === 'number') {
    body.temperature = req.temperature
  }

  const res = await fetch(FAL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Key ${req.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(
      `fal.ai request failed: ${res.status} ${res.statusText}${
        errText ? ` — ${errText.slice(0, 200)}` : ''
      }`
    )
  }

  const json = await res.json()
  const text =
    (json?.output as string | undefined) ??
    (json?.response as string | undefined) ??
    (json?.text as string | undefined) ??
    ''

  return { text, raw: json }
}

/**
 * Attempts to parse a JSON object/array from an LLM response that may include
 * Markdown code fences, prose, or other non-JSON text around the payload.
 */
export function extractJson<T = unknown>(text: string): T {
  const trimmed = text.trim()
  const tryParse = (s: string): T | null => {
    try {
      return JSON.parse(s) as T
    } catch {
      return null
    }
  }

  const direct = tryParse(trimmed)
  if (direct !== null) return direct

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) {
    const inside = tryParse(fence[1].trim())
    if (inside !== null) return inside
  }

  const firstBrace = trimmed.indexOf('{')
  const firstBracket = trimmed.indexOf('[')
  const start =
    firstBrace === -1
      ? firstBracket
      : firstBracket === -1
        ? firstBrace
        : Math.min(firstBrace, firstBracket)
  const lastBrace = trimmed.lastIndexOf('}')
  const lastBracket = trimmed.lastIndexOf(']')
  const end = Math.max(lastBrace, lastBracket)

  if (start !== -1 && end !== -1 && end > start) {
    const slice = trimmed.slice(start, end + 1)
    const out = tryParse(slice)
    if (out !== null) return out
  }

  throw new Error('Could not parse JSON from LLM response')
}
