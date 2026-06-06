# WhatsApp Support Bot

A WhatsApp chatbot that checks product warranty status and handles support ticket submissions. Built with Node.js, whatsapp-web.js, and Google Sheets as the backend database.

## Features

- Warranty lookup by serial number
- Warranty expiry calculation
- Support ticket submission (RMA / Tech Service)
- Email confirmation sent to customer
- Google Sheets as a free, zero-cost database

## Tech Stack

- [whatsapp-web.js](https://wwebjs.dev/) — WhatsApp Web automation
- Google Sheets — Product and ticket database
- Google Apps Script — Free REST API layer + email sending
- Node.js — Bot runtime

## Setup

### Prerequisites
- Node.js v18 or higher
- A secondary WhatsApp number for the bot

### Installation

```bash
git clone git@github.com:Shiroyasha21/whatsapp-support-bot.git
cd whatsapp-support-bot
npm install
```

### Configuration

```bash
cp .env.example .env
# Fill in your Apps Script URL in .env
```

### Run

```bash
npm start
```

Scan the QR code with your secondary WhatsApp number. The bot will come online.

## Project Structure

```
whatsapp-support-bot/
├── index.js          # Bot entry point + conversation state machine
├── .env.example      # Environment variable template
├── .gitignore        # Excludes node_modules, session files, .env
└── package.json
```

## Conversation Flow

```
Customer messages bot
  → Asks for name + email
  → Asks for serial number
  → Checks warranty in Google Sheets
  → Shows warranty status + expiry
  → Offers ticket submission if needed
  → Writes ticket to Google Sheets
  → Sends email confirmation to customer
```
