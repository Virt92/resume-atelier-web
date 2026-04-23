import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeightRule,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  TabStopPosition,
  TabStopType,
  TextRun,
  UnderlineType
} from 'docx'
import { saveAs } from 'file-saver'
import type { ResumeFacts, RewrittenResume, ThemeTokens } from '../types'
import { getTheme } from './themes'

const FONT_BODY_SANS = 'Calibri'
const FONT_BODY_SERIF = 'Cambria'
const FONT_HEADING_DISPLAY = 'Calibri'
const FONT_HEADING_SANS = 'Calibri'
const BODY_SIZE = 22 // half-points => 11pt
const SMALL_SIZE = 20 // 10pt
const NAME_SIZE = 40 // 20pt
const SECTION_HEADING_SIZE = 22 // 11pt (bold + uppercase)

interface ThemeCtx {
  ink: string
  muted: string
  accent: string
  fontBody: string
  fontHeading: string
  headingUpper: boolean
  rule: ThemeTokens['ruleStyle']
}

function ctxFromTheme(t: ThemeTokens): ThemeCtx {
  return {
    ink: t.ink,
    muted: t.muted,
    accent: t.accent,
    fontBody: t.bodyFont === 'serif' ? FONT_BODY_SERIF : FONT_BODY_SANS,
    fontHeading:
      t.headingFont === 'display' ? FONT_HEADING_DISPLAY : FONT_HEADING_SANS,
    headingUpper: t.headingCase === 'upper',
    rule: t.ruleStyle
  }
}

function sectionHeading(text: string, c: ThemeCtx): Paragraph {
  const border =
    c.rule === 'none'
      ? undefined
      : {
          bottom: {
            color: c.accent,
            size: c.rule === 'bar' ? 8 : 4,
            style: c.rule === 'dot' ? BorderStyle.DOTTED : BorderStyle.SINGLE,
            space: 2
          }
        }
  return new Paragraph({
    spacing: { before: 280, after: 120 },
    ...(border ? { border } : {}),
    children: [
      new TextRun({
        text: c.headingUpper ? text.toUpperCase() : text,
        bold: true,
        font: c.fontHeading,
        size: SECTION_HEADING_SIZE,
        characterSpacing: c.headingUpper ? 40 : 0,
        color: c.accent
      })
    ]
  })
}

function body(
  text: string,
  c: ThemeCtx,
  opts: { bold?: boolean; italics?: boolean; color?: string } = {}
): Paragraph {
  return new Paragraph({
    spacing: { after: 80, line: 300 },
    children: [
      new TextRun({
        text,
        bold: opts.bold,
        italics: opts.italics,
        font: c.fontBody,
        size: BODY_SIZE,
        color: opts.color ?? c.ink
      })
    ]
  })
}

function bullet(text: string, c: ThemeCtx): Paragraph {
  return new Paragraph({
    numbering: { reference: 'atelier-bullets', level: 0 },
    spacing: { after: 60, line: 300 },
    children: [
      new TextRun({ text, font: c.fontBody, size: BODY_SIZE, color: c.ink })
    ]
  })
}

