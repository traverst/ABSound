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
        this.storageKey = 'absound_tournament_v2'; // Bump version for new logic
        this.state = this.loadState() || this.initializeState();
        this.maxMatches = 100; // Target number of matches
    }

    initializeState() {
        // Start with a random champion
        const randomStart = this.samples[Math.floor(Math.random() * this.samples.length)];

        return {
            champion: randomStart.id,
            matchesPlayed: 0,
            history: [],
            currentMatch: null // Store current match details
        };
    }

    loadState() {
        const stored = localStorage.getItem(this.storageKey);
        if (!stored) return null;

        const state = JSON.parse(stored);

        // Basic validation
        const validIds = new Set(this.samples.map(s => s.id));

        // If champion is missing/invalid, reset
        if (!state.champion || !validIds.has(state.champion)) {
            return null;
        }

        if (state.history) {
            state.history = state.history.filter(m => validIds.has(m.a) && validIds.has(m.b));
        }

        return state;
    }

    saveState() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    }

    // Helper to get distance between two samples
    getDistance(idA, idB) {
        const sA = this.samples.find(s => s.id === idA);
        const sB = this.samples.find(s => s.id === idB);
        if (!sA || !sB) return Infinity;

        // Simple Euclidean distance on normalized params (approximate since ranges are small)
        const dEx = sA.exaggeration - sB.exaggeration;
        const dCfg = sA.cfg - sB.cfg;
        const dTemp = sA.temp - sB.temp;
        return Math.sqrt(dEx * dEx + dCfg * dCfg + dTemp * dTemp);
    }

    getChallenger() {
        const championId = this.state.champion;
        const matchesPlayed = this.state.matchesPlayed;

        // Filter out samples we've already compared against this SPECIFIC champion 
        // (to avoid repeating the same pair immediately)
        const playedAgainstChamp = new Set(
            this.state.history
                .filter(m => m.a === championId || m.b === championId)
                .map(m => m.a === championId ? m.b : m.a)
        );

        const candidates = this.samples.filter(s => s.id !== championId && !playedAgainstChamp.has(s.id));

        if (candidates.length === 0) {
            // If we've exhausted all candidates for this champion, pick ANY random one
            return this.samples.find(s => s.id !== championId);
        }

        // Phase 1: Exploration (First 20 matches)
        // Goal: Find the general region of preference by testing against very different samples
        if (matchesPlayed < 20) {
            // Sort by distance DESCENDING (furthest first)
            candidates.sort((a, b) => this.getDistance(championId, b.id) - this.getDistance(championId, a.id));
            // Pick from top 20% to ensure variety
            const poolSize = Math.max(1, Math.floor(candidates.length * 0.2));
            return candidates[Math.floor(Math.random() * poolSize)];
        }

        // Phase 2: Refinement (Remaining matches)
        // Goal: Fine-tune parameters by testing against neighbors
        else {
            // Occasional Sanity Check (Every 10th match)
            if (matchesPlayed % 10 === 0) {
                return candidates[Math.floor(Math.random() * candidates.length)];
            }

            // Sort by distance ASCENDING (closest first)
            candidates.sort((a, b) => this.getDistance(championId, a.id) - this.getDistance(championId, b.id));
            // Pick from top 5 closest
            const poolSize = Math.min(5, candidates.length);
            return candidates[Math.floor(Math.random() * poolSize)];
        }
    }

    getNextMatch() {
        if (this.state.matchesPlayed >= this.maxMatches) {
            return null; // Tournament complete
        }

        // If we already generated a match but haven't played it (e.g. reload), return it
        if (this.state.currentMatch) {
            return this.state.currentMatch;
        }

        const challenger = this.getChallenger();
        if (!challenger) return null; // Should not happen

        const match = {
            id: `${this.state.champion}_vs_${challenger.id}_${Date.now()}`,
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

        // Update Champion Logic
        // If Tie: Champion stays (Defender's advantage)
        // If Challenger wins: Challenger becomes Champion
        if (winnerId !== 'tie' && winnerId !== this.state.champion) {
            this.state.champion = winnerId;
            console.log("New Champion:", this.state.champion);
        }

        this.state.history.push(match);
        this.state.matchesPlayed++;
        this.state.currentMatch = null; // Clear current match to generate new one next time
        this.saveState();

        console.log(`Match recorded. Champion is now: ${this.state.champion}`);
    }

    reset() {
        localStorage.removeItem(this.storageKey);
        this.state = this.initializeState();
        this.saveState();
        console.log("Tournament reset.");
    }

    exportState() {
        return JSON.stringify(this.state, null, 2);
    }

    importState(jsonString) {
        try {
            const newState = JSON.parse(jsonString);

            // Basic validation
            if (!newState.champion || typeof newState.matchesPlayed !== 'number') {
                throw new Error("Invalid state format");
            }

            const validIds = new Set(this.samples.map(s => s.id));
            if (!validIds.has(newState.champion)) {
                throw new Error("Invalid champion ID");
            }

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
    constructor(tournament) {
        this.tournament = tournament;
        this.elements = {
            controls: document.getElementById('controls'),
            startBtn: document.getElementById('start-btn'),
            ui: document.getElementById('comparison-ui'),
            audioA: document.getElementById('audio-a'),
            audioB: document.getElementById('audio-b'),
            voteA: document.getElementById('vote-a'),
            voteB: document.getElementById('vote-b'),
            voteTie: document.getElementById('vote-tie'),
            paramsDisplay: document.getElementById('params-display'),
            completionMsg: document.getElementById('completion-msg')
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
        this.loadNextMatch();
    }

    loadNextMatch() {
        const match = this.tournament.getNextMatch();

        if (!match) {
            this.showCompletion();
            return;
        }

        this.currentMatch = match;
        this.elements.ui.classList.remove('hidden');
        this.elements.completionMsg.classList.add('hidden');

        // Load Audio
        const sampleA = this.tournament.samples.find(s => s.id === match.a);
        const sampleB = this.tournament.samples.find(s => s.id === match.b);

        if (!sampleA || !sampleB) {
            console.error("Missing sample for match:", match);
            // Auto-skip this match if data is corrupted
            this.tournament.recordResult(match.id, 'tie'); // Record as tie to move on? Or just skip?
            // Actually, better to just skip without recording if possible, but recordResult increments index.
            // Let's just try to load the next one recursively.
            this.loadNextMatch();
            return;
        }

        this.elements.audioA.src = sampleA.file;
        this.elements.audioB.src = sampleB.file;

        // Reset players
        this.elements.audioA.load();
        this.elements.audioB.load();

        // Error handling
        const handleError = (player, label) => {
            const err = player.error;
            let msg = 'Unknown error';
            if (err) {
                switch (err.code) {
                    case 1: msg = 'Aborted'; break;
                    case 2: msg = 'Network Error'; break;
                    case 3: msg = 'Decoding Error'; break;
                    case 4: msg = 'Source Not Supported'; break;
                }
            }
            console.error(`Error loading ${label}: ${player.src}`, err);
            // Optional: Alert user or show on UI
            // alert(`Error loading ${label}: ${msg}\n${player.src}`);
        };

        this.elements.audioA.onerror = () => handleError(this.elements.audioA, 'Sample A');
        this.elements.audioB.onerror = () => handleError(this.elements.audioB, 'Sample B');

        // Enforce mutual exclusivity
        this.elements.audioA.onplay = () => {
            this.elements.audioB.pause();
            if (window.viz && window.viz.currentAudio) {
                window.viz.currentAudio.pause();
            }
        };

        this.elements.audioB.onplay = () => {
            this.elements.audioA.pause();
            if (window.viz && window.viz.currentAudio) {
                window.viz.currentAudio.pause();
            }
        };

        this.updateProgress();
    }

    updateProgress() {
        const current = this.tournament.state.matchesPlayed + 1;
        const total = this.tournament.maxMatches;
        const percent = Math.round((current / total) * 100);

        const display = document.getElementById('progress-display');
        if (display) {
            display.textContent = `Match ${current} / ${total} (${percent}%)`;
        }
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
                <td>${r.id}</td>
                <td>${r.sample.exaggeration}</td>
                <td>${r.sample.cfg}</td>
                <td>${r.sample.temp}</td>
                <td><strong>${r.score.toFixed(1)}</strong></td>
                <td>${r.wins} / ${r.losses} / ${r.ties}</td>
            `;
            this.tableBody.appendChild(row);
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
        window.ui = new ComparisonUI(window.tournament);

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
