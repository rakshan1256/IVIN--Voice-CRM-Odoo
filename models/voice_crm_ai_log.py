from odoo import fields, models


class VoiceCrmAiLog(models.Model):
    _name = 'voice.crm.ai.log'
    _description = 'AI Copilot Action Log'
    _order = 'create_date desc'
    _rec_name = 'action_type'

    lead_id = fields.Many2one('crm.lead', string='Lead', ondelete='cascade', required=True)
    action_type = fields.Selection(
        selection=[
            ('summarize', 'Summarize Lead'),
            ('followup', 'Follow-up Email'),
            ('predict', 'Predict Closure'),
            ('next_action', 'Next Action'),
            ('draft_quotation', 'Draft Quotation'),
            ('draft_proposal', 'Draft Proposal'),
            ('draft_meeting_notes', 'Draft Meeting Notes'),
        ],
        string='Action',
        required=True,
    )
    ai_provider = fields.Char(string='AI Provider')
    prompt_used = fields.Text(string='Prompt')
    result_text = fields.Text(string='AI Response')
    posted_to_chatter = fields.Boolean(string='Posted to Chatter', default=False)
    create_date = fields.Datetime(string='Date', readonly=True)
