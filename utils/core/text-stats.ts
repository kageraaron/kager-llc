export interface TextStats {
  characters: number;
  charactersNoSpaces: number;
  words: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  syllables: number;
  readingTime: ReadingTime;
  speakingTime: ReadingTime;
  fleschReadingEase: number;
  fleschKincaidGrade: number;
  averageWordLength: number;
  averageSentenceLength: number;
  uniqueWords: number;
  lexicalDensity: number;
  topWords: { word: string; count: number }[];
}

export interface ReadingTime {
  minutes: number;
  seconds: number;
  text: string;
}

export function analyzeText(text: string): TextStats {
  const characters = text.length;
  const charactersNoSpaces = text.replace(/\s/g, '').length;
  const words = text.trim() === '' ? [] : text.trim().split(/\s+/);
  const wordCount = words.length;
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const lines = text.split('\n').length;

  const syllables = words.reduce((count, word) => count + countSyllables(word), 0);

  const readingWpm = 200;
  const speakingWpm = 130;
  const readingTime = calculateReadingTime(wordCount, readingWpm);
  const speakingTime = calculateReadingTime(wordCount, speakingWpm);

  const avgWordLength = wordCount > 0 ? charactersNoSpaces / wordCount : 0;
  const avgSentenceLength = sentences.length > 0 ? wordCount / sentences.length : 0;

  const lowerWords = words.map((w) => w.toLowerCase().replace(/[^a-z]/g, ''));
  const wordFrequency: Record<string, number> = {};
  for (const word of lowerWords) {
    if (word.length > 0) {
      wordFrequency[word] = (wordFrequency[word] || 0) + 1;
    }
  }

  const uniqueWords = Object.keys(wordFrequency).length;
  const lexicalDensity = wordCount > 0 ? uniqueWords / wordCount : 0;

  const topWords = Object.entries(wordFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }));

  const fleschReadingEase = calculateFleschReadingEase(wordCount, sentences.length, syllables);
  const fleschKincaidGrade = calculateFleschKincaidGrade(wordCount, sentences.length, syllables);

  return {
    characters,
    charactersNoSpaces,
    words: wordCount,
    sentences: sentences.length,
    paragraphs: paragraphs.length,
    lines,
    syllables,
    readingTime,
    speakingTime,
    fleschReadingEase,
    fleschKincaidGrade,
    averageWordLength: Math.round(avgWordLength * 100) / 100,
    averageSentenceLength: Math.round(avgSentenceLength * 100) / 100,
    uniqueWords,
    lexicalDensity: Math.round(lexicalDensity * 100) / 100,
    topWords,
  };
}

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;

  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word(/^y/, '');

  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

function calculateReadingTime(wordCount: number, wpm: number): ReadingTime {
  const totalSeconds = Math.round((wordCount / wpm) * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return {
    minutes,
    seconds,
    text: minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`,
  };
}

function calculateFleschReadingEase(words: number, sentences: number, syllables: number): number {
  if (words === 0 || sentences === 0) return 0;
  const score = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
  return Math.round(score * 100) / 100;
}

function calculateFleschKincaidGrade(words: number, sentences: number, syllables: number): number {
  if (words === 0 || sentences === 0) return 0;
  const score = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
  return Math.round(score * 10) / 10;
}

export interface WordFrequencyResult {
  word: string;
  count: number;
  percentage: number;
}

export function getWordFrequency(text: string, options: { minWordLength?: number; excludeCommon?: boolean } = {}): WordFrequencyResult[] {
  const { minWordLength = 1, excludeCommon = false } = options;
  const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'it', 'this', 'that', 'was', 'are', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'not', 'no']);

  const words = text.toLowerCase().match(/[a-z]+/g) || [];
  const filtered = words.filter((w) => w.length >= minWordLength && (!excludeCommon || !commonWords.has(w)));

  const frequency: Record<string, number> = {};
  for (const word of filtered) {
    frequency[word] = (frequency[word] || 0) + 1;
  }

  const total = filtered.length;
  return Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .map(([word, count]) => ({
      word,
      count,
      percentage: total > 0 ? Math.round((count / total) * 10000) / 100 : 0,
    }));
}

export function getCharacterFrequency(text: string): { char: string; count: number; percentage: number }[] {
  const frequency: Record<string, number> = {};
  for (const char of text) {
    if (char !== ' ' && char !== '\n' && char !== '\t') {
      frequency[char.toLowerCase()] = (frequency[char.toLowerCase()] || 0) + 1;
    }
  }

  const total = Object.values(frequency).reduce((a, b) => a + b, 0);
  return Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .map(([char, count]) => ({
      char,
      count,
      percentage: total > 0 ? Math.round((count / total) * 10000) / 100 : 0,
    }));
}
