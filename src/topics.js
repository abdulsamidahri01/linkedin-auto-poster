// src/topics.js
// V6 Day-aware topic selector
// Maps each day of the week to its pillar, emotional tone, and curated topic pool.
// Chooses a topic that has not been used recently (last 30 days).

'use strict';

const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, '..', 'data', 'topic-history.json');

const WEEKLY_PILLARS = {
  0: { // Sunday
    pillar: 'REFLECTIVE / PHILOSOPHICAL SCIENCE',
    goal: 'Deepen emotional attachment and intellectual identity',
    tone: 'calm, thoughtful, introspective, emotionally quiet',
    topics: [
      'The philosophy of uncertainty in medicine',
      'What biology teaches us about humility',
      'Science as a living, imperfect process',
      'The ethics of predicting disease before symptoms appear',
      'Why microbiology makes you a better systems thinker',
      'The line between curiosity and obsession in science',
      'What the smallest organisms reveal about the largest systems',
      'Biology and the question of what we cannot know',
      'The strange comfort of scientific uncertainty',
      'When scientific conviction becomes scientific blindness',
    ],
  },
  1: { // Monday
    pillar: 'AI + MICROBIOLOGY',
    goal: 'Build futuristic authority',
    tone: 'visionary, predictive, intellectually sharp',
    topics: [
      'What happens when AI identifies a resistance pattern before the clinician does',
      'Machine learning is now reading biofilms better than microscopes',
      'AI diagnostics will not replace microbiologists - it will expose the ones who stopped thinking',
      'The gap between what sequencing detects and what hospitals act on',
      'Predictive resistance modeling is here. Procurement systems are not',
      'How AI is quietly rewriting the rulebook on culture-based diagnostics',
      'The lab of 2030 will not look like the lab of today',
      'Why the best diagnostic AI tools are failing in the worst hospitals',
      'Smart microbiology is not a technology problem. It is a trust problem',
      'When the algorithm is more current than the antibiogram',
    ],
  },
  2: { // Tuesday
    pillar: 'CLINICAL BLIND SPOTS',
    goal: 'Drive engagement and debate',
    tone: 'tense, uncomfortable, strategically critical',
    topics: [
      'Hospitals are still making empirical treatment decisions from 2019 data',
      'The diagnostic delay nobody tracks because nobody benefits from tracking it',
      'Reimbursement codes that make accurate diagnosis financially irrational',
      'Surveillance lag: why our outbreak maps are always behind the outbreak',
      'What clinicians do not know about the labs they depend on',
      'The workflow that turns a 2-hour result into a 14-hour decision',
      'When infection control policy is written by administrators, not microbiologists',
      'The antibiotic stewardship committee that never meets the lab',
      'Why the fastest diagnostic in the ward still loses to a slow approval chain',
      'What happens to patient outcomes when the microbiology department is understaffed',
    ],
  },
  3: { // Wednesday
    pillar: 'MICROBIAL INTELLIGENCE',
    goal: 'Create fascination and memorability',
    tone: 'curious, reflective, philosophical',
    topics: [
      'Quorum sensing: bacteria deciding together what no individual can decide alone',
      'Biofilm as architecture - not contamination, but civilisation',
      'What microbial cooperation reveals about the limits of competitive thinking',
      'Bacteria have been solving antibiotic problems for 3 billion years',
      'The chemical language of microbes and what we are only beginning to translate',
      'How a biofilm protects itself the way a city protects its infrastructure',
      'Microbial adaptation as the most ruthless form of institutional memory',
      'The patience of pathogens vs. the impatience of healthcare systems',
      'What horizontal gene transfer teaches us about knowledge networks',
      'When the smallest life form outmanoeuvres the largest pharmaceutical company',
    ],
  },
  4: { // Thursday
    pillar: 'ACADEMIC / RESEARCH REALITY',
    goal: 'Humanize the account',
    tone: 'honest, grounded, reflective, emotionally believable',
    topics: [
      'The experiment that failed for six months and what it actually taught me',
      'Publication pressure and the quiet erosion of scientific honesty',
      'What a PhD teaches you that has nothing to do with your thesis',
      'The lab reality nobody puts in the methods section',
      'Burnout in research is a systemic failure, not a personal one',
      'The gap between what the paper claims and what the lab experienced',
      'Why I almost left research - and what made me stay',
      'Scientific uncertainty as a daily professional experience, not a philosophical abstraction',
      'The social dynamics of a research lab that no one publishes about',
      'What happens to your confidence when three consecutive experiments fail',
    ],
  },
  5: { // Friday
    pillar: 'FUTURE HEALTHCARE SYSTEMS',
    goal: 'Establish systems-thinking authority',
    tone: 'strategic, visionary, predictive',
    topics: [
      'The hospital of 2035 will diagnose before the patient feels sick',
      'Decentralized diagnostics and why central labs are not ready for what comes next',
      'Wastewater sequencing as the early warning system no government has fully funded',
      'The infrastructure gap between AI-ready data and AI-ready institutions',
      'Personalized antimicrobial therapy is not a future idea - it is a present failure to scale',
      'What point-of-care diagnostics will do to the referral system',
      'The coming collision between AI diagnostic speed and human clinical culture',
      'Why the future of infectious disease control is environmental, not clinical',
      'The economic model of healthcare is incompatible with predictive medicine',
      'When the healthcare system finally catches up to the science, who decides who benefits first',
    ],
  },
  6: { // Saturday
    pillar: 'PUBLIC HEALTH + AMR',
    goal: 'Build urgency and societal relevance',
    tone: 'serious, globally aware, strategically urgent',
    topics: [
      'AMR is not a future crisis. It is a present administrative failure',
      'The resistance genes spreading through wastewater that no one is monitoring in real time',
      'Why outbreak prediction models are more accurate than outbreak responses',
      'The global antibiotic pipeline and why it keeps producing the wrong molecules',
      'What low-income healthcare systems know about AMR that high-income systems ignore',
      'When surveillance data exists but policy does not follow',
      'The agricultural-clinical resistance pipeline nobody wants to regulate',
      'How resistance travels across borders faster than the alerts that should precede it',
      'The countries winning on AMR and the structural decisions that explain why',
      'Infection spread in 2026 is a logistics problem dressed as a biology problem',
    ],
  },
};

