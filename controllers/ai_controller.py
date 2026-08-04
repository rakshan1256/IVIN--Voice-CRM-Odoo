import json
import logging
import threading
import time
import uuid
import urllib.request
import urllib.error

from odoo import http
from odoo.http import request

_logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# In-memory job store  (keyed by job_id string)
# Structure: { job_id: { 'status': 'pending'|'ok'|'error', 'result': str,
#                         'message': str, 'hint': str } }
# Jobs older than JOB_TTL seconds are purged on each new run_async call.
# ─────────────────────────────────────────────────────────────────────────────
_JOB_STORE = {}
_JOB_LOCK  = threading.Lock()
JOB_TTL    = 600   # 10 minutes


def _purge_old_jobs():
    cutoff = time.time() - JOB_TTL
    with _JOB_LOCK:
        stale = [k for k, v in _JOB_STORE.items() if v.get('ts', 0) < cutoff]
        for k in stale:
            del _JOB_STORE[k]


def _set_job(job_id, status, result='', message='', hint=''):
    with _JOB_LOCK:
        _JOB_STORE[job_id] = {
            'status':  status,
            'result':  result,
            'message': message,
            'hint':    hint,
            'ts':      time.time(),
        }


def _get_job(job_id):
    with _JOB_LOCK:
        return dict(_JOB_STORE.get(job_id, {'status': 'pending'}))


# ─────────────────────────────────────────────────────────────────────────────
# Language configuration
# Maps language code → full language name (used in translation prompts)
# ─────────────────────────────────────────────────────────────────────────────
LANGUAGE_NAMES = {
    'en': 'English',
    'hi': 'Hindi',
    'te': 'Telugu',
    'kn': 'Kannada',
    'ta': 'Tamil',
}

# Language codes that require translation (all non-English codes)
NON_ENGLISH_LANGS = set(LANGUAGE_NAMES.keys()) - {'en'}

# ─────────────────────────────────────────────────────────────────────────────
# Translation prompt
# Used in Step 2: translate the English CRM output into the target language.
# This produces far more natural, fluent output than asking the AI to write
# directly in a native language from raw CRM data.
# ─────────────────────────────────────────────────────────────────────────────
TRANSLATION_PROMPT = """\
You are a professional business translator specialising in CRM and sales communications.

Your task is to translate the following English CRM text into {language}.

Translation rules:
1. Produce natural, fluent {language} — write as a native {language} speaker would.
2. Do NOT translate word-for-word; convey the full business meaning naturally.
3. Keep professional sales and CRM terminology accurate in {language}.
4. Do NOT mix English into the output EXCEPT for:
   - Email addresses  (e.g. john@example.com)
   - Phone numbers    (e.g. +91 98765 43210)
   - Company names    (e.g. Tata Consultancy Services, Infosys)
   - Proper nouns / brand names
5. Preserve the original structure (paragraphs, bullet points, headings) in {language}.
6. The result must read as if it was originally written in {language} by a sales professional.
7. Do not add any preamble like "Here is the translation:" — output only the translated text.

English CRM text to translate:
\"\"\"
{english_text}
\"\"\"

Translated {language} output:"""


# ─────────────────────────────────────────────────────────────────────────────
# Config helpers
# ─────────────────────────────────────────────────────────────────────────────

def _get_param(key, default=''):
    return request.env['ir.config_parameter'].sudo().get_param(
        'voice_crm_fixed_v2.' + key, default
    )


def _get_ai_config():
    """Return (provider, config_dict) — reads all params once."""
    provider = _get_param('ai_provider', 'openai')
    cfg = {'provider': provider}
    if provider == 'openai':
        cfg['api_key'] = _get_param('openai_api_key', '')
        cfg['model']   = _get_param('openai_model', 'gpt-4o')
    elif provider == 'gemini':
        cfg['api_key'] = _get_param('gemini_api_key', '')
        cfg['model']   = _get_param('gemini_model', 'gemini-1.5-flash')
    elif provider == 'ollama':
        cfg['base_url'] = _get_param('ollama_base_url', 'http://localhost:11434')
        cfg['model']    = _get_param('ollama_model', 'llama3')
    # Sarvam is always read regardless of main provider
    cfg['sarvam_api_key'] = _get_param('sarvam_api_key', '')
    cfg['sarvam_enabled'] = _get_param('sarvam_enabled', 'False') in ('True', '1', 'true')
    return provider, cfg


