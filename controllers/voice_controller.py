import logging
from odoo import http
from odoo.http import request

_logger = logging.getLogger(__name__)


class VoiceCrmController(http.Controller):

    # ─────────────────────────────────────────────────────────────────────────
    # CREATE / UPDATE LEAD
    # ─────────────────────────────────────────────────────────────────────────
    @http.route('/voice_crm/create_lead', type='json', auth='user', methods=['POST'], csrf=False)
    def create_lead_from_voice(self, transcript='', lead_id=None,
                               name='', contact_name='',
                               phone='', mobile='',
                               email='', email_cc='',
                               street='', city='', state_name='', zip='', country_name='',
                               website='', function='', title='', priority=None,
                               **kwargs):
        try:
            transcript = (transcript or '').strip()
            if not transcript and not name:
                return {'status': 'error', 'message': 'Empty transcript received.'}

            Lead = request.env['crm.lead']

            def _v(val):
                """Return val if non-empty, else False."""
                return val if val not in (None, '', False) else False

            # ── Resolve many2one lookups ──────────────────────────────────────
            state_id, country_id, title_id = False, False, False

            if state_name:
                rec = request.env['res.country.state'].search(
                    [('name', 'ilike', state_name)], limit=1)
                if rec:
                    state_id = rec.id

            if country_name:
                rec = request.env['res.country'].search(
                    [('name', 'ilike', country_name)], limit=1)
                if rec:
                    country_id = rec.id

            if title:
                rec = request.env['res.partner.title'].search(
                    [('name', 'ilike', title)], limit=1)
                if rec:
                    title_id = rec.id

            # ── Build values dict ─────────────────────────────────────────────
            vals = {
                'name':         _v(name) or transcript[:80] or 'Voice Lead',
                'contact_name': _v(contact_name),
                'phone':        _v(phone),
                'mobile':       _v(mobile),
                'email_from':   _v(email),
                'email_cc':     _v(email_cc),
                'street':       _v(street),
                'city':         _v(city),
                'zip':          _v(zip),
                'website':      _v(website),
                'function':     _v(function),
                'type':         'lead',
            }

            if priority is not None and str(priority) in ('0', '1', '2', '3'):
                vals['priority'] = str(priority)
            if state_id:   vals['state_id']   = state_id
            if country_id: vals['country_id'] = country_id
            if title_id:   vals['title']      = title_id

            # Strip False/empty so we don't blank out existing fields on update
            write_vals = {k: v for k, v in vals.items()
                          if v not in (False, None, '') or k == 'name'}

            if lead_id:
                lead = Lead.browse(int(lead_id))
                if not lead.exists():
                    return {'status': 'error', 'message': 'Lead not found.'}
                write_vals.pop('type', None)
                if write_vals:
                    lead.write(write_vals)
                return {'status': 'ok', 'lead_id': lead.id,
                        'lead_name': lead.name, 'action': 'updated'}
            else:
                lead = Lead.create(write_vals)
                return {'status': 'ok', 'lead_id': lead.id,
                        'lead_name': lead.name, 'action': 'created'}

        except Exception as e:
            _logger.exception("VoiceCRM create_lead error")
            return {'status': 'error', 'message': str(e)}

    # ─────────────────────────────────────────────────────────────────────────
    # SEARCH LEADS  — accepts a structured `filters` dict from JS
    # ─────────────────────────────────────────────────────────────────────────
    @http.route('/voice_crm/search_lead', type='json', auth='user', methods=['POST'], csrf=False)
    def search_lead_by_voice(self, filters=None, query='', **kwargs):
        """
        `filters` is the dict produced by JS extractSearchFilters().
        Supported keys:
            name, phone, mobile, email, email_cc,
            city, state_name, zip, country_name, street,
            website, function, title,
            company, salesperson, sales_team,
            priority  ('0'|'1'|'2'|'3')
            _native   (raw native-script text for additional ilike pass)

        Backward-compatible: if `filters` is absent but `query` is present,
        treat it as a plain name search.
        """
        try:
            # ── backward-compat ───────────────────────────────────────────────
            if not filters:
                if query:
                    filters = {'name': query.strip()}
                else:
                    return {'status': 'error', 'message': 'No search criteria provided.'}

            filters = filters or {}
            if not filters:
                return {'status': 'error', 'message': 'No search criteria provided.'}

            # Extract and remove the native-script fallback value before building domain
            native_val = (filters.pop('_native', None) or '').strip()

            Lead   = request.env['crm.lead']
            domain = []

            # ── Name ─────────────────────────────────────────────────────────
            name_val  = (filters.get('name') or '').strip()
            has_other = any(v for k, v in filters.items() if k != 'name' and v not in (None, '', False))

            if name_val and not has_other:
                # Name-only search: broad OR across name/contact + native script fallback
                if native_val and native_val != name_val:
                    # Search translated English name AND original native script
                    domain += [
                        '|', '|', '|', '|', '|',
                        ('name',         'ilike', name_val),
                        ('contact_name', 'ilike', name_val),
                        ('phone',        'ilike', name_val),
                        ('email_from',   'ilike', name_val),
                        ('name',         'ilike', native_val),
                        ('contact_name', 'ilike', native_val),
                    ]
                else:
                    domain += [
                        '|', '|', '|',
                        ('name',         'ilike', name_val),
                        ('contact_name', 'ilike', name_val),
                        ('phone',        'ilike', name_val),
                        ('email_from',   'ilike', name_val),
                    ]
            elif name_val:
                # Name + other filters → narrower OR just on name/contact
                if native_val and native_val != name_val:
                    domain += [
                        '|', '|', '|',
                        ('name',         'ilike', name_val),
                        ('contact_name', 'ilike', name_val),
                        ('email_from',   'ilike', name_val),
                        ('name',         'ilike', native_val),
                    ]
                else:
                    domain += [
                        '|', '|',
                        ('name',         'ilike', name_val),
                        ('contact_name', 'ilike', name_val),
                        ('email_from',   'ilike', name_val),
                    ]
            elif native_val and not has_other:
                # Only native text (no translated name) — search by native directly
                domain += [
                    '|',
                    ('name',         'ilike', native_val),
                    ('contact_name', 'ilike', native_val),
                ]

            # ── Phone ─────────────────────────────────────────────────────────
            if filters.get('phone'):
                domain.append(('phone', 'ilike', filters['phone']))

            # ── Mobile ────────────────────────────────────────────────────────
            if filters.get('mobile'):
                domain.append(('mobile', 'ilike', filters['mobile']))

            # ── Email (primary) ───────────────────────────────────────────────
            if filters.get('email'):
                domain.append(('email_from', 'ilike', filters['email']))

            # ── Email CC ──────────────────────────────────────────────────────
            if filters.get('email_cc'):
                domain.append(('email_cc', 'ilike', filters['email_cc']))

            # ── City ──────────────────────────────────────────────────────────
            if filters.get('city'):
                domain.append(('city', 'ilike', filters['city']))

            # ── State ─────────────────────────────────────────────────────────
            if filters.get('state_name'):
                state = request.env['res.country.state'].search(
                    [('name', 'ilike', filters['state_name'])], limit=1)
                if state:
                    domain.append(('state_id', '=', state.id))
                else:
                    domain.append(('state_id.name', 'ilike', filters['state_name']))

            # ── ZIP ───────────────────────────────────────────────────────────
            if filters.get('zip'):
                domain.append(('zip', 'ilike', filters['zip']))

            # ── Country ───────────────────────────────────────────────────────
            if filters.get('country_name'):
                country = request.env['res.country'].search(
                    [('name', 'ilike', filters['country_name'])], limit=1)
                if country:
                    domain.append(('country_id', '=', country.id))
                else:
                    domain.append(('country_id.name', 'ilike', filters['country_name']))

            # ── Street ────────────────────────────────────────────────────────
            if filters.get('street'):
                domain.append(('street', 'ilike', filters['street']))

            # ── Website ───────────────────────────────────────────────────────
            if filters.get('website'):
                domain.append(('website', 'ilike', filters['website']))

            # ── Job Position ──────────────────────────────────────────────────
            if filters.get('function'):
                domain.append(('function', 'ilike', filters['function']))

            # ── Title ─────────────────────────────────────────────────────────
            if filters.get('title'):
                title_rec = request.env['res.partner.title'].search(
                    [('name', 'ilike', filters['title'])], limit=1)
                if title_rec:
                    domain.append(('title', '=', title_rec.id))

            # ── Company ───────────────────────────────────────────────────────
            if filters.get('company'):
                domain.append(('partner_name', 'ilike', filters['company']))

            # ── Salesperson ───────────────────────────────────────────────────
            if filters.get('salesperson'):
                user = request.env['res.users'].search(
                    [('name', 'ilike', filters['salesperson'])], limit=1)
                if user:
                    domain.append(('user_id', '=', user.id))

            # ── Sales Team ────────────────────────────────────────────────────
            if filters.get('sales_team'):
                team = request.env['crm.team'].search(
                    [('name', 'ilike', filters['sales_team'])], limit=1)
                if team:
                    domain.append(('team_id', '=', team.id))

            # ── Priority ──────────────────────────────────────────────────────
            if filters.get('priority') is not None:
                p = str(filters['priority'])
                if p in ('0', '1', '2', '3'):
                    domain.append(('priority', '=', p))

            if not domain:
                return {'status': 'error', 'message': 'No valid search criteria found.'}

            leads = Lead.search(domain, limit=20)
            if not leads:
                return {'status': 'not_found', 'leads': []}

            STARS = {'0': '', '1': '★', '2': '★★', '3': '★★★'}

            results = []
            for lead in leads:
                results.append({
                    'id':               lead.id,
                    'name':             lead.name or '',
                    'contact_name':     lead.contact_name or '',
                    'title':            lead.title.name if lead.title else '',
                    'function':         lead.function or '',
                    'phone':            lead.phone or '',
                    'mobile':           lead.mobile or '',
                    'email':            lead.email_from or '',
                    'email_cc':         lead.email_cc or '',
                    'company':          lead.partner_name or '',
                    'website':          lead.website or '',
                    'street':           lead.street or '',
                    'city':             lead.city or '',
                    'state':            lead.state_id.name if lead.state_id else '',
                    'zip':              lead.zip or '',
                    'country':          lead.country_id.name if lead.country_id else '',
                    'stage':            lead.stage_id.name if lead.stage_id else '',
                    'priority':         lead.priority or '0',
                    'priority_label':   STARS.get(lead.priority or '0', ''),
                    'salesperson':      lead.user_id.name if lead.user_id else '',
                    'sales_team':       lead.team_id.name if lead.team_id else '',
                    'expected_revenue': str(lead.expected_revenue) if lead.expected_revenue else '',
                })

            return {'status': 'ok', 'count': len(results), 'leads': results}

        except Exception as e:
            _logger.exception("VoiceCRM search_lead error")
            return {'status': 'error', 'message': str(e)}
