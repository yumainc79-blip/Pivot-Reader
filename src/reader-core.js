(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PivotReaderCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  function queuePositionSave(state, saveFn, delay = 500) {
    if (!state || typeof saveFn !== 'function') return null;
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveFn, delay);
    return state.saveTimer;
  }

  function buildKpiSnapshot({ library = [], currentBook = null, words = [], index = 0, wpm = 300 } = {}) {
    const totalBooks = library.length;
    const totalWords = library.reduce((sum, book) => sum + (Number(book.totalWords) || 0), 0);
    const completedBooks = library.filter((book) => (Number(book.progressPct) || 0) >= 99).length;
    const activeBookWords = words.length || Number(currentBook && currentBook.totalWords) || 0;
    const activeRemaining = Math.max(0, activeBookWords - (Number(index) || 0) - 1);
    const safeWpm = Math.max(1, Number(wpm) || 300);

    return {
      totalBooks,
      totalWords,
      completedBooks,
      activeRemaining,
      activeRemainingMinutes: Math.ceil(activeRemaining / safeWpm),
      averageProgressPct: totalBooks
        ? Math.round(library.reduce((sum, book) => sum + (Number(book.progressPct) || 0), 0) / totalBooks)
        : 0,
    };
  }

  return {
    queuePositionSave,
    buildKpiSnapshot,
  };
});
