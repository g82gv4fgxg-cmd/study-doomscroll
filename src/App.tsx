import {
  BookOpen,
  Check,
  ChevronDown,
  Clipboard,
  Edit3,
  Eye,
  EyeOff,
  FilePlus2,
  Filter,
  Library,
  Moon,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Shuffle,
  Sparkles,
  Square,
  Sun,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  bumpProgress,
  cardsFromBulk,
  defaultData,
  emptyCard,
  loadData,
  saveData,
  touchCard,
} from "./storage";
import type { AppData, Difficulty, SpeechSettings, StudyCard, Subject, Theme } from "./types";

type View = "feed" | "library" | "settings";
type CardDraft = StudyCard;
type SubjectDraft = Pick<Subject, "id" | "name" | "color">;

const difficultyLabels: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

const colors = ["#64d2c8", "#ffb86b", "#a8c7ff", "#ff7a90", "#bda8ff", "#9de27e"];

type BulkCard = {
  title: string;
  body: string;
  hint?: string;
  source?: string;
  difficulty?: Difficulty;
};

const bulkPrompt = (subjectName: string) => `You are helping me create HSC study cards for my Study Scroll app.

Return ONLY valid JSON. Do not include markdown, code fences, comments, or extra text.

Format it exactly like this:
{
  "cards": [
    {
      "title": "Short card title",
      "body": "One clear HSC-friendly explanation. Keep it short enough to fit on a phone screen.",
      "hint": "Optional memory cue or exam tip",
      "source": "Optional syllabus/module/topic name",
      "difficulty": "easy"
    }
  ]
}

Rules:
- Use Australian spelling.
- Make each card useful for quick revision, not a full essay.
- The only allowed difficulty values are "easy", "medium", or "hard".
- Use plain text only.
- Keep body text under about 45 words where possible.
- Create cards for this subject: ${subjectName}.

Now create the cards from these notes / requirements:
`;

const cleanJsonPaste = (input: string) =>
  input
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

const parseBulkCards = (input: string): BulkCard[] => {
  const parsed = JSON.parse(cleanJsonPaste(input));
  const rawCards = Array.isArray(parsed) ? parsed : parsed.cards;
  if (!Array.isArray(rawCards)) {
    throw new Error("Paste JSON with a cards array.");
  }

  return rawCards.map((card, index) => {
    if (!card || typeof card.title !== "string" || typeof card.body !== "string") {
      throw new Error(`Card ${index + 1} needs a title and body.`);
    }
    const difficulty = ["easy", "medium", "hard"].includes(card.difficulty)
      ? (card.difficulty as Difficulty)
      : "medium";

    return {
      title: card.title,
      body: card.body,
      hint: typeof card.hint === "string" ? card.hint : "",
      source: typeof card.source === "string" ? card.source : "",
      difficulty,
    };
  });
};

const shuffleCards = (cards: StudyCard[]) =>
  [...cards]
    .map((card) => ({ card, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ card }) => card);

const getSubject = (subjects: Subject[], subjectId: string) =>
  subjects.find((subject) => subject.id === subjectId);

const RANDOM_VOICE = "__random__";
const preferredVoiceNames = [
  "samantha",
  "karen",
  "daniel",
  "moira",
  "tessa",
  "fiona",
  "victoria",
  "alex",
  "google uk english female",
  "google uk english male",
  "google us english",
  "microsoft aria",
  "microsoft jenny",
  "microsoft guy",
  "microsoft natasha",
  "microsoft william",
];
const blockedVoiceNames = ["bad news"];

const clearEnglishVoices = (voices: SpeechSynthesisVoice[]) => {
  const englishVoices = voices.filter((voice) => {
    const name = voice.name.toLowerCase();
    return (
      voice.lang.toLowerCase().startsWith("en") &&
      !blockedVoiceNames.some((blockedName) => name.includes(blockedName))
    );
  });
  const preferred = englishVoices.filter((voice) => {
    const name = voice.name.toLowerCase();
    return preferredVoiceNames.some((preferredName) => name.includes(preferredName));
  });
  const fallback = englishVoices.filter((voice) => voice.default || voice.localService).slice(0, 4);
  const unique = [...preferred, ...fallback].filter(
    (voice, index, list) => list.findIndex((item) => item.voiceURI === voice.voiceURI) === index
  );
  return unique.slice(0, 7);
};

