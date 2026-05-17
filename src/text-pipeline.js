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
    return repairTextExtractionArtifacts(String(text || ''))
      .replace(/\u00ad/g, '')
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/([,.;:!?])([^\s\u201d"'])/g, '$1 $2')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  function repairTextExtractionArtifacts(text) {
    return String(text || '')
      .replace(/\bPbrbes\b/g, 'Forbes')
      .replace(/\bBrìanna\b/g, 'Brianna')
      .replace(/\bintcriore\b/g, 'interiore')
      .replace(/\bintcriori\b/g, 'interiori')
      .replace(/thè/g, 'the');
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
    const indexed = detectIndexedChaptersFromText(text);
    if (indexed.length > 1) return indexed;

    const detected = detectChaptersFromText(text);
    if (detected.length > 1) return detected;

    const words = tokenize(cleanBookText(text));
    const chapters = [];
    for (let i = 0; i < words.length; i += wordsPerBlock) {
      chapters.push({ title: `Blocco ${chapters.length + 1}`, text: words.slice(i, i + wordsPerBlock).join(' ') });
    }
    return chapters;
  }

  function detectIndexedChaptersFromText(text, options = {}) {
    const entries = extractTocEntriesFromText(text, options);
    if (entries.length < (Number(options.minEntries) || 4)) return [];
    return buildChaptersFromToc(text, entries, options);
  }

  function extractTocEntriesFromText(text, options = {}) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    const start = lines.findIndex((line) => /^(indice|contenuti|sommario|contents|table of contents)$/i.test(normalizeTextLine(line)));
    if (start < 0) return [];

    const maxLines = Number(options.maxTocLines) || 260;
    const entries = [];
    let current = null;

    for (let i = start + 1; i < Math.min(lines.length, start + maxLines); i += 1) {
      const line = normalizeTextLine(lines[i]);
      if (!line) continue;
      if (/^\d{1,4}$/.test(line)) continue;

      const introMatch = line.match(/^(introduzione|introduction|prefazione|preface|prologo|prologue)\s+(\d{1,4})$/i);
      const numberedMatch = line.match(/^(\d{1,3})\s*[.)]\s+(.+)$/);

      if (introMatch) {
        current = { number: 0, title: normalizeChapterTitle(introMatch[1]), page: Number(introMatch[2]) || 0, lineIndex: i };
        entries.push(current);
        continue;
      }

      if (numberedMatch) {
        current = {
          number: Number(numberedMatch[1]),
          title: cleanTocTitle(numberedMatch[2]),
          page: extractTrailingPageNumber(numberedMatch[2]),
          lineIndex: i,
        };
        entries.push(current);
        continue;
      }

      if (entries.length >= 4 && looksLikeBodyAfterToc(line, entries[0])) break;

      if (current && shouldContinueTocTitle(line)) {
        current.title = cleanTocTitle(`${current.title} ${line}`);
        current.lineIndex = i;
      }
    }

    return entries
      .map((entry) => ({ ...entry, title: cleanTocTitle(entry.title) }))
      .filter((entry) => entry.title && (entry.number === 0 || entry.number > 0));
  }

  function buildChaptersFromToc(text, entries, options = {}) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    const tocStart = lines.findIndex((line) => /^(indice|contenuti|sommario|contents|table of contents)$/i.test(normalizeTextLine(line)));
    const tocEnd = entries.reduce((max, entry) => Math.max(max, Number(entry.lineIndex) || 0), tocStart);
    const searchStart = Math.max(0, tocEnd + 1);
    const matches = [];
    let cursor = searchStart;

    for (const entry of entries) {
      const match = findTocEntryInBody(lines, entry, cursor);
      if (!match) continue;
      matches.push({ ...entry, lineIndex: match.lineIndex, endLineIndex: match.endLineIndex });
      cursor = match.endLineIndex + 1;
    }

    const minMatchedRatio = Number(options.minMatchedRatio) || 0.45;
    if (matches.length < 2 || matches.length < Math.ceil(entries.length * minMatchedRatio)) return [];

    const chapters = [];
    for (let i = 0; i < matches.length; i += 1) {
      const current = matches[i];
      const next = matches[i + 1];
      const start = current.endLineIndex + 1;
      const end = next ? next.lineIndex : lines.length;
      const title = current.number > 0 ? `${current.number}. ${current.title}` : current.title;
      const cleaned = cleanBookText(lines.slice(start, end).join('\n'));
      if (tokenize(cleaned).length) chapters.push({ title, text: cleaned });
    }
    return chapters;
  }

  function findTocEntryInBody(lines, entry, startIndex) {
    const needleWords = significantWords(entry.title).slice(0, 8);
    const numberPattern = entry.number > 0 ? new RegExp(`^${entry.number}\\s*([.)-])?$`) : null;
    const maxLookAhead = 5;

    for (let i = Math.max(0, startIndex); i < lines.length; i += 1) {
      const line = normalizeTextLine(lines[i]);
      if (!line) continue;

      if (entry.number === 0 && normalizedLoose(line).startsWith(normalizedLoose(entry.title))) {
        return { lineIndex: i, endLineIndex: i };
      }

      if (entry.number > 0 && numberPattern.test(line)) {
        const windowText = lines.slice(i, Math.min(lines.length, i + maxLookAhead)).map(normalizeTextLine).join(' ');
        if (matchesSignificantWords(windowText, needleWords)) {
          return { lineIndex: i, endLineIndex: Math.min(lines.length - 1, i + 1) };
        }
      }

      if (entry.number > 0 && line.match(new RegExp(`^${entry.number}\\s*[.)-]\\s+`))) {
        const windowText = lines.slice(i, Math.min(lines.length, i + maxLookAhead)).map(normalizeTextLine).join(' ');
        if (matchesSignificantWords(windowText, needleWords)) return { lineIndex: i, endLineIndex: i };
      }
    }

    return null;
  }

  function cleanTocTitle(title) {
    return normalizeChapterTitle(String(title || '')
      .replace(/\s+\.{2,}\s*\d{1,4}$/g, '')
      .replace(/\s+\d{1,4}$/g, '')
      .replace(/\s*[-–—]\s*$/g, ''));
  }

  function extractTrailingPageNumber(text) {
    const match = String(text || '').match(/\s(\d{1,4})$/);
    return match ? Number(match[1]) : 0;
  }

  function shouldContinueTocTitle(line) {
    const value = normalizeTextLine(line);
    if (!value || value.length > 110) return false;
    if (/^(indice|contents|introduzione|introduction)$/i.test(value)) return false;
    if (/^\d{1,3}\s*[.)]\s+/.test(value)) return false;
    return /[\p{L}]/u.test(value);
  }

  function looksLikeBodyAfterToc(line, firstEntry) {
    const value = normalizedLoose(line);
    const firstTitle = normalizedLoose(firstEntry && firstEntry.title);
    return Boolean(firstTitle && value && (value === firstTitle || firstTitle.startsWith(value) || value.startsWith(firstTitle)));
  }

  function significantWords(text) {
    const stop = new Set(['che', 'con', 'del', 'della', 'delle', 'degli', 'dei', 'gli', 'per', 'non', 'una', 'uno', 'come', 'cosa', 'cose', 'cui', 'tuo', 'tua', 'tuoi', 'tue', 'the', 'and', 'that', 'your', 'you']);
    return normalizedLoose(text).split(' ').filter((word) => word.length >= 3 && !stop.has(word));
  }

  function matchesSignificantWords(text, words) {
    if (!words.length) return false;
    const haystack = normalizedLoose(text);
    const needed = Math.min(words.length, words.length <= 3 ? 2 : 4);
    let count = 0;
    for (const word of words) {
      if (haystack.includes(word)) count += 1;
      if (count >= needed) return true;
    }
    return false;
  }

  function normalizedLoose(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function detectChaptersFromText(text, options = {}) {
    const minWordsPerChapter = Number(options.minWordsPerChapter) || 80;
    const minChapters = Number(options.minChapters) || 2;
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    const headings = [];

    lines.forEach((line, index) => {
      const title = normalizeTextLine(line);
      if (isChapterHeading(title, index, lines)) headings.push(resolveHeading(title, index, lines));
    });

    if (headings.length < minChapters) return [];

    const chapters = [];
    for (let i = 0; i < headings.length; i += 1) {
      const start = headings[i].endIndex;
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

    const previous = normalizeTextLine(lines[index - 1] || '');
    const next = normalizeTextLine(lines[index + 1] || '');
    const afterNext = normalizeTextLine(lines[index + 2] || '');
    const hasBreathingRoom = !previous || previous.length < 80;
    if (!hasBreathingRoom) return false;

    return /^((chapter|chap\.?|capitolo|cap\.?)\s+([0-9]+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b.*)$/i.test(title) ||
      /^((parte|part)\s+([0-9]+|[ivxlcdm]+)\b.*)$/i.test(title) ||
      /^([0-9]{1,2}|[ivxlcdm]{1,8})\s*[-.)]\s+[\p{Lu}\p{Lt}0-9][\p{L}\p{N}'’" -]{2,}$/u.test(title) ||
      (/^([0-9]{1,3}|[ivxlcdm]{1,8})$/i.test(title) && looksLikeHeadingContinuation(next) && looksLikeBodyStart(afterNext)) ||
      (isAllCapsHeading(title) && looksLikeBodyStart(next)) ||
      /^(prologo|prologue|epilogo|epilogue|introduzione|introduction|prefazione|preface|conclusione|conclusion)$/i.test(title);
  }

  function resolveHeading(title, index, lines) {
    const next = normalizeTextLine(lines[index + 1] || '');
    const markerOnly = /^((chapter|chap\.?|capitolo|cap\.?)\s+([0-9]+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)|[0-9]{1,3}|[ivxlcdm]{1,8})$/i.test(title);
    if (markerOnly && looksLikeHeadingContinuation(next)) {
      return { index, endIndex: index + 1, title: normalizeChapterTitle(`${title} - ${next}`) };
    }
    return { index, endIndex: index, title: normalizeChapterTitle(title) };
  }

  function looksLikeHeadingContinuation(line) {
    const value = normalizeTextLine(line);
    return Boolean(value && value.length <= 80 && /[\p{L}]/u.test(value) && !/[.!?;:]$/.test(value));
  }

  function looksLikeBodyStart(line) {
    const value = normalizeTextLine(line);
    return Boolean(value && value.length >= 12 && /[\p{Ll}]/u.test(value));
  }

  function isAllCapsHeading(line) {
    const value = normalizeTextLine(line);
    if (value.length < 4 || value.length > 72) return false;
    if (!/[\p{L}]/u.test(value) || /[.!?;:]$/.test(value)) return false;
    const letters = Array.from(value).filter((ch) => /\p{L}/u.test(ch));
    if (letters.length < 4) return false;
    return letters.every((ch) => ch === ch.toLocaleUpperCase());
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
    repairTextExtractionArtifacts,
    findRepeatedNoiseLines,
    isNoiseLine,
    cleanBookText,
    tokenize,
    buildTextChapters,
    detectIndexedChaptersFromText,
    extractTocEntriesFromText,
    buildChaptersFromToc,
    detectChaptersFromText,
    isChapterHeading,
    createImportReport,
  };
});
