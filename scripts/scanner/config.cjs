/**
 * Scanner Configuration
 * Central configuration for all scanner modules
 */

const path = require('path');

// ============================================================================
// DOMAIN CONFIGURATION
// ============================================================================

const SUBDOMAINS = [
  "crinacle", "superreview", "hbb", "precog", "timmyv", "aftersound", 
  "paulwasabii", "vortexreviews", "tonedeafmonk", "rg", "nymz", 
  "gadgetrytech", "eliseaudio", "den-fi", "achoreviews", "aden", "adri-n", 
  "animagus", "ankramutt", "arc", "atechreviews", "arn", "audioamigo", 
  "theaudiostore", "awsmdanny", "bakkwatan", "banzai1122", "bassyalexander", 
  "bassaudio", "bedrock", "boizoff", "breampike", "bryaudioreviews", 
  "bukanaudiophile", "csi-zone", "dchpgall", "dhrme", "dl", "doltonius", 
  "ducbloke", "ekaudio", "fahryst", "enemyspider", "eplv", "flare", 
  "foxtoldmeso", "freeryder05", "hadoe", "harpo", "hore", "hu-fi", 
  "ianfann", "ideru", "iemocean", "iemworld", "isaiahse", "jacstone", 
  "jaytiss", "joshtbvo", "kazi", "kr0mka", "lestat", "listener", 
  "loomynarty", "lown-fi", "melatonin", "mmagtech", "musicafe", "obodio", 
  "practiphile", "pw", "ragnarok", "recode", "regancipher", "riz", "smirk", 
  "soundignity", "suporsalad", "tgx78", "therollo9", "scboy", "seanwee", 
  "silicagel", "sl0the", "soundcheck39", "tanchjim", "tedthepraimortis", 
  "treblewellxtended", "vsg", "yanyin", "yoshiultra", "kuulokenurkka", 
  "sai", "earphonesarchive", "auricularesargentina", "cammyfi", "capraaudio",
  "elrics", "filk", "unheardlab",
  // Special virtual domains
  "crinacle5128", "listener5128", "crinacleHP", "earphonesarchiveHP"
];

const OVERRIDES = {
  "crinacle": "https://graph.hangout.audio/iem/711/data/phone_book.json",
  "crinacle5128": "https://graph.hangout.audio/iem/5128/data/phone_book.json",
  "crinacleHP": "https://graph.hangout.audio/headphones/data/phone_book.json",
  "superreview": "https://squig.link/data/phone_book.json",
  "den-fi": "https://ish.squig.link/data/phone_book.json",
  "paulwasabii": "https://pw.squig.link/data/phone_book.json",
  "listener5128": "https://listener.squig.link/5128/data/phone_book.json",
  "earphonesarchiveHP": "https://earphonesarchive.squig.link/headphones/data/phone_book.json"
};

const HIGH_QUALITY_DOMAINS = ["crinacle", "earphonesarchive", "earphonesarchiveHP", "sai", "crinacle5128"];

// Display domain overrides for sourceDomain in results
// Domains not listed here default to "${subdomain}.squig.link"
const DISPLAY_DOMAINS = {
  "crinacle": "graph.hangout.audio",
  "crinacle5128": "graph.hangout.audio",
  "crinacleHP": "graph.hangout.audio"
};

// Domains that require encrypted fetch via d-c.php proxy on graph.hangout.audio
// Maps domain name -> { toolPath, numSamples } for constructing file paths
const ENCRYPTED_DOMAINS = {
  "crinacle":     { toolPath: "iem/711/",     numSamples: 1 },
  "crinacle5128": { toolPath: "iem/5128/",    numSamples: 1 },
  "crinacleHP":   { toolPath: "headphones/",  numSamples: 3 }
};

const RIG_5128_DOMAINS = [
  "earphonesarchive", 
  "earphonesarchiveHP",
  "crinacle5128",
  "listener5128",
  "den-fi"
];

// Domains that use KB006x pinnae for IEM measurements
// (KB6 support removed per user request, but keeping variable stub if needed later)
const RIG_KB6_DOMAINS = [];

// ============================================================================
// CLASSIFICATION CONFIGURATION
// ============================================================================

