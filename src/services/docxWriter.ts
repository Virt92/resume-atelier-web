import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun
} from 'docx'
import { saveAs } from 'file-saver'
import type { ResumeFacts, RewrittenResume } from '../types'

function heading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 80 },
    children: [new TextRun({ text: text.toUpperCase(), bold: true })]
  })
}

function para(text: string, opts: { bold?: boolean; italics?: boolean } = {}): Paragraph {
  return new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({ text, bold: opts.bold, italics: opts.italics })]
  })
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 40 },
    children: [new TextRun({ text })]
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
        heading: HeadingLevel.TITLE,
        spacing: { after: 120 },
        children: [new TextRun({ text: facts.name, bold: true, size: 40 })]
      })
    )
  }
  if (facts.contacts.length) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: facts.contacts.join('  ·  '), color: '4a5262' })]
      })
    )
  }

  if (rewritten.summary) {
    children.push(heading('Summary'))
    children.push(para(rewritten.summary))
  }

  if (rewritten.skills.length) {
    children.push(heading('Skills'))
    children.push(para(rewritten.skills.join(' · ')))
  }

  const exp = rewritten.experience.length ? rewritten.experience : facts.experience
  if (exp.length) {
    children.push(heading('Experience'))
    exp.forEach((e, idx) => {
      children.push(
        new Paragraph({
          spacing: { before: idx === 0 ? 0 : 160, after: 40 },
          children: [
            new TextRun({ text: `${e.role}`, bold: true }),
            new TextRun({ text: ` — ${e.company}`, bold: false }),
            new TextRun({
              text: `  (${[e.start, e.end].filter(Boolean).join(' — ')})`,
              italics: true,
              color: '4a5262'
            })
          ]
        })
      )
      const bullets =
        idx === 0 && rewritten.latestRoleBullets.length
          ? rewritten.latestRoleBullets
          : e.bullets
      bullets.forEach((b) => children.push(bullet(b)))
    })
  }

  if (facts.education.length) {
    children.push(heading('Education'))
    facts.education.forEach((e) => {
      children.push(
        para(
          [e.degree, e.institution, [e.start, e.end].filter(Boolean).join(' — ')]
            .filter(Boolean)
            .join(' · ')
        )
      )
      if (e.details) children.push(para(e.details, { italics: true }))
    })
  }

  if (facts.projects.length) {
    children.push(heading('Projects'))
    facts.projects.forEach((p) => {
      children.push(para(p.title, { bold: true }))
      children.push(para(p.description))
    })
  }

  if (facts.certifications.length) {
    children.push(heading('Certifications'))
    facts.certifications.forEach((c) => children.push(bullet(c)))
  }

  const doc = new Document({
    creator: 'Resume Atelier',
    title: facts.name || 'Resume',
    sections: [{ properties: {}, children }]
  })

  const blob = await Packer.toBlob(doc)
  saveAs(blob, fileName)
  return blob
}
