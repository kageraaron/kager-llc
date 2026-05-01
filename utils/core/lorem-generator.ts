export interface LoremOptions {
  paragraphs?: number;
  sentencesPerParagraph?: number;
  wordsPerSentence?: number;
  startWithLoremIpsum?: boolean;
}

export interface GeneratedLorem {
  text: string;
  wordCount: number;
  paragraphCount: number;
}

const WORDS = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
  'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore',
  'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud',
  'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip', 'ex', 'ea', 'commodo',
  'consequat', 'duis', 'aute', 'irure', 'in', 'reprehenderit', 'voluptate',
  'velit', 'esse', 'cillum', 'fugiat', 'nulla', 'pariatur', 'excepteur', 'sint',
  'occaecat', 'cupidatat', 'non', 'proident', 'sunt', 'culpa', 'qui', 'officia',
  'deserunt', 'mollit', 'anim', 'id', 'est', 'laborum', 'at vero', 'eos',
  'accusamus', 'iusto', 'odio', 'dignissimos', 'ducimus', 'blanditiis',
  'praesentium', 'voluptatum', 'deleniti', 'atque', 'corrupti', 'quos', 'dolores',
  'quas', 'molestias', 'excepturi', 'obcaecati', 'cupiditate', 'provident',
  'similique', 'mollitia', 'animi', 'perspiciatis', 'unde', 'omnis', 'iste',
  'natus', 'error', 'voluptatem', 'accusantium', 'doloremque', 'laudantium',
  'totam', 'rem', 'aperiam', 'eaque', 'ipsa', 'quae', 'ab', 'illo', 'inventore',
  'veritatis', 'quasi', 'architecto', 'beatae', 'vitae', 'dicta', 'explicabo',
  'nemo', 'ipsam', 'voluptas', 'aspernatur', 'aut', 'odit', 'fuga', 'debitis',
];

const LOREM_IPSUM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';

function randomInt(max: number): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % max;
}

function generateSentence(options: { minLength?: number; maxLength?: number; startWithLorem?: boolean }): string {
  const { minLength = 5, maxLength = 15, startWithLorem = false } = options;
  const length = minLength + randomInt(maxLength - minLength);
  const words: string[] = [];

  if (startWithLorem) {
    words.push(...LOREM_IPSUM.split(' '));
    for (let i = words.length; i < length; i++) {
      words.push(WORDS[randomInt(WORDS.length)]);
    }
  } else {
    for (let i = 0; i < length; i++) {
      words.push(WORDS[randomInt(WORDS.length)]);
    }
  }

  let sentence = words.join(' ');
  sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  sentence += '.';
  return sentence;
}

function generateParagraph(options: { sentences?: number; startWithLorem?: boolean }): string {
  const { sentences = 5, startWithLorem = false } = options;
  const sentences_arr: string[] = [];

  for (let i = 0; i < sentences; i++) {
    sentences_arr.push(
      generateSentence({ startWithLorem: i === 0 && startWithLorem })
    );
  }

  return sentences_arr.join(' ');
}

export function generateLorem(options: LoremOptions = {}): GeneratedLorem {
  const {
    paragraphs = 3,
    sentencesPerParagraph = 5,
    startWithLoremIpsum = true,
  } = options;

  const paragraphTexts: string[] = [];
  let totalWords = 0;

  for (let i = 0; i < paragraphs; i++) {
    const paragraph = generateParagraph({
      sentences: sentencesPerParagraph,
      startWithLorem: i === 0 && startWithLoremIpsum,
    });
    paragraphTexts.push(paragraph);
    totalWords += paragraph.split(/\s+/).length;
  }

  return {
    text: paragraphTexts.join('\n\n'),
    wordCount: totalWords,
    paragraphCount: paragraphs,
  };
}

export interface HeadingOptions {
  levels?: number[];
  count?: number;
}

export function generateHeadings(options: HeadingOptions = {}): string {
  const { levels = [1, 2, 3], count = 5 } = options;
  const lines: string[] = [];

  for (let i = 0; i < count; i++) {
    const level = levels[randomInt(levels.length)];
    const word = WORDS[randomInt(WORDS.length)].charAt(0).toUpperCase() + WORDS[randomInt(WORDS.length)].slice(1);
    const word2 = WORDS[randomInt(WORDS.length)];
    lines.push(`${'#'.repeat(level)} ${word} ${word2}`);
  }

  return lines.join('\n\n');
}
