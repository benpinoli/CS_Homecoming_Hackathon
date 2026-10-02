import type { CSSProperties } from 'react'
import type { GeneratedResume, ResumeAppearance } from '../types'
import { fontStack, resolveStyle } from '../lib/resumeStyles'
import { effectivePlacement, photoRingColor, photoWidthPt } from '../lib/photo'
import PhotoFrame from './PhotoFrame'
import '../styles/fonts.css'
import '../styles/ResumeDocument.css'

type Resume = GeneratedResume
const lines = (items: string[]) => items.filter((b) => b.trim())

function Summary({ resume }: { resume: Resume }) {
  if (!resume.summary.trim()) return null
  return (
    <section>
      <h3>Summary</h3>
      <p>{resume.summary}</p>
    </section>
  )
}

function Experience({ resume }: { resume: Resume }) {
  if (!resume.experience.length) return null
  return (
    <section>
      <h3>Experience</h3>
      {resume.experience.map((exp, i) => (
        <div key={i} className="paper-entry">
          <div className="paper-row">
            <strong>{exp.position}</strong>
            <span>{exp.duration}</span>
          </div>
          <div className="paper-sub">{[exp.company, exp.location].filter(Boolean).join(', ')}</div>
          <ul>{lines(exp.bullets).map((b, j) => <li key={j}>{b}</li>)}</ul>
        </div>
      ))}
    </section>
  )
}

function Projects({ resume }: { resume: Resume }) {
  if (!resume.projects.length) return null
  return (
    <section>
      <h3>Projects</h3>
      {resume.projects.map((p, i) => (
        <div key={i} className="paper-entry">
          <div className="paper-row">
            <strong>{p.name}</strong>
            <span>{p.link}</span>
          </div>
          <div className="paper-sub">{p.technologies}</div>
          <ul>{lines(p.bullets).map((b, j) => <li key={j}>{b}</li>)}</ul>
        </div>
      ))}
    </section>
  )
}

function Education({ resume, stacked }: { resume: Resume; stacked?: boolean }) {
  if (!resume.education.length) return null
  return (
    <section>
      <h3>Education</h3>
      {resume.education.map((e, i) => {
        const title = [e.degree, e.field].filter(Boolean).join(' in ')
        return stacked ? (
          <div key={i} className="paper-entry">
            <strong>{title}</strong>
            <div className="paper-sub">{e.school}</div>
            <div className="paper-muted">{e.year}</div>
            {e.details && <div className="paper-muted">{e.details}</div>}
          </div>
        ) : (
          <div key={i} className="paper-entry">
            <div className="paper-row">
              <strong>{title}</strong>
              <span>{e.year}</span>
            </div>
            <div className="paper-sub">{[e.school, e.details].filter(Boolean).join(' · ')}</div>
          </div>
        )
      })}
    </section>
  )
}

function Skills({ resume, list }: { resume: Resume; list?: boolean }) {
  if (!resume.skills.length) return null
  return (
    <section>
      <h3>Skills</h3>
      {list ? (
        <ul className="paper-plain-list">{resume.skills.map((s, i) => <li key={i}>{s}</li>)}</ul>
      ) : (
        <p>{resume.skills.join(', ')}</p>
      )}
    </section>
  )
}

/** US Letter (8.5x11) rendering of a resume; geometry mirrors lib/resumePdf.ts, scaled to the page width */
export default function ResumeDocument({ resume, appearance }: { resume: Resume; appearance: ResumeAppearance }) {
  const st = resolveStyle(appearance)
  const contact = [resume.email, resume.phone, resume.location, ...resume.links].filter(Boolean)
  const vars = {
    '--accent': st.accent,
    '--ink': st.ink,
    '--muted': st.muted,
    '--side-bg': st.tint,
    '--paper-font': fontStack(st.font),
  } as CSSProperties

  const className = `resume-paper header-${st.header} heading-${st.heading} layout-${st.layout}`

  const photo = resume.photo ?? null
  const place = photo ? effectivePlacement(photo, appearance.layout) : null
  const photoEl = photo && (
    <div className="paper-photo">
      <PhotoFrame
        photo={photo}
        width={`calc(var(--pt) * ${photoWidthPt(photo, appearance.layout)})`}
        ringColor={photoRingColor(appearance.layout, st.accent)}
      />
    </div>
  )
  // In the Sidebar layout a "top" photo goes above the side panel instead of the name
  const photoInHeader = !!photo && !(st.layout === 'sidebar' && place === 'top')
  const header = (withContact: boolean) => (
    <header className={`paper-header${photoInHeader ? ` has-photo photo-${place}` : ''}`}>
      {photoInHeader && place !== 'right' && photoEl}
      <div className="paper-header-text">
        <h1>{resume.name}</h1>
        {withContact && <p className="paper-contact">{contact.join('  |  ')}</p>}
      </div>
      {photoInHeader && place === 'right' && photoEl}
    </header>
  )

  return (
    <div className="resume-page">
      <article className={className} style={vars}>
        {st.layout === 'sidebar' ? (
          <>
            <aside className="paper-side">
              {photo && place === 'top' && photoEl}
              {contact.length > 0 && (
                <section>
                  <h3>Contact</h3>
                  <ul className="paper-plain-list">{contact.map((c, i) => <li key={i}>{c}</li>)}</ul>
                </section>
              )}
              <Skills resume={resume} list />
              <Education resume={resume} stacked />
            </aside>
            <div className="paper-main">
              {header(false)}
              <Summary resume={resume} />
              <Experience resume={resume} />
              <Projects resume={resume} />
            </div>
          </>
        ) : (
          <>
            {header(true)}
            <Summary resume={resume} />
            <Experience resume={resume} />
            <Projects resume={resume} />
            <Education resume={resume} />
            <Skills resume={resume} />
          </>
        )}
      </article>
    </div>
  )
}
