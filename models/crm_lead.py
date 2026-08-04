from odoo import api, fields, models


class CrmLead(models.Model):
    _inherit = 'crm.lead'

    ai_action_count = fields.Integer(
        string='AI Actions',
        compute='_compute_ai_action_count',
        store=False,
    )
    ai_last_summary = fields.Text(string='Last AI Summary', readonly=True)
    ai_closure_probability = fields.Float(
        string='AI Closure Probability (%)',
        readonly=True,
        digits=(5, 1),
    )
    ai_next_action = fields.Text(string='AI Suggested Next Action', readonly=True)


    @api.depends('ai_action_count')
    def _compute_ai_action_count(self):
        AiLog = self.env['voice.crm.ai.log']
        for lead in self:
            lead.ai_action_count = AiLog.search_count([('lead_id', '=', lead.id)])

    def action_open_voice_widget(self):
        """Opens the Voice Lead Creator popup."""
        return {
            'type': 'ir.actions.client',
            'tag': 'voice_crm_action',
            'target': 'new',
            'context': {'active_id': self.id if self else False},
        }

    def action_open_voice_search(self):
        """Opens the Voice Lead Search popup."""
        return {
            'type': 'ir.actions.client',
            'tag': 'voice_crm_search_action',
            'target': 'new',
        }

    def action_open_ai_copilot(self):
        """Opens the AI Copilot side panel."""
        return {
            'type': 'ir.actions.client',
            'tag': 'ai_copilot_action',
            'target': 'new',
            'name': '🤖 AI CRM Copilot',
            'context': {'active_id': self.id},
        }

    def action_view_ai_logs(self):
        """Smart button: view all AI action logs for this lead."""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': 'AI Copilot History',
            'res_model': 'voice.crm.ai.log',
            'view_mode': 'list,form',
            'domain': [('lead_id', '=', self.id)],
            'context': {'default_lead_id': self.id},
        }


