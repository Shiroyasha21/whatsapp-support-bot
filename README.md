# 🤖 WhatsApp Support Bot

A fully functional WhatsApp chatbot that simulates a real-world customer support system, built for portfolio demonstration. Customers can check their product's warranty status and submit RMA or tech service tickets, all through a natural WhatsApp conversation.

> **Live Demo:** Text `Hi` to **+63 976 501 5990** to interact with the bot.
> *(If unavailable, see the screen recording demo below)*

---

## 📸 Demo

> *(Screen recording to be added: full flow showing warranty check, ticket submission, and email confirmation)*

---

## 💡 The Idea

Support bots like Lenovo's or Dell's warranty checker always fascinated me. You give it a serial number and it instantly tells you your warranty status, then offers to open a service ticket. I wanted to understand and build that architecture from scratch.

This project replicates that experience using entirely free tools: no paid APIs, no cloud subscription, no backend server costs.

---

## ✨ Features

- **Guided conversation flow:** collects customer name, email, and contact number automatically
- **Warranty lookup:** checks serial number against a product database, calculates expiry date and days remaining
- **Handles all warranty states:** active, expired, and not found
- **Support ticket submission:** customer chooses RMA (return/replace) or Tech Service (bring-in repair)
- **Automated email confirmation:** sends a formatted ticket email to the customer instantly
- **Session management:** tracks each user's conversation state independently, times out after 30 minutes
- **Edge case handling:** filters spam, handles rapid messages, validates email format, enforces input limits
- **RESTART command:** user can type RESTART at any point to begin a new inquiry

---

## 🏗️ Architecture

```
Customer's Phone (WhatsApp)
        ↓  ↑  messages
Secondary Phone Number (Bot)
        ↓
Node.js Bot  (whatsapp-web.js + Puppeteer)
  - Conversation state machine (Map per user)
  - Input validation + edge case handling
        ↓  HTTP POST (fetch)
Google Apps Script Web App  [FREE, hosted by Google]
  - doPost() handles two actions:
    → checkWarranty: reads products sheet
    → submitTicket: writes to tickets sheet + sends email
        ↓                    ↓
  Google Sheets         Gmail (MailApp)
  products tab          Sends HTML ticket
  tickets tab           confirmation email
```

---

## 🛠️ Tech Stack

| Tool | Purpose | Why I chose it |
|---|---|---|
| **Node.js** | Bot runtime | JavaScript everywhere, large ecosystem |
| **whatsapp-web.js** | WhatsApp connection | Best-maintained unofficial library, active community |
| **Puppeteer** | Headless Chrome (used internally by whatsapp-web.js) | Bundled, no separate setup needed |
| **Google Sheets** | Product and ticket database | Free, visual, easy to manage, mirrors how a real DB works |
| **Google Apps Script** | REST API and email sender | Replaces a paid backend entirely. Free, hosted by Google, with native Sheets access |
| **MailApp (Apps Script)** | Email confirmation | Built into Apps Script, zero config, sends from Gmail |
| **dotenv** | Environment variable management | Keeps sensitive URLs out of source code |

---

## 🧠 Key Design Decisions

### Why whatsapp-web.js over the Official WhatsApp Business API?

The official Meta API requires business verification, a registered phone number, pre-approved message templates, and charges per conversation. For a portfolio project, that overhead is unnecessary. `whatsapp-web.js` connects to WhatsApp Web's protocol directly: same infrastructure, no approval process, zero cost.

**Trade-off acknowledged:** This uses an unofficial library that violates WhatsApp's ToS. A secondary number is used specifically to isolate any ban risk from the main account. For a real production system, the official API would be the right choice.

### Why Google Sheets as the database?

Real support systems use internal databases where every serial number manufactured is recorded along with warranty tier and purchase data. Google Sheets mirrors this concept in a free, accessible format.

It also makes the project transparent. Anyone reviewing it can open the sheet and immediately understand the data structure, which is a plus for a portfolio piece.

### Why Google Apps Script instead of the googleapis npm package?

The `googleapis` package requires OAuth 2.0 setup: service account JSON files, credential management, and complex auth flows. Google Apps Script, deployed as a Web App, exposes a simple HTTPS endpoint that any `fetch()` call can hit.

This also provides free email sending via `MailApp` with zero configuration: no SMTP setup, no SendGrid account, no Nodemailer. The Apps Script handles everything internally since it runs inside Google's ecosystem.

### How does the email sending work?

The Apps Script runs under the Google account that owns the spreadsheet. When a ticket is submitted, the script calls `MailApp.sendEmail()`, which sends the confirmation email directly from that Google account's Gmail. No external email service is needed. This means whoever sets up the spreadsheet and deploys the Apps Script is the sender — the email will appear to come from their Gmail address.

