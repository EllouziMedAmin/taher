let ws;
let audioContext;
let scriptProcessor;
let mediaStream;
let isCallActive = false;

const startCallBtn = document.getElementById("startCallBtn");
const endCallBtn = document.getElementById("endCallBtn");
const statusText = document.getElementById("statusText");
const subStatusText = document.getElementById("subStatusText");
const agentAvatar = document.getElementById("agentAvatar");

/**
 * We need to resample the audio coming from the browser microphone (usually 44.1kHz or 48kHz)
 * down to 16kHz for Gemini.
 */
function downsampleBuffer(buffer, sampleRate, outRate) {
    if (outRate === sampleRate) return buffer;
    if (outRate > sampleRate) throw "downsampling rate show be smaller than original sample rate";
    
    const sampleRateRatio = sampleRate / outRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Int16Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    
    while (offsetResult < result.length) {
        let nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
        let accum = 0, count = 0;
        for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
            accum += buffer[i];
            count++;
        }
        
        // Convert Float32 (-1.0 to 1.0) to Int16 (-32768 to 32767)
        let floatSample = accum / count;
        let intSample = Math.max(-1, Math.min(1, floatSample)) * 0x7FFF;
        result[offsetResult] = intSample;
        
        offsetResult++;
        offsetBuffer = nextOffsetBuffer;
    }
    return result;
}

// Very basic queue to play back incoming 24kHz audio from Gemini smoothly
let audioQueue = [];
let isPlaying = false;
let nextStartTime = 0;

function playAudioChunk(arrayBuffer) {
    if (!audioContext) return;
    
    // The incoming raw PCM is Int16 at 24000 Hz
    const int16Array = new Int16Array(arrayBuffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 0x7FFF;
    }

    const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000);
    audioBuffer.getChannelData(0).set(float32Array);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);

    if (nextStartTime < audioContext.currentTime) {
        nextStartTime = audioContext.currentTime;
    }

    source.start(nextStartTime);
    nextStartTime += audioBuffer.duration;
    
    // Add visual feedback
    agentAvatar.classList.add("speaking");
    
    source.onended = () => {
        // If nothing else is scheduled soon, stop animation
        if (nextStartTime <= audioContext.currentTime + 0.1) {
            agentAvatar.classList.remove("speaking");
        }
    };
}


async function startCall() {
    try {
        statusText.innerText = "Verbinde...";
        subStatusText.innerText = "Bitte Mikrofon freigeben...";
        
        // 1. Get Microphone access
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // 2. Initialize AudioContext for capturing
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const inputSampleRate = audioContext.sampleRate;
        const source = audioContext.createMediaStreamSource(mediaStream);
        
        // 3. Connect WebSocket to FastAPI backend
        ws = new WebSocket(`ws://${window.location.host}/ws`);
        ws.binaryType = "arraybuffer";
        
        ws.onopen = () => {
            console.log("WebSocket connected.");
            statusText.innerText = "Verbunden";
            subStatusText.innerText = "Der Agent hört dich. Sprich jetzt!";
            isCallActive = true;
            
            startCallBtn.style.display = "none";
            endCallBtn.style.display = "inline-block";
            
            // Start capturing and sending audio
            scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContext.destination); // Required for Chrome to fire onaudioprocess
            
            scriptProcessor.onaudioprocess = (e) => {
                if (!isCallActive || ws.readyState !== WebSocket.OPEN) return;
                
                const inputData = e.inputBuffer.getChannelData(0);
                const pcm16Data = downsampleBuffer(inputData, inputSampleRate, 16000);
                
                // Send raw Int16 PCM array buffer to WebSocket
                ws.send(pcm16Data.buffer);
            };
        };
        
        ws.onmessage = async (event) => {
            // Receive raw Int16 PCM audio chunk from Gemini via FastAPI
            playAudioChunk(event.data);
        };
        
        ws.onclose = () => {
            endCall();
        };

    } catch (err) {
        console.error("Error accessing mic or socket:", err);
        statusText.innerText = "Fehler";
        subStatusText.innerText = "Mikrofon-Zugriff verweigert oder Server nicht erreichbar.";
    }
}

function endCall() {
    isCallActive = false;
    
    if (ws) {
        ws.close();
        ws = null;
    }
    
    if (scriptProcessor) {
        scriptProcessor.disconnect();
        scriptProcessor = null;
    }
    
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    
    agentAvatar.classList.remove("speaking");
    statusText.innerText = "Bereit für den Anruf";
    subStatusText.innerText = "Der Anruf wurde beendet.";
    startCallBtn.style.display = "inline-block";
    endCallBtn.style.display = "none";
}

startCallBtn.addEventListener("click", startCall);
endCallBtn.addEventListener("click", endCall);
