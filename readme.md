# Vikunja Email Inbox (Cloudflare Worker)

A lightweight Cloudflare Email Routing Worker that converts incoming emails into [Vikunja](https://vikunja.io/) tasks and automatically maps `#hashtags` in the email subject to existing Vikunja labels.

## Features

- **Email-to-Task conversion:** Parses incoming email subject (task title) and plain-text body (task description) using `postal-mime`.
- **Hashtag-to-Label mapping:** Detects case-insensitive `#hashtags` in the subject line, matches them against existing labels in Vikunja, attaches the matching labels to the task, and strips recognized hashtags from the final task title.
- **Sender allowlist:** Only processes emails from explicitly allowed sender addresses (`ALLOWED_SENDERS`).
- **Locked-down deployment:** Public `workers.dev` and preview URLs are disabled (`workers_dev = false`, `preview_urls = false`).

## Prerequisites

- A [Cloudflare](https://www.cloudflare.com/) account with **Email Routing** enabled on your domain
- A self-hosted or cloud [Vikunja](https://vikunja.io/) instance
- [Node.js](https://nodejs.org/) (LTS) and `npm`
- [Git](https://git-scm.com/)

## Setup & Deployment

### 1. Clone and install dependencies

```bash
git clone [https://github.com/](https://github.com/vgerwen/vikunja-email-inbox.git)
cd vikunja-email-inbox
npm install
```

### 2. Configure wrangler.toml

Copy the example configuration and fill in your own details:
```bash
cp wrangler.toml.example wrangler.toml
```

Edit wrangler.toml:

- VIKUNJA_URL: Base URL of your Vikunja instance (e.g. https://todo.example.com)

- VIKUNJA_INBOX_PROJECT_ID: Numeric ID of the target Vikunja project (e.g. "1") ( This ID is shown in the url if you select the INBOX)

- ALLOWED_SENDERS: Comma-separated list of authorized email addresses

### 3. Create a Vikunja API Token

In Vikunja, go to *Settings → API Tokens* and create a token with minimal permissions:

- Labels: read all (and read one)

- Tasks: create

- Task Labels: create

### 4. Authenticate Wrangler and set the secret

Log in to Cloudflare and store your Vikunja API token as an encrypted Worker secret:

```bash
npx wrangler login
npx wrangler secret put VIKUNJA_TOKEN
```

### 5. Deploy and connect Email Routing
In the Cloudflare Dashboard, navigate to Email → Email Routing → Routing Rules, create or edit your target address (e.g. task@yourdomain.com), and set the action to a worker -> wikunja-email-inbox


### Usage
Send an email to your configured routing address:

- Subject: Buy groceries #shopping #errands

- Body: Milk, eggs, bread

If shopping exists as a label in Vikunja and errands does not:

- Task title: Buy groceries #errands

- Task description: Milk, eggs, bread

- Attached label: shopping