# ─────────────────────────────────────────────────────────────────────────────
# Lead context builder
# ─────────────────────────────────────────────────────────────────────────────

def _build_lead_context(lead):
    lines = [
        f"Lead Name: {lead.name or ''}",
        f"Contact: {lead.contact_name or ''}",
        f"Company: {lead.partner_name or ''}",
        f"Email: {lead.email_from or ''}",
        f"Phone: {lead.phone or ''}",
        f"Mobile: {lead.mobile or ''}",
        f"Stage: {lead.stage_id.name if lead.stage_id else ''}",
        f"Expected Revenue: {lead.expected_revenue or 0}",
        f"Probability: {lead.probability or 0}%",
        f"Priority: {lead.priority or '0'}",
        f"Salesperson: {lead.user_id.name if lead.user_id else ''}",
        f"Sales Team: {lead.team_id.name if lead.team_id else ''}",
        f"City: {lead.city or ''}",
        f"Country: {lead.country_id.name if lead.country_id else ''}",
        f"Website: {lead.website or ''}",
        f"Job Position: {lead.function or ''}",
    ]
    if lead.description:
        lines.append(f"Notes: {lead.description[:500]}")
    return '\n'.join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# AI provider calls
# ─────────────────────────────────────────────────────────────────────────────

def _call_openai(prompt, api_key, model):
    url = 'https://api.openai.com/v1/chat/completions'
    payload = json.dumps({
        'model': model or 'gpt-4o',
        'messages': [{'role': 'user', 'content': prompt}],
        'max_tokens': 900,
        'temperature': 0.7,
    }).encode('utf-8')
    req = urllib.request.Request(url, data=payload, method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Authorization', f'Bearer {api_key}')
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    return data['choices'][0]['message']['content'].strip()


def _call_gemini(prompt, api_key, model):
    model = model or 'gemini-1.5-flash'
    url = (
        f'https://generativelanguage.googleapis.com/v1beta/models/'
        f'{model}:generateContent?key={api_key}'
    )
    payload = json.dumps({
        'contents': [{'parts': [{'text': prompt}]}]
    }).encode('utf-8')
    req = urllib.request.Request(url, data=payload, method='POST')
    req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    return data['candidates'][0]['content']['parts'][0]['text'].strip()


def _call_ollama(prompt, base_url, model):
    """
    Call Ollama with stream=False.
    Timeout is set to 300 s (5 min) to allow large models time to respond.
    This runs in a background thread so it never hits Odoo's HTTP response
    timeout (~30 s).
    """
    base_url = (base_url or 'http://localhost:11434').rstrip('/')
    url = f'{base_url}/api/generate'
    payload = json.dumps({
        'model': model or 'llama3',
        'prompt': prompt,
        'stream': False,
    }).encode('utf-8')
    req = urllib.request.Request(url, data=payload, method='POST')
    req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req, timeout=300) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    return data.get('response', '').strip()


def _call_sarvam_translate(text, sarvam_api_key, target_lang='ta'):
    """
    Translate English CRM text to Tamil or Hindi using Sarvam AI translate API.
    target_lang: 'ta' for Tamil, 'hi' for Hindi
    Sarvam AI endpoint: POST https://api.sarvam.ai/translate
    """
    if not sarvam_api_key:
        raise ValueError('Sarvam API key not configured. Go to Settings → AI CRM Copilot → Sarvam AI.')

    LANG_CODES = {
        'ta': 'ta-IN',
        'hi': 'hi-IN',
        'te': 'te-IN',
        'kn': 'kn-IN',
    }
    target_code = LANG_CODES.get(target_lang, 'ta-IN')

    url = 'https://api.sarvam.ai/translate'
    MAX_CHARS = 1000
    chunks = _split_text_chunks(text, MAX_CHARS)
    translated_parts = []

    for chunk in chunks:
        payload = json.dumps({
            'input':                chunk,
            'source_language_code': 'en-IN',
            'target_language_code': target_code,
            'speaker_gender':       'Male',
            'mode':                 'formal',
            'model':                'mayura:v1',
            'enable_preprocessing': True,
        }).encode('utf-8')

        req = urllib.request.Request(url, data=payload, method='POST')
        req.add_header('Content-Type', 'application/json')
        req.add_header('api-subscription-key', sarvam_api_key)

        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode('utf-8'))

        translated = data.get('translated_text', '')
        if not translated:
            raise ValueError(f'Sarvam returned empty translation. Response: {data}')
        translated_parts.append(translated)

    return '\n\n'.join(translated_parts)


