// ================================
// CONFIGURATION & ÉTAT GLOBAL
// ================================

const CONFIG = {
  RANGE_OPTIONS: [25, 50, 100, 250, 500, 1000],
  DEFAULT_RANGE_INDEX: 2,
  DEFAULT_CONQUEST_THRESHOLD: 75,
  DEFAULT_CONQUEST_SPACING: 2,
  MC_CHOICES_COUNT: 4
};

const state = {
  // Decks
  decks: [],
  selectedDeckIndices: [0],
  currentDeck: [],
  deckMetadata: [],
  
  // Navigation
  currentIndex: 0,
  ranges: [],
  currentRangeIndex: 0,
  rangeSize: CONFIG.RANGE_OPTIONS[CONFIG.DEFAULT_RANGE_INDEX],
  
  // Modes
  isChoiceMode: false,
  isShuffleEnabled: true,
  conquestEnabled: false,
  
  // Progress
  correctCount: 0,
  skippedCount: 0,
  originalRange: [],
  currentChoices: [],
  
  // Conquest
  conquestQueue: [],
  conquestStats: {},
  conquestThreshold: CONFIG.DEFAULT_CONQUEST_THRESHOLD,
  conquestSpacingModifier: CONFIG.DEFAULT_CONQUEST_SPACING,
  conquestSessionData: null
};

// ================================
// INITIALISATION
// ================================

function init() {
  loadDeckPaths();
  initDeckSelector();
  initEventListeners();
  loadCombinedDecks();
}

function loadDeckPaths() {
  const deckPaths = ["decks/jk1.csv", "decks/jk2.csv", "decks/jk3.csv", "decks/jk4.csv", "decks/jk5.csv", "decks/jg1.csv", "decks/jg2.csv", "decks/ono.csv", "decks/yj1.csv", "decks/yj2.csv", "decks/yj3.csv", "decks/jkn2.csv"];
  
  state.decks = deckPaths.map(path => ({
    name: path.split('/').pop().replace('.csv', ''),
    path
  }));
}

// ================================
// GESTION MULTI-DECKS
// ================================

function initDeckSelector() {
  const container = document.getElementById('deckCheckboxes');
  if (!container) return;
  
  container.innerHTML = state.decks.map((deck, i) => `
    <label style="display: block; margin: 5px 0;">
      <input type="checkbox" class="deck-checkbox" data-index="${i}" ${i === 0 ? 'checked' : ''}>
      <span style="margin-left: 5px;">${deck.name}</span>
    </label>
  `).join('');
}

function applyDeckSelection() {
  const checkboxes = document.querySelectorAll('.deck-checkbox');
  state.selectedDeckIndices = Array.from(checkboxes)
    .filter(cb => cb.checked)
    .map(cb => parseInt(cb.dataset.index));

  if (state.selectedDeckIndices.length === 0) {
    alert('⚠️ Sélectionnez au moins un deck !');
    return;
  }

  loadCombinedDecks();
}

function resetDeckSelection() {
  state.selectedDeckIndices = [0];
  document.querySelectorAll('.deck-checkbox').forEach((cb, i) => {
    cb.checked = (i === 0);
  });
  loadCombinedDecks();
}

async function loadCombinedDecks() {
  resetProgress();
  state.currentDeck = [];
  state.deckMetadata = [];

  const loadPromises = state.selectedDeckIndices.map(async (index) => {
    // 🔥 MODIFICATION ICI - utiliser chrome.runtime.getURL
    const deckUrl = chrome.runtime.getURL(state.decks[index].path);
    const response = await fetch (deckUrl);
    const csv = await response.text();
    
    return new Promise(resolve => {
      Papa.parse(csv, {
        header: true,
        skipEmptyLines: true,
        complete: results => {
          results.data.forEach(question => {
            state.currentDeck.push(question);
            state.deckMetadata.push({
              deckIndex: index,
              deckName: state.decks[index].name
            });
          });
          resolve();
        }
      });
    });
  });

  await Promise.all(loadPromises);
  
  updateDeckDisplay();
  generateRanges(state.currentDeck.length);
  state.currentRangeIndex = 0;
  state.currentIndex = state.ranges[0].start;
  
  if (state.isShuffleEnabled) {
    shuffleCurrentRange();
  }
  
  updateRangeLabel();
  showQuestion();
}

