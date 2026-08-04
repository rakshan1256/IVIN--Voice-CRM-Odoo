/** @odoo-module **/
/**
 * ai_copilot.js  –  AI CRM Copilot  (English + Voice Edition)
 *
 * All AI output is in English.
 * A 🎤 Speak button lets the user trigger any AI action by voice.
 *
 * Voice command examples recognised:
 *   "summarize", "summarise", "generate summary", "lead summary",
 *   "generate lead summary", "summarize lead"
 *   → runAction('summarize')
 *
 *   "follow up", "followup", "follow-up email", "generate follow up email"
 *   → runAction('followup')
 *
 *   "predict", "closure probability", "predict closure", "closure prediction"
 *   → runAction('predict')
 *
 *   "next action", "suggest next action", "what's next", "next step"
 *   → runAction('next_action')
 *
 *   "draft quotation", "quotation", "generate quotation"
 *   → runAction('draft_quotation')
 *
 *   "draft proposal", "proposal", "generate proposal"
 *   → runAction('draft_proposal')
 *
 *   "meeting notes", "draft meeting", "meeting minutes"
 *   → runAction('draft_meeting_notes')
 */

import { Component, useState, onMounted, onWillUnmount } from "@odoo/owl";
import { registry }   from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

// ─────────────────────────────────────────────────────────────────────────────
// VOICE → ACTION MATCHING  (Phonetic + Multi-Candidate "Dumb Charades" Edition)
// ─────────────────────────────────────────────────────────────────────────────

/** Normalise: lower-case, strip punctuation, collapse whitespace */
function normalise(s) {
    return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

// ── Phonetic Sound-Alike Map ─────────────────────────────────────────────────
// Every key is something speech recognition might hear; value is the CRM keyword
// it actually represents. This drives accurate matching for homophones/near-homophones.
const SOUND_ALIKES = {
    // ── summarise ──
    "summer":      "summarise",
    "summers":     "summarise",
    "summery":     "summarise",
    "summary":     "summarise",
    "summaries":   "summarise",
    "summarise":   "summarise",
    "summarize":   "summarise",
    "someries":    "summarise",
    "somewhere":   "summarise",
    "someplace":   "summarise",
    "some":        "summarise",
    "is":          "summarise",   // "summer IS here" — filler word bridges
    // ── lead ──
    "lead":   "lead",
    "leads":  "lead",
    "led":    "lead",
    "lied":   "lead",
    "lid":    "lead",
    "laid":   "lead",
    "leave":  "lead",
    "read":   "lead",
    "need":   "lead",
    "feed":   "lead",
    "deed":   "lead",
    "here":   "lead",   // "summer is HERE" sounds like "lead"
    "hear":   "lead",
    // ── follow ──
    "follow":   "follow",
    "falling":  "follow",
    "fallen":   "follow",
    "hollow":   "follow",
    "fallow":   "follow",
    "fellow":   "follow",
    "valley":   "follow",
    "follow-up":"follow",
    // ── up ──
    "up":  "up",
    "app": "up",
    "opt": "up",
    // ── email ──
    "email":  "email",
    "gmail":  "email",
    "mail":   "email",
    "male":   "email",
    // ── predict ──
    "predict":    "predict",
    "predicted":  "predict",
    "prediction": "predict",
    "predicts":   "predict",
    "product":    "predict",   // common mishear
    "protect":    "predict",
    // ── closure ──
    "closure":  "closure",
    "closer":   "closure",
    "closing":  "closure",
    "clothes":  "closure",
    "clothe":   "closure",
    "close":    "closure",
    // ── probability ──
    "probability": "probability",
    "probably":    "probability",
    "probable":    "probability",
    // ── next ──
    "next":  "next",
    "text":  "next",
    "necks": "next",
    // ── action ──
    "action":  "action",
    "actions": "action",
    "auction": "action",
    "acting":  "action",
    // ── step ──
    "step":  "step",
    "steps": "step",
    // ── suggest ──
    "suggest":  "suggest",
    "suggests": "suggest",
    // ── quotation ──
    "quotation":  "quotation",
    "quotations": "quotation",
    "quotient":   "quotation",   // "draft QUOTIENT" — common mishear for quotation
    "quotient's": "quotation",
    "quote":      "quotation",
    "quotes":     "quotation",
    "quota":      "quotation",
    "notation":   "quotation",
    "curation":   "quotation",
    // ── proposal ──
    "proposal":   "proposal",
    "proposals":  "proposal",
    "propose":    "proposal",
    "disposal":   "proposal",
    "professor":  "proposal",   // "draft PROFESSOR" — mishear for proposal
    "professor's":"proposal",
    "proposer":   "proposal",
    "proposing":  "proposal",
    // ── meeting ──
    "meeting":  "meeting",
    "meetings": "meeting",
    "beating":  "meeting",
    "eating":   "meeting",
    "greeting": "meeting",
    "seating":  "meeting",
    // ── notes ──
    "notes":   "notes",
    "note":    "notes",
    "notes's": "notes",
    "boats":   "notes",
    "votes":   "notes",
    "quotes":  "notes",
    // ── minutes ──
    "minutes": "minutes",
    "minute":  "minutes",
    // ── generate ──
    "generate":  "generate",
    "generated": "generate",
    // ── draft ──
    "draft":    "draft",
    "drafting": "draft",
    "draught":  "draft",
    "drafted":  "draft",
    // ── ice cream / random words — map to nothing (keeps score low) ──
};

// ── Levenshtein distance ─────────────────────────────────────────────────────
function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = [];
    for (let i = 0; i <= m; i++) {
        dp[i] = [i];
        for (let j = 1; j <= n; j++) {
            dp[i][j] = i === 0 ? j :
                (a[i-1] === b[j-1]
                    ? dp[i-1][j-1]
                    : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]));
        }
    }
    return dp[m][n];
}

