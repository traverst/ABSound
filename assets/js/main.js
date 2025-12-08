console.log("Voice Model Comparison Loaded");

class AudioParser {
    constructor(files) {
        this.files = files || [];
        this.parsed = this.parseFiles();
    }

    parseFiles() {
        return this.files.map(filename => {
            // Regex to match: (sample|test)_e(float)_cfg(float)_t(float).wav
            const match = filename.match(/(?:sample|test)_e([\d\.]+)_cfg([\d\.]+)_t([\d\.]+)\.wav$/i);

            if (match) {
                const baseUrl = window.BASE_URL || '';
                return {
                    id: filename.replace(/\.wav$/i, ''),
                    file: `${baseUrl}/assets/audio/${filename}`,
                    exaggeration: parseFloat(match[1]),
                    cfg: parseFloat(match[2]),
                    temp: parseFloat(match[3])
                };
            } else {
                console.warn(`Could not parse filename: ${filename}`);
                return null;
            }
        }).filter(item => item !== null);
    }

    getMinMax() {
        const params = ['exaggeration', 'cfg', 'temp'];
        const ranges = {};

        params.forEach(param => {
            const values = this.parsed.map(item => item[param]);
            ranges[param] = {
                min: Math.min(...values),
                max: Math.max(...values)
            };
        });

        return ranges;
    }
}

class Tournament {
    constructor(samples) {
        this.samples = samples;
        this.storageKey = 'absound_tournament_v3'; // Bump version
        this.state = this.loadState() || this.initializeState();
        this.maxDistance = this.calculateMaxDistance();
    }

    calculateMaxDistance() {
        let minEx = Infinity, maxEx = -Infinity;
        let minCfg = Infinity, maxCfg = -Infinity;
        let minTemp = Infinity, maxTemp = -Infinity;

        this.samples.forEach(s => {
            minEx = Math.min(minEx, s.exaggeration);
            maxEx = Math.max(maxEx, s.exaggeration);
            minCfg = Math.min(minCfg, s.cfg);
            maxCfg = Math.max(maxCfg, s.cfg);
            minTemp = Math.min(minTemp, s.temp);
            maxTemp = Math.max(maxTemp, s.temp);
        });

        const dEx = maxEx - minEx;
        const dCfg = maxCfg - minCfg;
        const dTemp = maxTemp - minTemp;
        return Math.sqrt(dEx * dEx + dCfg * dCfg + dTemp * dTemp);
    }

    initializeState() {
        return {
            phase: 'explore',
            matchesPlayed: 0,
            phaseMatches: 0,
            history: [],
            currentMatch: null,
            candidates: [],
            showdownQueue: []
        };
    }

    loadState() {
        const stored = localStorage.getItem(this.storageKey);
        if (!stored) return null;
        const state = JSON.parse(stored);

        // Basic validation
        const validIds = new Set(this.samples.map(s => s.id));

        // Ensure new fields exist if loading old state
        if (!state.phase) state.phase = 'explore';
        if (typeof state.phaseMatches === 'undefined') state.phaseMatches = state.matchesPlayed;

        // Re-filter history for valid IDs
        if (state.history) {
            state.history = state.history.filter(m => validIds.has(m.a) && validIds.has(m.b));
        }

        return state;
    }

