{
    'name': 'Voice CRM + AI Copilot',
    'version': '17.0.2.0.0',
    'author': 'Voice CRM Team',
    'category': 'CRM',
    'summary': 'Voice Lead Creator + AI CRM Copilot — Summarize, Follow-up, Predict, Auto-draft inside Odoo 17',
    'description': """
AI CRM Copilot inside Odoo 17
==============================
* Voice Lead Creator (Quick Record & Interview Mode)
* Voice Lead Search
* AI Copilot panel on every lead:
  - Summarize this lead
  - Generate follow-up email
  - Predict closure probability
  - Suggest next action
* AI Provider support: OpenAI, Ollama (local), Gemini
* Smart Buttons: AI Summary, AI Actions count
* Chatter integration: post AI outputs as internal notes
* Auto-draft: Quotations, Proposals, Meeting Notes
    """,

    'depends': ['base', 'web', 'crm', 'mail'],

    'data': [
        'security/ir.model.access.csv',
        'views/res_config_settings_view.xml',
        'views/crm_view.xml',
    ],

    'assets': {
        'web.assets_backend': [
            'voice_crm_fixed_v2/static/src/js/voice_crm.js',
            'voice_crm_fixed_v2/static/src/js/ai_copilot.js',
            'voice_crm_fixed_v2/static/src/xml/ai_copilot.xml',
        ],
    },

    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
