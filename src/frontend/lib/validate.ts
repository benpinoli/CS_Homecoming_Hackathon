/** Returns an error message for a bad job listing URL, or '' if it is fine. */
export function validateJobUrl(value: string): string {
  if (!value.trim()) return 'Paste a job listing link so we know what to tailor your resume to.'
  try {
    const u = new URL(value.trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error()
  } catch {
    return "That doesn't look like a full link. Include https:// at the start."
  }
  return ''
}