function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [view, setView] = useState<View>("feed");
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [feedCards, setFeedCards] = useState<StudyCard[]>([]);
  const [revealedHints, setRevealedHints] = useState<Record<string, boolean>>({});
  const [cardDraft, setCardDraft] = useState<CardDraft | null>(null);
  const [subjectDraft, setSubjectDraft] = useState<SubjectDraft | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    document.documentElement.dataset.theme = data.theme;
    saveData(data);
  }, [data]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;

    const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  const filteredCards = useMemo(() => {
    if (selectedSubjectIds.length === 0) return data.cards;
    return data.cards.filter((card) => selectedSubjectIds.includes(card.subjectId));
  }, [data.cards, selectedSubjectIds]);

  useEffect(() => {
    setFeedCards((current) => {
      const ids = new Set(filteredCards.map((card) => card.id));
      const kept = current.filter((card) => ids.has(card.id));
      const missing = filteredCards.filter((card) => !kept.some((item) => item.id === card.id));
      return [...kept, ...shuffleCards(missing)];
    });
  }, [filteredCards]);

  const searchedCards = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data.cards;
    return data.cards.filter((card) => {
      const subject = getSubject(data.subjects, card.subjectId)?.name ?? "";
      return [card.title, card.body, card.hint, card.source, subject]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [data.cards, data.subjects, search]);

  const toggleSubjectFilter = (subjectId: string) => {
    setSelectedSubjectIds((ids) =>
      ids.includes(subjectId) ? ids.filter((id) => id !== subjectId) : [...ids, subjectId]
    );
  };

  const addCard = (subjectId = data.subjects[0]?.id) => {
    if (!subjectId) return;
    setCardDraft(emptyCard(subjectId));
  };

  const saveCard = (event: FormEvent) => {
    event.preventDefault();
    if (!cardDraft || !cardDraft.title.trim() || !cardDraft.body.trim()) return;
    setData((current) => {
      const exists = current.cards.some((card) => card.id === cardDraft.id);
      const cleaned = touchCard({
        ...cardDraft,
        title: cardDraft.title.trim(),
        body: cardDraft.body.trim(),
        hint: cardDraft.hint?.trim(),
        source: cardDraft.source?.trim(),
      });
      return {
        ...current,
        cards: exists
          ? current.cards.map((card) => (card.id === cleaned.id ? cleaned : card))
          : [cleaned, ...current.cards],
      };
    });
    setCardDraft(null);
  };

  const deleteCard = (cardId: string) => {
    setData((current) => {
      const nextProgress = { ...current.progress };
      delete nextProgress[cardId];
      return {
        ...current,
        cards: current.cards.filter((card) => card.id !== cardId),
        progress: nextProgress,
      };
    });
  };

  const saveSubject = (event: FormEvent) => {
    event.preventDefault();
    if (!subjectDraft?.name.trim()) return;
    setData((current) => {
      const exists = current.subjects.some((subject) => subject.id === subjectDraft.id);
      const subject = {
        id: subjectDraft.id,
        name: subjectDraft.name.trim(),
        color: subjectDraft.color,
        createdAt:
          current.subjects.find((item) => item.id === subjectDraft.id)?.createdAt ??
          new Date().toISOString(),
      };
      return {
        ...current,
        subjects: exists
          ? current.subjects.map((item) => (item.id === subject.id ? subject : item))
          : [...current.subjects, subject],
      };
    });
    setSubjectDraft(null);
  };

  const importBulkCards = (subjectId: string, cards: BulkCard[]) => {
    const nextCards = cardsFromBulk(subjectId, cards);
    setData((current) => ({
      ...current,
      cards: [...nextCards, ...current.cards],
    }));
    setBulkOpen(false);
    setView("library");
  };

  const deleteSubject = (subjectId: string) => {
    if (data.subjects.length <= 1) return;
    setData((current) => {
      const removedCards = new Set(
        current.cards.filter((card) => card.subjectId === subjectId).map((card) => card.id)
      );
      const nextProgress = { ...current.progress };
      removedCards.forEach((cardId) => delete nextProgress[cardId]);
      return {
        ...current,
        subjects: current.subjects.filter((subject) => subject.id !== subjectId),
        cards: current.cards.filter((card) => card.subjectId !== subjectId),
        progress: nextProgress,
      };
    });
    setSelectedSubjectIds((ids) => ids.filter((id) => id !== subjectId));
  };

  const markCard = (cardId: string, known: boolean) => {
    setData((current) => ({
      ...current,
      progress: bumpProgress(current.progress, cardId, known),
    }));
  };

  const setTheme = (theme: Theme) => {
    setData((current) => ({ ...current, theme }));
  };

  const setSpeech = (speech: SpeechSettings) => {
    setData((current) => ({ ...current, speech }));
  };

  const resetDemo = () => {
    setData({ ...defaultData(), theme: data.theme });
    setSelectedSubjectIds([]);
    setFeedCards([]);
    setRevealedHints({});
  };

  return (
    <main className="app-shell">
      <header className="top-bar">
        <button className="brand" onClick={() => setView("feed")} type="button">
          <span className="brand-mark">
            <Sparkles size={18} />
          </span>
          <span>
            <strong>HSC Study Scroll</strong>
            <small>{data.cards.length} HSC cards</small>
          </span>
        </button>
        <nav className="nav-pills" aria-label="Primary">
          <button className={view === "feed" ? "active" : ""} onClick={() => setView("feed")}>
            <BookOpen size={18} />
          </button>
          <button className={view === "library" ? "active" : ""} onClick={() => setView("library")}>
            <Library size={18} />
          </button>
          <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}>
            <Settings size={18} />
          </button>
        </nav>
      </header>

      {view === "feed" && (
        <FeedView
          cards={feedCards}
          subjects={data.subjects}
          progress={data.progress}
          selectedSubjectIds={selectedSubjectIds}
          revealedHints={revealedHints}
          onToggleSubject={toggleSubjectFilter}
          onClearSubjects={() => setSelectedSubjectIds([])}
          onShuffle={() => setFeedCards(shuffleCards(filteredCards))}
          onReveal={(cardId) =>
            setRevealedHints((current) => ({ ...current, [cardId]: !current[cardId] }))
          }
          onMark={markCard}
          onEdit={setCardDraft}
          onAdd={() => addCard(selectedSubjectIds[0] ?? data.subjects[0]?.id)}
          speech={data.speech}
          voices={voices}
          onSpeech={setSpeech}
        />
      )}

      {view === "library" && (
        <LibraryView
          cards={searchedCards}
          subjects={data.subjects}
          search={search}
          onSearch={setSearch}
          onAddCard={addCard}
          onEditCard={setCardDraft}
          onDeleteCard={deleteCard}
          onAddSubject={() =>
            setSubjectDraft({ id: `subject-${Date.now().toString(36)}`, name: "", color: colors[0] })
          }
          onBulkImport={() => setBulkOpen(true)}
          onEditSubject={(subject) => setSubjectDraft(subject)}
          onDeleteSubject={deleteSubject}
        />
      )}

      {view === "settings" && (
        <SettingsView
          data={data}
          onTheme={setTheme}
          onReset={resetDemo}
          onAddCard={() => addCard(data.subjects[0]?.id)}
          onBulkImport={() => setBulkOpen(true)}
          speech={data.speech}
          voices={voices}
          onSpeech={setSpeech}
        />
      )}

      {cardDraft && (
        <CardEditor
          draft={cardDraft}
          subjects={data.subjects}
          onChange={setCardDraft}
          onClose={() => setCardDraft(null)}
          onSave={saveCard}
        />
      )}

      {subjectDraft && (
        <SubjectEditor
          draft={subjectDraft}
          onChange={setSubjectDraft}
          onClose={() => setSubjectDraft(null)}
          onSave={saveSubject}
        />
      )}

      {bulkOpen && (
        <BulkImportModal
          subjects={data.subjects}
          onClose={() => setBulkOpen(false)}
          onImport={importBulkCards}
        />
      )}
    </main>
  );
}