export async function buildAdaptedDocx(
  facts: ResumeFacts,
  rewritten: RewrittenResume,
  fileName = 'resume-adapted.docx',
  theme?: ThemeTokens
): Promise<Blob> {
  const c = ctxFromTheme(theme ?? getTheme('classic'))
  const children: Paragraph[] = []

  if (facts.name) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: facts.name,
            bold: true,
            font: c.fontHeading,
            size: NAME_SIZE,
            color: c.ink
          })
        ]
      })
    )
  }

  if (facts.inferredRole || rewritten.summary) {
    const role = facts.inferredRole || ''
    if (role) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [
            new TextRun({
              text: role,
              font: c.fontBody,
              size: SMALL_SIZE,
              color: c.accent,
              bold: true,
              characterSpacing: 30
            })
          ]
        })
      )
    }
  }

  if (facts.contacts.length) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [
          new TextRun({
            text: facts.contacts.join('  ·  '),
            font: c.fontBody,
            size: SMALL_SIZE,
            color: c.muted
          })
        ]
      })
    )
  }

  if (rewritten.summary) {
    children.push(sectionHeading('Summary', c))
    children.push(body(rewritten.summary, c))
  }

  if (rewritten.skills.length) {
    children.push(sectionHeading('Skills', c))
    // Two-column layout via tab stops (readable, not overloaded)
    const skills = rewritten.skills.filter(Boolean)
    const midpoint = Math.ceil(skills.length / 2)
    const rows = Math.max(midpoint, skills.length - midpoint)
    for (let i = 0; i < rows; i++) {
      const left = skills[i]
      const right = skills[i + midpoint]
      children.push(
        new Paragraph({
          tabStops: [
            { type: TabStopType.LEFT, position: TabStopPosition.MAX / 2 }
          ],
          spacing: { after: 40, line: 280 },
          children: [
            ...(left
              ? [
                  new TextRun({
                    text: '•  ',
                    font: c.fontBody,
                    size: BODY_SIZE,
                    color: c.accent
                  }),
                  new TextRun({
                    text: left,
                    font: c.fontBody,
                    size: BODY_SIZE,
                    color: c.ink
                  })
                ]
              : []),
            ...(right
              ? [
                  new TextRun({ text: '\t', font: c.fontBody, size: BODY_SIZE }),
                  new TextRun({
                    text: '•  ',
                    font: c.fontBody,
                    size: BODY_SIZE,
                    color: c.accent
                  }),
                  new TextRun({
                    text: right,
                    font: c.fontBody,
                    size: BODY_SIZE,
                    color: c.ink
                  })
                ]
              : [])
          ]
        })
      )
    }
  }

  const exp = rewritten.experience.length ? rewritten.experience : facts.experience
  if (exp.length) {
    children.push(sectionHeading('Experience', c))
    exp.forEach((e, idx) => {
      children.push(
        new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          spacing: { before: idx === 0 ? 40 : 200, after: 20 },
          children: [
            new TextRun({
              text: e.role,
              bold: true,
              font: c.fontHeading,
              size: BODY_SIZE,
              color: c.ink
            }),
            new TextRun({
              text: `  ·  ${e.company}`,
              font: c.fontHeading,
              size: BODY_SIZE,
              color: c.ink
            }),
            new TextRun({ text: '\t', font: c.fontBody, size: BODY_SIZE }),
            new TextRun({
              text: [e.start, e.end].filter(Boolean).join(' — '),
              italics: true,
              font: c.fontBody,
              size: SMALL_SIZE,
              color: c.muted
            })
          ]
        })
      )
      if (e.location) {
        children.push(
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({
                text: e.location,
                italics: true,
                font: c.fontBody,
                size: SMALL_SIZE,
                color: c.muted
              })
            ]
          })
        )
      }
      const bullets =
        idx === 0 && rewritten.latestRoleBullets.length
          ? rewritten.latestRoleBullets
          : e.bullets
      bullets.filter(Boolean).forEach((b) => children.push(bullet(b, c)))
    })
  }

  if (facts.education.length) {
    children.push(sectionHeading('Education', c))
    facts.education.forEach((e) => {
      const parts = [e.degree, e.institution].filter(Boolean).join(' — ')
      const dates = [e.start, e.end].filter(Boolean).join(' — ')
      children.push(
        new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          spacing: { after: 40 },
          children: [
            new TextRun({
              text: parts,
              bold: true,
              font: c.fontHeading,
              size: BODY_SIZE,
              color: c.ink
            }),
            ...(dates
              ? [
                  new TextRun({ text: '\t', font: c.fontBody, size: BODY_SIZE }),
                  new TextRun({
                    text: dates,
                    italics: true,
                    font: c.fontBody,
                    size: SMALL_SIZE,
                    color: c.muted
                  })
                ]
              : [])
          ]
        })
      )
      if (e.details) {
        children.push(body(e.details, c, { italics: true, color: c.muted }))
      }
    })
  }

  if (facts.projects.length) {
    children.push(sectionHeading('Projects', c))
    facts.projects.forEach((p) => {
      children.push(body(p.title, c, { bold: true }))
      if (p.description) children.push(body(p.description, c))
    })
  }

  if (facts.languages.length) {
    children.push(sectionHeading('Languages', c))
    children.push(body(facts.languages.join('   ·   '), c))
  }

  if (facts.certifications.length) {
    children.push(sectionHeading('Certifications', c))
    facts.certifications.forEach((cert) => children.push(bullet(cert, c)))
  }

  const doc = new Document({
    creator: 'Resume Atelier',
    title: facts.name || 'Resume',
    description: 'Adapted resume generated by Resume Atelier Web',
    styles: {
      default: {
        document: {
          run: { font: c.fontBody, size: BODY_SIZE, color: c.ink }
        }
      }
    },
    numbering: {
      config: [
        {
          reference: 'atelier-bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 360, hanging: 220 } },
                run: { color: c.accent, bold: true }
              }
            }
          ]
        }
      ]
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1000,
              right: 1100,
              bottom: 1000,
              left: 1100
            }
          }
        },
        headers: {},
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: facts.name
                      ? [`${facts.name}  ·  Page `, PageNumber.CURRENT]
                      : ['Page ', PageNumber.CURRENT],
                    font: c.fontBody,
                    size: 18,
                    color: c.muted
                  })
                ]
              })
            ]
          })
        },
        children
      }
    ]
  })

  const blob = await Packer.toBlob(doc)
  saveAs(blob, fileName)
  return blob
}

// Ensure unused imports don't break build in environments where tree-shaking
// is aggressive (UnderlineType/HeightRule reserved for future richer layouts).
void UnderlineType
void HeightRule
