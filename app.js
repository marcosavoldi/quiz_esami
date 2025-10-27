// ==================== //
// Firebase Configuration & Imports
// ==================== //
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
    getAuth, 
    signInWithPopup, 
    GoogleAuthProvider, 
    onAuthStateChanged,
    signOut 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { 
    getFirestore, 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs, 
    query, 
    orderBy, 
    limit,
    enableIndexedDbPersistence 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyDVnwZmJkfrhRol2cNxZthNOI4nO177Tt0",
    authDomain: "quiz-esame-f4316.firebaseapp.com",
    projectId: "quiz-esame-f4316",
    storageBucket: "quiz-esame-f4316.firebasestorage.app",
    messagingSenderId: "554987099603",
    appId: "1:554987099603:web:437e96159f85b2c20b4b26",
    measurementId: "G-5DPWMC7HBR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Enable offline persistence
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
        console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
    } else if (err.code === 'unimplemented') {
        console.warn('The current browser doesn\'t support offline persistence');
    }
});

// ==================== //
// Global State
// ==================== //
const AppState = {
    currentUser: null,
    examData: null,
    currentTest: null,
    userAnswers: {},
    isOnline: navigator.onLine,
    pendingSync: [],
    stats: null
};

// ==================== //
// Utility Functions
// ==================== //
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="material-icons">${type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info'}</span>
        <span>${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function formatDate(timestamp) {
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('it-IT', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function shuffleArray(array) {
    const arr = [...array];
    
    // Fisher-Yates shuffle con seed temporale per maggiore casualità
    // Usa timestamp + Math.random() per garantire varietà
    const seed = Date.now() + Math.random() * 1000;
    
    for (let i = arr.length - 1; i > 0; i--) {
        // Usa multiple fonti di casualità
        const random1 = Math.random();
        const random2 = (seed * random1) % 1;
        const j = Math.floor((random1 + random2) / 2 * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    
    // Shuffle una seconda volta per maggiore randomizzazione
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    
    return arr;
}

function getLocalStorageKey(key) {
    const examId = AppState.examData?.examInfo?.id || 'default';
    return `${examId}_${key}`;
}

// ==================== //
// Load Exam Data
// ==================== //
async function loadExamData() {
    try {
        const response = await fetch('domande.json');
        const data = await response.json();
        
        // Check if data has examInfo, otherwise create default
        if (!data.examInfo) {
            AppState.examData = {
                examInfo: {
                    id: 'default_exam',
                    name: 'Quiz Esame',
                    version: '1.0',
                    questionsPerTest: 24,
                    passingScore: 18
                },
                questions: data
            };
        } else {
            AppState.examData = data;
        }
        
        // Update UI with exam info
        document.getElementById('exam-title').textContent = AppState.examData.examInfo.name;
        document.getElementById('exam-subtitle').textContent = 
            `${AppState.examData.questions.length} domande disponibili`;
        
        return true;
    } catch (error) {
        console.error('Error loading exam data:', error);
        showToast('Errore nel caricamento delle domande', 'error');
        return false;
    }
}

// ==================== //
// Authentication
// ==================== //
function setupAuthListeners() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            AppState.currentUser = user;
            await onUserLoggedIn(user);
        } else {
            AppState.currentUser = null;
            showLoginScreen();
        }
    });
}

async function onUserLoggedIn(user) {
    // Update UI with user info
    const avatarUrls = [
        document.getElementById('user-avatar'),
        document.getElementById('nav-avatar'),
        document.getElementById('settings-avatar')
    ];
    
    avatarUrls.forEach(img => {
        if (img) {
            img.src = user.photoURL || '';
            img.classList.remove('hidden');
        }
    });
    
    document.getElementById('user-icon')?.classList.add('hidden');
    document.getElementById('nav-username').textContent = user.displayName || 'Utente';
    document.getElementById('nav-email').textContent = user.email;
    document.getElementById('settings-username').textContent = user.displayName || 'Utente';
    document.getElementById('settings-email').textContent = user.email;
    
    // Load exam data
    const loaded = await loadExamData();
    if (!loaded) return;
    
    // Update settings with exam info
    document.getElementById('settings-exam-name').textContent = AppState.examData.examInfo.name;
    document.getElementById('settings-total-questions').textContent = AppState.examData.questions.length;
    document.getElementById('settings-passing-score').textContent = 
        `${AppState.examData.examInfo.passingScore}/${AppState.examData.examInfo.questionsPerTest}`;
    
    // Load user stats
    await loadUserStats();
    
    // Sync pending data
    if (AppState.isOnline) {
        await syncPendingData();
    }
    
    // Show app
    showApp();
}

function showLoginScreen() {
    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
}

function showApp() {
    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    
    // Navigate to home
    navigateTo('home');
}

document.getElementById('google-login-btn')?.addEventListener('click', async () => {
    try {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error('Login error:', error);
        showToast('Errore durante il login', 'error');
    }
});

document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try {
        await signOut(auth);
        showToast('Logout effettuato', 'success');
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Errore durante il logout', 'error');
    }
});

