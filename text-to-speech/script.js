const synth = window.speechSynthesis;

const voiceSelect = document.getElementById('voiceSelect');
const rateSlider = document.getElementById('rateSlider');
const rateVal = document.getElementById('rateVal');
const pitchSlider = document.getElementById('pitchSlider');
const pitchVal = document.getElementById('pitchVal');
const textInput = document.getElementById('textInput');
const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');

let voices = [];

function populateVoiceList() {
    voices = synth.getVoices();
    voiceSelect.innerHTML = '';
    
    voices.forEach((voice, i) => {
        const option = document.createElement('option');
        option.textContent = `${voice.name} (${voice.lang})`;
        
        if (voice.default) {
            option.textContent += ' -- DEFAULT';
        }

        option.setAttribute('data-lang', voice.lang);
        option.setAttribute('data-name', voice.name);
        voiceSelect.appendChild(option);
    });
}

populateVoiceList();
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populateVoiceList;
}

rateSlider.addEventListener('input', () => {
    rateVal.textContent = rateSlider.value;
});

pitchSlider.addEventListener('input', () => {
    pitchVal.textContent = pitchSlider.value;
});

playBtn.addEventListener('click', () => {
    if (synth.speaking) {
        console.error('speechSynthesis.speaking');
        synth.cancel(); // Cancel any current speech before starting new
    }

    if (textInput.value !== '') {
        const utterThis = new SpeechSynthesisUtterance(textInput.value);

        const selectedOption = voiceSelect.selectedOptions[0].getAttribute('data-name');
        for (let i = 0; i < voices.length; i++) {
            if (voices[i].name === selectedOption) {
                utterThis.voice = voices[i];
                break;
            }
        }
        
        utterThis.pitch = parseFloat(pitchSlider.value);
        utterThis.rate = parseFloat(rateSlider.value);
        
        synth.speak(utterThis);
    }
});

stopBtn.addEventListener('click', () => {
    synth.cancel();
});