function updateDeckDisplay() {
  const deckNames = state.selectedDeckIndices
    .map(i => state.decks[i].name)
    .join(' + ');
  
  document.getElementById('deckName').textContent = deckNames;
  
  const infoEl = document.getElementById('activeDeckInfo');
  if (infoEl) {
  infoEl.textContent = `アクティブ: ${state.currentDeck.length} 問題（${state.selectedDeckIndices.length} デッキから）`;

  }
}

// ================================
// NAVIGATION DECKS (Simple)
// ================================

function prevDeck() {
  if (state.selectedDeckIndices.length > 1) {
alert('ℹ️ マルチデッキモードが有効です。セレクターを使用してください。');
    return;
  }
  
  const currentIndex = state.selectedDeckIndices[0];
  const newIndex = (currentIndex - 1 + state.decks.length) % state.decks.length;
  state.selectedDeckIndices = [newIndex];
  loadCombinedDecks();
}

function nextDeck() {
  if (state.selectedDeckIndices.length > 1) {
    alert('ℹ️ Mode multi-deck actif. Utilisez le sélecteur.');
    return;
  }
  
  const currentIndex = state.selectedDeckIndices[0];
  const newIndex = (currentIndex + 1) % state.decks.length;
  state.selectedDeckIndices = [newIndex];
  loadCombinedDecks();
}

// ================================
// GESTION DES RANGES
// ================================

function generateRanges(totalQuestions) {
  state.ranges = [];
  
  // Range "all"
  state.ranges.push({
    name: 'all',
    start: 0,
    end: totalQuestions - 1
  });
  
  // Ranges par blocs
  for (let i = 0; i < totalQuestions; i += state.rangeSize) {
    state.ranges.push({
      name: `${i + 1}–${Math.min(i + state.rangeSize, totalQuestions)}`,
      start: i,
      end: Math.min(i + state.rangeSize - 1, totalQuestions - 1)
    });
  }
}

function updateRangeLabel() {
  const r = state.ranges[state.currentRangeIndex];
  document.getElementById('rangeLabel').textContent = `Range : ${r.start + 1}–${r.end + 1}`;
}

function prevRange() {
  resetProgress();
  state.currentRangeIndex = (state.currentRangeIndex - 1 + state.ranges.length) % state.ranges.length;
  state.currentIndex = state.ranges[state.currentRangeIndex].start;
  updateRangeLabel();
  showQuestion();
}

function nextRange() {
  resetProgress();
  state.currentRangeIndex = (state.currentRangeIndex + 1) % state.ranges.length;
  state.currentIndex = state.ranges[state.currentRangeIndex].start;
  updateRangeLabel();
  showQuestion();
}

function updateRangeSizeFromSlider() {
  const slider = document.getElementById('rangeSizeSlider');
  const label = document.getElementById('rangeSizeLabel');
  const index = parseInt(slider.value);
  
  state.rangeSize = CONFIG.RANGE_OPTIONS[index];
  label.textContent = state.rangeSize;
  generateRanges(state.currentDeck.length);
}

// ================================
// SHUFFLE
// ================================

function shuffleCurrentRange() {
  const r = state.ranges[state.currentRangeIndex];
  state.originalRange = state.currentDeck.slice(r.start, r.end + 1);

  const shuffled = [...state.originalRange];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  for (let i = 0; i < shuffled.length; i++) {
    state.currentDeck[r.start + i] = shuffled[i];
  }

  state.currentIndex = r.start;
  resetProgress();
  updateProgressDisplay();
  showQuestion();
}

function restoreOriginalRange() {
  const r = state.ranges[state.currentRangeIndex];
  
  if (state.originalRange.length > 0) {
    for (let i = 0; i < state.originalRange.length; i++) {
      state.currentDeck[r.start + i] = state.originalRange[i];
    }
  }

  state.currentIndex = r.start;
  resetProgress();
  updateProgressDisplay();
  showQuestion();
}

// ================================
// AFFICHAGE QUESTIONS
// ================================

