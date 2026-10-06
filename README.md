# Daily Brief

Austin's dashboard on **[GitHub Pages](https://austinpoulson.github.io/daily-dashboard/)**.

## Daily data

- **Plymouth, Minnesota weather:** current conditions, a seven-day high/low and precipitation chart, and a 24-hour view. Fahrenheit, mph, Central time.
- **Public projects:** 28 days of default-branch commits across `abyss`, `HomePage`, `devScripts`, and `RataTaskr`, plus open pull requests and issues. All contributors are included. Private work and this dashboard's bot commits are excluded.
- **Developer / AI radar:** the first 60 top Hacker News stories, ranked by title matches for AI/agents, web/tools, graphics, and systems/privacy. Topic bars describe this sample; a story can match multiple topics.
- **Horror / sci-fi discovery:** recent Bloody Disgusting film/TV headlines, with folk/ritual and technology/identity matches first, plus upcoming English-language horror, science-fiction, and thriller TV episodes from TVmaze. Same-day episode batches are grouped by show.

Film coverage links to publisher articles rather than claiming a complete movie-release calendar. TV listings combine US broadcast and global streaming schedules; a global listing does not guarantee local availability. These are discovery feeds, not recommendations checked against a private media library.

## Automatic management

**Refresh daily brief and deploy** runs on changes to `main`, manually from Actions, and every six hours at minute 17 UTC (00:17, 06:17, 12:17, 18:17 UTC). Scheduled runs may be delayed by GitHub. No local computer needs to stay on.

Each run validates fetch helpers, reads public APIs / RSS, commits `data/dashboard.json`, builds `dist/`, and deploys with official GitHub Pages Actions. The automatically provided `GITHUB_TOKEN` is used only by the workflow. No personal token or API key is needed; no credential reaches the browser.

If a fetch fails, its last successful payload is retained. **Sources & freshness** shows successful timestamps and errors. Data older than 12 hours is flagged even if the last fetch succeeded. If all sources fail, the workflow fails and preserves the deployed site. An empty valid feed is different from an outage.

**Refresh view** reloads the published snapshot; it does not fetch new APIs. For an immediate update, use **Actions → Refresh daily brief and deploy → Run workflow**. GitHub can disable schedules in public repositories after 60 days without repository activity. Check Actions if updates stop; snapshot commits normally maintain activity.

## Customize and develop

Edit [`config.json`](config.json) to change city coordinates, tracked **public** repositories, interests, or TV genres. Configuration and snapshots are public: keep credentials, private calendars, private project metadata, media inventories, and precise home addresses out of them.

Requires Node.js 24 or later:

```sh
npm ci --ignore-scripts
npm run refresh
npm test
npm run build
npm run serve
```

Open `http://127.0.0.1:4186`. `dist/` contains only HTML, CSS, browser JavaScript, and public JSON. Charts are local SVGs. Google Fonts has system-font fallbacks.

## Sources and reuse

- [Open-Meteo forecast API](https://open-meteo.com/en/docs), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), with attribution. Noncommercial personal use.
- [GitHub public REST API](https://docs.github.com/en/rest). Fetchers refuse private repositories. Counts show a `+` if the first 100 open issues or PRs fill the response.
- [Hacker News public API](https://github.com/HackerNews/API). Links to original stories and HN discussions.
- [Bloody Disgusting RSS](https://bloody-disgusting.com/feed/). Headline, date, link, and derived tags only; no full articles or images.
- [TVmaze API](https://www.tvmaze.com/api), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Normalized data under `sources.television.data` is an adaptation shared under CC BY-SA 4.0, with linked TVmaze attribution on the page.

External content is untrusted data: HTTP(S) links only, article text stripped, browser text escaped. It does not control refresh behavior. Initial title keyword filters follow web development, graphics, automation, folk/ritual horror, and technology/identity interests; they are inspectable filters, not AI classifications.
