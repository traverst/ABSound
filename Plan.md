

Voice Model Parameter Comparison Site — Full Jekyll Development Plan

Stage 0 — Project Setup (Jekyll)

Goals
	•	Create a static GitHub Pages site using Jekyll.
	•	Provide a clean structure for audio experiment files and metadata.

Tasks
	•	Initialise a GitHub Pages repository set to jekyll-theme-minimal (or custom).
	•	Create folders:

/assets/audio/
/assets/js/
/assets/css/
/_data/


	•	Add a basic layout using _layouts/default.html containing:
	•	A header
	•	Main content container
	•	JS imports

Deliverables
	•	A working Jekyll site that loads locally (bundle exec jekyll serve).

⸻

Stage 0.5 — Automatic Parameter Extraction From Filenames

Goal
Automatically detect all generated audio samples and extract parameters from filenames (no manual config).

Assumptions
Filenames look like:

sample_e0.05_cfg0.25_t0.12.wav
sample_e0.10_cfg0.40_t0.07.wav

Tasks
	•	Create _data/audio_files.yml containing only a list of filenames:

audio:
  - sample_e0.05_cfg0.25_t0.12.wav
  - sample_e0.15_cfg0.35_t0.08.wav

(This allows GitHub Pages to expose the list without server-side FS access.)

	•	Write a JS parser that:
	•	Loads audio_files.yml via Jekyll’s inlined JSON export
	•	Extracts floats using regex
	•	Outputs JS objects:

{
  id: "e0.05_cfg0.25_t0.12",
  file: "/assets/audio/sample_e0.05_cfg0.25_t0.12.wav",
  exaggeration: 0.05,
  cfg: 0.25,
  temp: 0.12
}



Ranges
	•	Auto-compute min/max for each parameter for later visualizations.

⸻

Stage 1 — Core UI Structure (Jekyll Pages)

Goal
Establish basic pages for the prototype system.

Pages
	•	/index.html — comparison interface
	•	/reference.html — reference voice/audio
	•	/about.html — project description

Tasks
	•	Create Jekyll front matter for each page using the default layout.
	•	Placeholder HTML containers for:
	•	A/B audio players
	•	Parameter labels
	•	“A is better / B is better / Same” buttons

⸻

Stage 1.5 — Reference Audio Support

Goal
Users can remind themselves of the target voice.

Tasks
	•	Add a reference audio file in /assets/audio/reference/
	•	Reference page plays:
	•	Original sample (Stoker)
	•	Optional narrator sample
	•	Simple controls:
	•	Play / Pause
	•	Jump to marker

Optional
	•	Add a floating mini-player accessible from the main compare page.

⸻

Stage 2 — Pairing Logic (Tournament Framework)

Goal
Implement the comparison engine (binary tree “eye test” style).

Tasks
	•	Generate all possible pairings using the list of samples.
	•	Include a mechanism that:
	•	Ensures extremes get tested early
	•	Avoids repeated comparisons
	•	Uses a Swiss-like pairing approach:
	•	Prioritize comparing high-variance parameter sets early
	•	Track each match:

{
  a: sampleA_ID,
  b: sampleB_ID,
  winner: null,
  timestamp: …
}


	•	Store match results in localStorage.

Outcome
The system progressively converges on the best-performing parameter combination.

⸻

Stage 3 — Comparison UI Logic

Goal
Turn the basic UI into an interactive match interface.

Features
	•	Load the next pair from the tournament.
	•	Show two buttons:
	•	“A is better”
	•	“B is better”
	•	“Tie”
	•	After selection:
	•	Record result
	•	Move to next pair

Tasks
	•	Add JS to play audio A or B on click.
	•	Smooth fade-in/out.
	•	Display extracted parameters for each test.

⸻

Stage 4 — Scoring & Ranking

Goal
Convert match results into a meaningful ranking.

Scoring Recommendation
	•	Weighted win score:

score = direct_wins + (tie * 0.5) + opponent_strength_factor


	•	Normalise scores into a leaderboard.

Tasks
	•	Aggregate all results
	•	Sort samples by score
	•	Display leaderboard:
	•	Filename
	•	Parameters
	•	Win statistics

⸻

Stage 5 — Visualization

Goal
Visualize the parameter landscape.

Charts
	•	3D scatter plot (exaggeration vs cfg vs temperature)
	•	Color-coded by score
	•	2D projections per pair of axes with best-performing region highlighted

Tasks
	•	Use a pure JS plotting library (Plotly is easiest for static GitHub Pages).
	•	Feed data from the computed ranges and sample scores.

⸻

Stage 6 — History & Export

Goal
Let the user save or reuse their evaluation history.

Features
	•	Export results as JSON
	•	Load previous sessions
	•	Store automatically in localStorage
	•	Persistent leaderboard

⸻

Stage 7 — Polishing & Exploration Tools

Potential Add-ons
	•	“Replay best vs worst” quick button
	•	Clustering samples by parameter similarity
	•	Suggested sampling region (“Your ear prefers lower CFG + medium temp + low exaggeration”)
	•	Tooltip explanations of each variable
	•	Pre-filtering UI to restrict comparisons

⸻

Stage 8 — Publishing

Goal
Deploy to GitHub Pages.

Tasks
	•	Push to main
	•	Ensure GitHub Pages is set to “Deploy from GitHub Actions” or “Deploy from main”
	•	Verify audio loads correctly (case sensitivity issues are common)

⸻

Ready to feed to a coding agent

This plan is ready for vibe-coding.
Let me know if you want:
	•	A version with embedded pseudocode
	•	A slimmer version
	•	A more explicit “implementation checklist”
	•	Or a version tailored for a specific agent format (OpenAI, Claude, etc.)