def _split_text_chunks(text, max_chars):
    """
    Split text into chunks of max_chars, breaking at paragraph boundaries.
    This respects Sarvam's per-request character limits.
    """
    if len(text) <= max_chars:
        return [text]

    chunks = []
    paragraphs = text.split('\n\n')
    current = ''

    for para in paragraphs:
        if len(current) + len(para) + 2 <= max_chars:
            current = (current + '\n\n' + para).lstrip('\n')
        else:
            if current:
                chunks.append(current.strip())
            # If a single paragraph exceeds max_chars, split by sentences
            if len(para) > max_chars:
                sentences = para.replace('. ', '.\n').split('\n')
                for sent in sentences:
                    if len(current) + len(sent) + 1 <= max_chars:
                        current = (current + ' ' + sent).strip()
                    else:
                        if current:
                            chunks.append(current.strip())
                        current = sent
            else:
                current = para

    if current:
        chunks.append(current.strip())

    return [c for c in chunks if c]


def _call_ai_with_config(prompt, cfg):
    """Dispatch to the right provider using pre-fetched config."""
    provider = cfg['provider']
    if provider == 'openai':
        if not cfg.get('api_key'):
            raise ValueError('OpenAI API key not configured. Go to Settings → AI CRM Copilot.')
        return _call_openai(prompt, cfg['api_key'], cfg.get('model', 'gpt-4o'))
    elif provider == 'gemini':
        if not cfg.get('api_key'):
            raise ValueError('Gemini API key not configured. Go to Settings → AI CRM Copilot.')
        return _call_gemini(prompt, cfg['api_key'], cfg.get('model', 'gemini-1.5-flash'))
    elif provider == 'ollama':
        return _call_ollama(prompt, cfg.get('base_url', 'http://localhost:11434'), cfg.get('model', 'llama3'))
    else:
        raise ValueError(f'Unknown AI provider: {provider}')


# ─────────────────────────────────────────────────────────────────────────────
# Prompts  (always generated in English; translation handled as a separate step)
# ─────────────────────────────────────────────────────────────────────────────

SUMMARIZE_PROMPT = """You are an expert CRM analyst. Given the CRM lead data below, write a concise 3-5 sentence business summary covering: who the contact is, their stage, revenue potential, and any noteworthy details.

Lead Data:
{context}

Write in a professional tone. No preamble like "Here is a summary:". Start directly."""

FOLLOWUP_PROMPT = """You are an expert sales executive. Write a professional follow-up email for the CRM lead below.
Requirements:
- First line: "Subject: [your subject here]"
- Warm, concise, persuasive (150-200 words)
- Reference specific details from the lead
- Clear call to action at the end

Lead Data:
{context}"""

PREDICT_PROMPT = """You are a sales forecasting expert. Predict the closure probability for this CRM lead.

Lead Data:
{context}

Respond in EXACTLY this format (no extra text before or after):
PROBABILITY: [integer 0-100]
REASONING: [3-4 sentence explanation]"""

NEXT_ACTION_PROMPT = """You are a CRM sales coach. Suggest the single best next action to move this deal forward.

Lead Data:
{context}

Respond in EXACTLY this format:
ACTION: [one-line action title]
DETAILS: [2-3 sentence explanation of what to do and why]"""

QUOTATION_PROMPT = """You are an expert sales proposal writer. Generate a professional quotation draft.

Lead Data:
{context}

Include:
1. Introduction (who this is for)
2. Proposed Solution / Products / Services (use [Product/Service Name] placeholders)
3. Pricing table (placeholder amounts)
4. Payment terms
5. Validity period
6. Next steps

Format as a clean professional document."""

PROPOSAL_PROMPT = """You are a senior business development manager. Write a comprehensive business proposal.

Lead Data:
{context}

Include:
1. Executive Summary
2. Problem Statement / Business Need
3. Proposed Solution
4. Key Benefits
5. Implementation Timeline (placeholder)
6. Investment Summary (placeholder pricing)
7. Why Choose Us
8. Next Steps / Call to Action

Write in a confident, professional tone."""