function showQuestion() {
  const r = state.ranges[state.currentRangeIndex];
  
  // 🚫 En mode Conquest, ne jamais afficher la fin de range
  if (!state.conquestEnabled && (state.currentIndex > r.end || state.currentIndex >= state.currentDeck.length)) {
    showEndOfRange();
    return;
  }

  document.getElementById('endOfRangeOptions').style.display = 'none';
  
  const question = state.currentDeck[state.currentIndex].Question;
  const correctAnswer = state.currentDeck[state.currentIndex].Answers;

  if (state.isChoiceMode) {
    showMultipleChoiceQuestion(question, correctAnswer);
  } else {
    showTextQuestion(question);
  }
}

function showTextQuestion(question) {
  document.getElementById('question').innerHTML = formatText(question);
  document.getElementById('instructions').textContent = '';
  document.getElementById('comment').textContent = '';
  document.getElementById('result').textContent = '';
  
  const input = document.querySelector('#textMode input');
  input.value = '';
  input.focus();
}

function showMultipleChoiceQuestion(question, correctAnswer) {
  state.currentChoices = generateMultipleChoices(correctAnswer, state.currentDeck);
  
  const choicesHTML = state.currentChoices
    .map((choice, i) => `${i + 1}. ${choice}`)
    .join('　');
  
  document.getElementById('questionChoice').innerHTML = formatText(question);
  document.getElementById('choices').innerHTML = choicesHTML;
  
  const input = document.querySelector('#choiceMode input');
  input.value = '';
  input.focus();
}

function generateMultipleChoices(correctAnswer, deck) {
  const choices = new Set();
  choices.add(correctAnswer);

  // Identifier le deck d'origine
  const currentQuestionDeck = state.deckMetadata[state.currentIndex]?.deckIndex;

  // Filtrer les questions du même deck
  const sameDeckIndices = state.deckMetadata
    .map((meta, idx) => meta.deckIndex === currentQuestionDeck ? idx : -1)
    .filter(idx => idx !== -1);

  // Pool de candidats (même deck si possible, sinon tous)
  const candidatePool = sameDeckIndices.length >= CONFIG.MC_CHOICES_COUNT 
    ? sameDeckIndices 
    : Array.from({length: deck.length}, (_, i) => i);

  let attempts = 0;
  const maxAttempts = 100;

  while (choices.size < CONFIG.MC_CHOICES_COUNT && attempts < maxAttempts) {
    const randomPoolIndex = Math.floor(Math.random() * candidatePool.length);
    const randomIndex = candidatePool[randomPoolIndex];
    const candidate = deck[randomIndex]?.Answers;
    
    if (candidate && candidate !== correctAnswer && !choices.has(candidate)) {
      choices.add(candidate);
    }
    attempts++;
  }

  // Fallback: compléter avec n'importe quelle réponse
  while (choices.size < CONFIG.MC_CHOICES_COUNT) {
    const randomIndex = Math.floor(Math.random() * deck.length);
    const candidate = deck[randomIndex]?.Answers;
    if (candidate && candidate !== correctAnswer && !choices.has(candidate)) {
      choices.add(candidate);
    }
  }

  return Array.from(choices).sort(() => Math.random() - 0.5);
}

function showEndOfRange() {
  document.getElementById('question').innerHTML = "🎉 Fin de la range.";
  document.getElementById('questionChoice').innerHTML = "🎉 Fin de la range.";
  document.getElementById('endOfRangeOptions').style.display = 'block';
}

function formatText(text) {
  return text.replace(/__([^_]+)__/g, '<u>$1</u>');
}

// ================================
// VALIDATION RÉPONSES
// ================================

function normalizeAnswer(answer) {
  try {
    return wanakana.toHiragana(answer.trim().toLowerCase());
  } catch (error) {
    console.warn('Wanakana conversion failed:', error);
    return answer.trim().toLowerCase();
  }
}

