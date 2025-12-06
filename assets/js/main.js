console.log("Voice Model Comparison Loaded");

class AudioParser {
    constructor(files) {
        this.files = files || [];
        this.parsed = this.parseFiles();
    }

    parseFiles() {
        return this.files.map(filename => {
            // Regex to match: sample_e(float)_cfg(float)_t(float).wav
            const match = filename.match(/sample_e([\d\.]+)_cfg([\d\.]+)_t([\d\.]+)\.wav/);

            if (match) {
                const baseUrl = window.BASE_URL || '';
                return {
                    id: filename.replace('.wav', ''),
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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (window.AUDIO_FILES) {
        const parser = new AudioParser(window.AUDIO_FILES);
        console.log("Parsed Audio Files:", parser.parsed);
        console.log("Parameter Ranges:", parser.getMinMax());

        // Temporary: Display parsed data on home page for verification
        const welcome = document.getElementById('welcome');
        if (welcome) {
            const debugInfo = document.createElement('pre');
            debugInfo.style.background = '#f4f4f4';
            debugInfo.style.padding = '1rem';
            debugInfo.textContent = JSON.stringify(parser.parsed, null, 2);
            welcome.after(debugInfo);
        }
    }
});
