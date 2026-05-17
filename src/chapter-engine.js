(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PivotChapterEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getChapterAt(wordIndex, chapters = []) {
    if (!Array.isArray(chapters) || !chapters.length) return null;
    const index = Number(wordIndex) || 0;
    let low = 0;
    let high = chapters.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const chapter = chapters[mid];
      if (index < chapter.startWordIndex) high = mid - 1;
      else if (index > chapter.endWordIndex) low = mid + 1;
      else return chapter;
    }

    if (index < chapters[0].startWordIndex) return chapters[0];
    return chapters[clamp(low, 0, chapters.length - 1)] || chapters[chapters.length - 1];
  }

  function currentChapterIndex(wordIndex, chapters = []) {
    const chapter = getChapterAt(wordIndex, chapters);
    return chapter ? chapter.index : 0;
  }

  function getAdjacentChapter(wordIndex, chapters = [], direction = 1) {
    if (!Array.isArray(chapters) || !chapters.length) return null;
    const current = getChapterAt(wordIndex, chapters);
    const currentIndex = current ? current.index : 0;
    const targetIndex = clamp(currentIndex + (Number(direction) || 0), 0, chapters.length - 1);
    return chapters[targetIndex] || null;
  }

  function chapterProgress(wordIndex, chapter) {
    if (!chapter) return { pct: 0, position: 0, remaining: 0 };
    const wordCount = Math.max(1, Number(chapter.wordCount) || 1);
    const position = clamp((Number(wordIndex) || 0) - chapter.startWordIndex + 1, 1, wordCount);
    const remaining = Math.max(0, chapter.endWordIndex - (Number(wordIndex) || 0) + 1);
    return { pct: Math.round((position / wordCount) * 100), position, remaining };
  }

  return {
    getChapterAt,
    currentChapterIndex,
    getAdjacentChapter,
    chapterProgress,
  };
});
