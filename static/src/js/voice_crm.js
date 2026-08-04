/** @odoo-module **/
/**
 * voice_crm.js  –  Multilingual Voice CRM
 *
 * Languages: English (en-IN), Hindi (hi-IN), Telugu (te-IN),
 *            Kannada (kn-IN), Tamil (ta-IN)
 *
 * Modes:
 *   1. Interview Mode  — computer asks field-by-field in chosen language
 *   2. Quick Record    — single utterance, all fields at once
 *
 * Actions registered:
 *   voice_crm_action        → 🎤 Speak  (form header)
 *   voice_crm_search_action → 🔍 Search Lead
 */

import { Component, useState, xml, onMounted, onWillUnmount } from "@odoo/owl";
import { registry }       from "@web/core/registry";
import { useService }     from "@web/core/utils/hooks";
import { patch }          from "@web/core/utils/patch";
import { ListController } from "@web/views/list/list_controller";

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const LANGUAGES = [
    { code: "en-IN", label: "English",  flag: "🇬🇧" },
    { code: "hi-IN", label: "हिंदी",    flag: "🇮🇳" },
    { code: "te-IN", label: "తెలుగు",   flag: "🌟" },
    { code: "kn-IN", label: "ಕನ್ನಡ",    flag: "🌸" },
    { code: "ta-IN", label: "தமிழ்",    flag: "🌺" },
];

// Interview field questions per language
const FIELD_QUESTIONS = {
    "en-IN": {
        intro:        "Let's collect lead details.",
        review:       "Please review and save.",
        required:     (label) => `${label} is required.`,
        name:         "Lead name?",
        contact_name: "Contact name?",
        phone:        "Phone number?",
        mobile:       "Mobile number?",
        email:        "Email address?",
        email_cc:     "CC email?",
        city:         "City?",
        state_name:   "State?",
        country_name: "Country?",
        website:      "Website?",
        function:     "Job position?",
        priority:     "Priority? Low, medium, or high?",
    },
    "hi-IN": {
        intro:        "लीड विवरण एकत्र करते हैं।",
        review:       "कृपया समीक्षा करें और सहेजें।",
        required:     (label) => `${label} आवश्यक है।`,
        name:         "लीड का नाम?",
        contact_name: "संपर्क व्यक्ति का नाम?",
        phone:        "फ़ोन नंबर?",
        mobile:       "मोबाइल नंबर?",
        email:        "ईमेल पता?",
        email_cc:     "CC ईमेल?",
        city:         "शहर?",
        state_name:   "राज्य?",
        country_name: "देश?",
        website:      "वेबसाइट?",
        function:     "पद?",
        priority:     "प्राथमिकता? कम, मध्यम या उच्च?",
    },
    "te-IN": {
        intro:        "లీడ్ వివరాలు సేకరిస్తాం.",
        review:       "దయచేసి సమీక్షించి సేవ్ చేయండి.",
        required:     (label) => `${label} అవసరం.`,
        name:         "లీడ్ పేరు?",
        contact_name: "సంప్రదింపు వ్యక్తి పేరు?",
        phone:        "ఫోన్ నంబర్?",
        mobile:       "మొబైల్ నంబర్?",
        email:        "ఇమెయిల్ చిరునామా?",
        email_cc:     "CC ఇమెయిల్?",
        city:         "నగరం?",
        state_name:   "రాష్ట్రం?",
        country_name: "దేశం?",
        website:      "వెబ్‌సైట్?",
        function:     "ఉద్యోగ స్థానం?",
        priority:     "ప్రాధాన్యత? తక్కువ, మధ్యమ లేదా అధిక?",
    },
    "kn-IN": {
        intro:        "ಲೀಡ್ ವಿವರಗಳನ್ನು ಸಂಗ್ರಹಿಸೋಣ.",
        review:       "ದಯವಿಟ್ಟು ಪರಿಶೀಲಿಸಿ ಮತ್ತು ಉಳಿಸಿ.",
        required:     (label) => `${label} ಅಗತ್ಯ.`,
        name:         "ಲೀಡ್ ಹೆಸರು?",
        contact_name: "ಸಂಪರ್ಕ ವ್ಯಕ್ತಿಯ ಹೆಸರು?",
        phone:        "ಫೋನ್ ಸಂಖ್ಯೆ?",
        mobile:       "ಮೊಬೈಲ್ ಸಂಖ್ಯೆ?",
        email:        "ಇಮೇಲ್ ವಿಳಾಸ?",
        email_cc:     "CC ಇಮೇಲ್?",
        city:         "ನಗರ?",
        state_name:   "ರಾಜ್ಯ?",
        country_name: "ದೇಶ?",
        website:      "ವೆಬ್‌ಸೈಟ್?",
        function:     "ಉದ್ಯೋಗ ಸ್ಥಾನ?",
        priority:     "ಆದ್ಯತೆ? ಕಡಿಮೆ, ಮಧ್ಯಮ ಅಥವಾ ಹೆಚ್ಚು?",
    },
    "ta-IN": {
        intro:        "லீட் விவரங்களை சேகரிக்கலாம்.",
        review:       "தயவுசெய்து மதிப்பாய்வு செய்து சேமிக்கவும்.",
        required:     (label) => `${label} தேவை.`,
        name:         "லீட் பெயர்?",
        contact_name: "தொடர்பு நபரின் பெயர்?",
        phone:        "தொலைபேசி எண்?",
        mobile:       "மொபைல் எண்?",
        email:        "மின்னஞ்சல் முகவரி?",
        email_cc:     "CC மின்னஞ்சல்?",
        city:         "நகரம்?",
        state_name:   "மாநிலம்?",
        country_name: "நாடு?",
        website:      "இணையதளம்?",
        function:     "பணி நிலை?",
        priority:     "முன்னுரிமை? குறைவு, நடுத்தரம் அல்லது அதிகம்?",
    },
};

// Field labels per language (for display in collected fields card)
const FIELD_LABELS = {
    "en-IN": { name:"Lead Name", contact_name:"Contact", phone:"Phone", mobile:"Mobile",
               email:"Email", email_cc:"CC Email", city:"City", state_name:"State",
               country_name:"Country", website:"Website", function:"Job Position", priority:"Priority" },
    "hi-IN": { name:"लीड नाम", contact_name:"संपर्क", phone:"फ़ोन", mobile:"मोबाइल",
               email:"ईमेल", email_cc:"CC ईमेल", city:"शहर", state_name:"राज्य",
               country_name:"देश", website:"वेबसाइट", function:"पद", priority:"प्राथमिकता" },
    "te-IN": { name:"లీడ్ పేరు", contact_name:"సంప్రదింపు", phone:"ఫోన్", mobile:"మొబైల్",
               email:"ఇమెయిల్", email_cc:"CC ఇమెయిల్", city:"నగరం", state_name:"రాష్ట్రం",
               country_name:"దేశం", website:"వెబ్‌సైట్", function:"పదవి", priority:"ప్రాధాన్యత" },
    "kn-IN": { name:"ಲೀಡ್ ಹೆಸರು", contact_name:"ಸಂಪರ್ಕ", phone:"ಫೋನ್", mobile:"ಮೊಬೈಲ್",
               email:"ಇಮೇಲ್", email_cc:"CC ಇಮೇಲ್", city:"ನಗರ", state_name:"ರಾಜ್ಯ",
               country_name:"ದೇಶ", website:"ವೆಬ್‌ಸೈಟ್", function:"ಹುದ್ದೆ", priority:"ಆದ್ಯತೆ" },
    "ta-IN": { name:"லீட் பெயர்", contact_name:"தொடர்பு", phone:"தொலைபேசி", mobile:"மொபைல்",
               email:"மின்னஞ்சல்", email_cc:"CC மின்னஞ்சல்", city:"நகரம்", state_name:"மாநிலம்",
               country_name:"நாடு", website:"இணையதளம்", function:"பணி", priority:"முன்னுரிமை" },
};

// Skip words per language
const SKIP_WORDS = {
    "en-IN": ["skip","no","none","n/a","not available","nothing","leave it","blank","pass","next","don't have","do not have","not sure"],
    "hi-IN": ["छोड़ें","नहीं","कोई नहीं","उपलब्ध नहीं","खाली","पास","अगला","नहीं है","skip","no"],
    "te-IN": ["దాటవేయి","లేదు","ఏదీ లేదు","అందుబాటులో లేదు","ఖాళీ","తదుపరి","skip","no"],
    "kn-IN": ["ಬಿಟ್ಟುಬಿಡಿ","ಇಲ್ಲ","ಏನೂ ಇಲ್ಲ","ಲಭ್ಯವಿಲ್ಲ","ಖಾಲಿ","ಮುಂದೆ","skip","no"],
    "ta-IN": ["தவிர்","இல்லை","எதுவும் இல்லை","கிடைக்கவில்லை","காலி","அடுத்து","skip","no"],
};

// Cancel/done/repeat words per language
const CONTROL_WORDS = {
    cancel: {
        "en-IN": ["cancel","abort","stop","quit"],
        "hi-IN": ["रद्द करें","बंद करो","छोड़ो","cancel"],
        "te-IN": ["రద్దు","ఆపు","cancel"],
        "kn-IN": ["ರದ್ದು","ನಿಲ್ಲಿಸು","cancel"],
        "ta-IN": ["ரத்து","நிறுத்து","cancel"],
    },
    done: {
        "en-IN": ["done","finish","that's all","save","complete"],
        "hi-IN": ["हो गया","समाप्त","बस इतना","सहेजें","done"],
        "te-IN": ["అయిపోయింది","పూర్తి","చాలు","done"],
        "kn-IN": ["ಮುಗಿದಿದೆ","ಮುಗಿಸು","ಸಾಕು","done"],
        "ta-IN": ["முடிந்தது","முடி","போதும்","done"],
    },
    repeat: {
        "en-IN": ["repeat","say again","what","again"],
        "hi-IN": ["दोहराएं","फिर से बोलें","क्या","repeat"],
        "te-IN": ["మళ్ళీ చెప్పు","ఏమిటి","repeat"],
        "kn-IN": ["ಮತ್ತೆ ಹೇಳಿ","ಏನು","repeat"],
        "ta-IN": ["மீண்டும் சொல்","என்ன","repeat"],
    },
};