const STRICTLY_IE_BRANDS = [
  "KZ", "TRN", "LETSHUOER", "7HZ", "THIEAUDIO", "KIWI EARS", "TANGZU", "TANCHJIM", 
  "SIMGOT", "QOA", "KINERA", "NICEHCK", "TRIPOWIN", "DUNU", "SOFTEARS", "EMPIRE EARS", 
  "CAMPFIRE AUDIO", "VISION EARS", "UNIQUE MELODY", "ETYMOTIC", "DIREM", "SONICAST", 
  "UCOTECH", "NOSTALGIA AUDIO", "TONEMAY", "CUSTOM ART", "RHA", "AFO", "FEAULLE",
  "64 AUDIO", "AFUL", "ZIIGAAT", "JUZEAR", "HIDIZS", "SALNOTES", "IKKO", "MOONDROP CHU", 
  "MOONDROP ARIA", "WHIZZER", "FENGRU", "FAAEAL", "VENTURE ELECTRONICS", "VE MONK", 
  "YINMAN", "BGVP", "MOONDROP QUARKS", "MOONDROP SPACESHIP", "MOONDROP KATO", "MOONDROP LAN",
  "RE-2", "NA3", "A8", "D-FI",
  "TIN", "CTM", "FEARLESS", "AUDIOSENSE", "NUARL", "QCY", "KLIPSCH"
];

const OE_MODEL_REGISTRY = [
  "MOONDROP VENUS", "MOONDROP COSMO", "MOONDROP PARA", "MOONDROP VOID", "MOONDROP JOKER", "GREAT GATSBY",
  "HD600", "HD650", "HD800", "HD6XX", "HD560", "HD580", "HD660", "HD490", "SENNHEISER HE1", "HD25", "HD280", "HD300", "MOMENTUM",
  "FOCAL UTOPIA", "FOCAL CLEAR", "FOCAL STELLIA", "FOCAL ELEX", "FOCAL RADIANCE", "FOCAL BATHYS", "FOCAL HADENYS", "FOCAL AZURYS", "FOCAL LISTEN", "FOCAL ELEGIA", "FOCAL CELESTEE",
  "MDR-7506", "MDR-V6", "MDR-CD900ST", "MDR-Z1R", "MDR-Z7", "MDR-MV1", "MDR-1A", "WH-1000", "WH-CH",
  "SUNDARA", "ANANDA", "SUSVARA", "ARYA", "HE1000", "HE400", "EDITION XS", "DEVA", "SHANGRI-LA", "AUDIVINA", "HE-R9", "HE-R10",
  "LCD-2", "LCD-3", "LCD-4", "LCD-X", "LCD-XC", "LCD-5", "LCD-MX4", "LCD-GX", "MAXWELL", "MOBIUS", "PENROSE", "MM-500", "MM-100",
  "KSC75", "PORTA PRO", "KPH30I", "KPH40", "UR20", "UR40",
  "FT3", "FT5", "FT1", "JT1",
  "K701", "K702", "K612", "K240", "K141", "K550", "K812", "K712", "K371", "K361",
  "ATH-M50", "ATH-M40", "ATH-M30", "ATH-M20", "ATH-AD", "ATH-A", "ATH-R70X", "ATH-AW", "ATH-WP",
  "FINAL D8000", "FINAL SONOROUS", "FINAL UX3000", "PANDORA",
  "DT770", "DT880", "DT990", "DT1990", "DT1770", "DT700", "DT900", "AMIRON", "CUSTOM ONE", "T1", "T5"
];

const STRICTLY_IE_DOMAINS = [
  "dchpgall", "hbb", "precog", "timmyv", "aftersound", "paulwasabii", "tonedeafmonk", 
  "vortexreviews", "nymz", "rg", "tonedeafmonk", "eliseaudio", "achoreviews",
  "animagus", "ankramutt", "atechreviews", "awsmdanny", "bakkwatan", "banzai1122",
  "bassyalexander", "breampike", "bryaudioreviews", "bukanaudiophile", "csi-zone",
  "ekaudio", "enemyspider", "eplv", "foxtoldmeso", "freeryder05", "hu-fi", "ianfann",
  "ideru", "iemocean", "iemworld", "isaiahse", "jacstone", "jaytiss", "joshtbvo",
  "kazi", "lestat", "loomynarty", "lown-fi", "melatonin", "mmagtech", "musicafe",
  "obodio", "practiphile", "recode", "riz", "smirk", "soundignity", "suporsalad",
  "tgx78", "therollo9", "scboy", "seanwee", "silicagel", "sl0the", "soundcheck39",
  "tanchjim", "tedthepraimortis", "treblewellxtended", "yanyin", "yoshiultra",
  "crinacle", "crinacle5128"
];

