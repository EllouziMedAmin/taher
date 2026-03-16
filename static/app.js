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
const transcriptionContainer = document.getElementById("transcriptionContainer");
const userTranscript = document.getElementById("userTranscript");
const modelTranscript = document.getElementById("modelTranscript");

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
let activeSources = [];

function stopAllAudio() {
    activeSources.forEach(source => {
        try {
            source.stop();
        } catch (e) {}
    });
    activeSources = [];
    nextStartTime = audioContext ? audioContext.currentTime : 0;
    agentAvatar.classList.remove("speaking");
    console.log("Audio playback stopped due to interruption.");
}

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
    
    activeSources.push(source);
    
    // Add visual feedback
    agentAvatar.classList.add("speaking");
    
    source.onended = () => {
        // Remove from active sources
        activeSources = activeSources.filter(s => s !== source);
        
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
        
        // Load AudioWorklet processor
        await audioContext.audioWorklet.addModule('/static/recorder-processor.js');
        
        const source = audioContext.createMediaStreamSource(mediaStream);
        const workletNode = new AudioWorkletNode(audioContext, 'recorder-processor');
        
        // 3. Connect WebSocket to FastAPI backend
        // Use the current host to avoid hardcoding localhost
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
        ws.binaryType = "arraybuffer";
        
        ws.onopen = () => {
            console.log("WebSocket connected.");
            statusText.innerText = "Verbunden";
            subStatusText.innerText = "Der Agent hört dich. Sprich jetzt!";
            isCallActive = true;
            
            transcriptionContainer.style.display = "flex";
            userTranscript.innerText = "";
            modelTranscript.innerText = "";
            
            startCallBtn.style.display = "none";
            endCallBtn.style.display = "inline-block";
            
            source.connect(workletNode);
            workletNode.connect(audioContext.destination); // Keep it connected to destination if needed for timing

            workletNode.port.onmessage = (event) => {
                if (!isCallActive || ws.readyState !== WebSocket.OPEN) return;
                
                const inputData = event.data;
                const pcm16Data = downsampleBuffer(inputData, inputSampleRate, 16000);
                
                // Send raw Int16 PCM array buffer to WebSocket
                ws.send(pcm16Data.buffer);
            };
            
            // Store it globally so we can disconnect it
            scriptProcessor = workletNode; 
        };
        
        ws.onmessage = async (event) => {
            if (typeof event.data === "string") {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === "interrupted") {
                        stopAllAudio();
                    }
                    if (msg.type === "input_transcript") {
                        userTranscript.innerText = "Du: " + msg.text;
                    }
                    if (msg.type === "output_transcript") {
                        modelTranscript.innerText = "Agent: " + msg.text;
                    }
                } catch (e) {
                    console.error("Error parsing JSON message:", e);
                }
            } else {
                // Receive raw Int16 PCM audio chunk from Gemini via FastAPI
                playAudioChunk(event.data);
            }
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
    
    if (transcriptionContainer) {
        transcriptionContainer.style.display = "none";
    }
}

startCallBtn.addEventListener("click", startCall);
endCallBtn.addEventListener("click", endCall);