const HASHTAGS = {
  'AI + MICROBIOLOGY': ['#AIMicrobiology', '#DiagnosticAI', '#SmartLab', '#ClinicalMicrobiology', '#HealthTech', '#PredictiveMedicine', '#MedicalAI'],
  'CLINICAL BLIND SPOTS': ['#ClinicalMicrobiology', '#InfectionControl', '#DiagnosticDelay', '#AntibioticStewardship', '#HealthcareReality', '#PatientSafety'],
  'MICROBIAL INTELLIGENCE': ['#Microbiology', '#QuorumSensing', '#Biofilm', '#MicrobialEcology', '#MicrobialIntelligence', '#InfectiousDisease'],
  'ACADEMIC / RESEARCH REALITY': ['#AcademicLife', '#PhDLife', '#ResearchReality', '#ClinicalMicrobiology', '#ScienceHumanism', '#LabLife'],
  'FUTURE HEALTHCARE SYSTEMS': ['#FutureHealthcare', '#DigitalHealth', '#PredictiveMedicine', '#HealthcareInnovation', '#DecentralizedDiagnostics', '#HealthTech'],
  'PUBLIC HEALTH + AMR': ['#AMR', '#AntimicrobialResistance', '#PublicHealth', '#OneHealth', '#GlobalHealth', '#InfectionPrevention'],
  'REFLECTIVE / PHILOSOPHICAL SCIENCE': ['#PhilosophyOfScience', '#Microbiology', '#ScienceThinking', '#IntellectualHonesty', '#ScientificCuriosity'],
};

function loadHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch { return []; }
}

function saveHistory(history) {
  const dir = path.dirname(HISTORY_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(-60), null, 2));
}

function getRecentTopics(history, days = 30) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Set(history.filter(h => new Date(h.date).getTime() > cutoff).map(h => h.topic));
}

function selectTopic(dayOverride = null) {
  const day = dayOverride !== null ? dayOverride : new Date().getDay();
  const pillarData = WEEKLY_PILLARS[day];
  const history = loadHistory();
  const recentTopics = getRecentTopics(history);
  const fresh = pillarData.topics.filter(t => !recentTopics.has(t));
  const pool = fresh.length > 0 ? fresh : pillarData.topics;
  const topic = pool[Math.floor(Math.random() * pool.length)];
  return { topic, pillar: pillarData.pillar, goal: pillarData.goal, tone: pillarData.tone, hashtags: HASHTAGS[pillarData.pillar] || [], day };
}

function recordTopicUsed(topic) {
  const history = loadHistory();
  history.push({ topic, date: new Date().toISOString() });
  saveHistory(history);
}

module.exports = { selectTopic, recordTopicUsed, WEEKLY_PILLARS };