// Priority words per language
const PRIORITY_WORDS = {
    high: {
        "en-IN": ["very high","highest","high","3","three"],
        "hi-IN": ["बहुत उच्च","उच्च","हाई","तीन","3"],
        "te-IN": ["చాలా ఎక్కువ","అధిక","హై","మూడు","3"],
        "kn-IN": ["ತುಂಬಾ ಹೆಚ್ಚು","ಅಧಿಕ","ಮೂರು","3"],
        "ta-IN": ["மிக அதிகம்","அதிகம்","மூன்று","3"],
    },
    medium: {
        "en-IN": ["medium","mid","normal","moderate","2","two"],
        "hi-IN": ["मध्यम","नॉर्मल","दो","2"],
        "te-IN": ["మధ్యమ","సాధారణ","రెండు","2"],
        "kn-IN": ["ಮಧ್ಯಮ","ಸಾಮಾನ್ಯ","ಎರಡು","2"],
        "ta-IN": ["நடுத்தரம்","சாதாரண","இரண்டு","2"],
    },
    low: {
        "en-IN": ["low","none","no","1","one","minimal"],
        "hi-IN": ["कम","निम्न","एक","1"],
        "te-IN": ["తక్కువ","ఒకటి","1"],
        "kn-IN": ["ಕಡಿಮೆ","ಒಂದು","1"],
        "ta-IN": ["குறைவு","ஒன்று","1"],
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// INTERVIEW FIELDS (keys only — labels/questions come from FIELD_QUESTIONS)
// ─────────────────────────────────────────────────────────────────────────────
const INTERVIEW_FIELDS = [
    { key: "name",         required: true  },
    { key: "contact_name", required: false },
    { key: "phone",        required: true  },
    { key: "mobile",       required: false },
    { key: "email",        required: true  },
    { key: "email_cc",     required: false },
    { key: "city",         required: false },
    { key: "state_name",   required: false },
    { key: "country_name", required: false },
    { key: "website",      required: false },
    { key: "function",     required: false },
    { key: "priority",     required: false },
];

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const STYLE = `
.voice-crm-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,.52);
    z-index: 9999;
    display: flex; align-items: center; justify-content: center;
}
.voice-crm-modal {
    background: #fff;
    border-radius: 14px;
    padding: 26px 30px;
    width: 620px;
    max-width: 96vw;
    box-shadow: 0 12px 55px rgba(0,0,0,.32);
    max-height: 92vh;
    overflow-y: auto;
}
.voice-crm-modal h4 { margin-bottom: 12px; font-size: 1.2rem; }

/* Language selector */
.vc-lang-bar {
    display: flex; gap: 6px; flex-wrap: wrap;
    margin-bottom: 16px;
}
.vc-lang-btn {
    padding: 5px 12px; border-radius: 20px; cursor: pointer;
    border: 1.5px solid #dee2e6; background: #fff;
    font-size: .82rem; transition: all .15s;
    display: flex; align-items: center; gap: 4px;
}
.vc-lang-btn.active {
    background: #7c3aed; color: #fff; border-color: #7c3aed;
}
.vc-lang-btn:hover:not(.active) { background: #f3f0ff; border-color: #7c3aed; }

/* Interview card */
.vc-interview-card {
    background: linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%);
    border-radius: 10px; padding: 22px 24px; color: #fff;
    text-align: center; margin-bottom: 14px;
}
.vc-interview-card .vc-question { font-size: 1.15rem; font-weight: 600; margin-bottom: 8px; }
.vc-interview-card .vc-field-label {
    font-size: .78rem; opacity: .75; margin-bottom: 12px;
    letter-spacing: .04em; text-transform: uppercase;
}
.vc-speaking-anim {
    display: flex; align-items: flex-end; justify-content: center;
    gap: 4px; height: 32px; margin: 8px 0;
}
.vc-speaking-anim span {
    display: inline-block; width: 5px; border-radius: 3px;
    background: rgba(255,255,255,.85); animation: vcbar .8s ease-in-out infinite;
}
.vc-speaking-anim span:nth-child(1){ height:12px; animation-delay:0s;    }
.vc-speaking-anim span:nth-child(2){ height:22px; animation-delay:.1s;   }
.vc-speaking-anim span:nth-child(3){ height:16px; animation-delay:.2s;   }
.vc-speaking-anim span:nth-child(4){ height:28px; animation-delay:.3s;   }
.vc-speaking-anim span:nth-child(5){ height:18px; animation-delay:.15s;  }
.vc-speaking-anim span:nth-child(6){ height:12px; animation-delay:.25s;  }
@keyframes vcbar { 0%,100%{transform:scaleY(.5);opacity:.6;} 50%{transform:scaleY(1.3);opacity:1;} }

.vc-listening-ring {
    display: inline-flex; align-items: center; justify-content: center;
    width: 60px; height: 60px; border-radius: 50%;
    background: rgba(255,255,255,.15); border: 3px solid rgba(255,255,255,.7);
    font-size: 1.6rem; margin: 8px auto;
    animation: vcring 1.2s ease-in-out infinite;
}
@keyframes vcring { 0%,100%{box-shadow:0 0 0 0 rgba(255,255,255,.4);} 50%{box-shadow:0 0 0 14px rgba(255,255,255,0);} }

.vc-interim { font-style:italic; font-size:.9rem; opacity:.85; min-height:1.4em; margin-top:6px; }

.vc-progress-bar { height:4px; background:rgba(255,255,255,.2); border-radius:2px; margin-bottom:14px; overflow:hidden; }
.vc-progress-bar-fill { height:100%; background:rgba(255,255,255,.85); border-radius:2px; transition:width .4s ease; }

/* Collected fields */
.vc-collected-fields {
    background: #f8f7ff; border:1px solid #e5e3f7; border-radius:8px;
    padding:10px 14px; margin-bottom:12px; font-size:.84rem;
}
.vc-collected-fields .vc-cf-row {
    display:flex; gap:8px; padding:3px 0; border-bottom:1px solid #ede9f6;
}
.vc-collected-fields .vc-cf-row:last-child { border-bottom:none; }
.vc-collected-fields .vc-cf-key { color:#7c3aed; font-weight:600; min-width:110px; }

/* Manual input row */
.vc-manual-row { display:flex; gap:8px; margin-top:10px; }
.vc-manual-row input { flex:1; }

/* Mode cards */
.vc-mode-card {
    border:2px solid #dee2e6; border-radius:10px; padding:14px 16px;
    margin-bottom:10px; cursor:pointer; transition:background .15s;
}
.vc-mode-card:hover { background:#f8f7ff; border-color:#7c3aed; }
.vc-mode-card .vc-mode-title { font-weight:600; font-size:.95rem; color:#495057; margin-bottom:4px; }
.vc-mode-card.primary { border-color:#7c3aed; }
.vc-mode-card.primary .vc-mode-title { color:#7c3aed; }

/* Search cards */
.vc-lead-card {
    border:1px solid #dee2e6; border-radius:8px; padding:14px 16px;
    margin-bottom:10px; background:#fafafa; transition:box-shadow .15s;
}
.vc-lead-card:hover { box-shadow:0 2px 12px rgba(0,0,0,.12); }
.vc-lead-card .vc-lead-name { font-weight:600; font-size:1.05rem; color:#3a3a5c; }
.vc-lead-card .vc-badge {
    display:inline-block; padding:2px 8px; border-radius:20px;
    font-size:.75rem; background:#7c3aed; color:#fff; margin-left:8px;
}
.vc-lead-card .vc-field { font-size:.85rem; color:#555; margin-top:4px; }
.vc-lead-card .vc-field span { font-weight:500; color:#222; }
.vc-search-count { font-size:.82rem; color:#888; margin-bottom:10px; }
.voice-pulse { font-size:1.4rem; text-align:center; animation:vcpulse 1s infinite; }
@keyframes vcpulse { 0%,100%{opacity:1;} 50%{opacity:.3;} }

/* List button */
.btn-voice-search {
    display:inline-flex; align-items:center; gap:5px;
    padding:0 12px; height:30px; font-size:.875rem;
    border-radius:4px; border:1px solid #6c757d;
    background:#fff; color:#495057; cursor:pointer;
    white-space:nowrap; transition:background .15s,border-color .15s;
}
.btn-voice-search:hover { background:#6c757d; color:#fff; }
`;

(function injectStyles(){
    if (document.getElementById("voice-crm-styles")) return;
    const s = document.createElement("style");
    s.id = "voice-crm-styles";
    s.textContent = STYLE;
    document.head.appendChild(s);
})();

// ─────────────────────────────────────────────────────────────────────────────
// SPEECH HELPERS
// ─────────────────────────────────────────────────────────────────────────────
// TTS voice cache: lang → best available SpeechSynthesisVoice
const _voiceCache = {};

function getBestVoice(lang) {
    if (_voiceCache[lang] !== undefined) return _voiceCache[lang];
    const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    if (!voices.length) { _voiceCache[lang] = null; return null; }

    // Exact lang match first (e.g. "ta-IN")
    let v = voices.find(v => v.lang === lang);
    // Then prefix match (e.g. "ta" for Tamil)
    if (!v) { const prefix = lang.split("-")[0]; v = voices.find(v => v.lang.startsWith(prefix)); }
    // For Indian languages with no native voice, fall back to a Hindi voice then en-IN
    if (!v && lang !== "en-IN") {
        v = voices.find(v => v.lang === "hi-IN") || voices.find(v => v.lang.startsWith("en"));
    }
    _voiceCache[lang] = v || null;
    return _voiceCache[lang];
}

// Invalidate cache when voices list changes (happens asynchronously on page load)
if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
        Object.keys(_voiceCache).forEach(k => delete _voiceCache[k]);
    };
}

function speak(text, lang = "en-IN", rate = 1.0) {
    return new Promise((resolve) => {
        if (!window.speechSynthesis) { setTimeout(resolve, 300); return; }
        window.speechSynthesis.cancel();
        setTimeout(() => {
            const utt = new SpeechSynthesisUtterance(text);
            // Pick best available voice — critical for Tamil/Telugu/Kannada
            const voice = getBestVoice(lang);
            if (voice) {
                utt.voice = voice;
                utt.lang  = voice.lang;   // use the actual voice lang
            } else {
                utt.lang = lang;
            }
            utt.rate  = rate;
            utt.pitch = 1.0;
            utt.onend   = () => setTimeout(resolve, 350);
            utt.onerror = () => setTimeout(resolve, 350);
            window.speechSynthesis.speak(utt);
        }, 80);
    });
}
function stopSpeaking() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSLATION HELPER  (MyMemory free API — no key needed, 500 req/day)
// Used to:
//   1. Translate native-language answers to English before saving to CRM
//   2. Translate native-language search queries to English before searching
// For English input, returns the text as-is immediately without API call.
// ─────────────────────────────────────────────────────────────────────────────
const _translateCache = {};

// Known bad translation patterns — MyMemory returns these for short Indian names
const BAD_TRANSLATION_PATTERNS = [
    /is today a holiday/i,
    /what is today/i,
    /quality management/i,
    /QUALITY/,           // all-caps responses = error
    /MYMEMORY/i,
    /^\s*$/,
];

function isBadTranslation(translated, original) {
    if (!translated || translated.trim() === "") return true;
    // All-caps longer than 4 chars = MyMemory error response
    if (translated.trim() === translated.trim().toUpperCase() && translated.trim().length > 4) return true;
    // Known junk patterns
    if (BAD_TRANSLATION_PATTERNS.some(p => p.test(translated))) return true;
    // Translation is longer than 3x original — probably hallucinated
    if (translated.length > original.length * 3 + 10) return true;
    return false;
}

