from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    # AI Provider selection
    ai_provider = fields.Selection(
        selection=[
            ('openai', 'OpenAI (GPT-4)'),
            ('gemini', 'Google Gemini'),
            ('ollama', 'Ollama (Local LLM)'),
        ],
        string='AI Provider',
        default='openai',
        config_parameter='voice_crm_fixed_v2.ai_provider',
    )

    # OpenAI
    openai_api_key = fields.Char(
        string='OpenAI API Key',
        config_parameter='voice_crm_fixed_v2.openai_api_key',
    )
    openai_model = fields.Char(
        string='OpenAI Model',
        default='gpt-4o',
        config_parameter='voice_crm_fixed_v2.openai_model',
    )

    # Gemini
    gemini_api_key = fields.Char(
        string='Gemini API Key',
        config_parameter='voice_crm_fixed_v2.gemini_api_key',
    )
    gemini_model = fields.Char(
        string='Gemini Model',
        default='gemini-1.5-flash',
        config_parameter='voice_crm_fixed_v2.gemini_model',
    )

    # Ollama
    ollama_base_url = fields.Char(
        string='Ollama Base URL',
        default='http://localhost:11434',
        config_parameter='voice_crm_fixed_v2.ollama_base_url',
    )
    ollama_model = fields.Char(
        string='Ollama Model',
        default='llama3',
        config_parameter='voice_crm_fixed_v2.ollama_model',
    )

    # ── Sarvam AI (Translation) ──────────────────────────────────────────────
    sarvam_api_key = fields.Char(
        string='Sarvam AI API Key',
        config_parameter='voice_crm_fixed_v2.sarvam_api_key',
        help='Get your API key from https://dashboard.sarvam.ai',
    )
    sarvam_enabled = fields.Boolean(
        string='Enable Sarvam Tamil Translation',
        default=False,
        config_parameter='voice_crm_fixed_v2.sarvam_enabled',
        help='When enabled, AI responses will be translated to Tamil using Sarvam AI.',
    )