### Why not host on a cloud VPS (Oracle Cloud Always Free)?

Oracle Cloud's Always Free tier was evaluated but set aside for this use case:

- **Idle suspension risk:** accounts with no activity for 30+ days can be flagged and terminated without warning
- **Account approval friction:** Oracle aggressively reviews new accounts in some regions
- **Scope mismatch:** a full Linux VPS setup adds hours of configuration for a project whose primary goal is demonstrating the bot itself, not DevOps

For portfolio showcasing, a screen recording of the live bot demonstrates the full flow more reliably and professionally than a live number that may go offline. A recording also lets me control exactly which scenarios to present, including all edge cases.

---

## 🗄️ Database Structure

### Sheet 1: `products`

Stores all product serial numbers with warranty information.

| Column | Type | Description |
|---|---|---|
| `serial_number` | String | Unique product identifier (e.g. SN-LNV-001) |
| `product_name` | String | Full product name |
| `purchase_date` | Date | Date of original purchase (YYYY-MM-DD) |
| `warranty_months` | Number | Warranty duration in months |

### Sheet 2: `tickets`

Populated by the bot when customers submit support requests.

| Column | Type | Description |
|---|---|---|
| `ticket_id` | String | Auto-generated (TKT-0001, TKT-0002...) |
| `timestamp` | DateTime | Submission time |
| `customer_name` | String | Collected during conversation |
| `customer_email` | String | Collected during conversation |
| `customer_phone` | String | Auto-captured from WhatsApp |
| `serial_number` | String | Product serial number |
| `product_name` | String | Product name |
| `issue_description` | String | Customer's description of the issue |
| `ticket_type` | String | RMA or Tech Service |
| `status` | String | Default: Open |

---

## 💬 Conversation Flow

```
Customer sends any message
        ↓
Bot asks for full name
        ↓
Bot asks for email address
        ↓
Bot asks for serial number → checks Google Sheets
        ↓
  ┌─────────────────────────────────┐
  │  Serial not found               │
  │  → Error message, try again     │
  └─────────────────────────────────┘
        ↓
  ┌─────────────────────────────────┐
  │  WARRANTY ACTIVE                │
  │  → Shows product + expiry info  │
  │  → Offers to submit a ticket    │
  └─────────────────────────────────┘
        ↓
  ┌─────────────────────────────────┐
  │  WARRANTY EXPIRED               │
  │  → Shows expiry info            │
  │  → Offers out-of-warranty       │
  │    service inquiry              │
  └─────────────────────────────────┘
        ↓ (if YES to ticket)
Bot asks for issue description
        ↓
Bot asks: 1 for RMA or 2 for Tech Service
        ↓
Ticket written to Google Sheets
Email confirmation sent to customer
Bot confirms with Ticket ID
        ↓
Session ends
Customer can send any message to start a new inquiry
```

---

## 🚀 Running Locally

### Prerequisites
- Node.js v18 or higher
- Google Chrome installed
- A secondary WhatsApp number (used as the bot's number)
- A Google account

### 1. Clone the repo
```bash
git clone git@github.com:Shiroyasha21/whatsapp-support-bot.git
cd whatsapp-support-bot
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up Google Sheets
- Create a new Google Spreadsheet
- Import `data/products.csv` as the first sheet and rename it `products`
- Add a second sheet named `tickets` with the headers from `data/tickets.csv`

### 4. Deploy the Apps Script
- Open your Google Sheet, then go to Extensions > Apps Script
- Paste the contents of `apps-script/Code.gs`
- Deploy as Web App (Execute as: Me, Access: Anyone)
- Copy the generated Web App URL

### 5. Configure environment
```bash
cp .env.example .env
# Paste your Apps Script URL into .env
```

### 6. Run
```bash
npm start
```

Scan the QR code with your secondary WhatsApp number. The bot comes online instantly.

---

## 📁 Project Structure

```
whatsapp-support-bot/
├── index.js              # Bot entry point and full conversation state machine
├── apps-script/
│   └── Code.gs           # Google Apps Script (warranty check, ticket API, email)
├── data/
│   ├── products.csv      # Sample product data (20 Lenovo products)
│   └── tickets.csv       # Empty tickets sheet with headers
├── .env.example          # Environment variable template
├── .gitignore            # Excludes node_modules, session files, and .env
└── package.json
```

---

## ⚠️ Disclaimer

This project uses `whatsapp-web.js`, an unofficial library not affiliated with WhatsApp or Meta. It is built for educational and portfolio purposes only. Use a secondary number and do not use your primary WhatsApp account.
