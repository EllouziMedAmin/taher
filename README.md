# Gemini Live Assistant

A real-time, voice-interactive AI assistant powered by the Google Gemini 2.5 Flash Live API. This application features a modern, responsive UI with live audio streaming and real-time transcription.

## Features

- **Gemini Live API Integration**: Real-time voice interaction with the `gemini-2.0-flash-exp` model.
- **Natural Conversation**: Supports Voice Activity Detection (VAD) and interruptions.
- **Real-Time Transcription**: View live text of both your speech and the agent's responses.
- **Modern Audio Implementation**: Uses `AudioWorkletNode` for optimized, low-latency audio processing.
- **Persistent Sessions**: Robust WebSocket implementation that maintains connection across multiple conversational turns.
- **Beautiful UI**: Premium dark-mode design with dynamic animations and glassmorphism.

## Getting Started

### Prerequisites

- Python 3.9+
- A Google Gemini API Key

### Installation

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd taher
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Configure your API key:
   Create a `.env` file in the root directory and add your key:
   ```env
   GEMINI_API_KEY=your_actual_api_key_here
   ```

### Running the Application

1. Start the FastAPI server:
   ```bash
   python server.py
   ```

2. Open your browser and navigate to `http://localhost:8000`.

3. Click **"Anruf starten"** to begin speaking with your assistant!

## Technical Details

- **Backend**: FastAPI with WebSockets.
- **Frontend**: Vanilla JavaScript with `AudioWorklet` for PCM audio capture and playback.
- **Audio Format**: Mono 16-bit PCM at 16kHz for input and 24kHz for output.
- **Model**: `gemini-2.0-flash-exp` with native audio capabilities.

## License

MIT