function resolveWord(w) {
    return SOUND_ALIKES[w] || w;
}

/**
 * Word similarity 0–1 between a spoken word and a target CRM keyword.
 * Pipeline: exact → sound-alike → prefix → Levenshtein (on original + resolved)
 */
function wordSim(spoken, target) {
    if (!spoken || !target) return 0;
    if (spoken === target) return 1;

    const resolved        = resolveWord(spoken);
    const resolvedTarget  = resolveWord(target);

    // Sound-alike direct hit
    if (resolved === target)         return 0.95;
    if (resolved === resolvedTarget) return 0.90;

    // Prefix matches (handles partial speech e.g. "summ" for "summarise")
    if (target.startsWith(spoken)   && spoken.length   >= 3) return 0.85;
    if (spoken.startsWith(target)   && target.length   >= 3) return 0.80;
    if (target.startsWith(resolved) && resolved.length >= 3) return 0.82;
    if (resolved.startsWith(target) && target.length   >= 3) return 0.78;

    // Levenshtein on original (1 edit per 3 chars)
    const maxD1 = Math.max(1, Math.floor(Math.max(spoken.length, target.length) / 3));
    const d1    = levenshtein(spoken, target);
    if (d1 <= maxD1) return Math.max(0, 1 - d1 / Math.max(spoken.length, target.length));

    // Levenshtein on resolved word
    const maxD2 = Math.max(1, Math.floor(Math.max(resolved.length, target.length) / 3));
    const d2    = levenshtein(resolved, target);
    if (d2 <= maxD2) return Math.max(0, 0.85 - d2 / Math.max(resolved.length, target.length));

    return 0;
}

// ── Action Definitions ───────────────────────────────────────────────────────
// Each action has a set of keyword groups. The BEST group score wins per action.
// Groups with a leading "draft" word REQUIRE the spoken word that maps to "draft"
// to actually be present — prevents "notes" alone from matching draft_quotation.
const ACTION_DEFS = [
    {
        key:   "summarize",
        label: "Summarise Lead",
        requireDraft: false,
        groups: [
            ["summarise", "lead"],
            ["summarize", "lead"],
            ["summary",   "lead"],
            ["generate",  "lead", "summary"],
            ["lead",      "summary"],
            ["generate",  "summary"],
            ["summer",    "lead"],
            ["summer",    "here"],
            ["somewhere", "lead"],
        ],
    },
    {
        key:   "followup",
        label: "Follow Up Email",
        requireDraft: false,
        groups: [
            ["follow", "up", "email"],
            ["follow", "up"],
            ["followup"],
            ["generate", "follow", "up"],
            ["follow",   "email"],
        ],
    },
    {
        key:   "predict",
        label: "Predict Closure",
        requireDraft: false,
        groups: [
            ["predict",  "closure"],
            ["closure",  "probability"],
            ["predict"],
            ["closure",  "prediction"],
            ["product",  "closure"],
        ],
    },
    {
        key:   "next_action",
        label: "Next Action",
        requireDraft: false,
        groups: [
            ["next",    "action"],
            ["suggest", "next", "action"],
            ["next",    "step"],
            ["what",    "next"],
            ["suggest", "next"],
        ],
    },
    {
        key:   "draft_quotation",
        label: "Draft Quotation",
        requireDraft: true,   // ← "notes" alone must NOT match this
        groups: [
            ["draft", "quotation"],
            ["draft", "quote"],
            ["generate", "quotation"],
            ["quotation"],
            ["quote"],
        ],
    },
    {
        key:   "draft_proposal",
        label: "Draft Proposal",
        requireDraft: true,
        groups: [
            ["draft",    "proposal"],
            ["draft",    "professor"],  // "draft professor" mishear
            ["generate", "proposal"],
            ["proposal"],
            ["propose"],
        ],
    },
    {
        key:   "draft_meeting_notes",
        label: "Draft Meeting Notes",
        requireDraft: false,  // "notes" alone should match this
        groups: [
            ["meeting", "notes"],
            ["meeting", "minutes"],
            ["draft",   "meeting"],
            ["draft",   "notes"],
            ["meeting", "note"],
            ["notes"],            // standalone "notes" → meeting notes
            ["minutes"],
        ],
    },
];

/**
 * Score spoken words against one keyword group.
 * Returns { score 0–1, breakdown [{targetWord, spokenWord, pct, matched}] }
 */
function scoreGroup(spokenWords, targetWords) {
    const breakdown  = [];
    let   totalScore = 0;

    for (const tWord of targetWords) {
        let bestSim    = 0;
        let bestSpoken = null;
        for (const sWord of spokenWords) {
            const s = wordSim(sWord, tWord);
            if (s > bestSim) { bestSim = s; bestSpoken = sWord; }
        }
        breakdown.push({
            targetWord: tWord,
            spokenWord: bestSpoken || "—",
            pct:        Math.round(bestSim * 100),
            matched:    bestSim >= 0.5,
        });
        totalScore += bestSim;
    }

    const score = targetWords.length > 0 ? totalScore / targetWords.length : 0;
    return { score, breakdown };
}