// Phonetic / transliteration map for common Indian names
// Used as a fast local fallback before API
const PHONETIC_MAP = {
    // ── Hindi/Devanagari — names ─────────────────────────────────────────────
    "रवि":"Ravi","रवी":"Ravi","सुरेश":"Suresh","सुरेष":"Suresh",
    "अनन्या":"Ananya","अनया":"Ananya","राम":"Ram","श्याम":"Shyam",
    "अजय":"Ajay","विजय":"Vijay","मोहन":"Mohan","सोहन":"Sohan",
    "राहुल":"Rahul","रोहन":"Rohan","कुमार":"Kumar","अमित":"Amit",
    "अनिल":"Anil","सुनील":"Sunil","दीपक":"Deepak","महेश":"Mahesh",
    "नितेश":"Nitesh","अर्जुन":"Arjun","प्रिया":"Priya","नेहा":"Neha",
    "पूजा":"Pooja","ममता":"Mamta","गीता":"Geeta","सीता":"Sita",
    "लक्ष्मी":"Lakshmi","दिव्या":"Divya","संजय":"Sanjay","विनय":"Vinay",
    "कमल":"Kamal","नवीन":"Naveen","सचिन":"Sachin","रितेश":"Ritesh",
    "रचना":"Rachna","शिल्पा":"Shilpa","अंकित":"Ankit","अक्षय":"Akshay",
    "आयुष":"Ayush","भावना":"Bhavna","चेतन":"Chetan","दिनेश":"Dinesh",
    "हर्ष":"Harsh","ईशान":"Ishan","जतिन":"Jatin","करण":"Karan",
    "लोकेश":"Lokesh","मनीष":"Manish","निखिल":"Nikhil","ओम":"Om",
    "परेश":"Paresh","राजेश":"Rajesh","शुभम":"Shubham","तरुण":"Tarun",
    "उमेश":"Umesh","वरुण":"Varun","यश":"Yash","जन":"John","जॉन":"John",
    "जान":"John","मैरी":"Mary","रोज":"Rose","एलेक्स":"Alex","अलेक्स":"Alex",
    "एलिस":"Alice","पीटर":"Peter","डेविड":"David","माइकल":"Michael",
    "सारा":"Sara","सोफिया":"Sofia","एम्मा":"Emma","ओलिवर":"Oliver",
    // ── Hindi — cities ───────────────────────────────────────────────────────
    "मुंबई":"Mumbai","दिल्ली":"Delhi","नई दिल्ली":"New Delhi",
    "चेन्नई":"Chennai","हैदराबाद":"Hyderabad","बेंगलुरु":"Bangalore",
    "बैंगलोर":"Bangalore","कोलकाता":"Kolkata","जयपुर":"Jaipur",
    "पुणे":"Pune","अहमदाबाद":"Ahmedabad","सूरत":"Surat",
    "नागपुर":"Nagpur","लखनऊ":"Lucknow","कानपुर":"Kanpur",
    "इंदौर":"Indore","भोपाल":"Bhopal","वडोदरा":"Vadodara",
    "कोच्चि":"Kochi","विशाखापत्तनम":"Visakhapatnam","कोयंबटूर":"Coimbatore",
    "मदुरै":"Madurai","नासिक":"Nashik","पटना":"Patna","वाराणसी":"Varanasi",
    "आगरा":"Agra","विजयवाड़ा":"Vijayawada","राजकोट":"Rajkot",
    // ── Hindi — states ───────────────────────────────────────────────────────
    "महाराष्ट्र":"Maharashtra","तमिलनाडु":"Tamil Nadu","तेलंगाना":"Telangana",
    "कर्नाटक":"Karnataka","केरल":"Kerala","गुजरात":"Gujarat",
    "राजस्थान":"Rajasthan","उत्तर प्रदेश":"Uttar Pradesh","मध्य प्रदेश":"Madhya Pradesh",
    "पश्चिम बंगाल":"West Bengal","आंध्र प्रदेश":"Andhra Pradesh",
    "बिहार":"Bihar","ओडिशा":"Odisha","पंजाब":"Punjab","हरियाणा":"Haryana",
    "दिल्ली":"Delhi","असम":"Assam","झारखंड":"Jharkhand","छत्तीसगढ़":"Chhattisgarh",
    "उत्तराखंड":"Uttarakhand","हिमाचल प्रदेश":"Himachal Pradesh",
    "गोवा":"Goa","त्रिपुरा":"Tripura","मणिपुर":"Manipur","मेघालय":"Meghalaya",
    // ── Hindi — countries ────────────────────────────────────────────────────
    "भारत":"India","इंडिया":"India","इंडिआ":"India","अमेरिका":"USA",
    "अमेरिका":"America","संयुक्त राज्य":"United States","ब्रिटेन":"United Kingdom",
    "इंग्लैंड":"England","ऑस्ट्रेलिया":"Australia","कनाडा":"Canada",
    "जर्मनी":"Germany","फ्रांस":"France","जापान":"Japan","चीन":"China",
    "सिंगापुर":"Singapore","दुबई":"Dubai","यूएई":"UAE",
    // ── Hindi — job titles ───────────────────────────────────────────────────
    "डेवलपर":"Developer","डेवेलपर":"Developer","प्रोग्रामर":"Programmer",
    "इंजीनियर":"Engineer","मैनेजर":"Manager","प्रबंधक":"Manager",
    "सेल्स मैनेजर":"Sales Manager","विक्रय प्रबंधक":"Sales Manager",
    "सीईओ":"CEO","सीटीओ":"CTO","निदेशक":"Director","अधिकारी":"Officer",
    "सलाहकार":"Consultant","विश्लेषक":"Analyst","डिजाइनर":"Designer",
    "अकाउंटेंट":"Accountant","डॉक्टर":"Doctor","शिक्षक":"Teacher",
    "वकील":"Lawyer","आर्किटेक्ट":"Architect","फोटोग्राफर":"Photographer",
    "मार्केटिंग":"Marketing","फाइनेंस":"Finance","ऑपरेशंस":"Operations",
    "प्रोडक्ट मैनेजर":"Product Manager","सॉफ्टवेयर इंजीनियर":"Software Engineer",
    "वेब डेवलपर":"Web Developer","मोबाइल डेवलपर":"Mobile Developer",
    "डेटा साइंटिस्ट":"Data Scientist","एचआर":"HR","मानव संसाधन":"HR",
    // ── Tamil — names ────────────────────────────────────────────────────────
    "ரவி":"Ravi","சுரேஷ்":"Suresh","சுரேஶ்":"Suresh","அனன்யா":"Ananya",
    "ராம்":"Ram","ஆயன்":"Aryan","விஜய்":"Vijay","அஜய்":"Ajay","ரோஹன்":"Rohan",
    "ராகுல்":"Rahul","அமித்":"Amit","அனில்":"Anil","சுனில்":"Sunil",
    "பிரியா":"Priya","நேஹா":"Neha","பூஜா":"Pooja","லக்ஷ்மி":"Lakshmi",
    "திவ்யா":"Divya","ஜான்":"John","மேரி":"Mary","ரோஸ்":"Rose",
    "அலெக்ஸ்":"Alex","ஆலிஸ்":"Alice","அனன்யா":"Ananya","கார்த்திக்":"Karthik",
    "முருகன்":"Murugan","சிவா":"Siva","குமார்":"Kumar","பாலாஜி":"Balaji",
    "ராஜேஷ்":"Rajesh","சுந்தர்":"Sundar","வெங்கட்":"Venkat","கிரண்":"Kiran",
    "லோகேஷ்":"Lokesh","நவீன்":"Naveen","சந்தோஷ்":"Santhosh",
    // ── Tamil — cities ───────────────────────────────────────────────────────
    "சென்னை":"Chennai","மும்பை":"Mumbai","கோவை":"Coimbatore",
    "மதுரை":"Madurai","ஹைதராபாத்":"Hyderabad","பெங்களூரு":"Bangalore",
    "தில்லி":"Delhi","புணே":"Pune","அகமதாபாத்":"Ahmedabad",
    "திருச்சி":"Trichy","சேலம்":"Salem","திருப்பூர்":"Tirupur",
    "வேலூர்":"Vellore","தஞ்சாவூர்":"Thanjavur","திருநெல்வேலி":"Tirunelveli",
    // ── Tamil — states ───────────────────────────────────────────────────────
    "தமிழ்நாடு":"Tamil Nadu","கர்நாடகா":"Karnataka","கேரளா":"Kerala",
    "ஆந்திரப் பிரதேசம்":"Andhra Pradesh","தெலங்கானா":"Telangana",
    "மகாராஷ்டிரா":"Maharashtra","குஜராத்":"Gujarat","ராஜஸ்தான்":"Rajasthan",
    // ── Tamil — countries ────────────────────────────────────────────────────
    "இந்தியா":"India","அமெரிக்கா":"America","இங்கிலாந்து":"England",
    "ஆஸ்திரேலியா":"Australia","கனடா":"Canada","சிங்கப்பூர்":"Singapore",
    "துபாய்":"Dubai",
    // ── Tamil — job titles ───────────────────────────────────────────────────
    "டெவலப்பர்":"Developer","புரோகிராமர்":"Programmer","இன்ஜினியர்":"Engineer",
    "மேனேஜர்":"Manager","டிசைனர்":"Designer","அனலிஸ்ட்":"Analyst",
    "கன்சல்டன்ட்":"Consultant","டைரக்டர்":"Director",
    // ── Telugu — names ───────────────────────────────────────────────────────
    "రవి":"Ravi","సురేష్":"Suresh","అనన్య":"Ananya","రాం":"Ram",
    "విజయ్":"Vijay","అజయ్":"Ajay","రోహన్":"Rohan","రాహుల్":"Rahul",
    "అమిత్":"Amit","ప్రియ":"Priya","నేహా":"Neha","పూజా":"Pooja",
    "లక్ష్మి":"Lakshmi","దివ్య":"Divya","కార్తీక్":"Karthik","వెంకట్":"Venkat",
    "శ్రీనివాస్":"Srinivas","బాలాజీ":"Balaji","రాజేష్":"Rajesh","కిరణ్":"Kiran",
    "జాన్":"John","మేరీ":"Mary","అలెక్స్":"Alex",
    // ── Telugu — cities ──────────────────────────────────────────────────────
    "హైదరాబాద్":"Hyderabad","బెంగళూరు":"Bangalore","చెన్నై":"Chennai",
    "విజయవాడ":"Vijayawada","విశాఖపట్నం":"Visakhapatnam","వరంగల్":"Warangal",
    "తిరుపతి":"Tirupati","నెల్లూరు":"Nellore","ముంబై":"Mumbai","దిల్లీ":"Delhi",
    "పుణే":"Pune","అహ్మదాబాద్":"Ahmedabad","కోల్‌కతా":"Kolkata",
    // ── Telugu — states & countries ─────────────────────────────────────────
    "ఆంధ్రప్రదేశ్":"Andhra Pradesh","తెలంగాణ":"Telangana","కర్ణాటక":"Karnataka",
    "తమిళనాడు":"Tamil Nadu","కేరళ":"Kerala","మహారాష్ట్ర":"Maharashtra",
    "భారతదేశం":"India","ఇండియా":"India","అమెరికా":"America","ఇంగ్లాండ్":"England",
    // ── Telugu — job titles ──────────────────────────────────────────────────
    "డెవలపర్":"Developer","ప్రోగ్రామర్":"Programmer","ఇంజినీర్":"Engineer",
    "మేనేజర్":"Manager","డిజైనర్":"Designer","అనలిస్ట్":"Analyst",
    "కన్సల్టెంట్":"Consultant","డైరెక్టర్":"Director","సేల్స్ మేనేజర్":"Sales Manager",
    // ── Kannada — names ─────────────────────────────────────────────────────
    "ರವಿ":"Ravi","ಸುರೇಶ್":"Suresh","ಅನನ್ಯ":"Ananya","ರಾಮ್":"Ram",
    "ವಿಜಯ್":"Vijay","ಅಜಯ್":"Ajay","ರೋಹನ್":"Rohan","ರಾಹುಲ್":"Rahul",
    "ಅಮಿತ್":"Amit","ಪ್ರಿಯ":"Priya","ನೇಹಾ":"Neha","ಪೂಜಾ":"Pooja",
    "ಕಾರ್ತೀಕ್":"Karthik","ವೆಂಕಟ್":"Venkat","ಶ್ರೀನಿವಾಸ್":"Srinivas",
    "ಬಾಲಾಜಿ":"Balaji","ರಾಜೇಶ್":"Rajesh","ಕಿರಣ್":"Kiran",
    "ಜಾನ್":"John","ಮೇರಿ":"Mary","ಅಲೆಕ್ಸ್":"Alex",
    // ── Kannada — cities ─────────────────────────────────────────────────────
    "ಬೆಂಗಳೂರು":"Bangalore","ಹೈದರಾಬಾದ್":"Hyderabad","ಚೆನ್ನೈ":"Chennai",
    "ಮೈಸೂರು":"Mysuru","ಹುಬ್ಬಳ್ಳಿ":"Hubballi","ಮಂಗಳೂರು":"Mangaluru",
    "ಮುಂಬೈ":"Mumbai","ದೆಹಲಿ":"Delhi","ಪುಣೆ":"Pune",
    // ── Kannada — states & countries ────────────────────────────────────────
    "ಕರ್ನಾಟಕ":"Karnataka","ತಮಿಳುನಾಡು":"Tamil Nadu","ಕೇರಳ":"Kerala",
    "ಮಹಾರಾಷ್ಟ್ರ":"Maharashtra","ತೆಲಂಗಾಣ":"Telangana","ಆಂಧ್ರ ಪ್ರದೇಶ":"Andhra Pradesh",
    "ಭಾರತ":"India","ಇಂಡಿಯಾ":"India","ಅಮೆರಿಕ":"America","ಇಂಗ್ಲೆಂಡ್":"England",
    // ── Kannada — job titles ─────────────────────────────────────────────────
    "ಡೆವಲಪರ್":"Developer","ಪ್ರೋಗ್ರಾಮರ್":"Programmer","ಇಂಜಿನಿಯರ್":"Engineer",
    "ಮ್ಯಾನೇಜರ್":"Manager","ಡಿಸೈನರ್":"Designer","ಅನಾಲಿಸ್ಟ್":"Analyst",
    "ಕನ್ಸಲ್ಟೆಂಟ್":"Consultant","ಡೈರೆಕ್ಟರ್":"Director",

    // ── Email domain words — Tamil ───────────────────────────────────────────
    // These are what Tamil STT produces when user speaks email domains aloud.
    // gmail
    "ஜிமெயில்":"gmail","ஜீமெயில்":"gmail","ஜிமேல்":"gmail","ஜீமேல்":"gmail",
    "ஜிமைல்":"gmail","ஜீமைல்":"gmail","கிமெயில்":"gmail","கீமெயில்":"gmail",
    // yahoo
    "யாகூ":"yahoo","யாஹூ":"yahoo","யாஹூ":"yahoo","யாகு":"yahoo",
    // hotmail
    "ஹாட்மெயில்":"hotmail","ஹாட்மேல்":"hotmail","ஹட்மெயில்":"hotmail",
    // outlook
    "அவுட்லுக்":"outlook","அவுட்லூக்":"outlook","அவட்லுக்":"outlook",
    // rediffmail
    "ரெடிஃப்மெயில்":"rediffmail","ரெடிஃப்மேல்":"rediffmail",
    // TLDs
    "காம்":"com","கொம்":"com","கோம்":"com","காம":"com","கொம":"com",
    "இன்":"in","நெட்":"net","ஆர்க்":"org","ஓர்க்":"org","ஒர்க்":"org",
    "கோ":"co","கோ இன்":"co.in","எடு":"edu","கவ்":"gov",

    // ── Email domain words — Hindi ───────────────────────────────────────────
    // Hindi STT output for common domains
    "जीमेल":"gmail","जिमेल":"gmail","जीमेइल":"gmail","जिमेइल":"gmail",
    "याहू":"yahoo","यूट्यूब":"youtube",
    "हॉटमेल":"hotmail","होटमेल":"hotmail",
    "आउटलुक":"outlook","ऑउटलुक":"outlook",
    "कॉम":"com","कोम":"com","कॉम्":"com","डॉटकॉम":"com",
    "इन":"in","नेट":"net","ओआरजी":"org","ओर्ग":"org",

    // ── Email domain words — Telugu ──────────────────────────────────────────
    "జీమెయిల్":"gmail","జిమెయిల్":"gmail","జీమేల్":"gmail",
    "యాహూ":"yahoo","హాట్‌మెయిల్":"hotmail","అవుట్‌లుక్":"outlook",
    "కామ్":"com","కొమ్":"com","నెట్":"net","ఆర్గ్":"org","ఇన్":"in",

    // ── Email domain words — Kannada ─────────────────────────────────────────
    "ಜೀಮೇಲ್":"gmail","ಜಿಮೇಲ್":"gmail","ಯಾಹೂ":"yahoo",
    "ಹಾಟ್‌ಮೇಲ್":"hotmail","ಔಟ್‌ಲುಕ್":"outlook",
    "ಕಾಮ್":"com","ಕೊಮ್":"com","ನೆಟ್":"net","ಆರ್ಗ್":"org","ಇನ್":"in",
};

