/**
 * Developer switches. The use* flags each control ONE backend function:
 *   false -> use placeholder (dummy) data from lib/dummyData.ts
 *   true  -> call the real backend
 *
 * Flip them one at a time as each backend piece becomes ready.
 */
export const DEV = {
	/**
	 * Show the Demo tab (live scraper demo). When false, the tab does not appear.
	 */
	showDemoTab: true,

	/**
	 * Fetch the pasted job listing with src/backend/web_scraper/scraper.py.
	 * Only works under `npm run dev` (the dev server runs the script, see dev-server/scraperBridge.ts)
	 * and needs Python with `requests` and `beautifulsoup4` installed.
	 */
	useRealScraper: true,

	/**
	 * Have Claude reword and reorder confirmed Data Bank facts for the job via src/backend/llm_app
	 * (POST /api/tailor, proxied to uvicorn on :8000). Bullets that don't cite confirmed facts are dropped.
	 * When false, or if llm_app isn't running, the resume uses confirmed fact text as written.
	 */
	useRealTailoring: true,

	/** Decide whether a photo is recommended for the job (src/backend/llm_app). Not hooked up yet. */
	useRealPhotoAdvice: false,

	/**
	 * Read an uploaded resume into the Data Bank via /api/parse-resume (src/parse_resume.ts, which calls Claude;
	 * needs ANTHROPIC_API_KEY in .env.local). The parser's candidate_profile is converted to Data Bank fields by
	 * lib/extractionToDataBank.ts. Set false only to show placeholder data without calling the API.
	 */
	useRealResumeParser: true,
};
