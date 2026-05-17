(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PivotTextPipeline = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  function normalizeTextLine(line) {
    return String(line || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[\t ]+/g, ' ')
      .replace(/^\s+|\s+$/g, '')
      .replace(/^[-\u2013\u2014\u2022\u00b7]+\s*/, '')
      .replace(/\s*[-\u2013\u2014\u2022\u00b7]+$/, '')
      .trim();
  }

  function normalizeText(text) {
    return String(text || '')
      .replace(/\u00ad/g, '')
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/([,.;:!?])([^\s\u201d"'])/g, '$1 $2')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  function findRepeatedNoiseLines(text) {
    const counts = new Map();
    String(text || '').split(/\r?\n/).forEach((line) => {
      const clean = normalizeTextLine(line);
      if (!clean || clean.length < 4 || clean.length > 90) return;
      if (/[.!?;:]$/.test(clean)) return;
      if (!/[\p{L}]/u.test(clean)) return;
      const key = clean.toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const repeated = new Set();
    counts.forEach((count, key) => {
      if (count >= 3) repeated.add(key);
    });
    return repeated;
  }

  function isNoiseLine(line, repeatedLines) {
    const value = normalizeTextLine(line);
    const lower = value.toLowerCase();

    if (/^[-\u2013\u2014]?\s*\d{1,4}\s*[-\u2013\u2014]?$/.test(value)) return true;
    if (/^\d{1,4}\s*\/\s*\d{1,4}$/.test(value)) return true;
    if (/^(page|pagina|pag\.)\s+\d{1,4}(\s+(of|di)\s+\d{1,4})?$/i.test(value)) return true;
    if (/^[ivxlcdm]{2,10}$/i.test(value)) return true;
    if (/^\[\d{1,4}\]$/.test(value)) return true;
    if (/^\(\d{1,4}\)$/.test(value)) return true;
    if (/^\d{1,3}[.)]$/.test(value)) return true;
    if (/^[*\u2020\u2021\u00a7]+\s*\d{0,3}$/.test(value)) return true;
    if (/^isbn\b/i.test(value)) return true;
    if (/^issn\b/i.test(value)) return true;
    if (/^doi\b/i.test(value)) return true;
    if (/^https?:\/\//i.test(value)) return true;
    if (/^www\./i.test(value)) return true;
    if (/^\u00a9|^copyright\b|all rights reserved/i.test(value)) return true;
    if (/^\d{3}-\d-\d{2,}-\d{2,}-\d$/i.test(value)) return true;
    if (repeatedLines && repeatedLines.has(lower)) return true;

    return false;
  }

  function cleanBookText(text, options = {}) {
    const original = String(text || '');
    const repeatedLines = options.repeatedLines || findRepeatedNoiseLines(original);
    let raw = original
      .replace(/\r\n?/g, '\n')
      .replace(/\u00ad/g, '')
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2018\u2019]/g, "'");

    raw = raw.replace(/([\p{L}])[-\u2010\u2011\u2012\u2013\u2014]\s*\n\s*([\p{Ll}])/gu, '$1$2');

    const lines = raw.split('\n');
    const kept = [];
    let droppedLines = 0;
    for (const originalLine of lines) {
      const line = normalizeTextLine(originalLine);
      if (!line) {
        if (kept.length && kept[kept.length - 1] !== '') kept.push('');
        continue;
      }
      if (isNoiseLine(line, repeatedLines)) {
        droppedLines += 1;
        continue;
      }
      kept.push(line);
    }

    const cleaned = normalizeText(kept.join('\n'))
      .replace(/\s*\[(?:\d{1,3}|[ivxlcdm]{2,8})\]/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return options.withReport ? { text: cleaned, droppedLines, repeatedLineCount: repeatedLines.size } : cleaned;
  }

  function tokenize(text) {
    const normalized = normalizeText(text);
    const tokens = normalized.match(/[\p{L}\p{N}]+(?:[\u2019'\-][\p{L}\p{N}]+)*|[^\s]/gu) || [];
    const words = [];
    for (const token of tokens) {
      if (/^[,.;:!?\u2026]+$/u.test(token) && words.length) words[words.length - 1] += token;
      else if (/^[\)\]\}"\u201d\u00bb]+$/u.test(token) && words.length) words[words.length - 1] += token;
      else words.push(token);
    }
    return words.filter((word) => /[\p{L}\p{N}]/u.test(word));
  }

  function buildTextChapters(text, wordsPerBlock = 2200) {
    const detected = detectChaptersFromText(text);
    if (detected.length > 1) return detected;

    const words = tokenize(text);
    const chapters = [];
    for (let i = 0; i < words.length; i += wordsPerBlock) {
      chapters.push({ title: `Blocco ${chapters.length + 1}`, text: words.slice(i, i + wordsPerBlock).join(' ') });
    }
    return chapters;
  }

  function detectChaptersFromText(text, options = {}) {
    const minWordsPerChapter = Number(options.minWordsPerChapter) || 80;
    const minChapters = Number(options.minChapters) || 2;
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    const headings = [];

    lines.forEach((line, index) => {
      const title = normalizeTextLine(line);
      if (isChapterHeading(title, index, lines)) headings.push({ index, title: normalizeChapterTitle(title) });
    });

    if (headings.length < minChapters) return [];

    const chapters = [];
    for (let i = 0; i < headings.length; i += 1) {
      const start = headings[i].index;
      const end = i + 1 < headings.length ? headings[i + 1].index : lines.length;
      const body = lines.slice(start + 1, end).join('\n');
      const cleaned = cleanBookText(body);
      const wordCount = tokenize(cleaned).length;
      if (wordCount >= minWordsPerChapter || i === headings.length - 1) {
        chapters.push({ title: headings[i].title, text: cleaned });
      } else if (chapters.length) {
        chapters[chapters.length - 1].text = cleanBookText(`${chapters[chapters.length - 1].text}\n\n${headings[i].title}\n${cleaned}`);
      }
    }

    return chapters.filter((chapter) => tokenize(chapter.text).length > 0);
  }

  function isChapterHeading(title, index, lines) {
    if (!title || title.length > 96) return false;
    if (!/[\p{L}\p{N}]/u.test(title)) return false;
    if (/[.!?;:,]$/.test(title)) return false;
    if (/^(page|pagina|pag\.)\s+\d+/i.test(title)) return false;
    if (/^\d{1,4}$/.test(title)) return false;

    const previous = normalizeTextLine(lines[index - 1] || '');
    const next = normalizeTextLine(lines[index + 1] || '');
    const hasBreathingRoom = !previous || !next || previous.length < 120;
    if (!hasBreathingRoom) return false;

    return /^((chapter|chap\.?|capitolo|cap\.?)\s+([0-9]+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)\b.*)$/i.test(title) ||
      /^((parte|part)\s+([0-9]+|[ivxlcdm]+)\b.*)$/i.test(title) ||
      /^([0-9]{1,2}|[ivxlcdm]{1,8})\s*[-.)]\s+[\p{Lu}\p{Lt}0-9][\p{L}\p{N}'’" -]{2,}$/u.test(title) ||
      /^(prologo|prologue|epilogo|epilogue|introduzione|introduction|prefazione|preface|conclusione|conclusion)$/i.test(title);
  }

  function normalizeChapterTitle(title) {
    const value = normalizeTextLine(title).replace(/\s+/g, ' ');
    return value || 'Capitolo';
  }

  function createImportReport(input) {
    const chapters = Array.isArray(input.chapters) ? input.chapters : [];
    const chapterReports = chapters.map((chapter, index) => {
      const words = tokenize(chapter.text || '');
      return {
        index,
        title: chapter.title || `Capitolo ${index + 1}`,
        words: words.length,
        chars: String(chapter.text || '').length,
      };
    });
    const totalWords = chapterReports.reduce((sum, chapter) => sum + chapter.words, 0);
    const emptyChapters = chapterReports.filter((chapter) => chapter.words === 0).length;
    const longestChapter = chapterReports.reduce((best, chapter) => chapter.words > best.words ? chapter : best, { words: 0 });

    return {
      title: input.title || input.fileName || 'Libro',
      format: input.format || 'txt',
      chapterCount: chapterReports.length,
      readableChapters: chapterReports.length - emptyChapters,
      emptyChapters,
      totalWords,
      longestChapterTitle: longestChapter.title || '',
      longestChapterWords: longestChapter.words || 0,
      warnings: buildWarnings({ totalWords, emptyChapters, chapterReports }),
      chapters: chapterReports,
    };
  }

  function buildWarnings(report) {
    const warnings = [];
    if (report.totalWords < 5) warnings.push('Testo insufficiente: il file potrebbe essere protetto, scansionato o non testuale.');
    if (report.emptyChapters > 0) warnings.push(`${report.emptyChapters} capitoli senza parole leggibili saranno ignorati.`);
    if (report.chapterReports.length > 80) warnings.push('Molti capitoli rilevati: la navigazione resta disponibile, ma il salvataggio iniziale puo richiedere qualche secondo.');
    return warnings;
  }

  return {
    normalizeTextLine,
    normalizeText,
    findRepeatedNoiseLines,
    isNoiseLine,
    cleanBookText,
    tokenize,
    buildTextChapters,
    detectChaptersFromText,
    isChapterHeading,
    createImportReport,
  };
});
