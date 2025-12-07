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
        const randomStart = this.samples[Math.floor(Math.random() * this.samples.length)];

        // Calculate initial max distance for this specific start point
        // This ensures Coverage starts at 0% regardless of where we start
        let maxDist = 0;
        this.samples.forEach(s => {
            if (s.id !== randomStart.id) {
                const d = this.getDistance(randomStart.id, s.id);
                if (d > maxDist) maxDist = d;
            }
        });

        return {
            phase: 'explore',
            champion: randomStart.id,
            matchesPlayed: 0,
            phaseMatches: 0,
            consecutiveWins: 0,
            initialMaxDist: maxDist, // Store baseline for coverage metric
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
        if (!state.champion || !validIds.has(state.champion)) return null;

        // Ensure new fields exist if loading old state
        if (!state.phase) state.phase = 'explore';
        if (typeof state.phaseMatches === 'undefined') state.phaseMatches = state.matchesPlayed;
        if (typeof state.consecutiveWins === 'undefined') state.consecutiveWins = 0;

        // Backfill initialMaxDist if missing
        if (!state.initialMaxDist) {
            // If we are at the start (or close to it), recalculate based on current champion
            // This fixes the issue where falling back to global maxDistance caused a 30% start
            if (state.matchesPlayed === 0) {
                let maxDist = 0;
                this.samples.forEach(s => {
                    if (s.id !== state.champion) {
                        const d = this.getDistance(state.champion, s.id);
                        if (d > maxDist) maxDist = d;
                    }
                });
                state.initialMaxDist = maxDist;
            } else {
                // If we are mid-game, we have to guess. 
                // Using maxDistance (diameter) is safer than 0, but might skew the metric.
                // Let's try to find the max distance from the CURRENT champion to ANY sample
                // as a proxy for the "local universe" size.
                let maxDist = 0;
                this.samples.forEach(s => {
                    const d = this.getDistance(state.champion, s.id);
                    if (d > maxDist) maxDist = d;
                });
                state.initialMaxDist = maxDist;
            }
        }

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
        // Gather top candidates: Current Champion + Top 2 from history (by wins)
        // This is a simplified logic; ideally we'd track "promising" ones better.
        // For now, let's take the current champion and 3 random neighbors of it to form a bracket.

        const championId = this.state.champion;
        const candidates = this.samples.filter(s => s.id !== championId);

        // Sort by closeness to champion
        candidates.sort((a, b) => this.getDistance(championId, a.id) - this.getDistance(championId, b.id));

        // Take top 3 closest + champion = 4 finalists
        const finalists = [championId, candidates[0].id, candidates[1].id, candidates[2].id];
        this.state.candidates = finalists;

        // Create Round Robin for these 4
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

    getChallenger() {
        const championId = this.state.champion;

        // Filter out recent matches to avoid repetition
        const recentHistory = this.state.history.slice(-10);
        const recentlyPlayed = new Set(
            recentHistory
                .filter(m => m.a === championId || m.b === championId)
                .map(m => m.a === championId ? m.b : m.a)
        );

        const candidates = this.samples.filter(s => s.id !== championId && !recentlyPlayed.has(s.id));

        if (candidates.length === 0) return this.samples.find(s => s.id !== championId);

        if (this.state.phase === 'explore') {
            // Farthest Point Sampling
            candidates.sort((a, b) => this.getDistance(championId, b.id) - this.getDistance(championId, a.id));
            // Top 10% furthest
            const poolSize = Math.max(1, Math.floor(candidates.length * 0.1));
            return candidates[Math.floor(Math.random() * poolSize)];
        }
        else if (this.state.phase === 'refine') {
            // Nearest Neighbor
            candidates.sort((a, b) => this.getDistance(championId, a.id) - this.getDistance(championId, b.id));
            // Top 5 closest
            const poolSize = Math.min(5, candidates.length);
            return candidates[Math.floor(Math.random() * poolSize)];
        }

        return candidates[0]; // Fallback
    }

    getNextMatch() {
        if (this.state.phase === 'complete') return null;

        if (this.state.currentMatch) return this.state.currentMatch;

        // Showdown Logic
        if (this.state.phase === 'showdown') {
            const nextShowdown = this.state.showdownQueue.find(m => !m.winner);
            if (!nextShowdown) {
                this.nextPhase(); // Auto-complete if done
                return null;
            }
            // Clone it to currentMatch
            this.state.currentMatch = { ...nextShowdown, timestamp: null };
            this.saveState();
            return this.state.currentMatch;
        }

        // Explore/Refine Logic
        const challenger = this.getChallenger();
        if (!challenger) return null;

        const match = {
            id: `${this.state.phase}_${this.state.champion}_vs_${challenger.id}_${Date.now()}`,
            a: this.state.champion,
            b: challenger.id,
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

        // Update Champion (Only in Explore/Refine)
        if (this.state.phase !== 'showdown') {
            if (winnerId !== 'tie' && winnerId !== this.state.champion) {
                this.state.champion = winnerId;
                this.state.consecutiveWins = 0; // Reset stability
                console.log("New Champion:", this.state.champion);
            } else {
                // Champion won or tied
                this.state.consecutiveWins++;
            }
        } else {
            // In showdown, update the queue entry
            const qMatch = this.state.showdownQueue.find(m => m.id === match.id || (m.a === match.a && m.b === match.b)); // ID might differ slightly due to timestamp
            if (qMatch) qMatch.winner = winnerId;
        }

        this.state.history.push(match);
        this.state.matchesPlayed++;
        this.state.phaseMatches++;
        this.state.currentMatch = null;
        this.saveState();

        console.log(`Match recorded. Champion is now: ${this.state.champion}`);
    }

    getMetric() {
        if (this.state.phase === 'explore') {
            // New Logic: Global Coverage (MaxMin Distance)
            // 1. Identify all "played" samples (History + Current Champion)
            // 2. For every "unplayed" sample, find dist to nearest "played".
            // 3. The MAX of those nearest distances is the "hole" size.
            // 4. Confidence = 1 - (HoleSize / MaxDistance)

            const playedIds = new Set();
            playedIds.add(this.state.champion);
            this.state.history.forEach(m => {
                playedIds.add(m.a);
                playedIds.add(m.b);
            });

            const unplayed = this.samples.filter(s => !playedIds.has(s.id));

            if (unplayed.length === 0) return 1.0;

            let maxMinDist = 0;

            // For each unplayed, find distance to nearest played
            // Optimization: We don't need to be perfectly precise if it's too slow, 
            // but for <2000 samples it's fine.
            unplayed.forEach(u => {
                let minDist = Infinity;
                playedIds.forEach(pId => {
                    const d = this.getDistance(u.id, pId);
                    if (d < minDist) minDist = d;
                });
                if (minDist > maxMinDist) maxMinDist = minDist;
            });

            // Normalize against global max distance
            // If we start in the middle, maxMinDist might be ~0.5 * maxDistance, so confidence starts at 50%.
            // To force it to start at 0, we can normalize against the INITIAL maxMinDist.
            const denominator = this.state.initialMaxDist || this.maxDistance;
            return Math.max(0, Math.min(1, 1 - (maxMinDist / denominator)));
        }
        else if (this.state.phase === 'refine') {
            // Stability: Consecutive Wins / Target (5)
            return Math.min(1, this.state.consecutiveWins / 5);
        }
        else if (this.state.phase === 'showdown') {
            // Progress: Played / Total
            const total = this.state.showdownQueue.length;
            if (total === 0) return 0;
            const played = this.state.showdownQueue.filter(m => m.winner).length;
            return played / total;
        }
        return 0;
    }

    reset() {
        localStorage.removeItem(this.storageKey);
        this.state = this.initializeState();
        location.reload();
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
