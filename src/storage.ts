import type { AppData, CardProgress, Difficulty, SpeechSettings, StudyCard, Subject, Theme } from "./types";

const STORAGE_KEY = "study-doomscroll:data";
const THEME_KEY = "study-doomscroll:theme";

const now = () => new Date().toISOString();

export const createId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const demoSubjects: Subject[] = [
  { id: "subject-advanced-english", name: "Advanced English", color: "#64d2c8", createdAt: now() },
  { id: "subject-maths-standard-2", name: "Maths Standard 2", color: "#ffb86b", createdAt: now() },
  { id: "subject-sor-2", name: "Studies of Religion 2", color: "#a8c7ff", createdAt: now() },
  { id: "subject-physics", name: "Physics", color: "#ff7a90", createdAt: now() },
  { id: "subject-cafs", name: "CAFS", color: "#bda8ff", createdAt: now() },
];

const demoCards: StudyCard[] = [
  {
    id: "card-english-1",
    subjectId: "subject-advanced-english",
    title: "Module B: Textual integrity",
    body: "Textual integrity is how a text remains unified and valuable through its form, ideas, language, and reception across contexts.",
    hint: "Ask: why does this text still matter?",
    source: "HSC English Advanced",
    difficulty: "medium",
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "card-english-2",
    subjectId: "subject-advanced-english",
    title: "Essay evidence flow",
    body: "A strong paragraph usually moves from argument to evidence to technique to effect to module idea. Do not leave quotes floating.",
    hint: "Argument first, quote second.",
    source: "HSC writing",
    difficulty: "easy",
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "card-maths-1",
    subjectId: "subject-maths-standard-2",
    title: "Annuity mindset",
    body: "An annuity is a repeated payment over time. Identify the payment amount, interest rate per period, number of periods, and whether payments are made at the start or end.",
    hint: "Repeated payments, not one lump sum.",
    source: "Financial maths",
    difficulty: "medium",
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "card-maths-2",
    subjectId: "subject-maths-standard-2",
    title: "Normal distribution",
    body: "For z-scores, subtract the mean then divide by the standard deviation. The z-score tells you how many standard deviations a value is from the mean.",
    hint: "z = (x - mean) / standard deviation.",
    source: "Statistical analysis",
    difficulty: "medium",
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "card-sor-1",
    subjectId: "subject-sor-2",
    title: "Living religious tradition",
    body: "A living religious tradition continues through beliefs, sacred texts, ethics, rituals, practices, and the lives of adherents.",
    hint: "Beliefs become lived practice.",
    source: "Religion and belief systems",
    difficulty: "easy",
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "card-sor-2",
    subjectId: "subject-sor-2",
    title: "Significance response",
    body: "When asked significance, explain importance and impact. Link the person, practice, or ethic to adherents and the wider tradition.",
    hint: "Importance plus impact.",
    source: "HSC SOR response verbs",
    difficulty: "medium",
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "card-physics-1",
    subjectId: "subject-physics",
    title: "Newton's second law",
    body: "The net force on an object equals mass times acceleration. If the net force is zero, acceleration is zero even if the object is moving.",
    hint: "Net force causes acceleration.",
    source: "Advanced mechanics",
    difficulty: "easy",
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "card-physics-2",
    subjectId: "subject-physics",
    title: "Motor effect",
    body: "A current-carrying conductor in a magnetic field can experience a force. Direction depends on current direction and magnetic field direction.",
    hint: "Current plus field gives force.",
    source: "Electromagnetism",
    difficulty: "medium",
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "card-cafs-1",
    subjectId: "subject-cafs",
    title: "Wellbeing factors",
    body: "Wellbeing can be physical, social, emotional, economic, cultural, and spiritual. Strong CAFS responses link factors to specific needs.",
    hint: "Name the factor, then explain the effect.",
    source: "Core: Resource management",
    difficulty: "easy",
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "card-cafs-2",
    subjectId: "subject-cafs",
    title: "Groups in context",
    body: "For groups in context, describe characteristics, needs, access to resources, and how community structures support or limit wellbeing.",
    hint: "Characteristics, needs, resources, wellbeing.",
    source: "Groups in context",
    difficulty: "medium",
    createdAt: now(),
    updatedAt: now(),
  },
];

const oldDemoSubjectIds = new Set(["subject-bio", "subject-psych", "subject-history"]);
const hasOnlyOldDemo = (data: Partial<AppData>) =>
  Array.isArray(data.subjects) &&
  data.subjects.length > 0 &&
  data.subjects.every((subject) => oldDemoSubjectIds.has(subject.id));

const defaultSpeech: SpeechSettings = {
  autoRead: false,
  autoAdvance: false,
  voiceURI: "",
  rate: 0.96,
  pitch: 1.04,
};

export const defaultData = (): AppData => ({
  subjects: demoSubjects,
  cards: demoCards,
  progress: {},
  theme: "dark",
  speech: defaultSpeech,
});

const normalizeData = (data: Partial<AppData>): AppData => {
  if (hasOnlyOldDemo(data)) {
    return { ...defaultData(), theme: data.theme === "light" ? "light" : loadTheme() };
  }

  return {
    ...defaultData(),
    ...data,
    subjects: Array.isArray(data.subjects) ? data.subjects : demoSubjects,
    cards: Array.isArray(data.cards) ? data.cards : demoCards,
    progress: data.progress && typeof data.progress === "object" ? data.progress : {},
    theme: data.theme === "light" || data.theme === "dark" ? data.theme : loadTheme(),
    speech: {
      ...defaultSpeech,
      ...(data.speech && typeof data.speech === "object" ? data.speech : {}),
    },
  };
};

export const loadTheme = (): Theme => {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === "light" || stored === "dark" ? stored : "dark";
};

export const loadData = (): AppData => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { ...defaultData(), theme: loadTheme() };
    }
    return normalizeData(JSON.parse(stored));
  } catch {
    return { ...defaultData(), theme: loadTheme() };
  }
};

export const saveData = (data: AppData) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  localStorage.setItem(THEME_KEY, data.theme);
};

export const emptyCard = (subjectId: string): StudyCard => ({
  id: createId("card"),
  subjectId,
  title: "",
  body: "",
  hint: "",
  source: "",
  difficulty: "medium",
  createdAt: now(),
  updatedAt: now(),
});

export const newSubject = (name: string, color: string): Subject => ({
  id: createId("subject"),
  name,
  color,
  createdAt: now(),
});

export const touchCard = (card: StudyCard): StudyCard => ({
  ...card,
  updatedAt: now(),
});

export type BulkCardInput = {
  title: string;
  body: string;
  hint?: string;
  source?: string;
  difficulty?: Difficulty;
};

export const cardsFromBulk = (subjectId: string, cards: BulkCardInput[]): StudyCard[] =>
  cards.map((card) => ({
    id: createId("card"),
    subjectId,
    title: card.title.trim(),
    body: card.body.trim(),
    hint: card.hint?.trim(),
    source: card.source?.trim(),
    difficulty: card.difficulty ?? "medium",
    createdAt: now(),
    updatedAt: now(),
  }));

export const bumpProgress = (
  progress: Record<string, CardProgress>,
  cardId: string,
  known: boolean
) => {
  const existing = progress[cardId] ?? { cardId, seenCount: 0, knownCount: 0 };
  return {
    ...progress,
    [cardId]: {
      cardId,
      seenCount: existing.seenCount + 1,
      knownCount: existing.knownCount + (known ? 1 : 0),
      lastSeenAt: now(),
    },
  };
};
