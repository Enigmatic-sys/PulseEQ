let currentBands = 12;
const rack = document.getElementById('rack');
const defaultFreqs = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 12000, 16000, 20000];

const standardPresets = {
    flat: Array(12).fill(0),
    bass: [12, 10, 8, 5, 2, 0, 0, 0, 0, 0, 0, 0],
    jazz: [4, 2, 0, 2, 4, 3, 1, 0, 1, 3, 4, 5],
    pop: [-2, -1, 0, 2, 4, 4, 2, 0, -1, -2, 0, 0],
    rock: [5, 3, -1, 3, 5, 6, 4, 0, 2, 4, 5, 6],
    electronic: [7, 5, 0, 2, 4, 0, 2, 4, 5, 7, 8, 9]
};

document.getElementById('patreonBtn').onclick = () => chrome.tabs.create({ url: 'https://patreon.com/B286B' });

function getModernColor(val) {
    if (val <= 0) return 'var(--accent-gradient)';
    const factor = val / 20;
    const r = Math.round(0 + 255 * factor);
    const g = Math.round(122 + (59 - 122) * factor);
    return `linear-gradient(180deg, rgb(${r}, ${g}, 255) 0%, #007AFF 100%)`;
}

function createBands(count) {
    rack.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const f = defaultFreqs[i] || 1000;
        const band = document.createElement('div');
        band.className = 'band';
        band.innerHTML = `
            <div class="db-label" id="db-${i}">0.0</div>
            <div class="slider-container">
                <div class="visual-fill" id="fill-${i}"></div>
                <input type="range" id="g-${i}" min="-20" max="20" value="0" step="0.5">
            </div>
            <div class="params">
                <div class="param-row"><span class="p-tag">HZ</span><input type="number" id="f-${i}" class="p-input" value="${f}"></div>
                <div class="param-row"><span class="p-tag">Q</span><input type="number" id="q-${i}" class="p-input" value="1.0" step="0.1"></div>
            </div>
        `;
        rack.appendChild(band);
        
        const slider = band.querySelector('input[type=range]');
        const fill = band.querySelector('.visual-fill');
        const label = band.querySelector('.db-label');

        slider.oninput = () => {
            const v = parseFloat(slider.value);
            fill.style.height = ((v + 20) / 40) * 100 + '%';
            label.innerText = (v > 0 ? '+' : '') + v.toFixed(1);
            
            if (v > 0) {
                fill.style.background = getModernColor(v);
                fill.style.boxShadow = `0 0 ${v * 1.5}px rgba(0, 122, 255, 0.6)`;
                label.style.color = v > 12 ? '#FF3B30' : '#fff';
            } else {
                fill.style.background = 'rgba(255,255,255,0.2)';
                fill.style.boxShadow = 'none';
                label.style.color = '#fff';
            }
        };
        slider.dispatchEvent(new Event('input'));
    }
}

// Fixed Preset Logic
document.getElementById('presetList').onchange = (e) => {
    const name = e.target.value;
    const isCustom = e.target.options[e.target.selectedIndex].parentNode.id === 'custPresets';
    document.getElementById('deletePreset').style.display = isCustom ? 'block' : 'none';

    chrome.storage.local.get(['customPresets'], (res) => {
        const all = {...standardPresets, ...(res.customPresets || {})};
        const targetGains = all[name];
        if (targetGains) {
            targetGains.forEach((g, i) => {
                const s = document.getElementById(`g-${i}`);
                if (s) { 
                    s.value = g; 
                    s.dispatchEvent(new Event('input')); // Updates visuals
                }
            });
            document.getElementById('applyBtn').click(); // Auto-apply to audio
        }
    });
};

document.getElementById('savePreset').onclick = () => {
    const name = document.getElementById('presetName').value.trim();
    if (!name) return;
    const currentGains = Array.from({length: 12}, (_, i) => {
        const s = document.getElementById(`g-${i}`);
        return s ? parseFloat(s.value) : 0;
    });
    chrome.storage.local.get(['customPresets'], (res) => {
        const custom = res.customPresets || {};
        custom[name] = currentGains;
        chrome.storage.local.set({ customPresets: custom }, () => location.reload());
    });
};

document.getElementById('deletePreset').onclick = () => {
    const name = document.getElementById('presetList').value;
    chrome.storage.local.get(['customPresets'], (res) => {
        const custom = res.customPresets || {};
        delete custom[name];
        chrome.storage.local.set({ customPresets: custom }, () => location.reload());
    });
};

chrome.storage.local.get(['customPresets'], (res) => {
    const custom = res.customPresets || {};
    const container = document.getElementById('custPresets');
    Object.keys(custom).forEach(name => {
        const opt = document.createElement('option');
        opt.value = name; opt.innerText = name;
        container.appendChild(opt);
    });
});

document.getElementById('bandCount').onchange = (e) => {
    currentBands = parseInt(e.target.value);
    createBands(currentBands);
};

document.getElementById('applyBtn').onclick = async () => {
    const config = Array.from({length: currentBands}, (_, i) => ({
        f: parseFloat(document.getElementById(`f-${i}`).value),
        g: parseFloat(document.getElementById(`g-${i}`).value),
        q: parseFloat(document.getElementById(`q-${i}`).value)
    }));
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab) return;
    chrome.scripting.executeScript({
        target: {tabId: tab.id},
        func: (cfg) => {
            const media = document.querySelector('video, audio');
            if (!media) return;
            if (!window.audioCtx) {
                window.audioCtx = new AudioContext();
                window.source = window.audioCtx.createMediaElementSource(media);
            }
            if (window.nodes) window.nodes.forEach(n => n.disconnect());
            window.nodes = cfg.map(c => {
                const f = window.audioCtx.createBiquadFilter();
                f.type = 'peaking'; f.frequency.value = c.f; f.gain.value = c.g; f.Q.value = c.q;
                return f;
            });
            let curr = window.source;
            window.nodes.forEach(n => { curr.connect(n); curr = n; });
            curr.connect(window.audioCtx.destination);
        },
        args: [config]
    });
};

createBands(12);
