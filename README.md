# Voice Model Parameter Comparison Site

A static site tool to compare audio samples generated with different parameters (Exaggeration, CFG, Temperature). Built with Jekyll.

## Project Status
- **Current Stage**: Stage 0.5 (Automatic Parameter Extraction)
- **Goal**: A/B testing interface for voice model parameters.

## Prerequisites
- Ruby (version 2.7 or higher recommended)
- Bundler

## Strategy & Assessment Approach

This project uses a **User-Controlled Adaptive Strategy** to efficiently find optimal parameters without requiring exhaustive pairwise comparisons (which would require >1700 matches).

### The 3-Phase Approach

1.  **Phase 1: Explore (Global Search)**
    *   **Algorithm**: Farthest Point Sampling.
    *   **Logic**: The system dynamically selects the sample that is *farthest* in parameter space from the current "Champion" and any recently played samples.
    *   **Metric**: **Coverage**. Calculated as `1.0 - (Distance to Farthest Remaining Candidate / Max Possible Distance)`. This metric increases as the "holes" in the parameter space are filled.

2.  **Phase 2: Refine (Local Search)**
    *   **Algorithm**: Hill Climbing (Nearest Neighbors).
    *   **Logic**: The system selects samples that are *closest* to the current Champion.
    *   **Metric**: **Stability**. Tracks the number of consecutive wins for the current Champion. A score of 5/5 indicates a strong local optimum.

3.  **Phase 3: Showdown (Verification)**
    *   **Algorithm**: Round-Robin Tournament.
    *   **Logic**: The top candidates found during the session (the current Champion + top historical performers) face off in a final bracket.
    *   **Metric**: **Progress**. Percentage of showdown matches completed.

### Assessment
- **Subjective**: Users vote based on their preference (A, B, or Tie).
- **Objective**: The system tracks the "Champion" state and visualizes the path through parameter space.
- **Outcome**: A ranked leaderboard of parameters that best match the user's preference.

## Setup
1. Clone the repository.
2. Install dependencies:
   ```bash
   bundle install
   ```
   *Note: If you encounter permission errors, use `bundle install --path vendor/bundle`.*

## Running Locally
Start the Jekyll development server:
```bash
bundle exec jekyll serve
```
Access the site at [http://localhost:4000](http://localhost:4000).

## Adding Audio Samples
- **Audio Files**: Place your generated audio samples in `assets/audio/`.
    - Supported formats: `.wav`, `.aiff`, `.aif`
    - Naming convention: `sample_e{exaggeration}_cfg{cfg}_t{temp}.wav` (or `test_...`)
    - Example: `sample_e0.05_cfg0.25_t0.12.aiff`
- **Reference Audio**: Place reference audio files in `assets/audio/reference/`.
    - Supported formats: `.wav`
- **Update File List**: After adding files, update `_data/audio_files.yml`:
   ```yaml
   - sample_e0.05_cfg0.25_t0.12.wav
   - sample_e0.10_cfg0.40_t0.07.wav
   ```
   *(Note: This manual step is required because static sites cannot list directory contents dynamically.)*

