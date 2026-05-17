const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const textPipeline = require('../src/text-pipeline');
const chapterEngine = require('../src/chapter-engine');
const readerCore = require('../src/reader-core');
const pivotEngine = require('../src/pivot-engine');

test('text pipeline cleans repeated noise and tokenizes readable words', () => {
  const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-text.txt'), 'utf8');
  const report = textPipeline.cleanBookText(fixture, { withReport: true });
  assert.equal(report.repeatedLineCount, 1);
  assert.match(report.text, /psychological/);
  assert.doesNotMatch(report.text, /^12$/m);

  const words = textPipeline.tokenize(report.text);
  assert.deepEqual(words.slice(0, 4), ['Questo', 'e', 'un', 'testo']);
});

test('import report summarizes chapters and warnings', () => {
  const imported = {
    title: 'Fixture',
    format: 'txt',
    chapters: [
      { title: 'Uno', text: 'Una frase leggibile.' },
      { title: 'Vuoto', text: '' },
    ],
  };
  const report = textPipeline.createImportReport(imported);
  assert.equal(report.chapterCount, 2);
  assert.equal(report.readableChapters, 1);
  assert.equal(report.emptyChapters, 1);
  assert.ok(report.totalWords >= 3);
  assert.ok(report.warnings.length >= 1);
});

test('chapter engine finds current and adjacent chapters', () => {
  const chapters = [
    { index: 0, startWordIndex: 0, endWordIndex: 9, wordCount: 10 },
    { index: 1, startWordIndex: 10, endWordIndex: 19, wordCount: 10 },
  ];
  assert.equal(chapterEngine.currentChapterIndex(12, chapters), 1);
  assert.equal(chapterEngine.getChapterAt(3, chapters).index, 0);
  assert.equal(chapterEngine.getAdjacentChapter(3, chapters, 1).index, 1);
  assert.equal(chapterEngine.chapterProgress(14, chapters[1]).pct, 50);
});

test('third-letter pivot uses the third readable character when possible', () => {
  assert.deepEqual(pivotEngine.splitWord('lettura', { mode: 'third-letter' }), {
    before: 'le',
    pivot: 't',
    after: 'tura',
  });
  assert.equal(pivotEngine.splitWord('io', { mode: 'third-letter' }).pivot, 'o');
});

test('reader core builds KPI snapshot', () => {
  const snapshot = readerCore.buildKpiSnapshot({
    library: [
      { totalWords: 1000, progressPct: 50 },
      { totalWords: 500, progressPct: 100 },
    ],
    words: new Array(100),
    index: 49,
    wpm: 100,
  });
  assert.equal(snapshot.totalBooks, 2);
  assert.equal(snapshot.totalWords, 1500);
  assert.equal(snapshot.completedBooks, 1);
  assert.equal(snapshot.averageProgressPct, 75);
  assert.equal(snapshot.activeRemainingMinutes, 1);
});