async function translateToEnglish(text, sourceLang) {
    if (!text || !text.trim()) return text;
    if (sourceLang === "en-IN") return text;

    const trimmed = text.trim();

    // 1. Exact match in phonetic map (instant, no API)
    if (PHONETIC_MAP[trimmed]) return PHONETIC_MAP[trimmed];

    // 2. Multi-word: try mapping every word via phonetic map.
    //    If ALL words resolve, skip API entirely.
    const words = trimmed.split(/\s+/);
    if (words.length > 1) {
        const mapped = words.map(w => PHONETIC_MAP[w] || null);
        if (mapped.every(m => m !== null)) return mapped.join(" ");
    }

    const cacheKey = sourceLang + "|" + trimmed;
    if (_translateCache[cacheKey] !== undefined) return _translateCache[cacheKey];

    // 3. API translation (MyMemory) for anything not in the phonetic map
    const langMap = { "hi-IN": "hi", "te-IN": "te", "kn-IN": "kn", "ta-IN": "ta" };
    const srcCode = langMap[sourceLang] || sourceLang.split("-")[0];

    try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(trimmed)}&langpair=${srcCode}|en`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const data = await resp.json();
        const raw  = data?.responseData?.translatedText || "";
        const result = isBadTranslation(raw, trimmed) ? trimmed : raw.trim();
        _translateCache[cacheKey] = result;
        return result;
    } catch (_) {
        // API failed — best-effort word-by-word phonetic fallback
        const fallback = words.map(w => PHONETIC_MAP[w] || w).join(" ");
        _translateCache[cacheKey] = fallback;
        return fallback;
    }
}

// Translate only text fields (skip phone/mobile/email/priority/website which need no translation)
const TRANSLATE_KEYS = new Set(["name", "contact_name", "city", "state_name", "country_name", "function", "title"]);

async function translateExtracted(extracted, lang) {
    if (lang === "en-IN") return extracted;
    const result = { ...extracted };
    for (const key of TRANSLATE_KEYS) {
        if (result[key]) {
            result[key] = await translateToEnglish(result[key], lang);
        }
    }
    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function getQ(lang, key) {
    return (FIELD_QUESTIONS[lang] || FIELD_QUESTIONS["en-IN"])[key] || key;
}
function getLabel(lang, key) {
    return (FIELD_LABELS[lang] || FIELD_LABELS["en-IN"])[key] || key;
}

function isSkip(text, lang) {
    const t = text.toLowerCase().trim();
    const words = SKIP_WORDS[lang] || SKIP_WORDS["en-IN"];
    return words.some(w => t === w || t.startsWith(w + " ") || t.endsWith(" " + w));
}
function isControl(text, lang, type) {
    const t = text.toLowerCase().trim();
    const words = (CONTROL_WORDS[type] || {})[lang] || (CONTROL_WORDS[type] || {})["en-IN"] || [];
    return words.some(w => t.includes(w));
}

// ─────────────────────────────────────────────────────────────────────────────
// ANSWER CLEANING (language-aware)
// ─────────────────────────────────────────────────────────────────────────────
function parsePriority(text, lang) {
    const t = text.toLowerCase();
    const hi = (PRIORITY_WORDS.high[lang]   || PRIORITY_WORDS.high["en-IN"]);
    const me = (PRIORITY_WORDS.medium[lang] || PRIORITY_WORDS.medium["en-IN"]);
    const lo = (PRIORITY_WORDS.low[lang]    || PRIORITY_WORDS.low["en-IN"]);
    if (hi.some(w => t.includes(w))) return "3";
    if (me.some(w => t.includes(w))) return "1";
    if (lo.some(w => t.includes(w))) return "0";
    return null;
}

function cleanAnswer(key, raw, lang) {
    const text  = (raw || "").trim().replace(/[.,!?।]+$/, "").trim();
    if (!text) return "";
    if (isSkip(text, lang)) return "";
    const lower = text.toLowerCase();

    if (key === "phone" || key === "mobile") {
        const digits = text.replace(/[^\d]/g, "");
        return digits.length >= 6 ? digits : text;
    }
    if (key === "priority") {
        return parsePriority(lower, lang) || "";
    }
        if (key === "email" || key === "email_cc") {
        // Direct regex match (already a valid email)
        const directMatch = raw.match(/[\w.+-]+@[\w.-]+\.\w+/);
        if (directMatch) return directMatch[0];

        // ─────────────────────────────────────────────────────────────────────
        // SPOKEN-TO-SYMBOL CONVERSION
        //
        // IMPORTANT: \b (word boundary) does NOT work for Unicode / non-ASCII
        // script characters (Hindi, Tamil, Telugu, Kannada) because JS regex
        // \b only recognises ASCII [A-Za-z0-9_] as "word" chars.
        //
        // FIX: use (?<!\S) … (?!\S)  — i.e. "preceded by whitespace or start"
        //      and "followed by whitespace or end" — for ALL non-ASCII words.
        //      For pure ASCII words (at, dot, etc.) \b still works fine.
        // ─────────────────────────────────────────────────────────────────────

        let conv = raw;

        // ── Helper: replace a non-ASCII word that sits between spaces/bounds ─
        // Matches the word when surrounded by whitespace or at string edges.
        function replaceUWord(str, word, replacement) {
            // Escape special regex chars in the word just in case
            const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            return str.replace(new RegExp("(?<!\\S)" + esc + "(?!\\S)", "g"), replacement);
        }

        // ── "at" symbol — English (ASCII \b works fine) ──────────────────────
        conv = conv.replace(/\bat the rate of\b/gi, "@");
        conv = conv.replace(/\bat the rate\b/gi,    "@");
        conv = conv.replace(/\bat sign\b/gi,         "@");
        conv = conv.replace(/\bat\b/gi,              "@");

        // ── "at" symbol — Hindi (space-boundary required) ────────────────────
        // STT variously produces: एट, ऐट, एट्, पर, और, ओर, अट, आट, अत, ऑट, ऑट्
        // "और" (meaning "and") is the most common mis-transcription of "at" in
        // email context by Hindi STT engines — must be caught here.
        for (const w of ["एट्","एट","ऐट","ऑट्","ऑट","आट","अट","अत","पर","और","ओर"]) {
            conv = replaceUWord(conv, w, "@");
        }

        // ── "at" symbol — Tamil (space-boundary required) ────────────────────
        // Common STT outputs for "at": ஆட்ட், ஏட்ட், ஏட்ட, ஆட்டு, ஆட், ஆட,
        //   அட், அட, ஏட், ஏட, ஐட், ஐட, அண்டு, ஆண்டு, ஆன
        // Order: longest/most-specific first to avoid partial matches
        for (const w of ["ஆட்ட்","ஏட்ட்","ஏட்ட","ஆட்டு","ஆட்","ஆட","அட்","அட",
                          "ஏட்","ஏட","ஐட்","ஐட","அண்டு","ஆண்டு","ஆன"]) {
            conv = replaceUWord(conv, w, "@");
        }

        // ── "at" symbol — Telugu (space-boundary required) ───────────────────
        for (const w of ["యాట్","యాట","ఆట్","అట్","పర్"]) {
            conv = replaceUWord(conv, w, "@");
        }

        // ── "at" symbol — Kannada (space-boundary required) ──────────────────
        for (const w of ["ಯಾಟ್","ಯಾಟ","ಆಟ್","ಅಟ್","ಪರ್"]) {
            conv = replaceUWord(conv, w, "@");
        }

        // ── "dot" symbol — English (ASCII \b works fine) ─────────────────────
        conv = conv.replace(/\bdot\b/gi,    ".");
        conv = conv.replace(/\bpoint\b/gi,  ".");
        conv = conv.replace(/\bperiod\b/gi, ".");

        // ── "dot" symbol — Hindi (space-boundary required) ───────────────────
        // STT variants: डॉट्, डॉट, डाट्, डाट, डट, दॉट, दोट, बिंदु, बिन्दु
        for (const w of ["डॉट्","डॉट","डाट्","डाट","डट","दॉट","दोट","बिंदु","बिन्दु"]) {
            conv = replaceUWord(conv, w, ".");
        }

        // ── "dot" symbol — Tamil (space-boundary required) ───────────────────
        // STT variants: டாட்ட், டாட், டாட, டோட், டோட, டொட், டொட, டட், டட, புள்ளி
        for (const w of ["டாட்ட்","டாட்","டாட","டோட்","டோட","டொட்","டொட","டட்","டட","புள்ளி"]) {
            conv = replaceUWord(conv, w, ".");
        }

        // ── "dot" symbol — Telugu (space-boundary required) ──────────────────
        for (const w of ["డాట్","డాట","బిందువు"]) {
            conv = replaceUWord(conv, w, ".");
        }

        // ── "dot" symbol — Kannada (space-boundary required) ─────────────────
        for (const w of ["ಡಾಟ್","ಡಾಟ","ಚುಕ್ಕಿ"]) {
            conv = replaceUWord(conv, w, ".");
        }

        // ── Collapse spaces around @ and . ───────────────────────────────────
        conv = conv.replace(/\s*@\s*/g, "@");
        conv = conv.replace(/\s*\.\s*/g, ".");

        // ── Remove all remaining whitespace to join parts ─────────────────────
        conv = conv.replace(/\s+/g, "");

        if (conv.includes("@")) {
            const atIdx   = conv.indexOf("@");
            let localPart = conv.slice(0, atIdx);
            let domain    = conv.slice(atIdx + 1);  // e.g. "gmail.com" or "ஜிமெயில்.காம்"

            // ── Transliterate localPart ──────────────────────────────────────
            // 1. Exact PHONETIC_MAP lookup (e.g. "ஜான்" → "John", "जॉन" → "John")
            if (PHONETIC_MAP[localPart]) {
                localPart = PHONETIC_MAP[localPart];
            } else {
                // 2. Word-by-word lookup for compound local parts (e.g. "john.alex")
                localPart = localPart.split(".").map(p => PHONETIC_MAP[p] || p).join(".");
                // 3. Strip any remaining non-ASCII / non-email characters
                localPart = localPart.replace(/[^\x00-\x7F._%+\-]/g, "");
            }
            if (!localPart) localPart = "user";  // safety fallback

            // ── Transliterate domain segments ────────────────────────────────
            // The domain may still contain native-script words if the user spoke
            // e.g. "gmail" as "ஜிமெயில்" and "com" as "காம்". Map each segment
            // through PHONETIC_MAP, then strip any remaining non-ASCII chars.
            domain = domain.split(".").map(seg => {
                if (!seg) return seg;
                // Direct map (e.g. "ஜிமெயில்" → "gmail", "காம்" → "com")
                if (PHONETIC_MAP[seg]) return PHONETIC_MAP[seg];
                // Strip non-ASCII if no map entry (already ASCII domain part)
                return seg.replace(/[^\x00-\x7F]/g, "");
            }).filter(seg => seg.length > 0).join(".");

            return (localPart + "@" + domain).toLowerCase();
        }

        // ── Last resort: strip all spaces and check again ─────────────────────
        const joined = raw.replace(/\s/g, "").toLowerCase();
        if (joined.includes("@")) return joined;

        return text;
    }

    // ── website — also needs dot-word substitution ───────────────────────────
    if (key === "website") {
        let w = (raw || "").trim();

        // Helper: space-boundary replace for non-ASCII words (same fix as email block)
        function replaceUWordW(str, word, replacement) {
            const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            return str.replace(new RegExp("(?<!\\S)" + esc + "(?!\\S)", "g"), replacement);
        }

        // English dot words (\b works fine for ASCII)
        w = w.replace(/\bdot\b/gi, ".").replace(/\bpoint\b/gi, ".").replace(/\bperiod\b/gi, ".");

        // Tamil dot words (space-boundary)
        for (const word of ["டாட்ட்","டாட்","டாட","டோட்","டோட","டொட்","டொட","டட்","டட","புள்ளி"]) {
            w = replaceUWordW(w, word, ".");
        }
        // Hindi dot words (space-boundary)
        for (const word of ["डॉट्","डॉट","डाट्","डाट","डट","दॉट","दोट","बिंदु","बिन्दु"]) {
            w = replaceUWordW(w, word, ".");
        }
        // Telugu dot words (space-boundary)
        for (const word of ["డాట్","డాట","బిందువు"]) {
            w = replaceUWordW(w, word, ".");
        }
        // Kannada dot words (space-boundary)
        for (const word of ["ಡಾಟ್","ಡಾಟ","ಚುಕ್ಕಿ"]) {
            w = replaceUWordW(w, word, ".");
        }

        // Remove spaces around dots and collapse remaining spaces
        w = w.replace(/\s*\.\s*/g, ".").replace(/\s+/g, "");
        // Transliterate via phonetic map (word by word for things like "India.com")
        const parts = w.split(".");
        const mapped = parts.map(p => PHONETIC_MAP[p] || p);
        w = mapped.join(".");
        // Strip any remaining non-ASCII / non-URL characters
        w = w.replace(/[^\x00-\x7F./:?=&_\-#%+@]/g, "");
        if (!w) w = text.replace(/\s+/g, "");
        return w.startsWith("http") ? w : "https://" + w;
    }

    return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// QUICK RECORD — extract lead fields from a single utterance (English)
// For non-English quick record, we do best-effort extraction of numbers/email
// ─────────────────────────────────────────────────────────────────────────────
function toTitleCase(str) {
    return (str || "").replace(/\b\w/g, c => c.toUpperCase());
}

function extractAfterKeyword(lowerText, keywords, stopWords) {
    const stopRe = stopWords.length
        ? new RegExp("\\b(" + stopWords.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b")
        : null;
    for (const kw of keywords) {
        const idx = lowerText.indexOf(kw);
        if (idx === -1) continue;
        let vs = idx + kw.length;
        while (vs < lowerText.length && lowerText[vs] === " ") vs++;
        const rest = lowerText.slice(vs);
        if (!rest) continue;
        let ve = rest.length;
        if (stopRe) { const m = stopRe.exec(rest); if (m) { const pre = m.index === 0 ? "" : rest[m.index-1]; if (pre === "" || pre === " ") ve = m.index; } }
        const value = rest.slice(0, ve).trim();
        if (value) return value;
    }
    return null;
}

const QUICK_STOPS = ["phone","mobile","email","emailcc","email cc","address","street",
    "city","state","zip","country","website","job position","position","title","priority","lead","create lead"];

function extractLeadData(text) {
    const data = {};

    // Pre-process spoken email symbols so the regex below finds them
    // e.g. "john at gmail dot com" → "john@gmail.com" (handles translated output too)
    text = text
        .replace(/\bat the rate of\b/gi, "@")
        .replace(/\bat the rate\b/gi, "@")
        .replace(/\bat sign\b/gi, "@")
        .replace(/\bat\b/gi, "@")
        .replace(/\bdot\b/gi, ".")
        .replace(/\bpoint\b/gi, ".")
        .replace(/\bperiod\b/gi, ".");
    // Remove spaces around @ and . to join email parts
    text = text.replace(/\s*@\s*/g, "@").replace(/\s*\.\s*/g, ".");

    const lower = text.toLowerCase();

    // Email(s)
    const allEmails = [...text.matchAll(/[\w.+-]+@[\w.-]+\.\w+/g)].map(m=>({value:m[0],index:m.index}));
    const emailCcKwIdx = lower.search(/\bemail\s*cc\b/);
    if (allEmails.length >= 2) {
        if (emailCcKwIdx !== -1) {
            const ccE = allEmails.reduce((c,e)=>{ if(e.index<emailCcKwIdx) return c; if(!c) return e; return e.index<c.index?e:c; },null);
            if (ccE) { data.email_cc=ccE.value; const p=allEmails.find(e=>e.value!==ccE.value); if(p) data.email=p.value; }
            else { data.email=allEmails[0].value; data.email_cc=allEmails[1].value; }
        } else { data.email=allEmails[0].value; data.email_cc=allEmails[1].value; }
    } else if (allEmails.length===1) {
        if (emailCcKwIdx!==-1 && allEmails[0].index>emailCcKwIdx) data.email_cc=allEmails[0].value;
        else data.email=allEmails[0].value;
    }

    // Phone / Mobile
    const hasPhKw  = lower.includes(" phone ")||lower.startsWith("phone ");
    const hasMoKw  = lower.includes(" mobile ")||lower.startsWith("mobile ");
    const extractNum = s=>{ const m=s.match(/\b\d[\d\s\-]{6,14}\d\b/); return m?m[0].replace(/[\s\-]/g,""):null; };
    const numStop = /\b(?:mobile|email|address|city|state|zip|website|title|position|priority)\b/;
    if (hasPhKw&&hasMoKw) {
        const pi=lower.indexOf("phone"),mi=lower.indexOf("mobile");
        const pn=extractNum(lower.slice(pi+5).split(numStop)[0]);
        const mn=extractNum(lower.slice(mi+6).split(numStop)[0]);
        if(pn) data.phone=pn; if(mn) data.mobile=mn;
    } else if (hasPhKw) {
        const n=extractNum(lower.slice(lower.indexOf("phone")+5).split(numStop)[0]); if(n) data.phone=n;
    } else if (hasMoKw) {
        const n=extractNum(lower.slice(lower.indexOf("mobile")+6).split(numStop)[0]); if(n) data.mobile=n;
    } else {
        const m=text.match(/\b\d[\d\s\-]{6,14}\d\b/); if(m) data.phone=m[0].replace(/[\s\-]/g,"");
    }

    // Name
    const cm=lower.match(/(?:create lead|add lead|lead for|lead named?)\s+([a-z][a-z ]+?)(?=\s+\d|\s+phone|\s+mobile|\s+email|\s+address|\s+website|\s+title|\s+priority|\s+job|$)/);
    if (cm) data.name=toTitleCase(cm[1].trim());
    else { const cap=text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/); if(cap) data.name=cap[0]; }
    const contM=text.match(/(?:contact|for|person)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
    if (contM) data.contact_name=contM[1].trim();
    if (!data.contact_name&&data.name) data.contact_name=data.name;

    // Address fields
    const aStop=["city","state","zip","country","phone","mobile","email","emailcc","email cc","website","title","priority","position"];
    const cStop=["state","zip","country","phone","mobile","email","emailcc","email cc","website","title","priority","position","address"];
    const sStop=["zip","country","phone","mobile","email","emailcc","email cc","website","title","priority","position","address","city"];
    const ctStop=["phone","mobile","email","emailcc","email cc","website","title","priority","position","address","city","state","zip"];
    const sr=extractAfterKeyword(lower,["address ","street "],aStop);
    const cr=extractAfterKeyword(lower,["city "],cStop);
    const str2=extractAfterKeyword(lower,["state "],sStop);
    const zr=extractAfterKeyword(lower,["zip "],["country","phone","mobile","email","website","title","priority","position","address","city","state"]);
    const cor=extractAfterKeyword(lower,["country "],ctStop);
    if(sr) data.street=toTitleCase(sr);
    if(cr) data.city=toTitleCase(cr);
    if(str2) data.state_name=toTitleCase(str2);
    if(zr) data.zip=zr.replace(/\s/g,"");
    if(cor) data.country_name=toTitleCase(cor);

    const wStop=["phone","mobile","email","emailcc","email cc","address","city","state","zip","country","title","priority","position","job"];
    const wr=extractAfterKeyword(lower,["website "],wStop);
    if(wr){ const ws=wr.trim().replace(/\s/g,""); data.website=ws.startsWith("http")?ws:"https://"+ws; }

    const jStop=["phone","mobile","email","emailcc","email cc","address","city","state","zip","country","website","title","priority"];
    const jr=extractAfterKeyword(lower,["job position ","position "],jStop);
    if(jr) data.function=toTitleCase(jr);

    const tStop=["phone","mobile","email","emailcc","email cc","address","city","state","zip","country","website","priority","position","job"];
    const tr=extractAfterKeyword(lower,["title "],tStop);
    if(tr){ const tm={"mr":"Mr.","mister":"Mr.","mrs":"Mrs.","missus":"Mrs.","miss":"Miss","ms":"Ms.","dr":"Dr.","doctor":"Dr.","prof":"Prof.","professor":"Prof."}; data.title=tm[tr.trim().toLowerCase()]||toTitleCase(tr.trim()); }

    const prStop=["phone","mobile","email","emailcc","email cc","address","city","state","zip","country","website","title","position"];
    const pr=extractAfterKeyword(lower,["priority "],prStop);
    if(pr){ const p=pr.trim().toLowerCase(); if(p.includes("very high")||p.includes("highest")) data.priority="3"; else if(p.includes("high")) data.priority="2"; else if(p.includes("medium")||p.includes("normal")||p.includes("mid")) data.priority="1"; else if(p.includes("low")||p.includes("none")||p.includes("no")) data.priority="0"; }

    return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH FILTER EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────
const SEARCH_STOPS=["name","phone","mobile","email","emailcc","email cc","city","state","zip","country","street","address","website","job position","position","title","priority","company","salesperson","team","sales team"];

function extractSearchFilters(text) {
    const filters={};
    const lower=text.toLowerCase().trim();
    const cleaned=lower.replace(/^(search|find|look up|show me|get|fetch|list|display|খুঁজুন|ढूंढें|వెతకు|ಹುಡುಕು|தேடு)\s+(lead[s]?\s+)?(for\s+|with\s+)?/,"").replace(/\s+lead[s]?\s*$/,"").trim();
    const grab=(kws,stops)=>extractAfterKeyword(cleaned,kws,stops);
    const parsePri=p=>{if(!p)return null;if(p.includes("very high")||p.includes("highest"))return"3";if(p.includes("high"))return"2";if(p.includes("medium")||p.includes("normal")||p.includes("mid"))return"1";if(p.includes("low")||p.includes("none")||p.includes("no"))return"0";return null;};
    const priAfter=grab(["priority "],SEARCH_STOPS.filter(s=>s!=="priority"));
    let pri=parsePri(priAfter);
    if(pri===null){const pm=cleaned.match(/\b(very high|highest|high|medium|normal|mid|low|none|no)\s+priority\b/);if(pm) pri=parsePri(pm[1]);}
    if(pri!==null) filters.priority=pri;
    const emailMatches=[...text.matchAll(/[\w.+-]+@[\w.-]+\.\w+/g)];
    const emailCcKwIdx=cleaned.search(/\bemail\s*cc\b/);
    if(emailMatches.length>=2){filters.email=emailMatches[0][0];filters.email_cc=emailMatches[1][0];}
    else if(emailMatches.length===1){if(emailCcKwIdx!==-1&&emailMatches[0].index>emailCcKwIdx) filters.email_cc=emailMatches[0][0]; else filters.email=emailMatches[0][0];}
    const extractNum=str=>{const m=str.match(/\b\d[\d\s\-]{6,14}\d\b/);return m?m[0].replace(/[\s\-]/g,""):null;};
    const hasPhoneKw=cleaned.includes(" phone ")||cleaned.startsWith("phone ");
    const hasMobileKw=cleaned.includes(" mobile ")||cleaned.startsWith("mobile ");
    const numStop=/\b(?:mobile|email|city|state|zip|country|website|title|position|priority|company|salesperson|team)\b/;
    if(hasPhoneKw){const n=extractNum(cleaned.slice(cleaned.indexOf("phone")+5).split(numStop)[0]);if(n) filters.phone=n;}
    if(hasMobileKw){const n=extractNum(cleaned.slice(cleaned.indexOf("mobile")+6).split(numStop)[0]);if(n) filters.mobile=n;}
    if(!hasPhoneKw&&!hasMobileKw&&!filters.email){const n=extractNum(cleaned);if(n) filters.phone=n;}
    const cityR=grab(["city "],SEARCH_STOPS.filter(s=>s!=="city"));
    const stateR=grab(["state "],SEARCH_STOPS.filter(s=>s!=="state"));
    const zipR=grab(["zip "],SEARCH_STOPS.filter(s=>s!=="zip"));
    const countryR=grab(["country "],SEARCH_STOPS.filter(s=>s!=="country"));
    const streetR=grab(["street ","address "],SEARCH_STOPS.filter(s=>!["street","address"].includes(s)));
    if(cityR) filters.city=toTitleCase(cityR);
    if(stateR) filters.state_name=toTitleCase(stateR);
    if(zipR) filters.zip=zipR.replace(/\s/g,"");
    if(countryR) filters.country_name=toTitleCase(countryR);
    if(streetR) filters.street=toTitleCase(streetR);
    const websiteR=grab(["website "],SEARCH_STOPS.filter(s=>s!=="website"));
    if(websiteR) filters.website=websiteR.trim().replace(/\s/g,"");
    const jobR=grab(["job position ","position "],SEARCH_STOPS.filter(s=>!["job position","position"].includes(s)));
    if(jobR) filters.function=toTitleCase(jobR);
    const titleR=grab(["title "],SEARCH_STOPS.filter(s=>s!=="title"));
    if(titleR){const tm={"mr":"Mr.","mister":"Mr.","mrs":"Mrs.","missus":"Mrs.","miss":"Miss","ms":"Ms.","dr":"Dr.","doctor":"Dr.","prof":"Prof.","professor":"Prof."};filters.title=tm[titleR.trim().toLowerCase()]||toTitleCase(titleR.trim());}
    const companyR=grab(["company "],SEARCH_STOPS.filter(s=>s!=="company"));
    if(companyR) filters.company=toTitleCase(companyR);
    const spR=grab(["salesperson "],SEARCH_STOPS.filter(s=>s!=="salesperson"));
    if(spR) filters.salesperson=toTitleCase(spR);
    const teamR=grab(["sales team ","team "],SEARCH_STOPS.filter(s=>!["team","sales team"].includes(s)));
    if(teamR) filters.sales_team=toTitleCase(teamR);
    const stripPats=[/\bpriority\s+\S+(\s+\S+)?\b/g,/\b(very high|highest|high|medium|normal|mid|low|none|no)\s+priority\b/g,/\bcity\s+\S+(\s+\S+)?\b/g,/\bstate\s+\S+(\s+\S+)?\b/g,/\bzip\s+\S+\b/g,/\bcountry\s+\S+(\s+\S+)?\b/g,/\b(street|address)\s+\S+(\s+\S+)?\b/g,/\bwebsite\s+\S+\b/g,/\bjob\s+position\s+\S+(\s+\S+)?\b/g,/\bposition\s+\S+(\s+\S+)?\b/g,/\btitle\s+\S+\b/g,/\bcompany\s+\S+(\s+\S+)?\b/g,/\bsalesperson\s+\S+(\s+\S+)?\b/g,/\b(sales\s+team|team)\s+\S+(\s+\S+)?\b/g,/\bphone\s+\d[\d\s\-]*\b/g,/\bmobile\s+\d[\d\s\-]*\b/g,/\bemail\s*cc\b/g,/\bemail\b/g,/[\w.+-]+@[\w.-]+\.\w+/g,/\bleads?\b/g,/\b\d{6,}\b/g];
    let nc=cleaned; for(const p of stripPats) nc=nc.replace(p," ");
    nc=nc.replace(/\s+/g," ").trim();
    if(nc) filters.name=toTitleCase(nc);
    return filters;
}
function filtersToLabel(filters){
    const STARS={"0":"None","1":"★","2":"★★","3":"★★★"};
    const parts=[];
    if(filters.name)         parts.push(`"${filters.name}"`);
    if(filters.priority!==undefined) parts.push(`Priority: ${STARS[filters.priority]||filters.priority}`);
    if(filters.city)         parts.push(`City: ${filters.city}`);
    if(filters.phone)        parts.push(`Phone: ${filters.phone}`);
    if(filters.email)        parts.push(`Email: ${filters.email}`);
    if(filters.company)      parts.push(`Company: ${filters.company}`);
    if(filters.salesperson)  parts.push(`Salesperson: ${filters.salesperson}`);
    return parts.join(" · ")||"all leads";
}

const PRIORITY_LABELS = { "0":"None","1":"Low ★","2":"Medium ★★","3":"High ★★★" };

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT 1: Voice Lead Creator
// ─────────────────────────────────────────────────────────────────────────────
class VoiceCrmWidget extends Component {
    static template = xml`