function checkAnswer(userInput) {
  const rawAnswers = state.currentDeck[state.currentIndex].Answers || '';
  const possibleAnswers = rawAnswers
    .replace(/"/g, '')
    .split(',')
    .map(ans => normalizeAnswer(ans));
  
  const userAnswer = normalizeAnswer(userInput);
  return possibleAnswers.includes(userAnswer);
}

function handleTextAnswer(input) {
  const r = state.ranges[state.currentRangeIndex];
  
  // 🚫 En mode Conquest, pas de limite de range
  if (!state.conquestEnabled && (state.currentIndex > r.end || state.currentIndex >= state.currentDeck.length)) {
    return;
  }

  const inputValue = input.value.trim();

  // Mode Conquest
  if (state.conquestEnabled) {
    if (inputValue === '') {
      // Skip = mauvaise réponse pour le calcul du %
      processConquestAnswer(false); // 🔴 Skip compte comme échec
    } else {
      const isCorrect = checkAnswer(inputValue);
      processConquestAnswer(isCorrect);
    }
    showConquestQuestion();
    updateProgressDisplay();
    updateConquestProgress();
    return;
  }

  // Mode Normal - Skip
  if (inputValue === '') {
    state.currentDeck[state.currentIndex].userAnswer = 'skipped';
    state.skippedCount++;
    showAnswerFeedback('▶️');
    state.currentIndex++;
    showQuestion();
    updateProgressDisplay();
    return;
  }

  // Mode Normal - Réponse
  const isCorrect = checkAnswer(inputValue);
  if (isCorrect) {
    state.currentDeck[state.currentIndex].userAnswer = 'correct';
    state.correctCount++;
    showAnswerFeedback('✅');
    state.currentIndex++;
    showQuestion();
    updateProgressDisplay();
  } else {
    showAnswerFeedback('❌');
    input.value = '';
  }
}

function handleChoiceAnswer(input) {
  const r = state.ranges[state.currentRangeIndex];
  
  // 🚫 En mode Conquest, pas de limite de range
  if (!state.conquestEnabled && (state.currentIndex > r.end || state.currentIndex >= state.currentDeck.length)) {
    return;
  }

  const inputValue = input.value.trim();

  // Mode Conquest
  if (state.conquestEnabled) {
    if (inputValue === '') {
      // Skip = mauvaise réponse pour le calcul du %
      processConquestAnswer(false); // 🔴 Skip compte comme échec
      showConquestQuestion();
      updateProgressDisplay();
      updateConquestProgress();
      return;
    }

    const choiceIndex = parseInt(inputValue, 10) - 1;
    
    if (isNaN(choiceIndex) || !state.currentChoices[choiceIndex]) {
      input.value = '';
      return;
    }

    const selectedAnswer = normalizeAnswer(state.currentChoices[choiceIndex]);
    const correctAnswers = (state.currentDeck[state.currentIndex].Answers || '')
      .replace(/"/g, '')
      .split(',')
      .map(ans => normalizeAnswer(ans));
    
    const isCorrect = correctAnswers.includes(selectedAnswer);
    processConquestAnswer(isCorrect);
    showConquestQuestion();
    updateProgressDisplay();
    updateConquestProgress();
    return;
  }

  // Mode Normal - Skip
  if (inputValue === '') {
    state.currentDeck[state.currentIndex].userAnswer = 'skipped';
    state.skippedCount++;
    showAnswerFeedback('▶️');
    state.currentIndex++;
    showQuestion();
    updateProgressDisplay();
    return;
  }

  // Mode Normal - Réponse
  const choiceIndex = parseInt(inputValue, 10) - 1;
  
  if (isNaN(choiceIndex) || !state.currentChoices[choiceIndex]) {
    input.value = '';
    return;
  }

  const selectedAnswer = normalizeAnswer(state.currentChoices[choiceIndex]);
  const correctAnswers = (state.currentDeck[state.currentIndex].Answers || '')
    .replace(/"/g, '')
    .split(',')
    .map(ans => normalizeAnswer(ans));
  
  const isCorrect = correctAnswers.includes(selectedAnswer);

  if (isCorrect) {
    state.currentDeck[state.currentIndex].userAnswer = 'correct';
    state.correctCount++;
    showAnswerFeedback('✅');
    state.currentIndex++;
    showQuestion();
    updateProgressDisplay();
  } else {
    showAnswerFeedback('❌');
    input.value = '';
  }
}

function showAnswerFeedback(symbol) {
  const feedback = document.getElementById('answerFeedback');
  feedback.textContent = symbol;
  feedback.style.opacity = 1;

  setTimeout(() => {
    feedback.style.opacity = 0;
    feedback.textContent = '';
  }, 250);
}

// ================================
// PROGRESSION & STATISTIQUES
// ================================

function resetProgress() {
  state.correctCount = 0;
  state.skippedCount = 0;
}

function updateProgressDisplay() {
  const r = state.ranges[state.currentRangeIndex];
  const totalInRange = r.end - r.start + 1;
  const answered = Math.min(state.currentIndex - r.start, totalInRange);
  const percent = Math.floor((answered / totalInRange) * 100);

  document.getElementById('progressDisplay').textContent =
    `${state.correctCount} / ${totalInRange} (${percent}%) | ${state.skippedCount} skipped`;
}

function restartCurrentRange() {
  const r = state.ranges[state.currentRangeIndex];
  state.currentIndex = r.start;
  resetProgress();
  document.getElementById('endOfRangeOptions').style.display = 'none';
  updateProgressDisplay();
  showQuestion();
}

function reviewSkipped() {
  const r = state.ranges[state.currentRangeIndex];
  const skippedIndices = [];

  for (let i = r.start; i <= r.end; i++) {
    const answer = state.currentDeck[i].userAnswer;
    if (!answer || answer === 'skipped') {
      skippedIndices.push(i);
    }
  }

  if (skippedIndices.length === 0) {
    alert("Aucune question skippée à revoir !");
    return;
  }

  state.currentDeck = skippedIndices.map(i => state.currentDeck[i]);
  state.deckMetadata = skippedIndices.map(i => state.deckMetadata[i]);
  generateRanges(state.currentDeck.length);
  state.currentRangeIndex = 0;
  state.currentIndex = 0;
  resetProgress();
  document.getElementById('endOfRangeOptions').style.display = 'none';
  updateRangeLabel();
  updateProgressDisplay();
  showQuestion();
}

// ================================
// MODE CONQUEST
// ================================

function initializeConquestQueue() {
  const r = state.ranges[state.currentRangeIndex];
  state.conquestQueue = [];
  state.conquestStats = {};

  for (let i = r.start; i <= r.end; i++) {
    state.conquestQueue.push(i);
    // Stats: correct = bonnes réponses, total = total de tentatives
    state.conquestStats[i] = { correct: 0, total: 0 };
  }

  state.currentIndex = state.conquestQueue[0];
}

function startConquestMode() {
  toggleConquestLock(true);

  let countdown = 3;
  const countdownInterval = setInterval(() => {
    if (countdown > 0) {
      document.getElementById('question').innerHTML = `⏳ Conquest mode in ${countdown}...`;
      countdown--;
    } else {
      clearInterval(countdownInterval);
      initializeConquestQueue();
      
      if (state.conquestQueue.length === 0) {
        document.getElementById('question').innerHTML = '🏆 Conquest end !';
        toggleConquestLock(false);
        return;
      }
      
      showConquestQuestion();
    }
  }, 1000);
}

function showConquestQuestion() {
  if (state.conquestQueue.length === 0) {
    document.getElementById('question').innerHTML = '🏆 Conquest terminé !';
    document.getElementById('questionChoice').innerHTML = '🏆 Conquest terminé !';
    
    // 🔄 Réinitialiser les inputs
    document.getElementById('answerInput').value = '';
    document.getElementById('answerInput2').value = '';
    
    state.conquestEnabled = false;
    document.getElementById('conquestToggle').checked = false;
    toggleConquestLock(false);
    return;
  }

  state.currentIndex = state.conquestQueue[0];
  showQuestion();
  updateConquestProgress();
}

// À ajouter quelque part lors de l'init du deck
// Chaque carte a ces champs pour la nouvelle règle
// { progressPercent: 0, consecutiveWrong: 0, lastWrongStreak: 0, postWrongSuccess: 0, attempts: 0, correct: 0, total: 0 }
function initializeConquestQueue() {
  const r = state.ranges[state.currentRangeIndex];
  state.conquestQueue = [];
  state.conquestStats = {};

  for (let i = r.start; i <= r.end; i++) {
    state.conquestQueue.push(i);
    // Stats initialisées pour la nouvelle logique
    state.conquestStats[i] = {
      progressPercent: 0,
      consecutiveWrong: 0,
      lastWrongStreak: 0,
      postWrongSuccess: 0,
      attempts: 0,
      correct: 0,
      total: 0
    };
  }

  state.currentIndex = state.conquestQueue[0];
}

function startConquestMode() {
  toggleConquestLock(true);

  let countdown = 3;
  const countdownInterval = setInterval(() => {
    if (countdown > 0) {
      document.getElementById('question').innerHTML = `⏳ Conquest mode in ${countdown}...`;
      countdown--;
    } else {
      clearInterval(countdownInterval);
      initializeConquestQueue();
      
      if (state.conquestQueue.length === 0) {
        document.getElementById('question').innerHTML = '🏆 Conquest end !';
        toggleConquestLock(false);
        return;
      }
      
      showConquestQuestion();
    }
  }, 1000);
}

function showConquestQuestion() {
  if (state.conquestQueue.length === 0) {
    document.getElementById('question').innerHTML = '🏆 Conquest terminé !';
    document.getElementById('questionChoice').innerHTML = '🏆 Conquest terminé !';
    
    // 🔄 Réinitialiser les inputs
    document.getElementById('answerInput').value = '';
    document.getElementById('answerInput2').value = '';
    
    state.conquestEnabled = false;
    document.getElementById('conquestToggle').checked = false;
    toggleConquestLock(false);
    return;
  }

  state.currentIndex = state.conquestQueue[0];
  showQuestion();
  updateConquestProgress();
}

// === Nouvelle logique ===
function ensureConquestStats(index) {
  if (!state.conquestStats[index]) {
    state.conquestStats[index] = {
      progressPercent: 0,
      consecutiveWrong: 0,
      lastWrongStreak: 0,
      postWrongSuccess: 0,
      attempts: 0,
      correct: 0,
      total: 0
    };
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function processConquestAnswer(isCorrect) {
  const idx = state.currentIndex;
  ensureConquestStats(idx);
  const stats = state.conquestStats[idx];

  stats.total++;
  const isFirstAttempt = stats.attempts === 0;
  stats.attempts++;

  if (isCorrect) {
    stats.correct++;

    if (isFirstAttempt) {
      // ✅ Bon du premier coup → sortie immédiate
      state.conquestQueue.shift();
      showAnswerFeedback('🎯');
      return;
    }

    if (stats.lastWrongStreak > 0) {
      // Séquence de rattrapage
      stats.postWrongSuccess++;
      const k = stats.lastWrongStreak;
      const j = stats.postWrongSuccess;
      const step = 50 / k;
      stats.progressPercent = round2(Math.min(100, 50 + (j - 1) * step));

      stats.consecutiveWrong = 0;

      const finishedSequence = j >= (k + 1);
      if (stats.progressPercent >= state.conquestThreshold || finishedSequence) {
        state.conquestQueue.shift();
        showAnswerFeedback('🎯');
        return;
      }

      // Réinsertion
      const cardIndex = state.conquestQueue.shift();
      const insertPosition = Math.min(
        state.conquestSpacingModifier,
        state.conquestQueue.length
      );
      state.conquestQueue.splice(insertPosition, 0, cardIndex);
      showAnswerFeedback('✅');
      return;
    } else {
      // Pas d’erreurs avant → maîtrise
      stats.progressPercent = 100;
      state.conquestQueue.shift();
      showAnswerFeedback('🎯');
      return;
    }
  } else {
    // ❌ Mauvaise réponse
    stats.consecutiveWrong++;
    stats.lastWrongStreak = stats.consecutiveWrong;
    stats.postWrongSuccess = 0;
    stats.progressPercent = 0;

    const cardIndex = state.conquestQueue.shift();
    const insertPosition = Math.min(
      state.conquestSpacingModifier,
      state.conquestQueue.length
    );
    state.conquestQueue.splice(insertPosition, 0, cardIndex);
    showAnswerFeedback('❌');
  }
}

function updateConquestProgress() {
  const progressEl = document.getElementById('conquestProgress');

  if (!state.conquestEnabled) {
    progressEl.textContent = '';
    return;
  }

  const idx = state.currentIndex;
  ensureConquestStats(idx);
  const stats = state.conquestStats[idx];

  const totalCards = Object.keys(state.conquestStats).length;
  const masteredCards = totalCards - state.conquestQueue.length;
  const overallPercent = Math.floor((masteredCards / totalCards) * 100);
  const remaining = state.conquestQueue.length;

  if (!stats || stats.attempts === 0) {
    progressEl.innerHTML = `
<div style="color: ${overallPercent >= 75 ? 'green' : 'orange'};">
  📊 全体: ${masteredCards}/${totalCards} (${overallPercent}%)
</div>
<div style="color: gray;">
  <!--🆕 このカード: 100%（未挑戦 - 最初の正解で終了）
</div>-->
    `;
    return;
  }

  const k = stats.lastWrongStreak;
  const j = stats.postWrongSuccess;
  const stepsLeft = k > 0 ? Math.max(0, (k + 1) - j) : 0;
  const cardPercent = Math.floor(stats.progressPercent);
  const full = Math.floor((cardPercent / state.conquestThreshold) * 100);

  progressEl.innerHTML = `
<div style="color: ${overallPercent >= 75 ? 'green' : 'orange'};">
  📊 全体: ${masteredCards}/${totalCards} (${overallPercent}%) | 残り ${remaining}
</div>
<div style="color: ${cardPercent >= state.conquestThreshold ? 'green' : 'red'};">
  🎯 このカード: (${stats.correct}/${stats.total}) ${cardPercent}/${state.conquestThreshold}% (${full}%)
  <!--${k > 0 ? `<div style="color: gray;">直前の誤答連続: ${k} | 成功数: ${j} | 残り復習回数: ${stepsLeft}</div>` : ''}
</div>-->
  `;
}

function updateConquestThreshold(value) {
  state.conquestThreshold = parseInt(value);
  document.getElementById('thresholdValue').textContent = `${state.conquestThreshold}%`;
}

function updateConquestSpacing(value) {
  state.conquestSpacingModifier = parseInt(value);
  document.getElementById('spacingValue').textContent = `${state.conquestSpacingModifier}x`;
}


function toggleConquestLock(lock) {
  const elements = [
    document.getElementById('prevDeckBtn'),
    document.getElementById('nextDeckBtn'),
    document.getElementById('shuffleToggle')?.closest('.mode-toggle'),
    document.getElementById('modeToggle')?.closest('.mode-toggle'),
    document.getElementById('rangeSizeSelector'),
    document.getElementById('prevRangeBtn'),
    document.getElementById('nextRangeBtn'),
    document.getElementById('deckSelector'),
    document.getElementById('endOfRangeOptions'),
    document.getElementById('applyDeckBtn'),
    document.getElementById('resetDeckBtn'),
    document.getElementById('conquestSettings'),
    document.getElementById('loadConquestBtn'),
    document.getElementById('restartRangeBtn'),
    document.getElementById('reviewSkippedBtn')
  ];

  elements.forEach(el => {
    if (el) {
      el.style.display = lock ? 'none' : '';
      if (el.tagName === 'BUTTON') {
        el.disabled = lock;
      }
    }
  });

  // Hide progress display in conquest mode
  const progressDisplay = document.getElementById('progressDisplay');
  if (progressDisplay) {
    progressDisplay.style.display = lock ? 'none' : '';
  }
}


// ================================
// SAUVEGARDE / CHARGEMENT CONQUEST
// ================================

function saveConquestPrompt() {
  const name = prompt('Nom de la session:');
  if (!name) return;

  state.conquestSessionData = {
    name: name,
    timestamp: new Date().toISOString(),
    queue: [...state.conquestQueue],
    stats: JSON.parse(JSON.stringify(state.conquestStats)),
    threshold: state.conquestThreshold,
    spacing: state.conquestSpacingModifier,
    deckIndices: [...state.selectedDeckIndices],
    rangeIndex: state.currentRangeIndex
  };

  const dataStr = JSON.stringify(state.conquestSessionData, null, 2);
  const blob = new Blob([dataStr], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `conquest_${name}_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  alert(`✅ Session "${name}" exportée !`);
}

function loadConquestPrompt() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        
        state.conquestQueue = data.queue;
        state.conquestStats = data.stats;
        state.conquestThreshold = data.threshold;
        state.conquestSpacingModifier = data.spacing;
        state.conquestSessionData = data;

        if (data.deckIndices) {
          state.selectedDeckIndices = data.deckIndices;
          
          // Mettre à jour les checkboxes
          document.querySelectorAll('.deck-checkbox').forEach((cb, i) => {
            cb.checked = data.deckIndices.includes(i);
          });
          
          await loadCombinedDecks();
          
          if (data.rangeIndex !== undefined) {
            state.currentRangeIndex = data.rangeIndex;
            updateRangeLabel();
          }
          
          state.conquestEnabled = true;
          document.getElementById('conquestToggle').checked = true;
          toggleConquestLock(true);
          showConquestQuestion();
          alert(`✅ Session "${data.name}" chargée !`);
        }
      } catch (err) {
        alert('❌ Fichier invalide !');
        console.error(err);
      }
    };
    reader.readAsText(file);
  };
  
  input.click();
}

// ================================
// EVENT LISTENERS
// ================================

function initEventListeners() {
  // Range size slider
  const rangeSizeSlider = document.getElementById('rangeSizeSlider');
  if (rangeSizeSlider) {
    rangeSizeSlider.addEventListener('input', updateRangeSizeFromSlider);
  }

  // Text mode input
  document.getElementById('answerInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleTextAnswer(e.target);
    }
  });

  // Choice mode input
  document.getElementById('answerInput2').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleChoiceAnswer(e.target);
    }
  });

  // Mode toggle
  document.getElementById('modeToggle').addEventListener('click', () => {
    state.isChoiceMode = !state.isChoiceMode;
    document.getElementById('textMode').style.display = state.isChoiceMode ? 'none' : 'block';
    document.getElementById('choiceMode').style.display = state.isChoiceMode ? 'block' : 'none';
    showQuestion();
  });

  // Shuffle toggle
  document.getElementById('shuffleToggle').addEventListener('change', (e) => {
    state.isShuffleEnabled = e.target.checked;
    if (state.isShuffleEnabled) {
      shuffleCurrentRange();
    } else {
      restoreOriginalRange();
    }
  });

  // Conquest toggle
  document.getElementById('conquestToggle').addEventListener('change', (e) => {
    state.conquestEnabled = e.target.checked;
    if (state.conquestEnabled) {
      startConquestMode();
    } else {
      toggleConquestLock(false);
    }
  });

  // Conquest threshold
  document.getElementById('conquestThresholdInput').addEventListener('input', (e) => {
    updateConquestThreshold(e.target.value);
  });

  // Conquest spacing
  document.getElementById('conquestSpacingInput').addEventListener('input', (e) => {
    updateConquestSpacing(e.target.value);
  });
}

// ================================
// EVENT LISTENERS - BOUTONS
// ================================

function initButtonListeners() {
  // Deck selection
  document.getElementById('applyDeckBtn')?.addEventListener('click', applyDeckSelection);
  document.getElementById('resetDeckBtn')?.addEventListener('click', resetDeckSelection);
  
  // Deck navigation
  document.getElementById('prevDeckBtn')?.addEventListener('click', prevDeck);
  document.getElementById('nextDeckBtn')?.addEventListener('click', nextDeck);
  
  // Range navigation
  document.getElementById('prevRangeBtn')?.addEventListener('click', prevRange);
  document.getElementById('nextRangeBtn')?.addEventListener('click', nextRange);
  
  // End of range
  document.getElementById('restartRangeBtn')?.addEventListener('click', restartCurrentRange);
  document.getElementById('reviewSkippedBtn')?.addEventListener('click', reviewSkipped);
  
  // Conquest save/load
  document.getElementById('saveConquestBtn')?.addEventListener('click', saveConquestPrompt);
  document.getElementById('loadConquestBtn')?.addEventListener('click', loadConquestPrompt);
}

// ================================
// INITIALISATION
// ================================

function init() {
  loadDeckPaths();
  initDeckSelector();
  initEventListeners();
  initButtonListeners(); // ✅ AJOUTER CETTE LIGNE
  loadCombinedDecks();
}

init();