type FeedViewProps = {
  cards: StudyCard[];
  subjects: Subject[];
  progress: AppData["progress"];
  selectedSubjectIds: string[];
  revealedHints: Record<string, boolean>;
  onToggleSubject: (subjectId: string) => void;
  onClearSubjects: () => void;
  onShuffle: () => void;
  onReveal: (cardId: string) => void;
  onMark: (cardId: string, known: boolean) => void;
  onEdit: (card: StudyCard) => void;
  onAdd: () => void;
  speech: SpeechSettings;
  voices: SpeechSynthesisVoice[];
  onSpeech: (speech: SpeechSettings) => void;
};

function FeedView(props: FeedViewProps) {
  const {
    cards,
    subjects,
    progress,
    selectedSubjectIds,
    revealedHints,
    onToggleSubject,
    onClearSubjects,
    onShuffle,
    onReveal,
    onMark,
    onEdit,
    onAdd,
    speech,
    voices,
    onSpeech,
  } = props;
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const scrollFrame = useRef<number | null>(null);
  const lastRandomVoiceURI = useRef("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [speakingCardId, setSpeakingCardId] = useState<string | null>(null);
  const readableVoices = useMemo(() => clearEnglishVoices(voices), [voices]);

  useEffect(() => {
    setCurrentIndex((index) => Math.min(index, Math.max(cards.length - 1, 0)));
  }, [cards.length]);

  useEffect(
    () => () => {
      if (scrollFrame.current) {
        window.cancelAnimationFrame(scrollFrame.current);
      }
      window.speechSynthesis?.cancel();
    },
    []
  );

  useEffect(() => {
    const currentCardId = cards[currentIndex]?.id;
    if (speakingCardId && speakingCardId !== currentCardId) {
      window.speechSynthesis?.cancel();
      setSpeakingCardId(null);
    }
  }, [cards, currentIndex, speakingCardId]);

  const speakCard = (card: StudyCard, subjectName: string) => {
    if (!("speechSynthesis" in window)) return;

    if (speakingCardId === card.id) {
      window.speechSynthesis.cancel();
      setSpeakingCardId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const parts = [subjectName, card.title, card.body, card.hint ? `Hint: ${card.hint}` : ""].filter(Boolean);
    const utterance = new SpeechSynthesisUtterance(parts.join(". "));
    const randomPool =
      readableVoices.length > 1
        ? readableVoices.filter((voice) => voice.voiceURI !== lastRandomVoiceURI.current)
        : readableVoices;
    const selectedVoice =
      speech.voiceURI === RANDOM_VOICE
        ? randomPool[Math.floor(Math.random() * Math.max(randomPool.length, 1))]
        : voices.find((voice) => voice.voiceURI === speech.voiceURI);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
      if (speech.voiceURI === RANDOM_VOICE) {
        lastRandomVoiceURI.current = selectedVoice.voiceURI;
      }
    }
    utterance.rate = speech.rate;
    utterance.pitch = speech.pitch;
    utterance.onend = () => {
      setSpeakingCardId(null);
      if (speech.autoAdvance && cards[currentIndex]?.id === card.id && currentIndex < cards.length - 1) {
        scrollerRef.current?.scrollTo({
          top: (currentIndex + 1) * (scrollerRef.current?.clientHeight ?? 0),
          behavior: "smooth",
        });
      }
    };
    utterance.onerror = () => setSpeakingCardId(null);
    setSpeakingCardId(card.id);
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (!speech.autoRead || !cards[currentIndex]) return;
    const card = cards[currentIndex];
    const subject = getSubject(subjects, card.subjectId);
    const timer = window.setTimeout(() => speakCard(card, subject?.name ?? "HSC study card"), 260);
    return () => window.clearTimeout(timer);
  }, [currentIndex, speech.autoRead, speech.autoAdvance, speech.pitch, speech.rate, speech.voiceURI, cards, subjects]);

  const updateCurrentIndex = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    if (scrollFrame.current) {
      window.cancelAnimationFrame(scrollFrame.current);
    }

    scrollFrame.current = window.requestAnimationFrame(() => {
      const nextIndex = Math.round(scroller.scrollTop / Math.max(scroller.clientHeight, 1));
      setCurrentIndex(Math.min(Math.max(nextIndex, 0), Math.max(cards.length - 1, 0)));
    });
  };

  return (
    <section className="feed-view">
      <div
        className="feed-progress"
        style={{ "--feed-progress": `${cards.length ? ((currentIndex + 1) / cards.length) * 100 : 0}%` } as React.CSSProperties}
      />
      <div className="filter-row">
        <button className={selectedSubjectIds.length === 0 ? "chip active" : "chip"} onClick={onClearSubjects}>
          <Filter size={15} />
          All
        </button>
        {subjects.map((subject) => (
          <button
            className={selectedSubjectIds.includes(subject.id) ? "chip active" : "chip"}
            key={subject.id}
            onClick={() => onToggleSubject(subject.id)}
            style={{ "--subject-color": subject.color } as React.CSSProperties}
          >
            <span className="dot" />
            {subject.name}
          </button>
        ))}
        <button className="icon-chip" onClick={onShuffle} aria-label="Shuffle feed">
          <Shuffle size={17} />
        </button>
        <button
          className={speech.autoRead ? "chip active" : "chip"}
          onClick={() => onSpeech({ ...speech, autoRead: !speech.autoRead })}
          type="button"
        >
          <Volume2 size={15} />
          Auto voice
        </button>
        <button
          className={speech.autoAdvance ? "chip active" : "chip"}
          onClick={() => {
            const nextAutoAdvance = !speech.autoAdvance;
            onSpeech({
              ...speech,
              autoAdvance: nextAutoAdvance,
              autoRead: nextAutoAdvance ? true : speech.autoRead,
            });
          }}
          type="button"
        >
          <ChevronDown size={15} />
          Autoplay
        </button>
      </div>

      <div className="feed-scroller" ref={scrollerRef} onScroll={updateCurrentIndex} aria-live="polite">
        {cards.length === 0 ? (
          <div className="empty-state">
            <BookOpen size={32} />
            <h2>No cards in this feed</h2>
            <p>Add a note or change your subject filter.</p>
            <button className="primary-action" onClick={onAdd}>
              <Plus size={18} />
              Add card
            </button>
          </div>
        ) : (
          cards.map((card, index) => {
            const shouldRenderFullCard = Math.abs(index - currentIndex) <= 2;
            const subject = getSubject(subjects, card.subjectId);

            if (!shouldRenderFullCard) {
              return (
                <article
                  className="study-slide virtual-slide"
                  key={card.id}
                  aria-label={`Card ${index + 1} of ${cards.length}`}
                >
                  <div className="virtual-card" style={{ "--subject-color": subject?.color } as React.CSSProperties}>
                    <span className="subject-badge">
                      <span className="dot" />
                      {subject?.name ?? "No subject"}
                    </span>
                    <strong>{card.title}</strong>
                  </div>
                </article>
              );
            }

            const cardProgress = progress[card.id];
            const accuracy =
              cardProgress?.seenCount ? Math.round((cardProgress.knownCount / cardProgress.seenCount) * 100) : 0;

            return (
              <article className="study-slide" key={card.id}>
                <div className="study-card" style={{ "--subject-color": subject?.color } as React.CSSProperties}>
                  <div className="card-glow" />
                  <div className="card-meta">
                    <span className="subject-badge">
                      <span className="dot" />
                      {subject?.name ?? "No subject"}
                    </span>
                    <span>{card.difficulty ? difficultyLabels[card.difficulty] : "Medium"}</span>
                  </div>
                  <div className="card-copy">
                    <p className="kicker">HSC bite {index + 1} of {cards.length}</p>
                    <h1>{card.title}</h1>
                    <p>{card.body}</p>
                    {card.source && <span className="source-pill">{card.source}</span>}
                    <button
                      className={speakingCardId === card.id ? "voice-button active" : "voice-button"}
                      onClick={() => speakCard(card, subject?.name ?? "HSC study card")}
                      type="button"
                    >
                      {speakingCardId === card.id ? <Square size={17} /> : <Volume2 size={18} />}
                      {speakingCardId === card.id ? "Stop reading" : "Read it aloud"}
                    </button>
                  </div>
                  {card.hint && (
                    <button className="hint-box" onClick={() => onReveal(card.id)}>
                      {revealedHints[card.id] ? <EyeOff size={18} /> : <Eye size={18} />}
                      <span>{revealedHints[card.id] ? card.hint : "Reveal hint"}</span>
                    </button>
                  )}
                  <div className="progress-strip">
                    <span>{cardProgress?.seenCount ?? 0} seen</span>
                    <span>{accuracy}% known</span>
                  </div>
                </div>
                <div className="floating-actions">
                  <button onClick={() => speakCard(card, subject?.name ?? "HSC study card")} aria-label="Read card aloud">
                    {speakingCardId === card.id ? <Square size={20} /> : <Volume2 size={22} />}
                  </button>
                  <button className="know-action" onClick={() => onMark(card.id, true)} aria-label="I know this">
                    <Check size={22} />
                  </button>
                  <button onClick={() => onMark(card.id, false)} aria-label="Still learning">
                    <ChevronDown size={22} />
                  </button>
                  <button onClick={() => onEdit(card)} aria-label="Edit card">
                    <Edit3 size={21} />
                  </button>
                  <button onClick={onAdd} aria-label="Add card">
                    <Plus size={22} />
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

type LibraryViewProps = {
  cards: StudyCard[];
  subjects: Subject[];
  search: string;
  onSearch: (value: string) => void;
  onAddCard: (subjectId?: string) => void;
  onEditCard: (card: StudyCard) => void;
  onDeleteCard: (cardId: string) => void;
  onAddSubject: () => void;
  onBulkImport: () => void;
  onEditSubject: (subject: Subject) => void;
  onDeleteSubject: (subjectId: string) => void;
};

function LibraryView(props: LibraryViewProps) {
  const {
    cards,
    subjects,
    search,
    onSearch,
    onAddCard,
    onEditCard,
    onDeleteCard,
    onAddSubject,
    onBulkImport,
    onEditSubject,
    onDeleteSubject,
  } = props;

  return (
    <section className="library-view">
      <div className="section-heading">
        <div>
          <p className="kicker">Library</p>
          <h1>HSC study stack</h1>
        </div>
        <div className="heading-actions">
          <button className="secondary-action" onClick={onBulkImport}>
            <FilePlus2 size={18} />
            Bulk
          </button>
          <button className="primary-action" onClick={() => onAddCard(subjects[0]?.id)}>
            <Plus size={18} />
            Card
          </button>
        </div>
      </div>

      <label className="search-box">
        <Search size={18} />
        <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search cards" />
      </label>

      <div className="subject-grid">
        {subjects.map((subject) => (
          <div className="subject-tile" key={subject.id} style={{ "--subject-color": subject.color } as React.CSSProperties}>
            <span className="dot" />
            <strong>{subject.name}</strong>
            <small>{cards.filter((card) => card.subjectId === subject.id).length} cards</small>
            <div className="mini-actions">
              <button onClick={() => onAddCard(subject.id)} aria-label={`Add ${subject.name} card`}>
                <Plus size={16} />
              </button>
              <button onClick={() => onEditSubject(subject)} aria-label={`Edit ${subject.name}`}>
                <Edit3 size={16} />
              </button>
              <button onClick={() => onDeleteSubject(subject.id)} aria-label={`Delete ${subject.name}`}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        <button className="subject-tile add-tile" onClick={onAddSubject}>
          <Plus size={20} />
          <strong>New subject</strong>
          <small>Add another HSC course</small>
        </button>
      </div>

      <div className="card-list">
        {cards.map((card) => {
          const subject = getSubject(subjects, card.subjectId);
          return (
            <article className="library-card" key={card.id} style={{ "--subject-color": subject?.color } as React.CSSProperties}>
              <div>
                <span className="subject-badge">
                  <span className="dot" />
                  {subject?.name ?? "No subject"}
                </span>
                <h2>{card.title}</h2>
                <p>{card.body}</p>
              </div>
              <div className="mini-actions">
                <button onClick={() => onEditCard(card)} aria-label={`Edit ${card.title}`}>
                  <Edit3 size={17} />
                </button>
                <button onClick={() => onDeleteCard(card.id)} aria-label={`Delete ${card.title}`}>
                  <Trash2 size={17} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SettingsView({
  data,
  onTheme,
  onReset,
  onAddCard,
  onBulkImport,
  speech,
  voices,
  onSpeech,
}: {
  data: AppData;
  onTheme: (theme: Theme) => void;
  onReset: () => void;
  onAddCard: () => void;
  onBulkImport: () => void;
  speech: SpeechSettings;
  voices: SpeechSynthesisVoice[];
  onSpeech: (speech: SpeechSettings) => void;
}) {
  const seen = Object.values(data.progress).reduce((sum, item) => sum + item.seenCount, 0);
  const known = Object.values(data.progress).reduce((sum, item) => sum + item.knownCount, 0);
  const readableVoices = useMemo(() => {
    const clearVoices = clearEnglishVoices(voices);
    const selectedVoice = voices.find((voice) => voice.voiceURI === speech.voiceURI);
    if (
      selectedVoice &&
      speech.voiceURI !== RANDOM_VOICE &&
      !clearVoices.some((voice) => voice.voiceURI === selectedVoice.voiceURI)
    ) {
      return [selectedVoice, ...clearVoices].slice(0, 8);
    }
    return clearVoices;
  }, [voices, speech.voiceURI]);

  return (
    <section className="settings-view">
      <div className="section-heading">
        <div>
          <p className="kicker">Settings</p>
          <h1>HSC revision setup</h1>
        </div>
      </div>
      <div className="settings-grid">
        <div className="settings-panel">
          <h2>Theme</h2>
          <div className="segmented">
            <button className={data.theme === "dark" ? "active" : ""} onClick={() => onTheme("dark")}>
              <Moon size={17} />
              Dark
            </button>
            <button className={data.theme === "light" ? "active" : ""} onClick={() => onTheme("light")}>
              <Sun size={17} />
              Light
            </button>
          </div>
        </div>
        <div className="settings-panel voice-settings">
          <h2>Voice</h2>
          <label className="toggle-row">
            <span>
              <strong>Auto-read cards</strong>
              <small>Starts reading when you land on a card.</small>
            </span>
            <input
              type="checkbox"
              checked={speech.autoRead}
              onChange={(event) => onSpeech({ ...speech, autoRead: event.target.checked })}
            />
          </label>
          <label className="toggle-row">
            <span>
              <strong>Autoplay next card</strong>
              <small>Scrolls after the voice finishes reading.</small>
            </span>
            <input
              type="checkbox"
              checked={speech.autoAdvance}
              onChange={(event) =>
                onSpeech({ ...speech, autoAdvance: event.target.checked, autoRead: event.target.checked ? true : speech.autoRead })
              }
            />
          </label>
          <label>
            Voice
            <select
              value={speech.voiceURI}
              onChange={(event) => onSpeech({ ...speech, voiceURI: event.target.value })}
            >
              <option value="">Default device voice</option>
              <option value={RANDOM_VOICE}>Random clear voice</option>
              {readableVoices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          </label>
          <label>
            Speed {speech.rate.toFixed(2)}x
            <input
              type="range"
              min="0.75"
              max="2"
              step="0.01"
              value={speech.rate}
              onChange={(event) => onSpeech({ ...speech, rate: Number(event.target.value) })}
            />
          </label>
          <label>
            Energy {speech.pitch.toFixed(2)}
            <input
              type="range"
              min="0.85"
              max="1.35"
              step="0.01"
              value={speech.pitch}
              onChange={(event) => onSpeech({ ...speech, pitch: Number(event.target.value) })}
            />
          </label>
          <small>
            This list only shows clearer English voices. Random picks one each time a card is read.
          </small>
        </div>
        <div className="settings-panel">
          <h2>Progress</h2>
          <div className="stat-row">
            <span>{data.cards.length}</span>
            <small>cards</small>
          </div>
          <div className="stat-row">
            <span>{seen}</span>
            <small>seen</small>
          </div>
          <div className="stat-row">
            <span>{known}</span>
            <small>known taps</small>
          </div>
        </div>
        <div className="settings-panel">
          <h2>Data</h2>
          <button className="secondary-action" onClick={onAddCard}>
            <Plus size={18} />
            Add card
          </button>
          <button className="secondary-action" onClick={onBulkImport}>
            <FilePlus2 size={18} />
            Bulk import cards
          </button>
          <button className="danger-action" onClick={onReset}>
            <RotateCcw size={18} />
            Reset demo data
          </button>
        </div>
      </div>
    </section>
  );
}

function CardEditor({
  draft,
  subjects,
  onChange,
  onClose,
  onSave,
}: {
  draft: CardDraft;
  subjects: Subject[];
  onChange: (draft: CardDraft) => void;
  onClose: () => void;
  onSave: (event: FormEvent) => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="editor-panel" onSubmit={onSave}>
        <div className="modal-heading">
          <h2>{draft.title ? "Edit card" : "New card"}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <label>
          Subject
          <select value={draft.subjectId} onChange={(event) => onChange({ ...draft, subjectId: event.target.value })}>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Title
          <input value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} required />
        </label>
        <label>
          Note
          <textarea
            value={draft.body}
            onChange={(event) => onChange({ ...draft, body: event.target.value })}
            rows={5}
            required
          />
        </label>
        <label>
          Hint
          <input value={draft.hint ?? ""} onChange={(event) => onChange({ ...draft, hint: event.target.value })} />
        </label>
        <label>
          Source
          <input value={draft.source ?? ""} onChange={(event) => onChange({ ...draft, source: event.target.value })} />
        </label>
        <label>
          Difficulty
          <select
            value={draft.difficulty ?? "medium"}
            onChange={(event) => onChange({ ...draft, difficulty: event.target.value as Difficulty })}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
        <button className="primary-action wide" type="submit">
          <Check size={18} />
          Save card
        </button>
      </form>
    </div>
  );
}

function BulkImportModal({
  subjects,
  onClose,
  onImport,
}: {
  subjects: Subject[];
  onClose: () => void;
  onImport: (subjectId: string, cards: BulkCard[]) => void;
}) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [paste, setPaste] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const subject = getSubject(subjects, subjectId) ?? subjects[0];
  const prompt = bulkPrompt(subject?.name ?? "my HSC subject");

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setMessage("Copy failed. Select the prompt text and copy it manually.");
    }
  };

  const importCards = () => {
    try {
      const cards = parseBulkCards(paste);
      if (cards.length === 0) {
        setMessage("No cards found in that paste.");
        return;
      }
      onImport(subjectId, cards);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That paste was not readable JSON.");
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="editor-panel bulk-panel">
        <div className="modal-heading">
          <div>
            <p className="kicker">Bulk import</p>
            <h2>Add lots of HSC cards</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <label>
          Subject
          <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
            {subjects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <div className="prompt-card">
          <div className="prompt-heading">
            <strong>AI prompt</strong>
            <button className="secondary-action" type="button" onClick={copyPrompt}>
              <Clipboard size={17} />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <textarea readOnly value={prompt} rows={12} aria-label="Bulk card AI prompt" />
        </div>

        <label>
          Paste AI JSON output
          <textarea
            value={paste}
            onChange={(event) => {
              setPaste(event.target.value);
              setMessage("");
            }}
            rows={9}
            placeholder='{"cards":[{"title":"...","body":"...","hint":"...","source":"...","difficulty":"medium"}]}'
          />
        </label>

        {message && <p className="form-message">{message}</p>}

        <button className="primary-action wide" type="button" onClick={importCards}>
          <FilePlus2 size={18} />
          Import cards
        </button>
      </div>
    </div>
  );
}

function SubjectEditor({
  draft,
  onChange,
  onClose,
  onSave,
}: {
  draft: SubjectDraft;
  onChange: (draft: SubjectDraft) => void;
  onClose: () => void;
  onSave: (event: FormEvent) => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="editor-panel compact" onSubmit={onSave}>
        <div className="modal-heading">
          <h2>{draft.name ? "Edit subject" : "New subject"}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <label>
          Name
          <input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} required />
        </label>
        <div className="swatches" aria-label="Subject color">
          {colors.map((color) => (
            <button
              type="button"
              key={color}
              className={draft.color === color ? "selected" : ""}
              onClick={() => onChange({ ...draft, color })}
              style={{ background: color }}
              aria-label={`Use color ${color}`}
            />
          ))}
        </div>
        <button className="primary-action wide" type="submit">
          <Check size={18} />
          Save subject
        </button>
      </form>
    </div>
  );
}

export default App;
