import mammoth from 'mammoth'

export interface ExtractedResume {
  text: string
  html: string
  warnings: string[]
}

export async function extractDocx(file: File): Promise<ExtractedResume> {
  const arrayBuffer = await file.arrayBuffer()
  const [textResult, htmlResult] = await Promise.all([
    mammoth.extractRawText({ arrayBuffer }),
    mammoth.convertToHtml({ arrayBuffer })
  ])
  return {
    text: textResult.value.trim(),
    html: htmlResult.value,
    warnings: [
      ...textResult.messages.map((m) => m.message),
      ...htmlResult.messages.map((m) => m.message)
    ]
  }
}

export function detectLanguage(text: string): 'English' | 'Ukrainian' | 'Russian' {
  const sample = text.slice(0, 4000)
  const cyr = (sample.match(/[А-Яа-яЁёІіЇїЄєҐґ]/g) || []).length
  const lat = (sample.match(/[A-Za-z]/g) || []).length
  if (cyr > lat) {
    const ua = (sample.match(/[ІіЇїЄєҐґ]/g) || []).length
    return ua > 3 ? 'Ukrainian' : 'Russian'
  }
  return 'English'
}