MEETING_NOTES_PROMPT = """You are an expert CRM note taker. Generate a structured meeting notes template for the next meeting with this contact.

Lead Data:
{context}

Include:
1. Meeting header (Date: [TBD], Attendees: [TBD])
2. Agenda items (based on lead stage and details)
3. Discussion points to cover
4. Questions to ask the prospect
5. Action items section (empty, ready to fill)
6. Follow-up commitments section"""

PROMPT_MAP = {
    'summarize':           SUMMARIZE_PROMPT,
    'followup':            FOLLOWUP_PROMPT,
    'predict':             PREDICT_PROMPT,
    'next_action':         NEXT_ACTION_PROMPT,
    'draft_quotation':     QUOTATION_PROMPT,
    'draft_proposal':      PROPOSAL_PROMPT,
    'draft_meeting_notes': MEETING_NOTES_PROMPT,
}

VALID_ACTIONS = set(PROMPT_MAP.keys())


def _build_prompt(action, context_text):
    """Build the English CRM prompt.  Translation is handled separately."""
    return PROMPT_MAP[action].format(context=context_text)


def _build_translation_prompt(english_text, lang_code):
    """Build a translation prompt for the given target language."""
    lang_name = LANGUAGE_NAMES.get(lang_code, lang_code)
    return TRANSLATION_PROMPT.format(language=lang_name, english_text=english_text)


# ─────────────────────────────────────────────────────────────────────────────
# Post/save helpers
# ─────────────────────────────────────────────────────────────────────────────

def _save_log(env, lead_id, action_type, prompt, result, provider, posted=False):
    env['voice.crm.ai.log'].sudo().create({
        'lead_id':          lead_id,
        'action_type':      action_type,
        'ai_provider':      provider,
        'prompt_used':      prompt,
        'result_text':      result,
        'posted_to_chatter': posted,
    })


def _post_to_chatter(lead, body, subject='AI Copilot'):
    lead.message_post(
        body=(
            f'<strong>🤖 {subject}</strong><br/>'
            f'<pre style="white-space:pre-wrap;font-family:inherit">{body}</pre>'
        ),
        message_type='comment',
        subtype_xmlid='mail.mt_note',
    )


def _update_lead_fields(lead, action_type, result, probability=None):
    """Store AI result on the lead record for the smart insights block."""
    vals = {}
    if action_type == 'summarize':
        vals['ai_last_summary'] = result
    elif action_type == 'next_action':
        vals['ai_next_action'] = result
    elif action_type == 'predict' and probability is not None:
        vals['ai_closure_probability'] = probability
    if vals:
        lead.sudo().write(vals)


def _parse_probability(text):
    """Extract integer probability from predict response."""
    for line in text.splitlines():
        if line.strip().upper().startswith('PROBABILITY:'):
            try:
                return float(line.split(':', 1)[1].strip().rstrip('%'))
            except (ValueError, IndexError):
                pass
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Controller
# ─────────────────────────────────────────────────────────────────────────────

