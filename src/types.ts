export type Difficulty = "easy" | "medium" | "hard";

export type Subject = {
  id: string;
  name: string;
  color: string;
  createdAt: string;
};

export type StudyCard = {
  id: string;
  subjectId: string;
  title: string;
  body: string;
  hint?: string;
  source?: string;
  difficulty?: Difficulty;
  createdAt: string;
  updatedAt: string;
};

export type CardProgress = {
  cardId: string;
  seenCount: number;
  knownCount: number;
  lastSeenAt?: string;
};

export type Theme = "dark" | "light";

export type SpeechSettings = {
  autoRead: boolean;
  autoAdvance: boolean;
  voiceURI: string;
  rate: number;
  pitch: number;
};

export type AppData = {
  subjects: Subject[];
  cards: StudyCard[];
  progress: Record<string, CardProgress>;
  theme: Theme;
  speech: SpeechSettings;
};
