# Mimiq preview check

On every preview deploy, AI agents use your app like your users, each in a real browser, and the pull request gets one comment: how many finished the task, what the browser caught (JavaScript errors, failed requests, requests slower than 3 seconds), where the rest got stuck, and a link to the full report. No test scripts: a task in plain words.

What a comment looks like, from a real run of one agent on Mimiq's demo preview build, which has three planted bugs:

```
Mimiq preview check
0 of 1 agents finished "Start the free trial, then add your first invoice".

What the browser caught
- POST /api/demo-signup answered 500 (1 of 1 agent)
- JavaScript error: Cannot read properties of undefined (reading 'plan') (1 of 1 agent)
- POST /api/demo-signup took 3.6s (1 of 1 agent)
```

In that run the agent retried the failed signup, got through, then clicked "Add an invoice" four times with nothing happening. Try the same build yourself: https://www.mimiqai.com/demo/tallyloop/preview

It works with any host that reports deployments to GitHub (Vercel, Netlify, Cloudflare Pages, Render and others), or with any URL you give it. Behind it is [Mimiq](https://www.mimiqai.com/github-actions): AI agents that act as your users, click, type and fill in your forms, with an inbox of their own for verification codes.

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

Without `api-key`, a small free check runs (up to 3 agents, with daily limits), which is enough to see what it does.

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

Store secrets as repository secrets and pass them as inputs. Mimiq keeps them sealed for that run only and deletes them when it ends: they never go in the URL, a result, a report or a log, and the agents type placeholders that are filled in only in the browser.

```yaml
      - uses: victorgulchenko/mimiq-preview-check@v1
        with:
          api-key: ${{ secrets.MIMIQ_API_KEY }}
          vercel-bypass-secret: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
          login-email: qa@yourapp.dev
          login-password: ${{ secrets.MIMIQ_TEST_ACCOUNT_PASSWORD }}
          goal: Sign in and create your first project
```

Use a test account with test data, not a real customer's account: the agents click, type and submit what the task asks.

## Inputs

| Input | Default | What it does |
| --- | --- | --- |
| `api-key` | none | Your Mimiq key. Without it, a small free check runs. |
| `url` | the deployment's preview URL | The page where the task starts. |
| `goal` | `Sign up and start using it` | The task each person tries, in plain words. |
| `audience` | picked from the page | Who the agents act as, e.g. `parents shopping for school shoes`. |
| `people` | `3` | 1 to 10 agents. Each uses 5 credits. |
| `max-steps` | empty | Optional step limit per agent, 10 to 200. Leave it empty and agents keep going until they finish the task or get stuck. |
| `devices` | `mix` | Which devices the agents use: `mix` (about 4 in 10 on a phone-sized touch screen), `phone` or `laptop`. |
| `timeout-seconds` | `2400` | How long to wait for the result, 60 to 3600. |
| `comment` | `true` | Keep one comment on the pull request up to date. |
| `fail-on` | `never` | `gave-up` fails the check if anyone gave up; `stuck` if anyone did not finish. |
| `vercel-bypass-secret` | none | For previews behind Vercel Deployment Protection: your "Protection Bypass for Automation" secret. |
| `basic-auth-username`, `basic-auth-password` | none | For a preview behind a browser password prompt. |
| `login-email`, `login-password` | none | A test account the agents sign in with, to test pages behind a sign-in. |
| `login-note` | none | Optional sign-in hint, e.g. `The sign-in link is in the top right.` |

Outputs: `report-url`, `finished`, `partway`, `gave-up`.

## Good to know

- The agents are simulated users. They find what breaks and what confuses; they do not forecast conversion, and they are not a deterministic regression suite, so keep scripted tests for behavior that must never change.
- They fill in forms with made-up details and can submit them, so point it at a preview or staging environment where test sign-ups are fine.
- A run takes a few minutes. Credits: 5 per agent, so the default 3 agents use 15 per deploy. [Pricing](https://www.mimiqai.com/pricing).
- Your coding agent can run the same check before it opens the pull request: see the [Mimiq MCP server](https://github.com/victorgulchenko/mimiq-mcp).

## License

MIT