/**
 * Check whether the spoken word list contains something that resolves to "draft".
 */
function hasDraftWord(spokenWords) {
    return spokenWords.some(w => resolveWord(w) === "draft" || w === "draft" ||
        w === "drafting" || w === "draught" || w === "drafted");
}

/**
 * Score ALL actions and return ranked candidates (up to top 3).
 * Each candidate: { action, label, score, breakdown }
 *
 * Key behaviours:
 * - requireDraft actions are penalised heavily if no draft word is spoken
 * - All "draft X" siblings are always evaluated so ambiguous "draft" shows all 3
 * - Threshold: include candidate if score > 0.08
 */
function rankVoiceActions(transcript) {
    const words = normalise(transcript).split(" ").filter(Boolean);
    if (!words.length) return [];

    const draftPresent = hasDraftWord(words);
    const results = [];

    for (const def of ACTION_DEFS) {
        let bestScore     = 0;
        let bestBreakdown = [];

        for (const group of def.groups) {
            const { score, breakdown } = scoreGroup(words, group);
            if (score > bestScore) {
                bestScore     = score;
                bestBreakdown = breakdown;
            }
        }

        // Penalise requireDraft actions when no draft word was spoken
        // (prevents "notes" from matching Draft Quotation)
        if (def.requireDraft && !draftPresent) {
            bestScore *= 0.3;
        }

        if (bestScore > 0.08) {
            results.push({
                action:    def.key,
                label:     def.label,
                score:     bestScore,
                breakdown: bestBreakdown,
            });
        }
    }

    // Sort descending by score, return top 3
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 3);
}

/**
 * Returns best single fuzzy match (for backward compat with existing onresult handler).
 * Returns null if nothing above threshold.
 */
function matchVoiceActionFuzzy(transcript) {
    const ranked = rankVoiceActions(transcript);
    return ranked.length ? ranked[0] : null;
}

