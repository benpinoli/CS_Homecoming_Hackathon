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
	useRealScraper: false,

	/** Build the tailored resume and "How it's tailored" notes from the Data Bank + job (src/backend/llm_app). Not hooked up yet. */
	useRealTailoring: false,

	/** Decide whether a photo is recommended for the job (src/backend/llm_app). Not hooked up yet. */
	useRealPhotoAdvice: false,
};
