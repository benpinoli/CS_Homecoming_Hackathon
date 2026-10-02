# Resume bank starter kit

This is a proposed v1 data contract and two reusable LLM prompts, not a deployed parser or a real applicant's profile. Alex Rivera, all organizations, achievements, metrics, source documents, and confirmations are fictional demonstration data. Reserved example.com links are illustrative, not verified credentials.

## Files

| File | Purpose |
| --- | --- |
| example_profile.json | Filled fictional bank covering every collection, including projects omitted from the sample resume |
| profile.schema.json | Backend JSON Schema for bank structure |
| resume_parser_prompt.md | Resume text/document to proposed source-supported facts |
| resume_extraction.schema.json | Output envelope for the resume parser |
| experience_bank_interviewer_prompt.md | Multi-session discovery, project deep dives, and review protocol |
| sample_resume.txt | Fictional abbreviated resume source |
| sample_interview.txt | Fictional detail-gathering interview source |
| sample_confirmation.txt | Fictional explicit profile-review acceptance |

The filled example represents the bank AFTER interview and user review. A parser applied only to sample_resume.txt must produce a much smaller profile, with extracted facts and no interview-only details. It can extract the internship and forecasting summaries, but must not invent their omitted team, testing, and design details or discover the sensor and planned projects absent from that input.

## Why this structure

Top-level collections make projects, work, education, and awards easy to retrieve. Each entity contains individually addressable facts. Each fact carries a value, an assertion status, supporting evidence IDs, and confirmation metadata. Evidence IDs resolve to exact quotes, locators, and source IDs. This lets the system verify a changed number or skill without treating an entire project description as an undifferentiated source of truth.

Example:

```json
{
  "id": "fact_demo",
  "key": "tools_used",
  "value": ["Python", "SQL"],
  "assertion_status": "extracted",
  "evidence_ids": ["evidence_demo"],
  "confirmation_evidence_id": null,
  "confirmed_by": null,
  "confirmed_at": null
}
```

The example shape is valid for a fact, but these demo identifiers are not entries in the filled profile. Values can be scalar or a coherent structured object, such as a metric with its baseline, units, measurement period, and scope. When pieces have different support or uncertainty, split them into facts. Unknown fields are absent, with open questions if useful; null is not permission to invent a value. A missing experience array does not mean the person has no experiences.

The bank is deliberately larger than a resume. It retains unsuccessful, unfinished, and planned projects with explicit status. Planned work and planned features must never become achieved experience in generated resumes.

## Workflow

1. Ingest the resume: extract document text with stable page/block locators; retain the original. Use optical character recognition for scans. Pass complete blocks, source IDs, and schemas into the parser prompt. For long documents, process batches and merge proposals with deduplication rather than silently truncating the document.
2. Review extraction: validate JSON, inspect exact evidence spans, ask about ambiguity, and display facts for acceptance. The application, not the LLM, records confirmed status after explicit review.
3. Discover the inventory: enumerate work, school terms, research, courses, independent experiments, freelance work, competitions, clubs, volunteering, awards, writing, credentials, and other activities. Get names and short descriptions before detailed interviews.
4. Use artifacts for recall: supplied or authorized repository lists, READMEs, assignment folders, reports, slides, portfolios, old resumes, or reviews can reveal forgotten items. Confirm participation and scope; copied projects and teammate work are not automatically the applicant's accomplishments.
5. Deep-dive each item: capture problem, individual contribution, team contribution, implementation, decisions, constraints, failures, validation, scale, outcomes, and evidence. Do not require metrics where none were measured.
6. Review and save: show the exact facts that will be accepted. Store user acceptance against those fact IDs and values. Preserve rejected, disputed, and corrected history without exposing it as current qualifications.
7. Maintain: after a project, semester, internship, or major milestone, offer a short update. Store new facts separately from old ones and resolve contradictions explicitly.

You cannot guarantee literal completeness. Instead show an inventory checklist, reviewed time periods/categories, projects awaiting deep dives, and unanswered questions. The user decides when enough has been captured; deferred categories remain visible.

## Bank updates and confirmation

The parser proposes an initial revision-0 profile. The interviewer proposes additions/corrections against base_revision. Only the application assigns persistent IDs, commits revisions, and marks facts confirmed. Check base_revision before writes to avoid one session overwriting another. A stale proposal is re-evaluated against the latest revision.

A confirmation record must bind the user's acceptance to exactly the displayed fact IDs AND values. Store the review object or content hash server-side. Do not mark unseen facts confirmed because the person approved a short summary. The fictional sample_confirmation.txt represents acceptance after displaying the full filled profile.

Treat imported facts as extracted until reviewed. Use confirmed facts for resume generation. needs_review and disputed facts are excluded from achieved qualifications until resolved; withdrawn facts remain in history but are excluded. source support means the text states it, not that an independent auditor verified it.

## Validation beyond JSON Schema

The schema checks shape, not truth. The application also needs these checks:

- IDs are unique and every evidence, source, entity, and fact reference resolves.
- Each evidence quote occurs verbatim at its supplied source locator; citations must support the actual value, not merely mention a related topic.
- Confirmed facts have a user-acceptance evidence record, confirmed_by, and confirmed_at. Other statuses have null confirmation fields.
- Entity references in values, such as related_experience_id and supporting_project_ids, resolve. Do not accept model-invented references.
- Dates preserve stated precision and make sense where chronology is unambiguous; distinguish expected and actual dates.
- Conflicting active values require resolution. Preserve changes and provenance; never silently choose an attractive number.
- Enforce per-collection field conventions and expected value types before downstream use. The generic fact schema permits new keys so unusual work can be retained; it does not enforce every key's meaning.
- New confirmed state can only be created by the application after explicit acceptance. The JSON fields themselves are not proof of authorization.
- Template rendering and final document text extraction must preserve content and reading order. Reparse the exported file and compare dates, numbers, names, and skills with the selected fact set. This checks your export path, not an employer's private parser or screening model.

## Later tailoring interface

The tailoring engine receives job requirements and eligible confirmed facts. Each generated bullet returns text plus supporting_fact_ids. Requirements are mapped to supported, uncertain, or missing. Unsupported requirements remain missing, even if adding the keyword would improve a coverage score.

Preserve personal versus team ownership, measured versus approximate results, and completed versus planned work. Derived quantities require a separate calculation record with source fact IDs and formula; never silently turn a model's calculation into an original user claim.

Resume generation may choose or rewrite facts. It must not alter the underlying bank. Apply disclosure preferences before exporting, and keep internal evidence excerpts out of the resume unless deliberately selected for publication.