<div class="voice-crm-overlay" t-on-click.self="close">
<div class="voice-crm-modal">
<h4>🎤 Voice Lead Creator</h4>

<!-- Language bar (always visible except done/error) -->
<t t-if="state.status !== 'done'">
<div class="vc-lang-bar">
    <t t-foreach="langs" t-as="lg" t-key="lg.code">
        <button class="vc-lang-btn"
                t-att-class="state.lang === lg.code ? 'active' : ''"
                t-on-click="() => this.setLang(lg.code)">
            <t t-esc="lg.flag"/> <t t-esc="lg.label"/>
        </button>
    </t>
</div>
</t>

<!-- ── MODE SELECTION ── -->
<div t-if="state.status === 'idle'">
    <div class="vc-mode-card primary" t-on-click="startInterview">
        <div class="vc-mode-title">🎙 Interview Mode
            <span style="font-size:.72rem;background:#7c3aed;color:#fff;padding:2px 8px;border-radius:10px;margin-left:6px;">Recommended</span>
        </div>
        <div style="font-size:.82rem;color:#555;">Computer asks field-by-field in your language. Name, phone, email required.</div>
    </div>
    <div class="vc-mode-card" t-on-click="startQuickRecord">
        <div class="vc-mode-title">⚡ Quick Record</div>
        <div style="font-size:.82rem;color:#555;">Say all details at once: <em>"Alex 9876543210 alex@gmail.com city Chennai"</em></div>
    </div>
    <button class="btn btn-light btn-sm mt-2" t-on-click="close">Cancel</button>