    saveState() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    }

    getDistance(idA, idB) {
        const sA = this.samples.find(s => s.id === idA);
        const sB = this.samples.find(s => s.id === idB);
        if (!sA || !sB) return Infinity;
        const dEx = sA.exaggeration - sB.exaggeration;
        const dCfg = sA.cfg - sB.cfg;
        const dTemp = sA.temp - sB.temp;
        return Math.sqrt(dEx * dEx + dCfg * dCfg + dTemp * dTemp);
    }

    nextPhase() {
        if (this.state.phase === 'explore') {
            this.state.phase = 'refine';
            this.state.phaseMatches = 0;
            this.state.consecutiveWins = 0;
            console.log("Switched to Refine Phase");
        } else if (this.state.phase === 'refine') {
            this.state.phase = 'showdown';
            this.state.phaseMatches = 0;
            this.prepareShowdown();
            console.log("Switched to Showdown Phase");
        } else if (this.state.phase === 'showdown') {
            this.state.phase = 'complete';
            console.log("Tournament Complete");
        }
        this.saveState();
        return this.state.phase;
    }

    prepareShowdown() {
        // Select top 8-10 performers for final round-robin verification
        const topPerformers = this.getTopPerformers(10);

        if (topPerformers.length < 2) {
            // Fallback: if not enough data, use random samples
            topPerformers.push(...this.samples.slice(0, Math.min(8, this.samples.length)));
        }

        // Take up to 10 finalists
        const finalists = topPerformers.slice(0, Math.min(10, topPerformers.length)).map(s => s.id);
        this.state.candidates = finalists;

        // Create Round Robin for all finalists
        const queue = [];
        for (let i = 0; i < finalists.length; i++) {
            for (let j = i + 1; j < finalists.length; j++) {
                queue.push({
                    id: `showdown_${finalists[i]}_vs_${finalists[j]}`,
                    a: finalists[i],
                    b: finalists[j],
                    winner: null
                });
            }
        }
        this.state.showdownQueue = queue;
    }

    getTopPerformers(count = 10) {
        // Calculate scores for all samples based on match history
        const scores = {};

        this.samples.forEach(s => {
            scores[s.id] = { id: s.id, sample: s, wins: 0, losses: 0, ties: 0, score: 0 };
        });

        this.state.history.forEach(match => {
            if (!scores[match.a] || !scores[match.b]) return;

            if (match.winner === 'tie') {
                scores[match.a].ties++;
                scores[match.b].ties++;
            } else if (match.winner === match.a) {
                scores[match.a].wins++;
                scores[match.b].losses++;
            } else if (match.winner === match.b) {
                scores[match.b].wins++;
                scores[match.a].losses++;
            }
        });

        // Calculate final scores (wins + ties*0.5)
        Object.values(scores).forEach(s => {
            s.score = s.wins + (s.ties * 0.5);
        });

        // Return top N performers
        return Object.values(scores)
            .filter(s => s.wins + s.losses + s.ties > 0) // Only samples that have been tested
            .sort((a, b) => b.score - a.score)
            .slice(0, count)
            .map(s => s.sample);
    }

    generateExplorePair() {
        // Phase 1: Generate diverse random pairs across parameter space
        // Avoid recently tested pairs
        const recentPairs = this.state.history.slice(-20).map(m => `${m.a}_${m.b}`);
        const recentPairsReverse = this.state.history.slice(-20).map(m => `${m.b}_${m.a}`);
        const recentSet = new Set([...recentPairs, ...recentPairsReverse]);

        let attempts = 0;
        while (attempts < 50) {
            const a = this.samples[Math.floor(Math.random() * this.samples.length)];
            const b = this.samples[Math.floor(Math.random() * this.samples.length)];

            if (a.id !== b.id && !recentSet.has(`${a.id}_${b.id}`)) {
                return { a: a.id, b: b.id };
            }
            attempts++;
        }

        // Fallback: just return any two different samples
        const a = this.samples[0];
        const b = this.samples[1];
        return { a: a.id, b: b.id };
    }

    generateRefinePair() {
        // Phase 2: Focus on samples near top performers
        const topPerformers = this.getTopPerformers(15);

        if (topPerformers.length < 2) {
            // Fallback to explore if not enough data
            return this.generateExplorePair();
        }

        // Find samples near top performers (within similar parameter ranges)
        const topRegion = [];
        topPerformers.forEach(top => {
            this.samples.forEach(s => {
                const dist = this.getDistance(top.id, s.id);
                // Include samples within 30% of max distance from top performers
                if (dist < this.maxDistance * 0.3) {
                    topRegion.push(s);
                }
            });
        });

        // Remove duplicates
        const uniqueRegion = [...new Map(topRegion.map(s => [s.id, s])).values()];

        if (uniqueRegion.length < 2) {
            return this.generateExplorePair();
        }

        // Generate pair from this region, avoiding recent pairs
        const recentPairs = this.state.history.slice(-20).map(m => `${m.a}_${m.b}`);
        const recentPairsReverse = this.state.history.slice(-20).map(m => `${m.b}_${m.a}`);
        const recentSet = new Set([...recentPairs, ...recentPairsReverse]);

        let attempts = 0;
        while (attempts < 50) {
            const a = uniqueRegion[Math.floor(Math.random() * uniqueRegion.length)];
            const b = uniqueRegion[Math.floor(Math.random() * uniqueRegion.length)];

            if (a.id !== b.id && !recentSet.has(`${a.id}_${b.id}`)) {
                return { a: a.id, b: b.id };
            }
            attempts++;
        }

        // Fallback
        return { a: uniqueRegion[0].id, b: uniqueRegion[1].id };
    }

    getNextMatch() {
        if (this.state.phase === 'complete') return null;

        if (this.state.currentMatch) return this.state.currentMatch;

        // Showdown Logic - keep generating matches between top candidates
        if (this.state.phase === 'showdown') {
            const nextShowdown = this.state.showdownQueue.find(m => !m.winner);
            if (!nextShowdown) {
                // Instead of auto-completing, generate a new round of showdown matches
                // This allows continued testing
                this.prepareShowdown();
                const newMatch = this.state.showdownQueue.find(m => !m.winner);
                if (newMatch) {
                    this.state.currentMatch = { ...newMatch, timestamp: null };
                    this.saveState();
                    return this.state.currentMatch;
                }
                // If still no match, fall through to generate regular match
            } else {
                // Clone it to currentMatch
                this.state.currentMatch = { ...nextShowdown, timestamp: null };
                this.saveState();
                return this.state.currentMatch;
            }
        }

        // Phase 1 (Explore) and Phase 2 (Refine) Logic - True AB Testing
        let pair;
        if (this.state.phase === 'explore') {
            pair = this.generateExplorePair();
        } else if (this.state.phase === 'refine') {
            pair = this.generateRefinePair();
        } else {
            // Fallback
            pair = this.generateExplorePair();
        }

        const match = {
            id: `${this.state.phase}_${pair.a}_vs_${pair.b}_${Date.now()}`,
            a: pair.a,
            b: pair.b,
            winner: null,
            timestamp: null
        };

        this.state.currentMatch = match;
        this.saveState();
        return match;
    }

    recordResult(matchId, winnerId) {
        if (!this.state.currentMatch || this.state.currentMatch.id !== matchId) return;

        const match = this.state.currentMatch;
        match.winner = winnerId;
        match.timestamp = Date.now();

        // In showdown, update the queue entry
        if (this.state.phase === 'showdown') {
            const qMatch = this.state.showdownQueue.find(m => m.id === match.id || (m.a === match.a && m.b === match.b));
            if (qMatch) qMatch.winner = winnerId;
        }

        this.state.history.push(match);
        this.state.matchesPlayed++;
        this.state.phaseMatches++;
        this.state.currentMatch = null;
        this.saveState();

        console.log(`Match recorded. ${this.state.matchesPlayed} total matches played.`);
    }

    getMetric() {
        // Cumulative confidence metric that reflects total testing done
        // This should generally increase over time and NOT reset when continuing testing

        // Component 1: Coverage - How much of the parameter space have we explored?
        const playedIds = new Set();
        playedIds.add(this.state.champion);
        this.state.history.forEach(m => {
            playedIds.add(m.a);
            playedIds.add(m.b);
        });

        const coverageRatio = playedIds.size / this.samples.length;

        // Component 2: Depth - How many comparisons have we done?
        // Use a logarithmic scale to show diminishing returns
        const totalComparisons = this.state.history.length;
        const targetComparisons = this.samples.length * 2; // Target: 2 comparisons per sample
        const depthRatio = Math.min(1, totalComparisons / targetComparisons);

        // Component 3: Phase-specific bonus
        let phaseBonus = 0;
        if (this.state.phase === 'showdown') {
            const total = this.state.showdownQueue.length;
            if (total > 0) {
                const played = this.state.showdownQueue.filter(m => m.winner).length;
                phaseBonus = 0.1 * (played / total); // Bonus up to 10%
            }
        }

        // Weighted combination: 60% coverage, 30% depth, 10% phase bonus
        const confidence = (coverageRatio * 0.6) + (depthRatio * 0.3) + phaseBonus;

        return Math.max(0, Math.min(1, confidence));
    }

    reset() {
        localStorage.removeItem(this.storageKey);
        this.state = this.initializeState();
        location.reload();
    }

    continueFromComplete() {
        // Keep all history but restart the phases
        this.state.phase = 'explore';
        this.state.phaseMatches = 0;
        this.state.currentMatch = null;
        this.state.candidates = [];
        this.state.showdownQueue = [];
        // Keep: history, matchesPlayed
        this.saveState();
        console.log("Continuing testing from explore phase with existing history");
    }

    exportState() {
        return JSON.stringify(this.state, null, 2);
    }

    importState(jsonString) {
        try {
            const newState = JSON.parse(jsonString);
            if (!newState.champion) throw new Error("Invalid state");

            // Basic validation for new state structure
            if (typeof newState.matchesPlayed !== 'number' || typeof newState.phaseMatches !== 'number' || !newState.phase) {
                throw new Error("Invalid state format or missing new fields.");
            }

            const validIds = new Set(this.samples.map(s => s.id));
            if (!validIds.has(newState.champion)) {
                throw new Error("Invalid champion ID in imported state.");
            }

            // Filter history for valid IDs
            if (newState.history) {
                newState.history = newState.history.filter(m => validIds.has(m.a) && validIds.has(m.b));
            }

            this.state = newState;
            this.saveState();
            return true;
        } catch (e) {
            console.error("Import failed:", e);
            return false;
        }
    }
}

