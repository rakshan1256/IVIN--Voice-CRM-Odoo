#Voice CRM Copilot — Odoo 17 Custom Module

An AI-powered voice assistant and multilingual copilot built directly inside Odoo 17 CRM. Enables sales teams to interact with CRM leads using voice commands and get AI-generated insights in Indian regional languages.

##Features

- **Voice Recognition** — Speak CRM commands using microphone (Web Speech API)
- **Fuzzy Phonetic Matching** — Understands natural speech like "summer is here" → "Summarise Lead" using Levenshtein distance and sound-alike phonetic mapping
- **Word-by-Word Match Breakdown** — Visual confirmation dialog showing per-word match percentage
- **Multi-Candidate Suggestions** — Shows top 3 possible commands when speech is ambiguous
- **7 AI Actions**:
  - Summarize Lead
  - Generate Follow-up Email
  - Predict Closure Probability
  - Suggest Next Action
  - Draft Quotation
  - Draft Proposal
  - Draft Meeting Notes
- **Multilingual Output** — AI responses translated to Tamil, Hindi, Telugu, Kannada using Sarvam AI (Mayura v1)
- **Multiple AI Providers** — Supports Ollama (local), OpenAI, Gemini
- **Async Processing** — AI runs in background thread, no UI freeze
- **Audit Logging** — Every AI action logged with full history per lead
- **Chatter Integration** — Post AI results directly to lead chatter

##Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python, Odoo 17 ORM, HTTP Controllers |
| Frontend | OWL (Odoo Web Library), JavaScript, XML |
| AI (Local) | Ollama — llama3 |
| AI (Cloud) | OpenAI GPT-4, Google Gemini |
| Translation | Sarvam AI — Mayura v1 |
| Database | PostgreSQL |
| Speech | Web Speech API |
| Algorithms | Levenshtein Distance, Phonetic Fuzzy Matching |

## Languages Supported

- 🇬🇧 English (default)
- 🇮🇳 Tamil (தமிழ்)
- 🇮🇳 Hindi (हिंदी)
- 🇮🇳 Telugu (తెలుగు)
- 🇮🇳 Kannada (ಕನ್ನಡ)

## Requirements

- Odoo 17.0
- Python 3.10
- PostgreSQL 15
- Ollama (for local AI)
- Sarvam AI API key (for Indian language translation)

## 🔧 Installation

1. Clone this repository
2. Copy `voice_crm_fixed_v2` folder to your Odoo `custom_addons` directory
3. Update `odoo.conf` to include `custom_addons` in `addons_path`
4. Restart Odoo and install the module from Apps menu
5. Go to Settings → AI CRM Copilot → configure your AI provider and Sarvam API key

## 📸 Module Structure
voice_crm_fixed_v2/
├── controllers/
│ ├── ai_controller.py # AI action endpoints + Sarvam translation
│ └── voice_controller.py # Voice search endpoints
├── models/
│ ├── crm_lead.py # Extended CRM lead with AI fields
│ ├── res_config_settings.py # Settings fields
│ └── voice_crm_ai_log.py # Audit log model
├── static/src/
│ ├── js/ai_copilot.js # Main copilot component + speech recognition
│ └── xml/ai_copilot.xml # OWL template
├── views/
│ ├── crm_view.xml # CRM form view extensions
│ └── res_config_settings_view.xml
└── manifest.py


## Built With
- Odoo 17 framework
- Sarvam AI for Indian language translation
- Ollama for local LLM inference


User speaks → Browser captures audio → Phonetic fuzzy matching identifies CRM command
→ Ollama generates English response → Sarvam AI translates to selected language
→ Result shown in copilot panel + posted to lead chatter



## ⚙️ How It Works