</div>

<!-- ── INTERVIEW: speaking ── -->
<div t-if="state.status === 'iv_speaking'">
    <div class="vc-progress-bar"><div class="vc-progress-bar-fill" t-att-style="'width:'+state.ivProgress+'%'"/></div>
    <div class="vc-interview-card">
        <div class="vc-field-label"><t t-esc="state.ivFieldLabel"/></div>
        <div class="vc-question"><t t-esc="state.ivQuestion"/></div>
        <div class="vc-speaking-anim"><span/><span/><span/><span/><span/><span/></div>
    </div>
    <t t-if="state.ivCollected and Object.keys(state.ivCollected).length">
        <div class="vc-collected-fields">
            <div t-foreach="Object.keys(state.ivCollected)" t-as="k" t-key="k" class="vc-cf-row">
                <span class="vc-cf-key"><t t-esc="k"/></span>
                <span class="vc-cf-val"><t t-esc="state.ivCollected[k]"/></span>
            </div>
        </div>
    </t>
    <button class="btn btn-sm btn-outline-danger" t-on-click="abortInterview">✕ Cancel</button>
</div>

<!-- ── INTERVIEW: listening ── -->
<div t-if="state.status === 'iv_listening'">
    <div class="vc-progress-bar"><div class="vc-progress-bar-fill" t-att-style="'width:'+state.ivProgress+'%'"/></div>
    <div class="vc-interview-card">
        <div class="vc-field-label"><t t-esc="state.ivFieldLabel"/></div>
        <div class="vc-question"><t t-esc="state.ivQuestion"/></div>
        <div class="vc-listening-ring">🎙</div>
        <div class="vc-interim"><t t-esc="state.interim || '...'"/></div>
    </div>
    <t t-if="state.ivCollected and Object.keys(state.ivCollected).length">
        <div class="vc-collected-fields">
            <div t-foreach="Object.keys(state.ivCollected)" t-as="k" t-key="k" class="vc-cf-row">
                <span class="vc-cf-key"><t t-esc="k"/></span>
                <span class="vc-cf-val"><t t-esc="state.ivCollected[k]"/></span>
            </div>
        </div>
    </t>
    <!-- Manual text fallback -->
    <div class="vc-manual-row">
        <input class="form-control form-control-sm"
               t-att-placeholder="'Type answer manually…'"
               t-att-value="state.ivManualInput"
               t-on-input="(e) => { state.ivManualInput = e.target.value; }"
               t-on-keydown="onManualKeyDown"/>
        <button class="btn btn-sm btn-primary" t-on-click="ivSubmitManual">OK</button>
    </div>
    <div class="mt-2 d-flex gap-2">
        <button class="btn btn-sm btn-outline-secondary" t-on-click="ivSkipField">Skip →</button>
        <button class="btn btn-sm btn-outline-danger"    t-on-click="abortInterview">✕ Cancel</button>
    </div>
</div>

<!-- ── INTERVIEW: confirming ── -->
<div t-if="state.status === 'iv_confirming'">
    <div class="vc-progress-bar"><div class="vc-progress-bar-fill" t-att-style="'width:'+state.ivProgress+'%'"/></div>
    <div class="vc-interview-card">
        <div class="vc-field-label"><t t-esc="state.ivFieldLabel"/></div>
        <div class="vc-question"><t t-esc="state.ivQuestion"/></div>
        <div class="vc-speaking-anim"><span/><span/><span/><span/><span/><span/></div>
    </div>
</div>

<!-- ── QUICK RECORD ── -->
<div t-if="state.status === 'recording'">
    <div class="voice-pulse">🎙 Listening…</div>
    <p t-if="state.interim" class="text-muted mt-2" style="font-style:italic"><t t-esc="state.interim"/></p>
    <button class="btn btn-danger mt-3" t-on-click="stopRecording">⏹ Stop</button>
</div>

<!-- ── PREVIEW ── -->
<div t-if="state.status === 'preview'">
    <label><strong>Review &amp; Edit</strong></label>
    <div class="row g-2 mt-1">
        <div class="col-6"><label>Lead Name *</label>
            <input class="form-control" t-att-value="state.extracted.name||''"
                   t-on-change="(e)=>{state.extracted.name=e.target.value;}"/></div>
        <div class="col-6"><label>Contact Name</label>
            <input class="form-control" t-att-value="state.extracted.contact_name||''"
                   t-on-change="(e)=>{state.extracted.contact_name=e.target.value;}"/></div>
        <div class="col-6"><label>Phone *</label>
            <input class="form-control" t-att-value="state.extracted.phone||''"
                   t-on-change="(e)=>{state.extracted.phone=e.target.value;}"/></div>
        <div class="col-6"><label>Mobile</label>
            <input class="form-control" t-att-value="state.extracted.mobile||''"
                   t-on-change="(e)=>{state.extracted.mobile=e.target.value;}"/></div>
        <div class="col-6"><label>Email *</label>
            <input class="form-control" t-att-value="state.extracted.email||''"
                   t-on-change="(e)=>{state.extracted.email=e.target.value;}"/></div>
        <div class="col-6"><label>Email CC</label>
            <input class="form-control" t-att-value="state.extracted.email_cc||''"
                   t-on-change="(e)=>{state.extracted.email_cc=e.target.value;}"/></div>
        <div class="col-4"><label>City</label>
            <input class="form-control" t-att-value="state.extracted.city||''"
                   t-on-change="(e)=>{state.extracted.city=e.target.value;}"/></div>
        <div class="col-4"><label>State</label>
            <input class="form-control" t-att-value="state.extracted.state_name||''"
                   t-on-change="(e)=>{state.extracted.state_name=e.target.value;}"/></div>
        <div class="col-4"><label>Country</label>
            <input class="form-control" t-att-value="state.extracted.country_name||''"
                   t-on-change="(e)=>{state.extracted.country_name=e.target.value;}"/></div>
        <div class="col-6"><label>Website</label>
            <input class="form-control" t-att-value="state.extracted.website||''"
                   t-on-change="(e)=>{state.extracted.website=e.target.value;}"/></div>
        <div class="col-6"><label>Job Position</label>
            <input class="form-control" t-att-value="state.extracted.function||''"
                   t-on-change="(e)=>{state.extracted.function=e.target.value;}"/></div>
        <div class="col-6"><label>Priority</label>
            <select class="form-select" t-on-change="(e)=>{state.extracted.priority=e.target.value;}">
                <option value="0" t-att-selected="(state.extracted.priority||'0')==='0'">None</option>
                <option value="1" t-att-selected="state.extracted.priority==='1'">Low ★</option>
                <option value="2" t-att-selected="state.extracted.priority==='2'">Medium ★★</option>
                <option value="3" t-att-selected="state.extracted.priority==='3'">High ★★★</option>
            </select>
        </div>
    </div>
    <t t-if="state.previewError">
        <div class="alert alert-warning mt-2 py-2"><t t-esc="state.previewError"/></div>
    </t>
    <div class="mt-3 d-flex gap-2 flex-wrap">
        <button class="btn btn-success" t-on-click="createLead" t-att-disabled="state.saving">
            <t t-if="state.saving">Saving…</t><t t-else="">✅ Save Lead</t>
        </button>
        <button class="btn btn-secondary" t-on-click="retake">🔁 Start Over</button>
        <button class="btn btn-light ms-auto" t-on-click="close">Cancel</button>
    </div>
