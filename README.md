# Mimiq preview check

Every preview deploy, simulated people try your app in a real browser, and the pull request gets one comment: how many finished the task, where the rest got stuck, and a link to the full report.

A real result, from Mimiq's own demo sign-up page:

```
Mimiq preview check
1 of 1 simulated people finished "Sign up for a free trial and reach the welcome page".

Where they got stuck or hesitated
- At Step 2, the company website field showed an invalid URL warning and I had to
  provide a full URL before I could continue. (SaaS Founder)
```

It works with any host that reports deployments to GitHub (Vercel, Netlify, Cloudflare Pages, Render and others), or with any URL you give it. Behind it is [Mimiq](https://www.mimiqai.com/mcp): audience-matched simulated people who click, type and fill in your forms, with an inbox of their own for verification codes.

## Quick start (Vercel, Netlify, Cloudflare Pages)

1. Create a free account at [mimiqai.com](https://www.mimiqai.com/sign-up?redirect_url=/app/settings), open Settings, find "Use Mimiq from your coding agent" and choose "Create a key".
2. Add it to your repository as the secret `MIMIQ_API_KEY`.
3. Add `.github/workflows/mimiq.yml`:

```yaml
name: Mimiq preview check
on: deployment_status
permissions:
  pull-requests: write
jobs:
  mimiq:
    if: github.event.deployment_status.state == 'success' && github.event.deployment.environment != 'Production'
    runs-on: ubuntu-latest
    steps:
      - uses: victorgulchenko/mimiq-preview-check@v1
        with:
          api-key: ${{ secrets.MIMIQ_API_KEY }}
          goal: Sign up and reach the dashboard
          audience: freelance designers who send invoices
```

Without `api-key`, a small free check runs (up to 3 people, with daily limits), which is enough to see what it does.

## Any URL

On `pull_request`, pass the URL yourself, for example a staging site:

```yaml
      - uses: victorgulchenko/mimiq-preview-check@v1
        with:
          api-key: ${{ secrets.MIMIQ_API_KEY }}
          url: https://staging.example.com/signup
          goal: Create an account and invite a teammate
```

## Protected previews and pages behind a sign-in

Store secrets as repository secrets and pass them as inputs. Mimiq keeps them sealed for that run only and deletes them when it ends: they never go in the URL, a result, a report or a log, and the simulated people type placeholders that are filled in only in the browser.

```yaml
      - uses: victorgulchenko/mimiq-preview-check@v1
        with:
          api-key: ${{ secrets.MIMIQ_API_KEY }}
          vercel-bypass-secret: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
          login-email: qa@yourapp.dev
          login-password: ${{ secrets.MIMIQ_TEST_ACCOUNT_PASSWORD }}
          goal: Sign in and create your first project
```

Use a test account with test data, not a real customer's account: the people click, type and submit what the task asks.

## Inputs

| Input | Default | What it does |
| --- | --- | --- |
| `api-key` | none | Your Mimiq key. Without it, a small free check runs. |
| `url` | the deployment's preview URL | The page where the task starts. |
| `goal` | `Sign up and start using it` | The task each person tries, in plain words. |
| `audience` | picked from the page | Who the people are, e.g. `parents shopping for school shoes`. |
| `people` | `3` | 1 to 10. Each person uses 5 credits. |
| `max-steps` | `25` | Step limit per person, 10 to 60. |
| `timeout-seconds` | `1200` | How long to wait for the result. |
| `comment` | `true` | Keep one comment on the pull request up to date. |
| `fail-on` | `never` | `gave-up` fails the check if anyone gave up; `stuck` if anyone did not finish. |
| `vercel-bypass-secret` | none | For previews behind Vercel Deployment Protection: your "Protection Bypass for Automation" secret. |
| `basic-auth-username`, `basic-auth-password` | none | For a preview behind a browser password prompt. |
| `login-email`, `login-password` | none | A test account the people sign in with, to test pages behind a sign-in. |
| `login-note` | none | Optional sign-in hint, e.g. `The sign-in link is in the top right.` |

Outputs: `report-url`, `finished`, `partway`, `gave-up`.

## Good to know

- The people are simulated. Treat the result as a fast usability check before real users, not a conversion forecast. [How far to trust it](https://www.mimiqai.com/benchmark).
- They fill in forms with made-up details and can submit them, so point it at a preview or staging environment where test sign-ups are fine.
- A run takes a few minutes. Credits: 5 per person, so the default 3 people use 15 per deploy. [Pricing](https://www.mimiqai.com/pricing).
- Your coding agent can run the same check before it opens the pull request: see the [Mimiq MCP server](https://github.com/victorgulchenko/mimiq-mcp).

## License

MIT
