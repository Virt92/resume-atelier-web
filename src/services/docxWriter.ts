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
import type { ResumeFacts, RewrittenResume } from '../types'

const COLOR_INK = '1c2030'
const COLOR_MUTED = '5a6172'
const COLOR_ACCENT = '4b17b4'
const FONT_BODY = 'Calibri'
const FONT_HEADING = 'Calibri'
const BODY_SIZE = 22 // half-points => 11pt
const SMALL_SIZE = 20 // 10pt
const NAME_SIZE = 40 // 20pt
const SECTION_HEADING_SIZE = 22 // 11pt (bold + uppercase)

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 280, after: 120 },
    border: {
      bottom: {
        color: COLOR_ACCENT,
        size: 6,
        style: BorderStyle.SINGLE,
        space: 2
      }
    },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        font: FONT_HEADING,
        size: SECTION_HEADING_SIZE,
        characterSpacing: 40,
        color: COLOR_ACCENT
      })
    ]
  })
}

function body(text: string, opts: { bold?: boolean; italics?: boolean; color?: string } = {}): Paragraph {
  return new Paragraph({
    spacing: { after: 80, line: 300 },
    children: [
      new TextRun({
        text,
        bold: opts.bold,
        italics: opts.italics,
        font: FONT_BODY,
        size: BODY_SIZE,
        color: opts.color ?? COLOR_INK
      })
    ]
  })
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    numbering: { reference: 'atelier-bullets', level: 0 },
    spacing: { after: 60, line: 300 },
    children: [
      new TextRun({ text, font: FONT_BODY, size: BODY_SIZE, color: COLOR_INK })
    ]
  })
}

export async function buildAdaptedDocx(
  facts: ResumeFacts,
  rewritten: RewrittenResume,
  fileName = 'resume-adapted.docx'
): Promise<Blob> {
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
            font: FONT_HEADING,
            size: NAME_SIZE,
            color: COLOR_INK
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
              font: FONT_BODY,
              size: SMALL_SIZE,
              color: COLOR_ACCENT,
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
            font: FONT_BODY,
            size: SMALL_SIZE,
            color: COLOR_MUTED
          })
        ]
      })
    )
  }

  if (rewritten.summary) {
    children.push(sectionHeading('Summary'))
    children.push(body(rewritten.summary))
  }

  if (rewritten.skills.length) {
    children.push(sectionHeading('Skills'))
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
                    font: FONT_BODY,
                    size: BODY_SIZE,
                    color: COLOR_ACCENT
                  }),
                  new TextRun({
                    text: left,
                    font: FONT_BODY,
                    size: BODY_SIZE,
                    color: COLOR_INK
                  })
                ]
              : []),
            ...(right
              ? [
                  new TextRun({ text: '\t', font: FONT_BODY, size: BODY_SIZE }),
                  new TextRun({
                    text: '•  ',
                    font: FONT_BODY,
                    size: BODY_SIZE,
                    color: COLOR_ACCENT
                  }),
                  new TextRun({
                    text: right,
                    font: FONT_BODY,
                    size: BODY_SIZE,
                    color: COLOR_INK
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
    children.push(sectionHeading('Experience'))
    exp.forEach((e, idx) => {
      children.push(
        new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          spacing: { before: idx === 0 ? 40 : 200, after: 20 },
          children: [
            new TextRun({
              text: e.role,
              bold: true,
              font: FONT_HEADING,
              size: BODY_SIZE,
              color: COLOR_INK
            }),
            new TextRun({
              text: `  ·  ${e.company}`,
              font: FONT_HEADING,
              size: BODY_SIZE,
              color: COLOR_INK
            }),
            new TextRun({ text: '\t', font: FONT_BODY, size: BODY_SIZE }),
            new TextRun({
              text: [e.start, e.end].filter(Boolean).join(' — '),
              italics: true,
              font: FONT_BODY,
              size: SMALL_SIZE,
              color: COLOR_MUTED
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
                font: FONT_BODY,
                size: SMALL_SIZE,
                color: COLOR_MUTED
              })
            ]
          })
        )
      }
      const bullets =
        idx === 0 && rewritten.latestRoleBullets.length
          ? rewritten.latestRoleBullets
          : e.bullets
      bullets.filter(Boolean).forEach((b) => children.push(bullet(b)))
    })
  }

  if (facts.education.length) {
    children.push(sectionHeading('Education'))
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
              font: FONT_HEADING,
              size: BODY_SIZE,
              color: COLOR_INK
            }),
            ...(dates
              ? [
                  new TextRun({ text: '\t', font: FONT_BODY, size: BODY_SIZE }),
                  new TextRun({
                    text: dates,
                    italics: true,
                    font: FONT_BODY,
                    size: SMALL_SIZE,
                    color: COLOR_MUTED
                  })
                ]
              : [])
          ]
        })
      )
      if (e.details) {
        children.push(body(e.details, { italics: true, color: COLOR_MUTED }))
      }
    })
  }

  if (facts.projects.length) {
    children.push(sectionHeading('Projects'))
    facts.projects.forEach((p) => {
      children.push(body(p.title, { bold: true }))
      if (p.description) children.push(body(p.description))
    })
  }

  if (facts.languages.length) {
    children.push(sectionHeading('Languages'))
    children.push(body(facts.languages.join('   ·   ')))
  }

  if (facts.certifications.length) {
    children.push(sectionHeading('Certifications'))
    facts.certifications.forEach((c) => children.push(bullet(c)))
  }

  const doc = new Document({
    creator: 'Resume Atelier',
    title: facts.name || 'Resume',
    description: 'Adapted resume generated by Resume Atelier Web',
    styles: {
      default: {
        document: {
          run: { font: FONT_BODY, size: BODY_SIZE, color: COLOR_INK }
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
                run: { color: COLOR_ACCENT, bold: true }
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
                    font: FONT_BODY,
                    size: 18,
                    color: COLOR_MUTED
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