</div>

<!-- ── DONE ── -->
<div t-if="state.status === 'done'">
    <div class="alert alert-success">✅ Lead <strong><t t-esc="state.leadName"/></strong> saved!</div>
    <button class="btn btn-primary" t-on-click="close">Close</button>
</div>

<!-- ── ERROR ── -->
<div t-if="state.status === 'error'">
    <div class="alert alert-danger">❌ <t t-esc="state.errorMsg"/></div>
    <button class="btn btn-secondary" t-on-click="retake">Try Again</button>
</div>

</div>
</div>
    `;

    setup() {
        this.langs = LANGUAGES;
        this.state = useState({
            lang:         "en-IN",
            status:       "idle",
            transcript:   "",
            interim:      "",
            extracted:    {},
            saving:       false,
            leadName:     "",
            errorMsg:     "",
            previewError: "",
            // Interview
            ivFieldIdx:   0,
            ivFieldLabel: "",
            ivQuestion:   "",
            ivProgress:   0,
            ivCollected:  {},
            ivManualInput:"",
        });
        this.recognition = null;
        this._ivAborted  = false;
        this.notification = useService("notification");
        this.rpc          = useService("rpc");
        this.leadId       = this.props.action?.context?.active_id || null;
    }

    setLang(code) {
        this.state.lang = code;
    }

    // ── Interview ─────────────────────────────────────────────────────────────

    async startInterview() {
        this._ivAborted = false;
        if (this.recognition) { try { this.recognition.abort(); } catch(_){} this.recognition = null; }
        this.state.ivCollected  = {};
        this.state.extracted    = {};
        this.state.ivManualInput = "";
        stopSpeaking();
        await speak(getQ(this.state.lang, "intro"), this.state.lang);
        if (this._ivAborted) return;
        await this._ivAskField(0);
    }

    async _ivAskField(idx) {
        if (this._ivAborted) return;
        if (idx >= INTERVIEW_FIELDS.length) { await this._ivFinish(); return; }
        const field = INTERVIEW_FIELDS[idx];
        const total = INTERVIEW_FIELDS.length;
        const lang  = this.state.lang;
        const label = getLabel(lang, field.key);
        const q     = getQ(lang, field.key);

        this.state.ivFieldIdx   = idx;
        this.state.ivFieldLabel = `${idx+1} / ${total}  —  ${label}`;
        this.state.ivQuestion   = q;
        this.state.ivProgress   = Math.round((idx / total) * 100);
        this.state.status       = "iv_speaking";
        this.state.ivManualInput = "";

        await speak(q, lang);
        if (this._ivAborted) return;
        this._ivListenForAnswer(idx, 0);
    }

    _ivListenForAnswer(idx, retryCount) {
        if (this._ivAborted) return;
        const retry = retryCount || 0;
        const lang  = this.state.lang;
        const field = INTERVIEW_FIELDS[idx];
        this.state.status  = "iv_listening";
        this.state.interim = "";

        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            this.state.status   = "error";
            this.state.errorMsg = "Web Speech API not supported. Use Chrome or Edge.";
            return;
        }

        if (this.recognition) { try { this.recognition.abort(); } catch(_){} this.recognition = null; }

        const rec = new SR();
        rec.continuous      = true;
        rec.interimResults  = true;
        rec.lang            = lang;
        rec.maxAlternatives = 5;
        this.recognition    = rec;

        let finalResult  = "";
        let handled      = false;
        let audioStarted = false;
        let silenceTimer = null;

        const clearTimer = () => { if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; } };

        const commit = () => {
            clearTimer();
            if (handled || this._ivAborted) return;
            handled = true;
            try { rec.stop(); } catch(_){}
            const answer = finalResult.trim();
            if (answer) {
                this._ivHandleAnswer(idx, field, answer);
            } else if (retry < 3) {
                setTimeout(() => { if (!this._ivAborted) this._ivListenForAnswer(idx, retry+1); }, 400);
            } else {
                this._ivAskField(idx);
            }
        };

        rec.onresult = (event) => {
            clearTimer();
            let interim = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const t = event.results[i][0].transcript;
                if (event.results[i].isFinal) finalResult += t + " ";
                else interim += t;
            }
            this.state.interim = interim || finalResult.trim();
            if (finalResult.trim()) {
                silenceTimer = setTimeout(commit, 2500);
            }
        };

        rec.onerror = (ev) => {
            clearTimer();
            if (handled || this._ivAborted) return;
            if (ev.error === "no-speech") {
                handled = true;
                if (retry < 2) setTimeout(() => { if(!this._ivAborted) this._ivListenForAnswer(idx, retry+1); }, 400);
                else this._ivAskField(idx);
            } else if (ev.error === "aborted") {
                // intentional
            } else if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
                this.state.status   = "error";
                this.state.errorMsg = "Microphone permission denied.";
            } else {
                handled = true;
                setTimeout(() => { if(!this._ivAborted) this._ivListenForAnswer(idx, retry+1); }, 600);
            }
        };

        rec.onend = () => { clearTimer(); if (!this._ivAborted && !handled) commit(); };

        rec.onaudiostart = () => { audioStarted = true; };

        const startTimeout = setTimeout(() => {
            if (!audioStarted && !handled && !this._ivAborted) {
                handled = true;
                try { rec.abort(); } catch(_){}
                setTimeout(() => { if(!this._ivAborted) this._ivListenForAnswer(idx, retry+1); }, 500);
            }
        }, 5000);
        rec.onaudiostart = () => { clearTimeout(startTimeout); audioStarted = true; };

        try { rec.start(); } catch(err) {
            clearTimeout(startTimeout);
            handled = true;
            setTimeout(() => { if(!this._ivAborted) this._ivListenForAnswer(idx, retry+1); }, 500);
        }
    }

    async _ivHandleAnswer(idx, field, rawAnswer) {
        if (this._ivAborted) return;
        if (this.recognition) { try { this.recognition.stop(); } catch(_){} this.recognition = null; }

        const lang  = this.state.lang;
        const lower = rawAnswer.toLowerCase();

        if (isControl(lower, lang, "cancel")) { this.abortInterview(); return; }
        if (isControl(lower, lang, "done"))   { await this._ivFinish(); return; }
        if (isControl(lower, lang, "repeat")) { await this._ivAskField(idx); return; }

        const cleaned  = cleanAnswer(field.key, rawAnswer, lang);
        const label    = getLabel(lang, field.key);

        if (cleaned) {
            // For text fields in non-English, translate to English for storage
            // but confirm back to user in their original spoken value
            let storedValue = cleaned;
            if (lang !== "en-IN" && TRANSLATE_KEYS.has(field.key)) {
                storedValue = await translateToEnglish(cleaned, lang);
            }
            const displayVal = field.key === "priority" ? (PRIORITY_LABELS[storedValue] || storedValue) : cleaned; // show original to user
            const newCollected = { ...this.state.ivCollected };
            newCollected[label] = cleaned; // show native script in collected card
            this.state.ivCollected = newCollected;
            const newExtracted = { ...this.state.extracted };
            newExtracted[field.key] = storedValue; // store English
            this.state.extracted = newExtracted;
            this.state.status    = "iv_confirming";
            this.state.ivQuestion = cleaned; // speak back native value to confirm
            await speak(cleaned, lang);
        } else {
            if (field.required) {
                const reqMsg = getQ(lang, "required")(label);
                this.state.status    = "iv_confirming";
                this.state.ivQuestion = reqMsg;
                await speak(reqMsg, lang);
                if (!this._ivAborted) await this._ivAskField(idx);
                return;
            }
            // optional — skip silently
        }

        if (this._ivAborted) return;
        await this._ivAskField(idx + 1);
    }

    async _ivFinish() {
        if (this._ivAborted) return;
        stopSpeaking();
        if (!this.state.extracted.name) {
            this.state.status   = "error";
            this.state.errorMsg = "Lead name is required. Please start again.";
            await speak(getQ(this.state.lang, "required")(getLabel(this.state.lang, "name")), this.state.lang);
            return;
        }
        // Translate all text fields to English before saving to CRM
        if (this.state.lang !== "en-IN") {
            this.state.status = "iv_speaking";
            this.state.ivQuestion = "Translating…";
            this.state.extracted = await translateExtracted(this.state.extracted, this.state.lang);
        }
        await speak(getQ(this.state.lang, "review"), this.state.lang);
        this.state.ivProgress = 100;
        this.state.status     = "preview";
    }

    abortInterview() {
        this._ivAborted = true;
        stopSpeaking();
        if (this.recognition) { try { this.recognition.abort(); } catch(_){} this.recognition = null; }
        this.state.status      = "idle";
        this.state.ivCollected = {};
        this.state.extracted   = {};
    }

    ivSkipField() {
        if (this.recognition) { try { this.recognition.abort(); } catch(_){} this.recognition = null; }
        this._ivHandleAnswer(this.state.ivFieldIdx, INTERVIEW_FIELDS[this.state.ivFieldIdx], "skip");
    }

    onManualKeyDown(e) {
        if (e.key === "Enter") this.ivSubmitManual();
    }

    ivSubmitManual() {
        const answer = (this.state.ivManualInput || "").trim();
        if (!answer) return;
        this.state.ivManualInput = "";
        if (this.recognition) { try { this.recognition.abort(); } catch(_){} this.recognition = null; }
        const idx   = this.state.ivFieldIdx;
        const field = INTERVIEW_FIELDS[idx];
        this._ivHandleAnswer(idx, field, answer);
    }

    // ── Quick Record ──────────────────────────────────────────────────────────

    startQuickRecord() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { this.state.status="error"; this.state.errorMsg="Web Speech API not supported."; return; }
        if (this.recognition) { try { this.recognition.abort(); } catch(_){} }
        this.recognition = new SR();
        this.recognition.continuous     = true;
        this.recognition.interimResults = true;
        this.recognition.lang           = this.state.lang;
        this.recognition.onresult = (event) => {
            let final="",interim="";
            for(let i=event.resultIndex;i<event.results.length;i++){
                const t=event.results[i][0].transcript;
                if(event.results[i].isFinal) final+=t; else interim+=t;
            }
            if(final) this.state.transcript+=final+" ";
            this.state.interim=interim;
        };
        this.recognition.onerror = (ev) => {
            if (ev.error !== "aborted") { this.state.status="error"; this.state.errorMsg="Microphone error: "+ev.error; }
        };
        this.recognition.onend = () => { if(this.state.status==="recording") this._finishRecording(); };
        this.state.status     = "recording";
        this.state.transcript = "";
        this.state.interim    = "";
        this.recognition.start();
    }

    stopRecording() { if (this.recognition) this.recognition.stop(); }

    async _finishRecording() {
        const text = this.state.transcript.trim();
        if (!text) { this.state.status="error"; this.state.errorMsg="No speech detected. Please try again."; return; }

        // For non-English quick record: translate the whole transcript to English first
        let processText = text;
        if (this.state.lang !== "en-IN") {
            this.state.status  = "recording";  // keep spinner visible
            this.state.interim = "Translating…";
            processText = await translateToEnglish(text, this.state.lang);
        }

        const extracted = extractLeadData(processText);
        this.state.extracted = extracted;
        const missing = [];
        if (!extracted.name)  missing.push("lead name");
        if (!extracted.phone) missing.push("phone number");
        if (!extracted.email) missing.push("email address");
        if (missing.length > 0) {
            this.state.status   = "error";
            this.state.errorMsg = "Please say: " + missing.join(", ");
            return;
        }
        this.state.status = "preview";
    }

    // ── Save ──────────────────────────────────────────────────────────────────

    async createLead() {
        this.state.previewError = "";
        const ex = this.state.extracted;
        const missing = [];
        if (!ex.name)  missing.push("Lead name");
        if (!ex.phone) missing.push("Phone");
        if (!ex.email) missing.push("Email");
        if (missing.length) { this.state.previewError = missing.join(", ") + " required."; return; }

        this.state.saving = true;
        try {
            const result = await this.rpc("/voice_crm/create_lead", {
                transcript:   this.state.transcript || "",
                lead_id:      this.leadId || false,
                name:         ex.name,
                contact_name: ex.contact_name,
                phone:        ex.phone,
                mobile:       ex.mobile,
                email:        ex.email,
                email_cc:     ex.email_cc,
                street:       ex.street,
                city:         ex.city,
                state_name:   ex.state_name,
                zip:          ex.zip,
                country_name: ex.country_name,
                website:      ex.website,
                function:     ex.function,
                title:        ex.title,
                priority:     ex.priority,
            });
            if (result.status === "ok") {
                this.state.leadName = result.lead_name;
                this.state.status   = "done";
                this.notification.add(`Lead "${result.lead_name}" created!`, { type: "success" });
            } else {
                this.state.status   = "error";
                this.state.errorMsg = result.message || "Unknown error";
            }
        } catch (e) {
            this.state.status   = "error";
            this.state.errorMsg = e.message || String(e);
        } finally {
            this.state.saving = false;
        }
    }

    retake() {
        this._ivAborted = true;
        stopSpeaking();
        if (this.recognition) { try { this.recognition.abort(); } catch(_){} this.recognition = null; }
        Object.assign(this.state, {
            status:"idle", transcript:"", interim:"", extracted:{},
            errorMsg:"", previewError:"", ivCollected:{}, ivManualInput:"",
        });
        this._ivAborted = false;
    }

    close() {
        this._ivAborted = true;
        stopSpeaking();
        if (this.recognition) { try { this.recognition.abort(); } catch(_){} this.recognition = null; }
        try {
            if (this.state.status === "done") window.location.reload();
            else this.__owl__.app.destroy();
        } catch(_){}
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT 2: Voice Lead Search
// ─────────────────────────────────────────────────────────────────────────────
class VoiceCrmSearchWidget extends Component {
    static template = xml`
