import type { BankFact } from '../lib/experienceBank'
import { setFactStatus } from '../lib/experienceBank'

interface FactReviewProps {
  facts: BankFact[]
  onChange: (facts: BankFact[]) => void
}

export default function FactReview({ facts, onChange }: FactReviewProps) {
  const visible = facts.filter((fact) => fact.assertion_status !== 'withdrawn')
  const confirmed = visible.filter((fact) => fact.assertion_status === 'confirmed').length
  return (
    <section className="data-content">
      <div className="section-title">
        <div>
          <h2>Confirm facts</h2>
          <p className="section-blurb">
            Generation uses only confirmed facts. {confirmed} of {visible.length} are confirmed.
            Example text inside a template is not added here.
          </p>
        </div>
      </div>
      {visible.length === 0 && <p className="empty-state">Upload a resume to extract facts, then confirm the ones that are true.</p>}
      <div className="entry-list">
        {visible.map((fact) => (
          <div key={fact.id} className="entry-card">
            <div className="entry-head">
              <span className="entry-title">{fact.section} · {fact.key}</span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  onChange(setFactStatus(facts, fact.id, fact.assertion_status === 'confirmed' ? 'extracted' : 'confirmed'))
                }
              >
                {fact.assertion_status === 'confirmed' ? 'Confirmed' : 'Confirm'}
              </button>
            </div>
            <p>{fact.valueText}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