class ComparisonUI {
    constructor(tournament, audioParser) {
        this.tournament = tournament;
        this.audioParser = audioParser;
        this.elements = {
            container: document.getElementById('comparison-ui'),
            ui: document.getElementById('comparison-ui'),
            controls: document.getElementById('controls'),
            startBtn: document.getElementById('start-btn'),
            voteA: document.getElementById('vote-a'),
            voteB: document.getElementById('vote-b'),
            voteTie: document.getElementById('vote-tie'),
            audioA: document.getElementById('audio-a'),
            audioB: document.getElementById('audio-b'),
            paramsDisplay: document.getElementById('params-display'),
            completionMsg: document.getElementById('completion-msg'),
            nextPhaseBtn: document.getElementById('next-phase-btn'),
            phaseControl: document.getElementById('phase-control'),
            phaseLabel: document.getElementById('phase-label'),
            phaseDesc: document.getElementById('phase-desc'),
            phaseBar: document.getElementById('phase-progress-bar'),
            phaseMetric: document.getElementById('phase-metric')
        };

        // Bind events if elements exist (only on index page)
        if (this.elements.startBtn) {
            this.init();
        }
    }

    init() {
        this.elements.startBtn.addEventListener('click', () => this.start());
        this.elements.voteA.addEventListener('click', () => this.handleVote('a'));
        this.elements.voteB.addEventListener('click', () => this.handleVote('b'));
        this.elements.voteTie.addEventListener('click', () => this.handleVote('tie'));

        if (this.elements.nextPhaseBtn) {
            this.elements.nextPhaseBtn.addEventListener('click', () => {
                const newPhase = this.tournament.nextPhase();
                this.updatePhaseUI();
                if (newPhase === 'complete') {
                    this.showCompletion();
                } else {
                    this.loadNextMatch();
                }
            });
        }

        // Keyboard Shortcuts
        document.addEventListener('keydown', (e) => {
            if (this.elements.ui.classList.contains('hidden')) return; // Only if active

            switch (e.key.toLowerCase()) {
                case 'a':
                case '1':
                    this.handleVote('a');
                    break;
                case 'b':
                case '2':
                    this.handleVote('b');
                    break;
                case 't':
                case '3':
                    this.handleVote('tie');
                    break;
                case ' ':
                    e.preventDefault(); // Prevent scrolling
                    this.togglePlay();
                    break;
            }
        });

        // Check if we should auto-start (if in progress)
        if (this.tournament.state.matchesPlayed > 0 && this.tournament.getNextMatch()) {
            this.start();
        }

        // Ensure only one audio plays at a time
        this.elements.audioA.addEventListener('play', () => {
            this.elements.audioB.pause();
        });
        this.elements.audioB.addEventListener('play', () => {
            this.elements.audioA.pause();
        });

        // Initial UI Update
        this.updatePhaseUI();

        // Data Tab Listeners
        const exportBtn = document.getElementById('export-btn');
        const importBtn = document.getElementById('import-btn');
        const importFile = document.getElementById('import-file');
        const resetBtn = document.getElementById('reset-btn');

        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const data = this.tournament.exportState();
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `absound_export_${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
            });
        }

        if (importBtn && importFile) {
            importBtn.addEventListener('click', () => {
                const file = importFile.files[0];
                if (!file) {
                    alert("Please select a file first.");
                    return;
                }

                const reader = new FileReader();
                reader.onload = (e) => {
                    const success = this.tournament.importState(e.target.result);
                    if (success) {
                        alert("Import successful! Reloading...");
                        location.reload();
                    } else {
                        alert("Import failed. Check console for details.");
                    }
                };
                reader.readAsText(file);
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (confirm("Are you sure you want to delete all history? This cannot be undone.")) {
                    this.tournament.reset();
                    location.reload();
                }
            });
        }

        // Continue Testing Button
        const continueBtn = document.getElementById('continue-testing-btn');
        if (continueBtn) {
            continueBtn.addEventListener('click', () => {
                this.tournament.continueFromComplete();
                this.elements.completionMsg.classList.add('hidden');
                this.elements.phaseControl.classList.remove('hidden');
                this.updatePhaseUI();
                this.loadNextMatch();
            });
        }
    }

    start() {
        this.elements.controls.classList.add('hidden');
        this.elements.phaseControl.classList.remove('hidden');
        this.loadNextMatch();
    }
    async loadNextMatch() {
        console.log("loadNextMatch called");
        const match = this.tournament.getNextMatch();
        console.log("Next match:", match);

        if (!match) {
            console.log("No match found");
            if (this.tournament.state.phase === 'complete') {
                this.showCompletion();
            } else {
                if (this.elements.paramsDisplay) {
                    this.elements.paramsDisplay.textContent = 'Loading next match...';
                }
            }
            return;
        }

        if (this.elements.paramsDisplay) {
            this.elements.paramsDisplay.textContent = 'Loading audio...';
        }

        this.updateProgress();
        this.updatePhaseUI();

        try {
            console.log("Fetching audio URLs for:", match.a, match.b);
            const sampleA = this.tournament.samples.find(s => s.id === match.a);
            const sampleB = this.tournament.samples.find(s => s.id === match.b);

            if (!sampleA || !sampleB) {
                throw new Error(`Sample not found: ${!sampleA ? match.a : match.b}`);
            }

            const urlA = sampleA.file;
            const urlB = sampleB.file;
            console.log("Audio URLs:", urlA, urlB);

            this.renderMatch(match, urlA, urlB);

            // Check if confidence is very high and suggest completion
            const confidence = this.tournament.getMetric();
            if (confidence >= 0.95 && this.tournament.state.phase === 'showdown') {
                // Show a subtle message suggesting completion
                if (this.elements.paramsDisplay) {
                    this.elements.paramsDisplay.innerHTML =
                        '<strong style="color: #10b981;">Confidence is very high (95%+)!</strong> ' +
                        'Further testing won\'t significantly improve results. Consider clicking "Finish" when ready.';
                }
            }
        } catch (error) {
            console.error("Error loading audio:", error);
            if (this.elements.paramsDisplay) {
                this.elements.paramsDisplay.innerHTML = `<span class="error">Error loading audio: ${error.message}</span>`;
            }
        }
    }

    renderMatch(match, urlA, urlB) {
        console.log("renderMatch called", {
            audioA: !!this.elements.audioA,
            audioB: !!this.elements.audioB,
            ui: !!this.elements.ui
        });

        if (!this.elements.audioA || !this.elements.audioB) {
            console.error("Audio elements missing!");
            return;
        }

        this.currentMatch = match; // Store current match for voting

        this.elements.audioA.src = urlA;
        this.elements.audioB.src = urlB;

        // Reset and load
        this.elements.audioA.load();
        this.elements.audioB.load();

        // Reset params display
        if (this.elements.paramsDisplay) {
            this.elements.paramsDisplay.textContent = 'Hidden during blind test';
        }

        // Ensure UI is visible
        if (this.elements.ui) {
            console.log("Removing hidden class from UI");
            this.elements.ui.classList.remove('hidden');
        }
    }

    updatePhaseUI() {
        const state = this.tournament.state;
        if (!this.elements.phaseLabel) return;

        const metric = this.tournament.getMetric();
        const percent = Math.round(metric * 100);

        // Update Labels
        if (state.phase === 'explore') {
            this.elements.phaseLabel.textContent = 'Phase 1: Explore';
            this.elements.phaseLabel.style.background = '#3b82f6'; // Blue
            this.elements.phaseDesc.textContent = 'Finding broad preferences...';
            this.elements.nextPhaseBtn.textContent = 'Start Refinement →';
            this.elements.phaseMetric.textContent = `Confidence: ${percent}%`;
        } else if (state.phase === 'refine') {
            this.elements.phaseLabel.textContent = 'Phase 2: Refine';
            this.elements.phaseLabel.style.background = '#8b5cf6'; // Purple
            this.elements.phaseDesc.textContent = 'Fine-tuning your choice...';
            this.elements.nextPhaseBtn.textContent = 'Start Showdown →';
            this.elements.phaseMetric.textContent = `Confidence: ${percent}%`;
        } else if (state.phase === 'showdown') {
            this.elements.phaseLabel.textContent = 'Phase 3: Showdown';
            this.elements.phaseLabel.style.background = '#ef4444'; // Red
            this.elements.phaseDesc.textContent = 'Final battle between top candidates!';
            this.elements.nextPhaseBtn.textContent = 'Finish →';
            this.elements.phaseMetric.textContent = `Confidence: ${percent}%`;
        }

        this.elements.phaseBar.style.width = `${percent}%`;

        // Color Coding
        this.elements.phaseBar.className = 'progress-bar'; // Reset
        if (percent < 40) {
            this.elements.phaseBar.classList.add('bar-low');
        } else if (percent < 80) {
            this.elements.phaseBar.classList.add('bar-med');
        } else {
            this.elements.phaseBar.classList.add('bar-high');
        }
    }

    updateProgress() {
        // Deprecated in favor of updatePhaseUI, but kept for compatibility if needed
    }

    handleVote(winner) {
        // Stop audio
        this.elements.audioA.pause();
        this.elements.audioB.pause();

        // Record result
        // If winner is 'a' or 'b', we send the sample ID. If 'tie', we send 'tie'.
        let winnerId = 'tie';
        if (winner === 'a') winnerId = this.currentMatch.a;
        if (winner === 'b') winnerId = this.currentMatch.b;

        this.tournament.recordResult(this.currentMatch.id, winnerId);

        // Load next
        this.loadNextMatch();
    }

    togglePlay() {
        const audioA = this.elements.audioA;
        const audioB = this.elements.audioB;

        if (!audioA.paused) {
            audioA.pause();
            audioB.play();
        } else if (!audioB.paused) {
            audioB.pause();
            // Both paused
        } else {
            audioA.play();
        }
    }

    showCompletion() {
        this.elements.ui.classList.add('hidden');
        this.elements.controls.classList.add('hidden');
        this.elements.completionMsg.classList.remove('hidden');
    }
}

class ScoringSystem {
    constructor(tournament) {
        this.tournament = tournament;
        this.tableBody = document.querySelector('#leaderboard tbody');
    }

    calculateScores() {
        const scores = {};

        // Initialize
        this.tournament.samples.forEach(s => {
            scores[s.id] = {
                id: s.id,
                sample: s,
                wins: 0,
                losses: 0,
                ties: 0,
                score: 0
            };
        });

        // Tally history
        this.tournament.state.history.forEach(match => {
            // Skip matches involving deleted/missing samples
            if (!scores[match.a] || !scores[match.b]) {
                return;
            }

            if (match.winner === 'tie') {
                scores[match.a].ties++;
                scores[match.b].ties++;
            } else if (match.winner === match.a) {
                scores[match.a].wins++;
                scores[match.b].losses++;
            } else if (match.winner === match.b) {
                scores[match.b].wins++;
                scores[match.a].losses++;
            }
        });

        // Calculate final score
        Object.values(scores).forEach(s => {
            s.score = s.wins + (s.ties * 0.5);
        });

        return Object.values(scores).sort((a, b) => b.score - a.score);
    }

    updateLeaderboard() {
        if (!this.tableBody) return;

        const rankings = this.calculateScores();
        this.tableBody.innerHTML = '';

        rankings.forEach((r, index) => {
            // Only show if they have played at least one match (optional, but keeps it clean)
            if (r.wins + r.losses + r.ties === 0) return;

            const row = document.createElement('tr');

            // Add rank classes for styling
            if (index === 0) row.classList.add('rank-1');
            if (index === 1) row.classList.add('rank-2');
            if (index === 2) row.classList.add('rank-3');

            row.innerHTML = `
                <td>${index + 1}</td>
                <td><button class="btn-play-small" data-id="${r.id}">▶</button></td>
                <td>${r.id}</td>
                <td>${r.sample.exaggeration}</td>
                <td>${r.sample.cfg}</td>
                <td>${r.sample.temp}</td>
                <td><strong>${r.score.toFixed(1)}</strong></td>
                <td>${r.wins} / ${r.losses} / ${r.ties}</td>
            `;
            this.tableBody.appendChild(row);
        });

        // Add listeners to new play buttons
        this.tableBody.querySelectorAll('.btn-play-small').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                if (window.viz) {
                    window.viz.playSample(id);
                }
            });
        });
    }
}

class Visualization {
    constructor(scoringSystem) {
        this.scoring = scoringSystem;
        this.containerId = 'visualization';
    }

    update() {
        const scores = this.scoring.calculateScores();

        // Prepare data for Plotly
        const x = scores.map(s => s.sample.exaggeration);
        const y = scores.map(s => s.sample.cfg);
        const z = scores.map(s => s.sample.temp);
        const c = scores.map(s => s.score);
        const text = scores.map(s => `${s.id} <br>Score: ${s.score}`);

        const data = [{
            x: x,
            y: y,
            z: z,
            mode: 'markers',
            marker: {
                size: 8,
                color: c,
                colorscale: 'Viridis',
                opacity: 0.8,
                colorbar: { title: 'Score' }
            },
            type: 'scatter3d',
            text: text,
            hoverinfo: 'text'
        }];

        const layout = {
            margin: { l: 0, r: 0, b: 0, t: 0 },
            scene: {
                xaxis: { title: 'Exaggeration' },
                yaxis: { title: 'CFG' },
                zaxis: { title: 'Temperature' }
            }
        };

        Plotly.newPlot(this.containerId, data, layout);

        // Click Interaction
        const plot = document.getElementById(this.containerId);
        plot.on('plotly_click', (data) => {
            if (data.points.length > 0) {
                const point = data.points[0];
                // Extract ID from hover text (hacky but works given our data structure)
                // text format: "id <br>Score: score"
                const id = point.text.split(' <br>')[0];
                this.playSample(id);
            }
        });
    }

    playSample(id) {
        // Stop currently playing visualization audio
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
        }

        // Also stop comparison players if they are playing
        if (window.ui && window.ui.elements) {
            window.ui.elements.audioA.pause();
            window.ui.elements.audioB.pause();
        }

        const sample = this.scoring.tournament.samples.find(s => s.id === id);
        if (sample) {
            const audio = new Audio(sample.file);
            this.currentAudio = audio;
            audio.play().catch(e => console.error("Play failed:", e));
            console.log("Playing:", id);
        }
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (window.AUDIO_FILES && window.AUDIO_FILES.length > 0) {
        const parser = new AudioParser(window.AUDIO_FILES);

        // Initialize Tournament
        window.tournament = new Tournament(parser.parsed);

        // Initialize Scoring
        window.scoring = new ScoringSystem(window.tournament);
        window.scoring.updateLeaderboard();

        // Initialize Visualization
        window.viz = new Visualization(window.scoring);
        window.viz.update();

        // Initialize UI
        window.ui = new ComparisonUI(window.tournament, parser);

        // Hook into voting to update leaderboard and visualization
        const originalHandleVote = window.ui.handleVote.bind(window.ui);
        window.ui.handleVote = (winner) => {
            originalHandleVote(winner);
            window.scoring.updateLeaderboard();
            window.viz.update();
        };

        // Tab Switching Logic
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove active class from all
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

                // Add active class to clicked
                btn.classList.add('active');
                const tabId = btn.getAttribute('data-tab');
                document.getElementById(`tab-${tabId}`).classList.add('active');

                // Resize Plotly if switching to visualize tab
                if (tabId === 'visualize' && window.viz) {
                    window.viz.update(); // Re-render/resize
                }
            });
        });

        // Temporary: Display parsed data on home page for verification
        const welcome = document.getElementById('welcome');
        if (welcome) {
            const debugInfo = document.createElement('pre');
            debugInfo.style.background = '#f4f4f4';
            debugInfo.style.padding = '1rem';
            debugInfo.style.maxHeight = '200px';
            debugInfo.style.overflow = 'auto';
            debugInfo.textContent = `Loaded ${parser.parsed.length} samples.\n` +
                `Generated ${window.tournament.state.matches.length} pairs.`;
            welcome.after(debugInfo);
        }
    }
});