<div class="voice-crm-overlay" t-on-click.self="close">
<div class="voice-crm-modal">
<h4>🔍 Voice Lead Search</h4>

<!-- Language bar -->
<t t-if="state.status !== 'results' and state.status !== 'not_found'">
<div class="vc-lang-bar">
    <t t-foreach="langs" t-as="lg" t-key="lg.code">
        <button class="vc-lang-btn"
                t-att-class="state.lang === lg.code ? 'active' : ''"
                t-on-click="() => this.setLang(lg.code)">
            <t t-esc="lg.flag"/> <t t-esc="lg.label"/>
        </button>
    </t>
</div>
</t>

<div t-if="state.status === 'idle'">
    <p style="font-size:.88rem;color:#555;margin-bottom:10px;">
        Say a name, or describe filters: <em>"Ravi city Chennai"</em> · <em>"priority high"</em> · <em>"company Acme"</em>
    </p>
    <div class="input-group mb-3">
        <input class="form-control" placeholder="Or type here and press Search…"
               t-att-value="state.manualQuery"
               t-on-input="(e)=>{state.manualQuery=e.target.value;}"
               t-on-keydown="onKeyDown"/>
        <button class="btn btn-outline-secondary" t-on-click="searchManual" t-att-disabled="!state.manualQuery">Search</button>
    </div>
    <button class="btn btn-primary" t-on-click="startRecording">🎤 Start Recording</button>
    <button class="btn btn-light ms-2" t-on-click="close">Cancel</button>
</div>

<div t-if="state.status === 'recording'">
    <div class="voice-pulse">🎙 Listening…</div>
    <p t-if="state.interim" class="text-muted mt-2" style="font-style:italic"><t t-esc="state.interim"/></p>
    <button class="btn btn-danger mt-3" t-on-click="stopRecording">⏹ Stop</button>
</div>

<div t-if="state.status === 'searching'" class="text-center py-3">
    <div class="spinner-border text-primary" role="status"></div>
    <p class="mt-2">Searching for <strong><t t-esc="state.queryLabel"/></strong>…</p>
</div>

<div t-if="state.status === 'results'">
    <p class="vc-search-count"><t t-esc="state.leads.length"/> result(s) — <t t-esc="state.queryLabel"/></p>
    <div t-foreach="state.leads" t-as="lead" t-key="lead.id" class="vc-lead-card">
        <div class="vc-lead-name"><t t-esc="lead.name"/>
            <span t-if="lead.stage" class="vc-badge"><t t-esc="lead.stage"/></span>
        </div>
        <div t-if="lead.priority_label" class="vc-field">⭐ Priority: <span><t t-esc="lead.priority_label"/></span></div>
        <div t-if="lead.contact_name"   class="vc-field">👤 Contact: <span><t t-esc="lead.contact_name"/></span></div>
        <div t-if="lead.phone"          class="vc-field">📞 Phone: <span><t t-esc="lead.phone"/></span></div>
        <div t-if="lead.mobile"         class="vc-field">📱 Mobile: <span><t t-esc="lead.mobile"/></span></div>
        <div t-if="lead.email"          class="vc-field">✉️ Email: <span><t t-esc="lead.email"/></span></div>
        <div t-if="lead.company"        class="vc-field">🏢 Company: <span><t t-esc="lead.company"/></span></div>
        <div t-if="lead.website"        class="vc-field">🌐 Website: <span><t t-esc="lead.website"/></span></div>
        <div t-if="lead.city or lead.country" class="vc-field">📍 <span>
            <t t-esc="lead.city"/><t t-if="lead.city and lead.country">, </t><t t-esc="lead.country"/>
        </span></div>
        <div t-if="lead.salesperson"    class="vc-field">🙋 <span><t t-esc="lead.salesperson"/>
            <t t-if="lead.sales_team"> / <t t-esc="lead.sales_team"/></t>
        </span></div>
        <div t-if="lead.expected_revenue" class="vc-field">💰 Revenue: <span><t t-esc="lead.expected_revenue"/></span></div>
    </div>
    <div class="mt-3 d-flex gap-2">
        <button class="btn btn-primary" t-on-click="searchAgain">🎤 Search Again</button>
        <button class="btn btn-light ms-auto" t-on-click="close">Close</button>
    </div>
</div>

<div t-if="state.status === 'not_found'">
    <div class="alert alert-warning">🔍 No leads found for <strong><t t-esc="state.queryLabel"/></strong>.</div>
    <button class="btn btn-primary" t-on-click="searchAgain">Try Again</button>
    <button class="btn btn-light ms-2" t-on-click="close">Close</button>
</div>

<div t-if="state.status === 'error'">
    <div class="alert alert-danger">❌ <t t-esc="state.errorMsg"/></div>
    <button class="btn btn-secondary" t-on-click="searchAgain">Try Again</button>
    <button class="btn btn-light ms-2" t-on-click="close">Close</button>
</div>

</div>
</div>
    `;

    setup() {
        this.langs = LANGUAGES;
        this.state = useState({
            lang:        "en-IN",
            status:      "idle",
            queryLabel:  "",
            manualQuery: "",
            interim:     "",
            leads:       [],
            errorMsg:    "",
        });
        this.recognition = null;
        this.rpc         = useService("rpc");
        this.notification= useService("notification");
    }

    setLang(code) { this.state.lang = code; }
    onKeyDown(e)  { if(e.key==="Enter"&&this.state.manualQuery) this.searchManual(); }

    startRecording() {
        const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
        if(!SR){this.state.status="error";this.state.errorMsg="Web Speech API not supported.";return;}
        if(this.recognition){try{this.recognition.abort();}catch(_){}}
        this.recognition=new SR();
        this.recognition.continuous=false;
        this.recognition.interimResults=true;
        this.recognition.lang=this.state.lang;
        this.recognition.onresult=(event)=>{
            let final="",interim="";
            for(let i=event.resultIndex;i<event.results.length;i++){
                const t=event.results[i][0].transcript;
                if(event.results[i].isFinal) final+=t; else interim+=t;
            }
            if(final) this._doSearch(final.trim());
            this.state.interim=interim;
        };
        this.recognition.onerror=(ev)=>{
            if(ev.error!=="aborted"){this.state.status="error";this.state.errorMsg="Microphone error: "+ev.error;}
        };
        this.recognition.onend=()=>{ if(this.state.status==="recording") this.state.status="idle"; };
        this.state.status="recording";
        this.state.interim="";
        this.recognition.start();
    }

    stopRecording(){ if(this.recognition) this.recognition.stop(); this.state.status="idle"; }
    searchManual() { const q=(this.state.manualQuery||"").trim(); if(q) this._doSearch(q); }

    async _doSearch(rawText) {
        if(!rawText){this.state.status="error";this.state.errorMsg="No query detected.";return;}

        this.state.status     = "searching";
        this.state.queryLabel = "Searching…";

        let searchText = rawText;
        let rawNative  = null;  // original native text — sent as extra fallback to backend

        if (this.state.lang !== "en-IN") {
            this.state.queryLabel = "Translating…";
            const translated = await translateToEnglish(rawText, this.state.lang);
            // If translation returned something different, use it as main search
            // but also send the native original as a fallback
            if (translated && translated !== rawText) {
                searchText = translated;
                rawNative  = rawText;   // backend will also search this natively
            }
            // else: translation returned same (single name, unknown word) — search as-is
        }

        const filters = extractSearchFilters(searchText);
        // Always inject the raw native text so backend can do an extra ilike pass
        if (rawNative) filters._native = rawNative;

        const label = filtersToLabel(filters);
        if (Object.keys(filters).filter(k => k !== "_native").length === 0) {
            // Nothing extracted — use raw as a plain name search
            filters.name = searchText || rawText;
        }

        this.state.status     = "searching";
        this.state.queryLabel = label || `"${searchText}"`;
        try {
            const result = await this.rpc("/voice_crm/search_lead", { filters });
            if(result.status==="ok"){this.state.leads=result.leads;this.state.status="results";}
            else if(result.status==="not_found"){this.state.status="not_found";}
            else{this.state.status="error";this.state.errorMsg=result.message||"Unknown error";}
        } catch(e){this.state.status="error";this.state.errorMsg=e.message||String(e);}
    }

    searchAgain(){
        this.state.status="idle";this.state.queryLabel="";
        this.state.manualQuery="";this.state.leads=[];
        this.state.interim="";this.state.errorMsg="";
    }
    close(){ try{this.__owl__.app.destroy();}catch(_){} }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH: inject Search Lead button into CRM list control panel
// ─────────────────────────────────────────────────────────────────────────────
patch(ListController.prototype, {
    setup() {
        super.setup();
        if (this.props.resModel !== "crm.lead") return;
        this._vcActionService = useService("action");
        this._vcObserver = null;
        onMounted(() => {
            this._vcInjectButton();
            this._vcObserver = new MutationObserver(() => {
                if (!document.getElementById("voice-crm-search-btn")) this._vcInjectButton();
            });
            this._vcObserver.observe(document.body, { childList:true, subtree:true });
        });
        onWillUnmount(() => {
            if (this._vcObserver) { this._vcObserver.disconnect(); this._vcObserver = null; }
            const btn = document.getElementById("voice-crm-search-btn");
            if (btn) btn.remove();
        });
    },
    _vcInjectButton() {
        if (this.props.resModel !== "crm.lead") return;
        if (document.getElementById("voice-crm-search-btn")) return;
        const cp = document.querySelector(".o_control_panel_actions") ||
                   document.querySelector(".o_cp_buttons") ||
                   document.querySelector(".o_control_panel .o_cp_top_left");
        if (!cp) return;
        const btn = document.createElement("button");
        btn.id        = "voice-crm-search-btn";
        btn.className = "btn-voice-search ms-2";
        btn.innerHTML = "🔍 Search Lead";
        btn.title     = "Search CRM leads by voice";
        btn.addEventListener("click", () => {
            this._vcActionService.doAction({
                type:"ir.actions.client", tag:"voice_crm_search_action",
                target:"new", name:"Voice Lead Search",
            });
        });
        cp.appendChild(btn);
    },
});

// ─────────────────────────────────────────────────────────────────────────────
registry.category("actions").add("voice_crm_action",        VoiceCrmWidget);
registry.category("actions").add("voice_crm_search_action", VoiceCrmSearchWidget);
