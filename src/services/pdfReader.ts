import * as pdfjs from 'pdfjs-dist'
import PdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?worker'

// Wire up Vite-bundled worker.
if (!pdfjs.GlobalWorkerOptions.workerPort) {
  pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker() as unknown as Worker
}

import type { Language } from '../types'

export interface PdfExtractionResult {
  text: string
  usedOcr: boolean
  pages: number
  warnings: string[]
}

export interface PdfExtractionOptions {
  /** Called with progress 0..1 during OCR. */
  onOcrProgress?: (percent: number, status: string) => void
  /** Hint about the resume language (helps OCR). */
  languageHint?: Language
  /** Force OCR even if text layer is present. */
  forceOcr?: boolean
}

const TEXT_THRESHOLD_CHARS_PER_PAGE = 80

export async function extractPdf(
  file: File,
  opts: PdfExtractionOptions = {}
): Promise<PdfExtractionResult> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
  const warnings: string[] = []
  const pages = pdf.numPages

  // 1) Try the text layer first.
  let textLayer = ''
  for (let pageNum = 1; pageNum <= pages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((it) => ('str' in it ? (it as { str: string }).str : ''))
      .filter(Boolean)
      .join(' ')
    textLayer += pageText + '\n\n'
  }
  textLayer = textLayer.trim()

  const needsOcr =
    opts.forceOcr ||
    textLayer.length < TEXT_THRESHOLD_CHARS_PER_PAGE * pages

  if (!needsOcr) {
    return { text: textLayer, usedOcr: false, pages, warnings }
  }

  if (textLayer.length > 0 && !opts.forceOcr) {
    warnings.push(
      'PDF text layer looks sparse — running OCR for full coverage.'
    )
  }

  // 2) Fallback: render each page → canvas → OCR.
  opts.onOcrProgress?.(0, 'preparing OCR')
  const { createWorker } = await import('tesseract.js')
  const langs = ocrLangCodes(opts.languageHint)
  const worker = await createWorker(langs, undefined, {
    logger: (m: { status: string; progress: number }) => {
      if (m.progress != null) {
        opts.onOcrProgress?.(m.progress, m.status)
      }
    }
  })

  try {
    let out = ''
    for (let pageNum = 1; pageNum <= pages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale: 2 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas 2D context not available')
      await page.render({ canvasContext: ctx, viewport, canvas }).promise
      const {
        data: { text: pageText }
      } = await worker.recognize(canvas)
      out += pageText.trim() + '\n\n'
      opts.onOcrProgress?.(pageNum / pages, `page ${pageNum}/${pages}`)
    }
    const text = out.trim()
    // If OCR came back empty, fall back to whatever text layer we had.
    if (!text && textLayer) {
      warnings.push('OCR produced no text; using original text layer.')
      return { text: textLayer, usedOcr: false, pages, warnings }
    }
    return { text, usedOcr: true, pages, warnings }
  } finally {
    await worker.terminate().catch(() => undefined)
  }
}

function ocrLangCodes(hint?: Language): string {
  // Always include English as a safety net for mixed-language resumes.
  switch (hint) {
    case 'Ukrainian':
      return 'ukr+eng'
    case 'Russian':
      return 'rus+eng'
    default:
      return 'eng'
  }
}

export function looksLikeCyrillic(text: string): boolean {
  const sample = text.slice(0, 4000)
  const cyr = (sample.match(/[А-Яа-яЁёІіЇїЄєҐґ]/g) || []).length
  const lat = (sample.match(/[A-Za-z]/g) || []).length
  return cyr > lat
}