// ==================== //
// Navigation
// ==================== //
function setupNavigation() {
    // Menu button
    document.getElementById('menu-btn')?.addEventListener('click', () => {
        document.getElementById('nav-drawer').classList.add('open');
        document.getElementById('drawer-overlay').classList.add('active');
    });
    
    // Close drawer
    document.getElementById('drawer-overlay')?.addEventListener('click', closeDrawer);
    
    // Nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const view = link.dataset.view;
            navigateTo(view);
            closeDrawer();
        });
    });
    
    // Hash change
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.slice(1) || 'home';
        navigateTo(hash);
    });
}

function closeDrawer() {
    document.getElementById('nav-drawer').classList.remove('open');
    document.getElementById('drawer-overlay').classList.remove('active');
}

function navigateTo(view) {
    // Update active view
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${view}`)?.classList.add('active');
    
    // Update nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.view === view);
    });
    
    // Update URL
    window.location.hash = view;
    
    // Update header title
    const titles = {
        home: 'Home',
        test: 'Test in Corso',
        stats: 'Statistiche',
        settings: 'Impostazioni'
    };
    document.getElementById('header-title').textContent = titles[view] || 'Quiz Esame';
    
    // View-specific actions
    if (view === 'stats') {
        loadStats();
    }
}

// ==================== //
// Quiz Logic
// ==================== //
function startNewTest() {
    const questionsPerTest = AppState.examData.examInfo.questionsPerTest;
    const allQuestions = AppState.examData.questions;
    
    if (allQuestions.length < questionsPerTest) {
        showToast('Non ci sono abbastanza domande!', 'error');
        return;
    }
    
    // Shuffle and select questions
    const shuffled = shuffleArray(allQuestions);
    AppState.currentTest = shuffled.slice(0, questionsPerTest);
    AppState.userAnswers = {};
    
    // Navigate to test view
    navigateTo('test');
    
    // Reset and show test-actions
    const testActions = document.querySelector('.test-actions');
    if (testActions) {
        testActions.style.display = 'flex';
    }
    
    // Reset submit button
    const submitBtn = document.getElementById('submit-test-btn');
    if (submitBtn) {
        submitBtn.classList.add('hidden');
    }
    
    // Remove review mode classes from previous test
    setTimeout(() => {
        document.querySelectorAll('.question-card').forEach(card => {
            card.classList.remove('review-mode', 'correct', 'incorrect', 'answered');
        });
    }, 100);
    
    renderTest();
}

function renderTest() {
    const container = document.getElementById('questions-container');
    container.innerHTML = '';
    
    // Render ALL questions at once
    AppState.currentTest.forEach((question, index) => {
        const card = createQuestionCard(question, index);
        container.appendChild(card);
    });
    
    // Show test actions
    const testActions = document.querySelector('.test-actions');
    if (testActions) {
        testActions.classList.remove('hidden');
    }
    
    updateTestUI();
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function createQuestionCard(question, index) {
    const card = document.createElement('div');
    card.className = 'question-card';
    card.id = `question-${index}`;
    
    if (AppState.userAnswers[question.id] !== undefined) {
        card.classList.add('answered');
    }
    
    const optionsList = question.opzioni.map((option, optIndex) => {
        const isSelected = AppState.userAnswers[question.id] === optIndex;
        return `
            <label class="option-label ${isSelected ? 'selected' : ''}" data-question-id="${question.id}" data-option="${optIndex}">
                <input type="radio" 
                       name="question_${question.id}" 
                       value="${optIndex}"
                       ${isSelected ? 'checked' : ''}>
                <span class="option-text">${option}</span>
            </label>
        `;
    }).join('');
    
    card.innerHTML = `
        <span class="question-number">Domanda ${index + 1}</span>
        <div class="question-text">${question.domanda}</div>
        <div class="options-list">
            ${optionsList}
        </div>
    `;
    
    // Add event listeners
    card.querySelectorAll('.option-label').forEach(label => {
        label.addEventListener('click', () => {
            const questionId = parseInt(label.dataset.questionId);
            const optionIndex = parseInt(label.dataset.option);
            selectAnswer(questionId, optionIndex);
        });
    });
    
    return card;
}

function selectAnswer(questionId, optionIndex) {
    AppState.userAnswers[questionId] = optionIndex;
    
    // Update UI for this specific question
    const questionCards = document.querySelectorAll('.question-card');
    questionCards.forEach((card, index) => {
        const question = AppState.currentTest[index];
        if (question.id === questionId) {
            card.classList.add('answered');
            
            // Update selected option
            card.querySelectorAll('.option-label').forEach(label => {
                const optIdx = parseInt(label.dataset.option);
                label.classList.toggle('selected', optIdx === optionIndex);
                label.querySelector('input').checked = optIdx === optionIndex;
            });
        }
    });
    
    updateTestUI();
}

function updateTestUI() {
    const total = AppState.currentTest.length;
    const answered = Object.keys(AppState.userAnswers).length;
    
    // Update progress bar
    const progress = (answered / total) * 100;
    document.getElementById('progress-fill').style.width = `${progress}%`;
    
    // Update counter
    document.getElementById('question-counter').textContent = `Risposte: ${answered}/${total}`;
    
    // Show/hide submit button based on answered questions
    const submitBtn = document.getElementById('submit-test-btn');
    if (answered > 0) {
        submitBtn.classList.remove('hidden');
    }
}

async function submitTest() {
    const total = AppState.currentTest.length;
    const answered = Object.keys(AppState.userAnswers).length;
    
    if (answered < total) {
        const confirm = window.confirm(`Hai risposto solo a ${answered} domande su ${total}. Vuoi inviare comunque?`);
        if (!confirm) return;
    }
    
    // Calculate results
    let correct = 0;
    const errors = [];
    
    AppState.currentTest.forEach((question, index) => {
        const userAnswer = AppState.userAnswers[question.id];
        const correctAnswer = question.corretta - 1; // Convert to 0-indexed
        
        if (userAnswer === correctAnswer) {
            correct++;
        } else {
            errors.push({
                questionId: question.id,
                questionText: question.domanda,
                correctAnswer: question.opzioni[correctAnswer],
                userAnswer: userAnswer !== undefined ? question.opzioni[userAnswer] : 'Non risposto'
            });
        }
    });
    
    const passed = correct >= AppState.examData.examInfo.passingScore;
    const percentage = Math.round((correct / total) * 100);
    
    // Save test result
    const testResult = {
        timestamp: new Date().toISOString(),
        questionsTotal: total,
        correctAnswers: correct,
        passed: passed,
        percentage: percentage,
        errors: errors
    };
    
    await saveTestResult(testResult);
    
    // Show results
    showResults(testResult);
    
    // Enter review mode
    enterReviewMode();
}

function enterReviewMode() {
    document.querySelectorAll('.question-card').forEach((card, index) => {
        const question = AppState.currentTest[index];
        const userAnswer = AppState.userAnswers[question.id];
        const correctAnswer = question.corretta - 1;
        
        card.classList.add('review-mode');
        
        if (userAnswer === correctAnswer) {
            card.classList.add('correct');
        } else {
            card.classList.add('incorrect');
        }
        
        // Mark correct and incorrect options
        card.querySelectorAll('.option-label').forEach((label, optIndex) => {
            const input = label.querySelector('input');
            input.disabled = true;
            
            if (optIndex === correctAnswer) {
                label.classList.add('correct');
                label.innerHTML += '<span class="material-icons option-icon">check_circle</span>';
            } else if (optIndex === userAnswer && userAnswer !== correctAnswer) {
                label.classList.add('incorrect');
                label.innerHTML += '<span class="material-icons option-icon">cancel</span>';
            }
        });
    });
    
    // Hide test-actions (submit button)
    const testActions = document.querySelector('.test-actions');
    if (testActions) {
        testActions.style.display = 'none';
    }
}

function showResults(result) {
    const modal = document.getElementById('results-modal');
    const icon = document.getElementById('results-icon');
    const title = document.getElementById('results-title');
    const subtitle = document.getElementById('results-subtitle');
    const score = document.getElementById('result-score');
    const percentage = document.getElementById('result-percentage');
    
    if (result.passed) {
        icon.className = 'results-icon passed';
        icon.innerHTML = '<span class="material-icons">celebration</span>';
        title.textContent = 'Test Superato! 🎉';
        subtitle.textContent = 'Complimenti! Hai superato il test!';
    } else {
        icon.className = 'results-icon failed';
        icon.innerHTML = '<span class="material-icons">sentiment_dissatisfied</span>';
        title.textContent = 'Test Non Superato';
        subtitle.textContent = 'Continua a studiare, ce la farai!';
    }
    
    score.textContent = `${result.correctAnswers}/${result.questionsTotal}`;
    percentage.textContent = `${result.percentage}%`;
    
    modal.classList.remove('hidden');
}

// ==================== //
// Firestore Operations
// ==================== //
async function saveTestResult(result) {
    if (!AppState.currentUser) return;
    
    const examId = AppState.examData.examInfo.id;
    const userId = AppState.currentUser.uid;
    const testId = `test_${Date.now()}`;
    
    const testData = {
        ...result,
        timestamp: new Date(),
        examId: examId,
        examName: AppState.examData.examInfo.name
    };
    
    try {
        if (AppState.isOnline) {
            // Save to Firestore
            await setDoc(
                doc(db, 'users', userId, 'exams', examId, 'tests', testId),
                testData
            );
            
            // Update stats
            await updateStats(result);
            
            showToast('Test salvato con successo!', 'success');
        } else {
            // Save to localStorage for later sync
            addToPendingSync('test', testData);
            showToast('Test salvato localmente (sincronizzazione pending)', 'warning');
        }
        
        // Also save locally
        saveTestLocally(testData);
        
        // Reload stats to update UI
        await loadUserStats();
        
    } catch (error) {
        console.error('Error saving test:', error);
        showToast('Errore nel salvataggio del test', 'error');
        
        // Fallback to localStorage
        saveTestLocally(testData);
        addToPendingSync('test', testData);
    }
}

async function updateStats(result) {
    if (!AppState.currentUser) return;
    
    const examId = AppState.examData.examInfo.id;
    const userId = AppState.currentUser.uid;
    
    const statsRef = doc(db, 'users', userId, 'exams', examId, 'stats', 'aggregate');
    
    try {
        const statsDoc = await getDoc(statsRef);
        const currentStats = statsDoc.exists() ? statsDoc.data() : {
            totalTests: 0,
            passedTests: 0,
            totalQuestions: 0,
            totalCorrect: 0,
            errorsByQuestion: {}
        };
        
        // Update stats
        currentStats.totalTests += 1;
        if (result.passed) currentStats.passedTests += 1;
        currentStats.totalQuestions += result.questionsTotal;
        currentStats.totalCorrect += result.correctAnswers;
        
        // Track errors
        result.errors.forEach(error => {
            if (!currentStats.errorsByQuestion[error.questionId]) {
                currentStats.errorsByQuestion[error.questionId] = {
                    count: 0,
                    questionText: error.questionText,
                    correctAnswer: error.correctAnswer
                };
            }
            currentStats.errorsByQuestion[error.questionId].count += 1;
        });
        
        currentStats.lastUpdated = new Date();
        
        await setDoc(statsRef, currentStats);
        AppState.stats = currentStats;
        
        // Also save to localStorage
        saveStatsLocally(currentStats);
        
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

async function loadUserStats() {
    if (!AppState.currentUser) return;
    
    const examId = AppState.examData.examInfo.id;
    const userId = AppState.currentUser.uid;
    
    try {
        const statsRef = doc(db, 'users', userId, 'exams', examId, 'stats', 'aggregate');
        const statsDoc = await getDoc(statsRef);
        
        if (statsDoc.exists()) {
            AppState.stats = statsDoc.data();
        } else {
            AppState.stats = {
                totalTests: 0,
                passedTests: 0,
                totalQuestions: 0,
                totalCorrect: 0,
                errorsByQuestion: {}
            };
        }
        
        // Also try to load from localStorage as fallback
        const localStats = loadStatsLocally();
        if (localStats && (!AppState.stats || AppState.stats.totalTests === 0)) {
            AppState.stats = localStats;
        }
        
        updateHomeStats();
        
    } catch (error) {
        console.error('Error loading stats:', error);
        
        // Load from localStorage
        AppState.stats = loadStatsLocally() || {
            totalTests: 0,
            passedTests: 0,
            totalQuestions: 0,
            totalCorrect: 0,
            errorsByQuestion: {}
        };
        
        updateHomeStats();
    }
}

function updateHomeStats() {
    if (!AppState.stats) return;
    
    const stats = AppState.stats;
    const successRate = stats.totalTests > 0 
        ? Math.round((stats.passedTests / stats.totalTests) * 100) 
        : 0;
    
    document.getElementById('total-tests').textContent = stats.totalTests;
    document.getElementById('passed-tests').textContent = stats.passedTests;
    document.getElementById('success-rate').textContent = `${successRate}%`;
    
    // Load recent tests
    loadRecentTests();
}

async function loadRecentTests() {
    if (!AppState.currentUser) return;
    
    const examId = AppState.examData.examInfo.id;
    const userId = AppState.currentUser.uid;
    
    try {
        const testsRef = collection(db, 'users', userId, 'exams', examId, 'tests');
        const q = query(testsRef, orderBy('timestamp', 'desc'), limit(5));
        const snapshot = await getDocs(q);
        
        const recentTests = [];
        snapshot.forEach(doc => recentTests.push(doc.data()));
        
        displayRecentTests(recentTests);
        
    } catch (error) {
        console.error('Error loading recent tests:', error);
        
        // Load from localStorage
        const localTests = loadRecentTestsLocally();
        displayRecentTests(localTests);
    }
}

function displayRecentTests(tests) {
    const container = document.getElementById('recent-tests');
    
    if (!tests || tests.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">Nessun test effettuato ancora</p>';
        return;
    }
    
    container.innerHTML = tests.map(test => `
        <div class="recent-test-card">
            <div class="recent-test-info">
                <div class="recent-test-date">${formatDate(test.timestamp)}</div>
                <div class="recent-test-score">${test.correctAnswers}/${test.questionsTotal}</div>
            </div>
            <span class="recent-test-badge ${test.passed ? 'passed' : 'failed'}">
                ${test.passed ? 'Superato' : 'Non Superato'}
            </span>
        </div>
    `).join('');
}

// ==================== //
// Stats View
// ==================== //
function loadStats() {
    if (!AppState.stats) return;
    
    const stats = AppState.stats;
    const avgErrors = stats.totalTests > 0
        ? ((stats.totalQuestions - stats.totalCorrect) / stats.totalTests).toFixed(1)
        : 0;
    const failedTests = stats.totalTests - stats.passedTests;
    
    document.getElementById('stats-total').textContent = stats.totalTests;
    document.getElementById('stats-passed').textContent = stats.passedTests;
    document.getElementById('stats-failed').textContent = failedTests;
    document.getElementById('stats-avg-errors').textContent = avgErrors;
    
    // Load top errors
    loadTopErrors();
}

function loadTopErrors() {
    if (!AppState.stats || !AppState.stats.errorsByQuestion) return;
    
    const errors = Object.entries(AppState.stats.errorsByQuestion)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    
    const container = document.getElementById('top-errors-list');
    
    if (errors.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">Nessun dato disponibile</p>';
        return;
    }
    
    container.innerHTML = errors.map((error, index) => `
        <div class="error-card">
            <div class="error-header">
                <span style="font-weight: 600;">#${index + 1}</span>
                <span class="error-count">${error.count}x</span>
            </div>
            <div class="error-question">${error.questionText}</div>
            <div class="error-answer">
                <strong>Risposta corretta:</strong> ${error.correctAnswer}
            </div>
        </div>
    `).join('');
}

// ==================== //
// LocalStorage Operations
// ==================== //
function saveTestLocally(testData) {
    try {
        const key = getLocalStorageKey('tests');
        const tests = JSON.parse(localStorage.getItem(key) || '[]');
        tests.push(testData);
        
        // Keep only last 20 tests
        if (tests.length > 20) {
            tests.shift();
        }
        
        localStorage.setItem(key, JSON.stringify(tests));
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
}

function loadRecentTestsLocally() {
    try {
        const key = getLocalStorageKey('tests');
        const tests = JSON.parse(localStorage.getItem(key) || '[]');
        return tests.slice(-5).reverse();
    } catch (error) {
        console.error('Error loading from localStorage:', error);
        return [];
    }
}

function loadStatsLocally() {
    try {
        const key = getLocalStorageKey('stats');
        return JSON.parse(localStorage.getItem(key) || 'null');
    } catch (error) {
        console.error('Error loading stats from localStorage:', error);
        return null;
    }
}

function saveStatsLocally(stats) {
    try {
        const key = getLocalStorageKey('stats');
        localStorage.setItem(key, JSON.stringify(stats));
    } catch (error) {
        console.error('Error saving stats to localStorage:', error);
    }
}

// ==================== //
// Offline/Online Sync
// ==================== //
function addToPendingSync(type, data) {
    const key = getLocalStorageKey('pending_sync');
    const pending = JSON.parse(localStorage.getItem(key) || '[]');
    pending.push({ type, data, timestamp: Date.now() });
    localStorage.setItem(key, JSON.stringify(pending));
}

async function syncPendingData() {
    const key = getLocalStorageKey('pending_sync');
    const pending = JSON.parse(localStorage.getItem(key) || '[]');
    
    if (pending.length === 0) return;
    
    console.log(`Syncing ${pending.length} pending items...`);
    
    for (const item of pending) {
        try {
            if (item.type === 'test') {
                const examId = AppState.examData.examInfo.id;
                const userId = AppState.currentUser.uid;
                const testId = `test_${item.timestamp}`;
                
                await setDoc(
                    doc(db, 'users', userId, 'exams', examId, 'tests', testId),
                    item.data
                );
                
                await updateStats({
                    passed: item.data.passed,
                    questionsTotal: item.data.questionsTotal,
                    correctAnswers: item.data.correctAnswers,
                    errors: item.data.errors
                });
            }
        } catch (error) {
            console.error('Error syncing item:', error);
        }
    }
    
    // Clear pending
    localStorage.removeItem(key);
    showToast('Dati sincronizzati con successo!', 'success');
}

function setupOnlineOfflineListeners() {
    window.addEventListener('online', async () => {
        AppState.isOnline = true;
        document.getElementById('offline-indicator')?.classList.add('hidden');
        document.getElementById('sync-icon').textContent = 'cloud_done';
        document.getElementById('sync-status').textContent = 'Online';
        showToast('Connessione ripristinata', 'success');
        
        // Sync pending data
        if (AppState.currentUser) {
            await syncPendingData();
        }
    });
    
    window.addEventListener('offline', () => {
        AppState.isOnline = false;
        document.getElementById('offline-indicator')?.classList.remove('hidden');
        document.getElementById('sync-icon').textContent = 'cloud_off';
        document.getElementById('sync-status').textContent = 'Offline';
        showToast('Modalità offline attivata', 'warning');
    });
}

// ==================== //
// Event Listeners
// ==================== //
function setupEventListeners() {
    // Navigation
    setupNavigation();
    
    // Home
    document.getElementById('start-test-btn')?.addEventListener('click', startNewTest);
    
    // Test
    document.getElementById('submit-test-btn')?.addEventListener('click', submitTest);
    document.getElementById('quit-test-btn')?.addEventListener('click', () => {
        if (confirm('Vuoi davvero uscire? I progressi non salvati andranno persi.')) {
            navigateTo('home');
        }
    });
    
    // Results modal
    document.getElementById('review-test-btn')?.addEventListener('click', () => {
        document.getElementById('results-modal').classList.add('hidden');
        // Scroll to top to review from first question
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    
    document.getElementById('new-test-btn')?.addEventListener('click', () => {
        document.getElementById('results-modal').classList.add('hidden');
        startNewTest();
    });
    
    document.getElementById('home-btn')?.addEventListener('click', () => {
        document.getElementById('results-modal').classList.add('hidden');
        navigateTo('home');
    });
    
    // Settings
    document.getElementById('force-sync-btn')?.addEventListener('click', async () => {
        if (!AppState.isOnline) {
            showToast('Connessione offline, impossibile sincronizzare', 'error');
            return;
        }
        showToast('Sincronizzazione in corso...', 'info');
        await syncPendingData();
        await loadUserStats();
    });
    
    document.getElementById('clear-local-btn')?.addEventListener('click', () => {
        if (confirm('Vuoi davvero cancellare tutti i dati locali? I dati cloud saranno preservati.')) {
            const examId = AppState.examData?.examInfo?.id || 'default';
            Object.keys(localStorage)
                .filter(key => key.startsWith(examId))
                .forEach(key => localStorage.removeItem(key));
            showToast('Dati locali cancellati', 'success');
        }
    });
    
    document.getElementById('logout-settings-btn')?.addEventListener('click', async () => {
        if (confirm('Vuoi davvero disconnetterti?')) {
            try {
                await signOut(auth);
                showToast('Logout effettuato', 'success');
            } catch (error) {
                console.error('Logout error:', error);
                showToast('Errore durante il logout', 'error');
            }
        }
    });
}

// ==================== //
// Initialize App
// ==================== //
document.addEventListener('DOMContentLoaded', () => {
    setupAuthListeners();
    setupEventListeners();
    setupOnlineOfflineListeners();
    
    // Check initial online status
    if (!navigator.onLine) {
        document.getElementById('offline-indicator')?.classList.remove('hidden');
    }
});
