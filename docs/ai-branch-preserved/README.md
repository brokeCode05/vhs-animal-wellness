# AI branch versions preserved during Laravel v5 integration

These are **original Git blob versions** from the branch before the
Laravel-root cleanup. They differ from the approved working v5
files and have not been automatically merged into active scripts.

Use the relevant files as references when integrating the real AI
provider. Do not directly load the files from docs/ in a browser.
REQ009 and REQ035 remain deferred.

| Original branch file | Saved original version | Active v5 file |
|---|---|---|
| `doctor/doctor-scribe.js` | `docs/ai-branch-preserved/doctor/doctor-scribe.js` | `public/doctor/doctor-scribe.js` |
| `user/vetti-data.js` | `docs/ai-branch-preserved/user/vetti-data.js` | `public/user/vetti-data.js` |
| `user/vetti-onboarding.js` | `docs/ai-branch-preserved/user/vetti-onboarding.js` | `public/user/vetti-onboarding.js` |
| `user/vetti-state.js` | `docs/ai-branch-preserved/user/vetti-state.js` | `public/user/vetti-state.js` |
| `user/vetti-ui.js` | `docs/ai-branch-preserved/user/vetti-ui.js` | `public/user/vetti-ui.js` |

Please review each difference before integrating it into the active
frontend. The integration did not implement a live AI provider.
