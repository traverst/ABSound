console.log("Voice Model Comparison Loaded");

class AudioParser {
    constructor(files) {
        this.files = files || [];
        this.parsed = this.parseFiles();
    }

    parseFiles() {
        return this.files.map(filename => {
            // Regex to match: (sample|test)_e(float)_cfg(float)_t(float).(wav|aiff|aif)
            const match = filename.match(/(?:sample|test)_e([\d\.]+)_cfg([\d\.]+)_t([\d\.]+)\.(?:wav|aiff|aif)$/i);

            if (match) {
                const baseUrl = window.BASE_URL || '';
                return {
                    id: filename.replace(/\.(wav|aiff|aif)$/i, ''),
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
        this.storageKey = 'absound_tournament_v1';
        this.state = this.loadState() || this.initializeState();
    }

    initializeState() {
        const pairs = this.generatePairs();
        const sortedPairs = this.prioritizePairs(pairs);

        return {
            matches: sortedPairs, // Queue of matches
            history: [],          // Completed matches
            currentMatchIndex: 0
        };
    }

    loadState() {
        const stored = localStorage.getItem(this.storageKey);
        return stored ? JSON.parse(stored) : null;
    }

    saveState() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    }

    generatePairs() {
        const pairs = [];
        for (let i = 0; i < this.samples.length; i++) {
            for (let j = i + 1; j < this.samples.length; j++) {
                pairs.push({
                    id: `${this.samples[i].id}_vs_${this.samples[j].id}`,
                    a: this.samples[i].id,
                    b: this.samples[j].id,
                    winner: null,
                    timestamp: null
                });
            }
        }
        return pairs;
    }

    prioritizePairs(pairs) {
        // Normalize parameters to 0-1 range for fair distance calculation
        const ranges = this.getRanges();

        const normalize = (val, param) => {
            const r = ranges[param];
            if (r.max === r.min) return 0;
            return (val - r.min) / (r.max - r.min);
        };

        const getSample = (id) => this.samples.find(s => s.id === id);

        const distance = (pair) => {
            const sA = getSample(pair.a);
            const sB = getSample(pair.b);

            const dEx = normalize(sA.exaggeration, 'exaggeration') - normalize(sB.exaggeration, 'exaggeration');
            const dCfg = normalize(sA.cfg, 'cfg') - normalize(sB.cfg, 'cfg');
            const dTemp = normalize(sA.temp, 'temp') - normalize(sB.temp, 'temp');

            return Math.sqrt(dEx * dEx + dCfg * dCfg + dTemp * dTemp);
        };

        // Sort by distance descending (most different first)
        return pairs.sort((a, b) => distance(b) - distance(a));
    }

    getRanges() {
        // Helper to get min/max from samples
        const params = ['exaggeration', 'cfg', 'temp'];
        const ranges = {};
        params.forEach(p => {
            const vals = this.samples.map(s => s[p]);
            ranges[p] = { min: Math.min(...vals), max: Math.max(...vals) };
        });
        return ranges;
    }

    getNextMatch() {
        if (this.state.currentMatchIndex >= this.state.matches.length) {
            return null; // Tournament complete
        }
        return this.state.matches[this.state.currentMatchIndex];
    }

    recordResult(matchId, winnerId) { // winnerId can be sampleId or 'tie'
        const matchIndex = this.state.matches.findIndex(m => m.id === matchId);
        if (matchIndex === -1) return;

        const match = this.state.matches[matchIndex];
        match.winner = winnerId;
        match.timestamp = Date.now();

        this.state.history.push(match);
        this.state.currentMatchIndex++;
        this.saveState();

        console.log(`Match recorded: ${matchId}, Winner: ${winnerId}`);
    }

    reset() {
        localStorage.removeItem(this.storageKey);
        this.state = this.initializeState();
        this.saveState();
        console.log("Tournament reset.");
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

        // Check if we should auto-start (if in progress)
        if (this.tournament.state.currentMatchIndex > 0 && this.tournament.getNextMatch()) {
            this.start();
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

        this.elements.audioA.src = sampleA.file;
        this.elements.audioB.src = sampleB.file;

        // Reset players
        this.elements.audioA.load();
        this.elements.audioB.load();

        this.updateProgress();
    }

    updateProgress() {
        const current = this.tournament.state.currentMatchIndex + 1;
        const total = this.tournament.state.matches.length;
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

    showCompletion() {
        this.elements.ui.classList.add('hidden');
        this.elements.controls.classList.add('hidden');
        this.elements.completionMsg.classList.remove('hidden');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (window.AUDIO_FILES) {
        const parser = new AudioParser(window.AUDIO_FILES);
        console.log("Parsed Audio Files:", parser.parsed);

        // Initialize Tournament
        window.tournament = new Tournament(parser.parsed);
        console.log("Tournament Initialized:", window.tournament);

        // Initialize UI
        window.ui = new ComparisonUI(window.tournament);

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