// Hard regex match — instant execution, no dialog
function matchVoiceAction(transcript) {
    const s = normalise(transcript);
    if (/\bsummar[iz]|lead summary|generate summary|generate lead\b/.test(s)) return "summarize";
    if (/\bfollow.?up\b|\bfollowup\b/.test(s))                               return "followup";
    if (/\bpredict\b|\bclosure prob|\bclosure prediction|\bprobability\b/.test(s)) return "predict";
    if (/\bnext action\b|\bnext step\b|\bsuggest next\b|\bwhat.?s next\b/.test(s)) return "next_action";
    if (/\bquotation\b/.test(s))                                              return "draft_quotation";
    if (/\bproposal\b/.test(s))                                               return "draft_proposal";
    if (/\bmeeting note|\bmeeting minute|\bdraft meeting\b/.test(s))          return "draft_meeting_notes";
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOADING / RESULT LABELS  (English only)
// ─────────────────────────────────────────────────────────────────────────────

const LOADING_LABELS = {
    summarize:           "Summarizing lead…",
    followup:            "Drafting follow-up email…",
    predict:             "Predicting closure probability…",
    next_action:         "Suggesting next action…",
    draft_quotation:     "Drafting quotation…",
    draft_proposal:      "Drafting proposal…",
    draft_meeting_notes: "Drafting meeting notes…",
};

const RESULT_TITLES = {
    summarize:           "📋 Lead Summary",
    followup:            "✉️ Follow-up Email Draft",
    predict:             "📊 Closure Probability Prediction",
    next_action:         "🎯 Suggested Next Action",
    draft_quotation:     "📄 Auto-Draft Quotation",
    draft_proposal:      "📑 Auto-Draft Proposal",
    draft_meeting_notes: "📝 Meeting Notes Template",
};

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const COPILOT_STYLE = `
.ai-copilot-overlay{
    position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:10000;
    display:flex; align-items:center; justify-content:center;
    padding:20px; backdrop-filter:blur(4px);
}
.ai-copilot-panel{
    width:700px; max-width:96vw; max-height:92vh; overflow-y:auto;
    background:#ffffff; border-radius:18px; border:1px solid #dbe4ea;
    box-shadow:0 12px 40px rgba(0,0,0,.10); display:flex; flex-direction:column;
}
.ai-copilot-header{
    display:flex; align-items:center; justify-content:space-between;
    padding:16px 22px; border-bottom:1px solid #dbe4ea;
    background:#1973b8; color:#ffffff; position:sticky; top:0; z-index:2;
    border-radius:18px 18px 0 0;
}
.ai-copilot-title{ display:flex; align-items:center; gap:10px; font-size:1.08rem; font-weight:700; }
.ai-copilot-icon{ font-size:1.3rem; }
.ai-header-right{ display:flex; align-items:center; gap:10px; }
.ai-provider-badge{
    background:rgba(255,255,255,.14); color:#ffffff; border:1px solid rgba(255,255,255,.25);
    border-radius:999px; padding:5px 12px; font-size:.74rem; font-weight:600;
}
.ai-copilot-close{
    width:34px; height:34px; border:none; border-radius:50%;
    background:rgba(255,255,255,.14); color:#ffffff; cursor:pointer;
    font-size:1rem; display:flex; align-items:center; justify-content:center;
    transition:all .15s ease;
}
.ai-copilot-close:hover{ background:rgba(255,255,255,.28); }

/* Lead bar */
.ai-lead-bar{
    padding:14px 22px; border-bottom:1px solid #eef2f5; background:#f8fbfd;
}
.ai-lead-top-row{
    display:flex; align-items:center; justify-content:space-between;
    margin-bottom:8px; gap:10px;
}
.ai-lead-name{ font-size:1.05rem; font-weight:700; color:#1f2937; }
.ai-lead-meta{ display:flex; gap:8px; flex-wrap:wrap; }
.ai-badge{ padding:4px 11px; border-radius:999px; font-size:.72rem; font-weight:600; }
.ai-badge-stage{ background:#e8f1f8; color:#1973b8; }
.ai-badge-prob{ background:#edf7ef; color:#4ea749; }
.ai-badge-ai{ background:#1973b8; color:#ffffff; }
.ai-badge-tamil{ background:#ff6b35; color:#ffffff; }  /* Sarvam Tamil badge */

/* ── Language selector bar ────────────────────────────────── */
.ai-lang-bar{
    display:flex; align-items:center; gap:8px;
    padding:10px 18px 4px; flex-wrap:wrap;
}
.ai-lang-label{
    font-size:.72rem; font-weight:700; color:#9ca3af;
    text-transform:uppercase; letter-spacing:.05em; margin-right:4px;
}
.ai-lang-btn{
    display:inline-flex; align-items:center; gap:5px;
    padding:5px 14px; border-radius:999px; cursor:pointer;
    border:2px solid #e5e7eb; background:#ffffff; color:#6b7280;
    font-size:.78rem; font-weight:700; transition:all .18s ease;
    white-space:nowrap;
}
.ai-lang-btn:hover{ border-color:#1973b8; color:#1973b8; background:#e8f3fb; }
.ai-lang-btn--active{
    border-color:#1973b8 !important;
    background:#1973b8 !important;
    color:#ffffff !important;
}
.ai-lang-btn--tamil.ai-lang-btn--active{
    border-color:#ff6b35 !important;
    background:#ff6b35 !important;
}
.ai-lang-btn--hindi.ai-lang-btn--active{
    border-color:#138808 !important;
    background:#138808 !important;
}
.ai-lang-btn--telugu.ai-lang-btn--active{
    border-color:#7c3aed !important;
    background:#7c3aed !important;
}
.ai-lang-btn--kannada.ai-lang-btn--active{
    border-color:#b45309 !important;
    background:#b45309 !important;
}

/* Speak button */
.ai-speak-btn{
    display:inline-flex; align-items:center; gap:6px;
    padding:7px 14px; border-radius:999px; cursor:pointer;
    border:2px solid #1973b8; background:#ffffff; color:#1973b8;
    font-size:.82rem; font-weight:700; transition:all .18s ease;
    flex-shrink:0;
}
.ai-speak-btn:hover:not(:disabled){
    background:#e8f3fb;
}
.ai-speak-btn--active{
    background:#dc2626 !important; border-color:#dc2626 !important;
    color:#ffffff !important; animation:ai-pulse-ring 1.2s ease-in-out infinite;
}
@keyframes ai-pulse-ring{
    0%,100%{ box-shadow:0 0 0 0 rgba(220,38,38,.4); }
    50%{ box-shadow:0 0 0 8px rgba(220,38,38,.0); }
}
.ai-speak-btn:disabled{ opacity:.4; cursor:not-allowed; }
.ai-speak-icon{ font-size:1rem; }
.ai-speak-label{ white-space:nowrap; }

/* Voice status feedback */
.ai-voice-status{
    margin-top:8px; padding:6px 10px; border-radius:8px;
    background:#fffbeb; border:1px solid #fde68a;
    color:#92400e; font-size:.8rem; font-style:italic;
}

/* ── Voice confirm dialog ─────────────────────────────────── */
.ai-voice-confirm{
    margin:10px 22px 4px; padding:14px 16px; border-radius:14px;
    border:2px solid #f59e0b; background:#fffbeb;
}
.ai-voice-confirm-title{
    font-size:.95rem; font-weight:700; color:#92400e; margin-bottom:4px;
}
.ai-voice-confirm-sub{
    font-size:.78rem; color:#b45309; margin-bottom:12px;
}
/* Overall score bar */
.ai-score-bar-row{
    display:flex; align-items:center; gap:10px; margin-bottom:12px;
}
.ai-score-bar-track{
    flex:1; height:8px; border-radius:999px; background:#e5e7eb; overflow:hidden;
}
.ai-score-bar-fill{
    height:100%; border-radius:999px; transition:width .4s ease;
}
.ai-score-bar-fill--high  { background:#16a34a; }
.ai-score-bar-fill--mid   { background:#f59e0b; }
.ai-score-bar-fill--low   { background:#dc2626; }
.ai-score-pct{
    font-size:.78rem; font-weight:700; color:#374151; white-space:nowrap; min-width:36px;
}
/* Word breakdown chips */
.ai-word-breakdown{
    display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;
}
.ai-word-chip{
    display:flex; flex-direction:column; align-items:center;
    border-radius:10px; padding:6px 10px; min-width:70px;
    border:1px solid transparent; font-size:.75rem;
}
.ai-word-chip--matched{
    background:#dcfce7; border-color:#86efac; color:#166534;
}
.ai-word-chip--partial{
    background:#fef9c3; border-color:#fde047; color:#854d0e;
}
.ai-word-chip--missed{
    background:#fee2e2; border-color:#fca5a5; color:#991b1b;
}
.ai-chip-target{ font-weight:700; font-size:.8rem; }
.ai-chip-arrow { font-size:.65rem; color:#9ca3af; margin:1px 0; }
.ai-chip-spoken{ font-size:.72rem; font-style:italic; }
.ai-chip-pct{
    font-size:.7rem; font-weight:700; margin-top:2px;
    padding:1px 6px; border-radius:999px; background:rgba(0,0,0,.08);
}
/* Confirm action buttons */
.ai-confirm-btns{
    display:flex; gap:8px; flex-wrap:wrap;
}
.ai-btn-yes{
    padding:8px 18px; border-radius:9px; border:none; cursor:pointer;
    background:#16a34a; color:#fff; font-size:.84rem; font-weight:700;
    display:inline-flex; align-items:center; gap:5px; transition:all .15s;
}
.ai-btn-yes:hover{ background:#15803d; }
.ai-btn-no{
    padding:8px 18px; border-radius:9px; border:none; cursor:pointer;
    background:#dc2626; color:#fff; font-size:.84rem; font-weight:700;
    display:inline-flex; align-items:center; gap:5px; transition:all .15s;
}
.ai-btn-no:hover{ background:#b91c1c; }
.ai-btn-retry{
    padding:8px 18px; border-radius:9px; cursor:pointer;
    background:#fff; color:#1973b8; border:2px solid #1973b8;
    font-size:.84rem; font-weight:700;
    display:inline-flex; align-items:center; gap:5px; transition:all .15s;
}
.ai-btn-retry:hover{ background:#e8f3fb; }

/* Alternative candidates */
.ai-voice-alternatives{
    margin-top:12px; padding-top:10px; border-top:1px dashed #fcd34d;
}
.ai-voice-alt-label{
    font-size:.74rem; color:#92400e; font-weight:600; margin-bottom:6px;
}
.ai-voice-alt-btns{
    display:flex; flex-wrap:wrap; gap:6px;
}
.ai-btn-alt{
    padding:6px 14px; border-radius:8px; border:1.5px solid #d97706;
    background:#fff; color:#92400e; font-size:.8rem; font-weight:600;
    cursor:pointer; transition:all .15s;
    display:inline-flex; align-items:center; gap:5px;
}
.ai-btn-alt:hover{ background:#fffbeb; border-color:#b45309; }
.ai-btn-alt-score{
    font-size:.7rem; opacity:.7; font-weight:400;
}

/* Voice status (multiline) */
.ai-voice-status{ white-space:pre-line; }

/* Section titles */
.ai-section-title{
    padding:14px 22px 6px; font-size:.72rem; font-weight:700;
    letter-spacing:.08em; text-transform:uppercase; color:#94a3b8;
}

/* Action grid */
.ai-action-grid{
    display:grid; grid-template-columns:repeat(2,1fr); gap:10px; padding:0 22px 8px;
}
.ai-action-btn{
    display:flex; align-items:center; gap:12px; padding:15px 16px;
    border-radius:12px; border:none; cursor:pointer;
    transition:all .15s ease; font-size:.88rem; font-weight:600; color:#ffffff;
    text-align:left; line-height:1.3;
}
.ai-action-btn:hover:not(:disabled){
    transform:translateY(-2px); box-shadow:0 8px 20px rgba(0,0,0,.12); filter:brightness(1.04);
}
.ai-action-btn:disabled{ opacity:.5; cursor:not-allowed; }
.ai-btn-blue{ background:#1973b8; }
.ai-btn-green{ background:#4ea749; }
.ai-btn-icon{ font-size:1.05rem; flex-shrink:0; }

/* Loading */
.ai-loading{
    display:flex; gap:12px; align-items:flex-start;
    margin:12px 22px; padding:14px 16px;
    background:#f8fbfd; border:1px solid #dbe4ea; border-radius:12px;
}
.ai-spinner{
    width:20px; height:20px; border:3px solid #dbe4ea;
    border-top-color:#1973b8; border-radius:50%;
    animation:ai-spin .8s linear infinite; flex-shrink:0; margin-top:2px;
}
@keyframes ai-spin{ to{transform:rotate(360deg);} }
.ai-loading-text{ color:#334155; font-size:.88rem; }
.ai-loading-hint{ color:#64748b; font-size:.78rem; margin-top:4px; }

/* Error */
.ai-error-area{
    margin:12px 22px 16px; padding:14px 16px; border-radius:12px;
    border:1px solid #fecaca; background:#fef2f2; color:#991b1b; font-size:.85rem;
}

/* Result popup overlay */
.ai-result-popup-overlay{
    position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:10001;
    display:flex; align-items:center; justify-content:center;
    padding:20px; backdrop-filter:blur(4px);
}
.ai-result-popup{
    width:740px; max-width:96vw; max-height:88vh;
    background:#ffffff; border-radius:18px; border:1px solid #dbe4ea;
    box-shadow:0 20px 60px rgba(0,0,0,.2);
    display:flex; flex-direction:column; overflow:hidden;
}
.ai-result-popup-header{
    display:flex; align-items:center; justify-content:space-between;
    padding:16px 20px; background:#1973b8; color:#ffffff; flex-shrink:0;
    border-radius:18px 18px 0 0;
}
.ai-result-popup-title{ font-size:1rem; font-weight:700; color:#ffffff; }
.ai-result-popup-lead{
    padding:10px 20px; background:#f0f7ff; border-bottom:1px solid #dbe4ea;
    font-size:.84rem; color:#1973b8; flex-shrink:0;
}
.ai-result-popup-body{
    flex:1; overflow-y:auto; padding:20px; background:#ffffff;
}
.ai-result-pre{
    margin:0; white-space:pre-wrap; word-break:break-word;
    font-family:'Inter',system-ui,sans-serif; font-size:.9rem; line-height:1.75; color:#1f2937;
}
.ai-result-popup-footer{
    display:flex; align-items:center; gap:10px; padding:14px 20px;
    border-top:1px solid #eef2f5; background:#f8fbfd;
    flex-shrink:0; flex-wrap:wrap;
}
.ai-btn-save-insights{
    display:inline-flex; align-items:center; gap:6px; padding:9px 18px;
    background:#1973b8; color:#ffffff; border:none; border-radius:10px;
    font-size:.88rem; font-weight:600; cursor:pointer; transition:all .15s ease;
}
.ai-btn-save-insights:hover:not(:disabled){ background:#1568a3; transform:translateY(-1px); }
.ai-btn-save-insights:disabled{ opacity:.6; cursor:not-allowed; }
.ai-icon-btn{
    border:1px solid #dbe4ea; background:#ffffff; color:#1973b8;
    border-radius:10px; padding:7px 12px; cursor:pointer;
    font-size:.8rem; font-weight:600; transition:all .15s ease;
}
.ai-icon-btn:hover{ background:#f1f7fb; }
`;

(function injectCopilotStyles() {
    if (document.getElementById("ai-copilot-styles")) return;
    const s = document.createElement("style");
    s.id  = "ai-copilot-styles";
    s.textContent = COPILOT_STYLE;
    document.head.appendChild(s);
})();

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const PROVIDER_LABELS = { openai:"⚡ OpenAI", gemini:"✨ Gemini", ollama:"🦙 Ollama (Local)" };
const POLL_MS  = 2500;
const HINT_MS  = 8000;
const COPY_MS  = 2000;
const VOICE_SILENCE_MS = 2000;   // stop listening N ms after speech ends

const VALID_ACTIONS = [
    "summarize","followup","predict","next_action",
    "draft_quotation","draft_proposal","draft_meeting_notes",
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

class AiCopilotWidget extends Component {
    static template = "voice_crm_fixed_v2.AiCopilotWidget";

    setup() {
        this.state = useState({
            lead:              null,
            providerLabel:     "",
            // action flow
            loading:           false,
            loadingAction:     "",
            loadingHint:       "",
            // result popup
            showResultPopup:   false,
            result:            "",
            resultTitle:       "",
            lastActionKey:     "",
            currentJobId:      null,
            // footer state
            saving:            false,
            savedMsg:          "",
            copied:            false,
            // error
            error:             "",
            errorHint:         "",
            // voice
            listening:         false,
            voiceStatus:       "",
            // voice confirmation dialog (dumb-charades word breakdown)
            voiceConfirm:      false,
            voiceHeard:        "",
            voiceMatchLabel:   "",
            voiceMatchAction:  "",
            voiceMatchScore:   0,
            voiceBreakdown:    [],
            // multi-candidate alternatives shown below primary match
            voiceCandidates:   [],  // [{action, label, score, breakdown}] — top 3
            // Sarvam language selector: 'en' | 'ta' | 'hi' | 'te' | 'kn'
            langMode:          'en',   // currently selected language
            sarvamEnabled:     false,  // true if Sarvam key is configured in settings
        });

        this.rpc          = useService("rpc");
        this.notification = useService("notification");
        this.leadId       = this.props.action?.context?.active_id || null;
        this._pollTimer   = null;
        this._hintTimer   = null;
        this._copyTimer   = null;
        this._dead        = false;

        // Speech recognition handle
        this._recognition = null;
        this._silenceTimer = null;

        onMounted(() => this._loadLead());
        onWillUnmount(() => {
            this._dead = true;
            this._stopVoice();
            this._clearTimers();
        });
    }

    // ── Lead loading ──────────────────────────────────────────────────────────

    async _loadLead() {
        if (!this.leadId) return;
        try {
            const r = await this.rpc("/ai_copilot/lead_info", { lead_id: this.leadId });
            if (r.status === "ok") {
                this.state.lead           = r.lead;
                this.state.providerLabel  = PROVIDER_LABELS[r.provider] || r.provider || "";
                this.state.sarvamEnabled  = r.sarvam_enabled || false;
            }
        } catch (_) {}
    }

    // ── Voice recognition ─────────────────────────────────────────────────────

    /**
     * Toggle voice listening on/off.
     * Uses Web Speech API (SpeechRecognition) — works in Chrome/Edge.
     * Falls back to a friendly error in unsupported browsers.
     */
    toggleVoice() {
        if (this.state.listening) {
            this._stopVoice();
        } else {
            this._startVoice();
        }
    }

    _startVoice() {
        const SpeechRecognition =
            window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            this.state.voiceStatus =
                "⚠️ Voice recognition is not supported in this browser. Please use Chrome or Edge.";
            return;
        }

        try {
            const rec = new SpeechRecognition();
            rec.lang            = "en-US";
            rec.continuous      = true;   // keep listening until we stop it
            rec.interimResults  = true;   // show partial results as feedback
            rec.maxAlternatives = 3;

            rec.onstart = () => {
                this.state.listening   = true;
                this.state.voiceStatus = "🎙️ Listening… say an action (e.g. 'summarize lead')";
            };

            rec.onresult = (event) => {
                let interim = "";
                let finalTranscript = "";

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const res = event.results[i];
                    const text = res[0].transcript;
                    if (res.isFinal) {
                        finalTranscript += text + " ";
                    } else {
                        interim += text;
                    }
                }

                // Show interim feedback
                if (interim) {
                    this.state.voiceStatus = `🎙️ Hearing: "${interim.trim()}"`;
                }

                if (finalTranscript.trim()) {
                    const heard = finalTranscript.trim();
                    this.state.voiceStatus = `✅ Heard: "${heard}"`;

                    // 1. Try hard regex match first (instant, no dialog)
                    const hardAction = matchVoiceAction(finalTranscript);
                    if (hardAction) {
                        this._stopVoice();
                        this.state.voiceStatus = "";
                        this.runAction(hardAction);
                        return;
                    }

                    // 2. Rank all fuzzy candidates
                    const candidates = rankVoiceActions(finalTranscript);
                    if (candidates.length > 0) {
                        const best = candidates[0];
                        this._stopVoice();
                        this.state.voiceStatus      = "";
                        this.state.voiceConfirm     = true;
                        this.state.voiceHeard       = heard;
                        this.state.voiceMatchLabel  = best.label;
                        this.state.voiceMatchAction = best.action;
                        this.state.voiceMatchScore  = Math.round(best.score * 100);
                        this.state.voiceBreakdown   = best.breakdown;
                        // Store alternatives (exclude best, keep next 2)
                        this.state.voiceCandidates  = candidates.slice(1);
                        return;
                    }

                    // 3. Nothing matched at all
                    this.state.voiceStatus =
                        `🚫 What you said is completely unrelated to a CRM command.\n` +
                        `💡 Please try saying something relevant like:\n` +
                        `"summarise lead" · "follow up email" · "predict closure"\n` +
                        `"next action" · "draft quotation" · "meeting notes"`;

                    clearTimeout(this._silenceTimer);
                    this._silenceTimer = setTimeout(() => {
                        if (this.state.listening) {
                            this._stopVoice();
                            setTimeout(() => { this.state.voiceStatus = ""; }, 3000);
                        }
                    }, VOICE_SILENCE_MS);
                }
            };

            rec.onerror = (event) => {
                const msg = event.error;
                if (msg === "no-speech") {
                    this.state.voiceStatus = "⚠️ No speech detected. Click 🎤 and try again.";
                } else if (msg === "not-allowed" || msg === "service-not-allowed") {
                    this.state.voiceStatus = "🚫 Microphone access denied. Please allow microphone permissions.";
                } else {
                    this.state.voiceStatus = `⚠️ Voice error: ${msg}`;
                }
                this._stopVoice(false);  // stop but preserve status message
            };

            rec.onend = () => {
                // If we're still marked as listening, the browser ended on its own
                if (this.state.listening) {
                    this.state.listening = false;
                }
            };

            this._recognition = rec;
            rec.start();

        } catch (err) {
            this.state.voiceStatus = `⚠️ Could not start voice: ${err.message}`;
        }
    }

    /**
     * Stop voice recognition.
     * @param {boolean} clearStatus - if true, clear the voice status message
     */
    _stopVoice(clearStatus = true) {
        clearTimeout(this._silenceTimer);
        this._silenceTimer = null;

        if (this._recognition) {
            try { this._recognition.stop(); } catch (_) {}
            try { this._recognition.abort(); } catch (_) {}
            this._recognition = null;
        }

        this.state.listening = false;
        if (clearStatus) {
            this.state.voiceStatus = "";
        }
    }

    // ── Voice confirmation dialog ─────────────────────────────────────────────

    /** User clicked "Yes, execute" in the word-breakdown confirmation dialog */
    confirmVoiceAction() {
        const key = this.state.voiceMatchAction;
        this._dismissVoiceConfirm();
        if (key) this.runAction(key);
    }

    /** User clicked "No, cancel" */
    cancelVoiceConfirm() {
        this._dismissVoiceConfirm();
    }

    /** User clicked "Try Again" — re-open microphone */
    retryVoice() {
        this._dismissVoiceConfirm();
        this._startVoice();
    }

    _dismissVoiceConfirm() {
        this.state.voiceConfirm    = false;
        this.state.voiceHeard      = "";
        this.state.voiceMatchLabel = "";
        this.state.voiceMatchAction= "";
        this.state.voiceMatchScore = 0;
        this.state.voiceBreakdown  = [];
        this.state.voiceCandidates = [];
    }

    /** User clicked an alternative candidate button */
    executeCandidate(action) {
        this._dismissVoiceConfirm();
        if (action) this.runAction(action);
    }

    /** Select language from the copilot language bar */
    selectLang(lang) {
        if (!this.state.sarvamEnabled && lang !== 'en') {
            this.state.error     = "Sarvam API key not configured. Go to Settings → AI CRM Copilot → Sarvam AI to add your key.";
            this.state.errorHint = "";
            return;
        }
        this.state.langMode = lang;
        this.state.error    = "";
    }

    // ── Run AI action ─────────────────────────────────────────────────────────

    async runAction(key) {
        if (!VALID_ACTIONS.includes(key)) return;
        this._clearTimers();

        Object.assign(this.state, {
            loading:         true,
            loadingAction:   LOADING_LABELS[key] || "Processing…",
            loadingHint:     "",
            showResultPopup: false,
            result:          "",
            resultTitle:     "",
            error:           "",
            errorHint:       "",
            savedMsg:        "",
            copied:          false,
            lastActionKey:   key,
            currentJobId:    null,
        });

        this._hintTimer = setTimeout(() => {
            if (this.state.loading) {
                this.state.loadingHint =
                    "Ollama is generating locally — this may take 30–120 s depending on your model.";
            }
        }, HINT_MS);

        try {
            const r = await this.rpc("/ai_copilot/run_async", {
                action:    key,
                lead_id:   this.leadId,
                lang:      "en",
                lang_mode: this.state.langMode,   // 'en' | 'ta' | 'hi'
            });

            if (r.status === "queued" && r.job_id) {
                this.state.currentJobId = r.job_id;
                this._poll(key);
            } else if (r.status === "ok") {
                this._showResult(r.result, key);
                await this._loadLead();
            } else {
                this._fail(r.message || "Unknown error", r.hint || "");
            }
        } catch (e) {
            this._fail(e.message || String(e), "Check Odoo can reach your AI provider.");
        }
    }

    _poll(key) {
        this._pollTimer = setInterval(async () => {
            if (this._dead || !this.state.currentJobId) {
                clearInterval(this._pollTimer);
                return;
            }
            try {
                const r = await this.rpc("/ai_copilot/poll", { job_id: this.state.currentJobId });
                if (r.status === "ok") {
                    clearInterval(this._pollTimer);
                    this._showResult(r.result, key);
                    await this._loadLead();
                } else if (r.status === "error") {
                    clearInterval(this._pollTimer);
                    this._fail(r.message || "AI error", r.hint || "");
                }
                // "pending" → keep polling
            } catch (e) {
                clearInterval(this._pollTimer);
                this._fail(e.message || String(e), "");
            }
        }, POLL_MS);
    }

    _showResult(resultText, key) {
        this._clearTimers();
        this.state.loading         = false;
        this.state.result          = resultText;
        this.state.resultTitle     = RESULT_TITLES[key] || key;
        this.state.showResultPopup = true;
        this.state.savedMsg        = "";
        this.state.copied          = false;
    }

    // ── Error ─────────────────────────────────────────────────────────────────

    _fail(msg, hint) {
        this._clearTimers();
        this.state.loading   = false;
        this.state.error     = msg;
        this.state.errorHint = hint;
    }

    // ── Timers ────────────────────────────────────────────────────────────────

    _clearTimers() {
        if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
        if (this._hintTimer) { clearTimeout(this._hintTimer);  this._hintTimer = null; }
        if (this._copyTimer) { clearTimeout(this._copyTimer);  this._copyTimer = null; }
    }

    // ── Result popup ──────────────────────────────────────────────────────────

    closeResultPopup() {
        this.state.showResultPopup = false;
    }

    // ── Save to AI Insights ───────────────────────────────────────────────────

    async saveToInsights() {
        if (!this.state.result || this.state.saving) return;
        this.state.saving   = true;
        this.state.savedMsg = "";
        try {
            const r = await this.rpc("/ai_copilot/save_to_insights", {
                lead_id:     this.leadId,
                action_type: this.state.lastActionKey,
                result_text: this.state.result,
            });
            if (r.status === "ok") {
                this.state.savedMsg = r.message || "Saved!";
                this.notification.add(r.message || "Saved to AI Insights!", { type: "success" });
                await this._loadLead();
            } else {
                this.state.error = r.message || "Failed to save.";
            }
        } catch (e) {
            this.state.error = e.message || String(e);
        } finally {
            this.state.saving = false;
        }
    }

    // ── Copy ──────────────────────────────────────────────────────────────────

    async copyResult() {
        const textToCopy = this.state.result;
        if (!textToCopy) return;
        try {
            await navigator.clipboard.writeText(textToCopy);
            this.state.copied = true;
            this.notification.add("Copied to clipboard!", { type: "info" });
            this._copyTimer = setTimeout(() => { this.state.copied = false; }, COPY_MS);
        } catch (_) {
            this.notification.add("Copy failed — select text manually.", { type: "warning" });
        }
    }

    // ── Close ─────────────────────────────────────────────────────────────────

    close() {
        this._dead = true;
        this._stopVoice();
        this._clearTimers();
        try { this.__owl__.app.destroy(); } catch (_) {}
    }
}

registry.category("actions").add("ai_copilot_action", AiCopilotWidget);
