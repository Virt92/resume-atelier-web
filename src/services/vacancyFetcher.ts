export interface VacancyFetchResult {
  text: string
  source: 'direct' | 'proxy'
  proxyUsed?: string
  title?: string
}

/**
 * Best-effort public CORS proxies. Ordered by reliability.
 * They proxy arbitrary HTTP GETs; we only use them for reading public job pages.
 */
const PROXIES: Array<{
  name: string
  toUrl: (target: string) => string
  /** Extracts the actual HTML/text from the proxy response body. */
  parse: (raw: string) => string
}> = [
  {
    name: 'r.jina.ai',
    // Returns clean, Markdown-ish text — perfect for vacancy pages.
    toUrl: (u) => `https://r.jina.ai/${u}`,
    parse: (raw) => raw
  },
  {
    name: 'allorigins.win',
    toUrl: (u) =>
      `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
    parse: (raw) => {
      try {
        const j = JSON.parse(raw) as { contents?: string }
        return j.contents ?? ''
      } catch {
        return ''
      }
    }
  },
  {
    name: 'codetabs.com',
    toUrl: (u) =>
      `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
    parse: (raw) => raw
  },
  {
    name: 'cors.isomorphic-git.org',
    toUrl: (u) => `https://cors.isomorphic-git.org/${u}`,
    parse: (raw) => raw
  }
]

const MIN_CONTENT_LEN = 400

export async function fetchVacancy(url: string): Promise<VacancyFetchResult> {
  const normalized = normalizeUrl(url)

  // 1) Direct fetch (works for the rare CORS-friendly boards and local files).
  try {
    const res = await fetch(normalized, { mode: 'cors' })
    if (res.ok) {
      const html = await res.text()
      const extracted = extractMainContent(html, normalized)
      if (extracted.text.length >= MIN_CONTENT_LEN) {
        return { text: extracted.text, source: 'direct', title: extracted.title }
      }
    }
  } catch {
    // ignore, fall through to proxies
  }

  // 2) Try proxies in order.
  let lastErr: Error | null = null
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy.toUrl(normalized), { mode: 'cors' })
      if (!res.ok) continue
      const raw = await res.text()
      const body = proxy.parse(raw)
      if (!body) continue
      // r.jina.ai already returns clean text; still run through extractor,
      // which handles both HTML and plain text gracefully.
      const extracted = looksLikeHtml(body)
        ? extractMainContent(body, normalized)
        : { text: cleanup(body), title: undefined as string | undefined }
      if (extracted.text.length >= MIN_CONTENT_LEN) {
        return {
          text: extracted.text,
          source: 'proxy',
          proxyUsed: proxy.name,
          title: extracted.title
        }
      }
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
    }
  }

  throw new Error(
    `Could not fetch vacancy content from ${url}. ${
      lastErr?.message ?? 'All proxies returned too little content.'
    } Copy and paste the job description instead.`
  )
}

function normalizeUrl(u: string): string {
  const trimmed = u.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function looksLikeHtml(s: string): boolean {
  return /<html[\s>]|<body[\s>]|<div[\s>]|<article[\s>]/i.test(s.slice(0, 2000))
}

/**
 * Extract the most relevant text blob from a job-page HTML:
 * site-specific first; fallback to a simple Readability-lite heuristic.
 */
function extractMainContent(
  html: string,
  sourceUrl: string
): { text: string; title?: string } {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  // Drop noise.
  doc
    .querySelectorAll(
      'script, style, noscript, iframe, svg, canvas, nav, header, footer, form, aside, [aria-hidden="true"]'
    )
    .forEach((n) => n.remove())

  const title = doc.title || undefined

  const host = safeHost(sourceUrl)
  const sitePicks = siteSelectors(host)
  for (const sel of sitePicks) {
    const el = doc.querySelector(sel)
    if (el) {
      const t = cleanup((el as HTMLElement).innerText || el.textContent || '')
      if (t.length >= MIN_CONTENT_LEN) return { text: t, title }
    }
  }

  // Generic: pick the densest block.
  const candidates = Array.from(
    doc.querySelectorAll<HTMLElement>(
      'article, main, section, div[class*="vacan"], div[class*="job"], div[class*="description"], div[class*="content"], div[class*="details"]'
    )
  )
  let best = ''
  for (const el of candidates) {
    const t = cleanup(el.innerText || el.textContent || '')
    if (t.length > best.length) best = t
  }
  if (best.length >= MIN_CONTENT_LEN) return { text: best, title }

  // Last resort: whole body.
  const bodyText = cleanup(doc.body?.innerText || '')
  return { text: bodyText, title }
}

function siteSelectors(host: string): string[] {
  if (host.includes('jobs.dou.ua')) {
    return ['div.b-typo.vacancy-section', 'div.vacancy-section', 'article.b-typo']
  }
  if (host.includes('djinni.co')) {
    return ['.job-post__description', '.job-post', 'main']
  }
  if (host.includes('linkedin.com')) {
    return [
      '.show-more-less-html__markup',
      '.description__text',
      '.jobs-description__content'
    ]
  }
  if (host.includes('indeed.com')) {
    return ['#jobDescriptionText', '.jobsearch-JobComponent']
  }
  if (host.includes('work.ua')) {
    return ['#job-description', '.card.wordwrap']
  }
  if (host.includes('rabota.ua')) {
    return ['.job-description', '[data-id="abstract"]']
  }
  if (host.includes('greenhouse.io') || host.includes('lever.co')) {
    return ['#content', '.content', '.posting', '.section-wrapper']
  }
  return []
}

function safeHost(u: string): string {
  try {
    return new URL(u).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function cleanup(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+$/gm, '')
    .trim()
}