class AiCopilotController(http.Controller):

    def _get_lead(self, lead_id):
        if not lead_id:
            return None, {'status': 'error', 'message': 'No lead ID provided.'}
        lead = request.env['crm.lead'].browse(int(lead_id))
        if not lead.exists():
            return None, {'status': 'error', 'message': 'Lead not found.'}
        return lead, None

    # ── Lead info ──────────────────────────────────────────────────────────────
    @http.route('/ai_copilot/lead_info', type='json', auth='user', methods=['POST'], csrf=False)
    def get_lead_info(self, lead_id=None, **kw):
        try:
            lead, err = self._get_lead(lead_id)
            if err:
                return err
            provider, cfg = _get_ai_config()
            return {
                'status': 'ok',
                'provider':       provider,
                'sarvam_enabled': bool(cfg.get('sarvam_api_key')),  # true if key is set
                'lead': {
                    'id':                    lead.id,
                    'name':                  lead.name or '',
                    'contact_name':          lead.contact_name or '',
                    'company':               lead.partner_name or '',
                    'stage':                 lead.stage_id.name if lead.stage_id else '',
                    'probability':           lead.probability or 0,
                    'ai_closure_probability':lead.ai_closure_probability or 0,
                    'expected_revenue':      lead.expected_revenue or 0,
                    'priority':              lead.priority or '0',
                    'salesperson':           lead.user_id.name if lead.user_id else '',
                    'ai_last_summary':       lead.ai_last_summary or '',
                    'ai_next_action':        lead.ai_next_action or '',
                }
            }
        except Exception as e:
            _logger.exception('lead_info error')
            return {'status': 'error', 'message': str(e)}

    # ── Async dispatch ─────────────────────────────────────────────────────────
    @http.route('/ai_copilot/run_async', type='json', auth='user', methods=['POST'], csrf=False)
    def run_async(self, action=None, lead_id=None, lang='en', lang_mode='en', tamil_mode=False, **kw):
        """
        lang_mode: 'en' = English, 'ta' = Tamil, 'hi' = Hindi
        Sent from JS language selector. Translates via Sarvam AI when ta/hi.
        """
        try:
            _purge_old_jobs()

            if action not in VALID_ACTIONS:
                return {'status': 'error', 'message': f'Unknown action: {action}'}

            lead, err = self._get_lead(lead_id)
            if err:
                return err

            provider, cfg = _get_ai_config()
            context_text  = _build_lead_context(lead)
            prompt        = _build_prompt(action, context_text)
            lead_id_int   = lead.id
            db_name       = request.env.cr.dbname
            uid           = request.env.uid

            # lang_mode from JS selector; fall back to tamil_mode for compat
            effective_lang = lang_mode if lang_mode in ('ta', 'hi', 'te', 'kn') else ('ta' if tamil_mode else 'en')
            use_translate  = effective_lang in ('ta', 'hi', 'te', 'kn') and bool(cfg.get('sarvam_api_key'))

            job_id = str(uuid.uuid4())
            _set_job(job_id, 'pending')

            def _worker():
                try:
                    # Step 1: Generate English CRM content via main AI provider
                    english_result = _call_ai_with_config(prompt, cfg)

                    # Step 2: Translate via Sarvam if Tamil or Hindi selected
                    if use_translate:
                        lang_name = {'ta': 'Tamil', 'hi': 'Hindi', 'te': 'Telugu', 'kn': 'Kannada'}.get(effective_lang, effective_lang)
                        try:
                            result = _call_sarvam_translate(
                                english_result,
                                cfg['sarvam_api_key'],
                                target_lang=effective_lang,
                            )
                            _logger.info('Sarvam %s translation successful for action %s', lang_name, action)
                        except Exception as sarvam_err:
                            _logger.warning('Sarvam translation failed, using English: %s', sarvam_err)
                            result = english_result + f'\n\n[{lang_name} translation failed: {sarvam_err}]'
                    else:
                        result = english_result

                    # Write back to lead in a fresh environment
                    try:
                        import odoo
                        with odoo.registry(db_name).cursor() as cr:
                            env = odoo.api.Environment(cr, uid, {})
                            lead_rec = env['crm.lead'].browse(lead_id_int)
                            if lead_rec.exists():
                                probability = None
                                if action == 'predict':
                                    probability = _parse_probability(result)
                                _update_lead_fields(lead_rec, action, result, probability)
                                _save_log(env, lead_id_int, action, prompt, result, provider)
                    except Exception as db_err:
                        _logger.warning('AI worker DB write failed: %s', db_err)
                    _set_job(job_id, 'ok', result=result)
                except Exception as e:
                    _logger.exception('AI worker error for job %s', job_id)
                    hint = ''
                    msg  = str(e)
                    if 'timed out' in msg.lower() or 'timeout' in msg.lower():
                        hint = 'Ollama took too long. Try a smaller model or increase timeout.'
                    elif 'connection refused' in msg.lower():
                        hint = 'Cannot connect to Ollama. Make sure it is running at the configured URL.'
                    elif 'api key' in msg.lower() or '401' in msg:
                        hint = 'Invalid API key. Check Settings → AI CRM Copilot.'
                    elif 'sarvam' in msg.lower():
                        hint = 'Sarvam translation failed. Check your Sarvam API key in Settings.'
                    _set_job(job_id, 'error', message=msg, hint=hint)

            t = threading.Thread(target=_worker, daemon=True)
            t.start()
            return {'status': 'queued', 'job_id': job_id}

        except Exception as e:
            _logger.exception('run_async error')
            return {'status': 'error', 'message': str(e)}

    # ── Poll ───────────────────────────────────────────────────────────────────
    @http.route('/ai_copilot/poll', type='json', auth='user', methods=['POST'], csrf=False)
    def poll(self, job_id=None, **kw):
        """Return current status of a background AI job."""
        if not job_id:
            return {'status': 'error', 'message': 'No job_id provided.'}
        return _get_job(job_id)

    # ── Post to Chatter (standalone — does NOT re-run AI) ─────────────────────
    @http.route('/ai_copilot/post_chatter', type='json', auth='user', methods=['POST'], csrf=False)
    def post_chatter(self, lead_id=None, action_type=None, result_text=None, title=None, **kw):
        """Post an already-generated AI result to the lead chatter."""
        try:
            lead, err = self._get_lead(lead_id)
            if err:
                return err
            if not result_text:
                return {'status': 'error', 'message': 'No result text to post.'}
            subject = title or 'AI Copilot'
            _post_to_chatter(lead, result_text, subject)
            # Mark the latest matching log as posted
            if action_type:
                log = request.env['voice.crm.ai.log'].sudo().search(
                    [('lead_id', '=', lead.id), ('action_type', '=', action_type)],
                    order='id desc', limit=1,
                )
                if log:
                    log.write({'posted_to_chatter': True})
            return {'status': 'ok'}
        except Exception as e:
            _logger.exception('post_chatter error')
            return {'status': 'error', 'message': str(e)}

    # ─────────────────────────────────────────────────────────────────────────
    # Legacy synchronous endpoints — kept for backward compatibility
    # ─────────────────────────────────────────────────────────────────────────

    def _sync_action(self, action, lead_id, post_to_chatter_flag=False, lang='en'):
        """Shared implementation for legacy synchronous endpoints."""
        try:
            lead, err = self._get_lead(lead_id)
            if err:
                return err
            provider, cfg = _get_ai_config()
            context_text  = _build_lead_context(lead)
            prompt        = _build_prompt(action, context_text)
            # Step 1: Generate English CRM content
            english_result = _call_ai_with_config(prompt, cfg)
            # Step 2: Translate via Sarvam if enabled
            if cfg.get('sarvam_enabled') and cfg.get('sarvam_api_key'):
                try:
                    result = _call_sarvam_translate(english_result, cfg['sarvam_api_key'])
                except Exception as sarvam_err:
                    _logger.warning('Sarvam translation failed: %s', sarvam_err)
                    result = english_result
            else:
                result = english_result

            probability = None
            if action == 'predict':
                probability = _parse_probability(result)

            _update_lead_fields(lead, action, result, probability)
            _save_log(request.env, lead.id, action, prompt, result, provider)

            if post_to_chatter_flag:
                _post_to_chatter(lead, result, action.replace('_', ' ').title())
                log = request.env['voice.crm.ai.log'].sudo().search(
                    [('lead_id', '=', lead.id), ('action_type', '=', action)],
                    order='id desc', limit=1,
                )
                if log:
                    log.write({'posted_to_chatter': True})

            res = {'status': 'ok', 'result': result}
            if probability is not None:
                res['probability'] = probability
            return res
        except Exception as e:
            _logger.exception('sync action %s error', action)
            return {'status': 'error', 'message': str(e)}

    @http.route('/ai_copilot/save_to_insights', type='json', auth='user', methods=['POST'], csrf=False)
    def save_to_insights(self, lead_id=None, action_type=None, result_text=None, **kw):
        """
        Saves the AI result directly into the AI Insights fields on the lead form.

        Mapping:
          summarize          → ai_last_summary
          followup           → ai_last_summary (stored as summary with email label)
          predict            → ai_closure_probability (extracts %) + ai_last_summary
          next_action        → ai_next_action
          draft_quotation    → ai_last_summary (stored with label)
          draft_proposal     → ai_last_summary (stored with label)
          draft_meeting_notes→ ai_last_summary (stored with label)
        """
        try:
            if not lead_id or not result_text:
                return {'status': 'error', 'message': 'Missing lead_id or result_text.'}

            lead = request.env['crm.lead'].browse(int(lead_id))
            if not lead.exists():
                return {'status': 'error', 'message': 'Lead not found.'}

            vals = {}
            import re

            if action_type == 'summarize':
                vals['ai_last_summary'] = result_text

            elif action_type == 'followup':
                vals['ai_last_summary'] = f"[Follow-up Email Draft]\n\n{result_text}"

            elif action_type == 'predict':
                # Try to extract % from result
                pct_match = re.search(r'(\d{1,3})\s*%', result_text)
                if pct_match:
                    vals['ai_closure_probability'] = float(pct_match.group(1))
                # Also try PROBABILITY: N format
                if 'ai_closure_probability' not in vals:
                    for line in result_text.splitlines():
                        if line.strip().upper().startswith('PROBABILITY:'):
                            try:
                                vals['ai_closure_probability'] = float(
                                    line.split(':', 1)[1].strip().rstrip('%')
                                )
                            except (ValueError, IndexError):
                                pass
                            break
                vals['ai_last_summary'] = f"[Closure Prediction]\n\n{result_text}"

            elif action_type == 'next_action':
                vals['ai_next_action'] = result_text

            elif action_type == 'draft_quotation':
                vals['ai_last_summary'] = f"[Quotation Draft]\n\n{result_text}"

            elif action_type == 'draft_proposal':
                vals['ai_last_summary'] = f"[Proposal Draft]\n\n{result_text}"

            elif action_type == 'draft_meeting_notes':
                vals['ai_last_summary'] = f"[Meeting Notes]\n\n{result_text}"

            else:
                vals['ai_last_summary'] = result_text

            if vals:
                lead.sudo().write(vals)

            # Also update the log entry
            try:
                AiLog = request.env['voice.crm.ai.log']
                log = AiLog.search([
                    ('lead_id', '=', lead.id),
                    ('action_type', '=', action_type),
                ], order='create_date desc', limit=1)
                if log:
                    log.write({'posted_to_chatter': True})
            except Exception:
                pass

            field_saved = list(vals.keys())[0] if vals else 'ai_last_summary'
            label_map = {
                'ai_last_summary':        'Last AI Summary',
                'ai_next_action':         'Suggested Next Action',
                'ai_closure_probability': 'AI Closure Probability',
            }
            return {
                'status': 'ok',
                'message': f"Saved to {label_map.get(field_saved, 'AI Insights')}!",
            }

        except Exception as e:
            _logger.exception('save_to_insights error')
            return {'status': 'error', 'message': str(e)}

    @http.route('/ai_copilot/summarize',           type='json', auth='user', methods=['POST'], csrf=False)
    def summarize(self, lead_id=None, post_to_chatter=False, lang='en', **kw):
        return self._sync_action('summarize', lead_id, post_to_chatter, lang)

    @http.route('/ai_copilot/followup',            type='json', auth='user', methods=['POST'], csrf=False)
    def followup(self, lead_id=None, post_to_chatter=False, lang='en', **kw):
        return self._sync_action('followup', lead_id, post_to_chatter, lang)

    @http.route('/ai_copilot/predict',             type='json', auth='user', methods=['POST'], csrf=False)
    def predict(self, lead_id=None, post_to_chatter=False, lang='en', **kw):
        return self._sync_action('predict', lead_id, post_to_chatter, lang)

    @http.route('/ai_copilot/next_action',         type='json', auth='user', methods=['POST'], csrf=False)
    def next_action(self, lead_id=None, post_to_chatter=False, lang='en', **kw):
        return self._sync_action('next_action', lead_id, post_to_chatter, lang)

    @http.route('/ai_copilot/draft_quotation',     type='json', auth='user', methods=['POST'], csrf=False)
    def draft_quotation(self, lead_id=None, post_to_chatter=False, lang='en', **kw):
        return self._sync_action('draft_quotation', lead_id, post_to_chatter, lang)

    @http.route('/ai_copilot/draft_proposal',      type='json', auth='user', methods=['POST'], csrf=False)
    def draft_proposal(self, lead_id=None, post_to_chatter=False, lang='en', **kw):
        return self._sync_action('draft_proposal', lead_id, post_to_chatter, lang)

    @http.route('/ai_copilot/draft_meeting_notes', type='json', auth='user', methods=['POST'], csrf=False)
    def draft_meeting_notes(self, lead_id=None, post_to_chatter=False, lang='en', **kw):
        return self._sync_action('draft_meeting_notes', lead_id, post_to_chatter, lang)