const IE_FORCE_KEYWORDS = [
  "IEM", "IN-EAR", "MONITOR", "EARPHONE", "EARBUD", "BUDS", "PODS", "TWS", "WIRELESS IEM", 
  "WF-", "IE 200", "IE 300", "IE 600", "IE 900", "CX ", "MX ", "ISINE", "LCD-I", "EUCLID", "SPHEAR", "LYRIC"
];

const TWS_KEYWORDS = ["Earbud", "TWS", "Wireless", "Buds", "Pods", "True Wireless", "AirPods"];

// ============================================================================
// TIMING CONFIGURATION
// ============================================================================

const PHONE_BOOK_TIMEOUT = 30000;
const MEASUREMENT_TIMEOUT = 5000;
const CONCURRENT_DOMAINS = 30;
const CONCURRENT_MEASUREMENTS = 50;
const RETRY_ATTEMPTS = 2;
const RETRY_DELAY = 1000;

// ============================================================================
// PATH CONFIGURATION
// ============================================================================

const ROOT_DIR = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT_DIR, 'public', 'data');
const CACHE_DIR = path.join(ROOT_DIR, 'public', 'cache');
const MEASUREMENTS_DIR = path.join(CACHE_DIR, 'measurements');
const TARGETS_DIR = path.join(ROOT_DIR, 'public', 'targets');
const COMPENSATION_DIR = path.join(ROOT_DIR, 'compensation');

// New cache files
const CACHE_INDEX_PATH = path.join(CACHE_DIR, 'index.json');
const DOMAINS_HASH_PATH = path.join(CACHE_DIR, 'domains.json');
const CHECKPOINT_PATH = path.join(CACHE_DIR, 'checkpoint.json');

// Output files
const RESULTS_IEM_PATH = path.join(DATA_DIR, 'results.json');
const RESULTS_IEM_5128_PATH = path.join(DATA_DIR, 'results_iem_5128.json');
const RESULTS_HP_KB5_PATH = path.join(DATA_DIR, 'results_hp_kb5.json');
const RESULTS_HP_5128_PATH = path.join(DATA_DIR, 'results_hp_5128.json');
const CURVES_PATH = path.join(DATA_DIR, 'curves.msgpack');
const CURVES_JSON_PATH = path.join(DATA_DIR, 'curves.json'); // Keep for migration

module.exports = {
  // Domains
  SUBDOMAINS,
  OVERRIDES,
  HIGH_QUALITY_DOMAINS,
  DISPLAY_DOMAINS,
  ENCRYPTED_DOMAINS,
  RIG_5128_DOMAINS,
  
  // Classification
  STRICTLY_IE_BRANDS,
  OE_MODEL_REGISTRY,
  STRICTLY_IE_DOMAINS,
  IE_FORCE_KEYWORDS,
  TWS_KEYWORDS,
  
  // Timing
  PHONE_BOOK_TIMEOUT,
  MEASUREMENT_TIMEOUT,
  CONCURRENT_DOMAINS,
  CONCURRENT_MEASUREMENTS,
  RETRY_ATTEMPTS,
  RETRY_DELAY,
  
  // Paths
  ROOT_DIR,
  DATA_DIR,
  CACHE_DIR,
  MEASUREMENTS_DIR,
  TARGETS_DIR,
  COMPENSATION_DIR,
  CACHE_INDEX_PATH,
  DOMAINS_HASH_PATH,
  CHECKPOINT_PATH,
  RESULTS_IEM_PATH,
  RESULTS_IEM_5128_PATH,
  RESULTS_HP_KB5_PATH,
  RESULTS_HP_5128_PATH,
  CURVES_PATH,
  CURVES_JSON_PATH
};
