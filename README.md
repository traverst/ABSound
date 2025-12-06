# Voice Model Parameter Comparison Site

A static site tool to compare audio samples generated with different parameters (Exaggeration, CFG, Temperature). Built with Jekyll.

## Project Status
- **Current Stage**: Stage 0.5 (Automatic Parameter Extraction)
- **Goal**: A/B testing interface for voice model parameters.

## Prerequisites
- Ruby (version 2.7 or higher recommended)
- Bundler

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

## Development Stages
- [x] **Stage 0**: Project Setup (Jekyll structure, config)
- [x] **Stage 0.5**: Automatic Parameter Extraction (JS parser, data injection)
- [ ] **Stage 1**: Core UI Structure (Comparison interface, Reference page)
- [ ] **Stage 1.5**: Reference Audio Support
- [ ] **Stage 2**: Pairing Logic (Tournament system)
- [ ] **Stage 3**: Comparison UI Logic (A/B playback)
- [ ] **Stage 4**: Scoring & Ranking
- [ ] **Stage 5**: Visualization
- [ ] **Stage 6**: History & Export
- [ ] **Stage 7**: Polishing
- [ ] **Stage 8**: Publishing
