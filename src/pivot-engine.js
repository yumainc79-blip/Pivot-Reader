(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PivotEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function choosePivotLetterNumber(length, mode = 'third-letter') {
    const safeLength = Math.max(0, Number(length) || 0);
    if (safeLength <= 1) return 0;
    if (mode === 'third-letter') {
      if (safeLength <= 2) return 1;
      return 2;
    }
    if (safeLength <= 5) return 1;
    if (safeLength <= 9) return 2;
    if (safeLength <= 13) return 3;
    return Math.max(1, Math.floor(safeLength * 0.35));
  }

  function splitWord(rawWord, options = {}) {
    const word = String(rawWord || '').trim();
    if (!word) return { before: '', pivot: '', after: '' };
    const chars = Array.from(word);
    const letterPositions = [];
    chars.forEach((ch, idx) => {
      if (/[\p{L}\p{N}]/u.test(ch)) letterPositions.push(idx);
    });
    if (!letterPositions.length) return { before: '', pivot: chars[0], after: chars.slice(1).join('') };
    const pivotLetterNumber = choosePivotLetterNumber(letterPositions.length, options.mode);
    const pivotIndex = letterPositions[clamp(pivotLetterNumber, 0, letterPositions.length - 1)];
    return {
      before: chars.slice(0, pivotIndex).join(''),
      pivot: chars[pivotIndex],
      after: chars.slice(pivotIndex + 1).join(''),
    };
  }

  return {
    choosePivotLetterNumber,
    splitWord,
  };
});
