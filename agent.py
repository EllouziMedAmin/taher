import asyncio
import os
import sys
import pyaudio
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

# Audio settings
FORMAT = pyaudio.paInt16
CHANNELS = 1
SEND_RATE = 16000
RECEIVE_RATE = 24000
CHUNK_SIZE = 512

async def audio_playback_task(session, p):
    """Receives audio chunks from the Gemini API and plays them to the speaker."""
    stream_out = p.open(
        format=FORMAT,
        channels=CHANNELS,
        rate=RECEIVE_RATE,
        output=True,
    )
    
    try:
        async for response in session.receive():
            server_content = response.server_content
            if server_content is not None:
                # Print input transcription (what Gemini hears you say)
                if getattr(server_content, "input_transcription", None):
                    print(f"\n[Du]: {server_content.input_transcription.text}")
                
                # Print output transcription (what Gemini says)
                if getattr(server_content, "output_transcription", None):
                    print(f"\n[Agent]: {server_content.output_transcription.text}")

                model_turn = getattr(server_content, "model_turn", None)
                if model_turn is not None:
                    for part in getattr(model_turn, "parts", []):
                        # Direct audio output route
                        if getattr(part, "inline_data", None) and part.inline_data.data:
                            stream_out.write(part.inline_data.data)

                if getattr(server_content, "turn_complete", False):
                    print(flush=True)
                
    except asyncio.CancelledError:
        pass
    except Exception as e:
        print(f"\n[Error in playback task]: {e}")
    finally:
        stream_out.stop_stream()
        stream_out.close()


async def audio_capture_task(session, p):
    """Captures microphone audio and pushes it to the Gemini Live session."""
    audio_queue = asyncio.Queue()

    def callback(in_data, frame_count, time_info, status):
        audio_queue.put_nowait(in_data)
        return (None, pyaudio.paContinue)

    stream_in = p.open(
        format=FORMAT,
        channels=CHANNELS,
        rate=SEND_RATE,
        input=True,
        frames_per_buffer=CHUNK_SIZE,
        stream_callback=callback
    )
    
    stream_in.start_stream()
    
    try:
        while True:
            data = await audio_queue.get()
            # Send the PCM audio block using the syntax from the docs
            await session.send_realtime_input(
                audio=types.Blob(
                    data=data,
                    mime_type=f"audio/pcm;rate={SEND_RATE}"
                )
            )
    except asyncio.CancelledError:
        pass
    except Exception as e:
        print(f"\n[Error in capture task]: {e}")
    finally:
        stream_in.stop_stream()
        stream_in.close()


async def main():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Fehler: GEMINI_API_KEY wurde nicht in .env gefunden.")
        sys.exit(1)

    print("Initialisiere System...")

    # PyAudio manager
    p = pyaudio.PyAudio()

    # Create GenAI Client
    client = genai.Client()

    # Recommended model for the Google GenAI Live API
    model = "gemini-2.5-flash-native-audio-preview-12-2025" 

    # We use a dict configuration to avoid rigid typed class errors (like the Part.from_text TypeError)
    config = {
        "response_modalities": ["AUDIO"],
        "system_instruction": {
            "parts": [{"text": 
                "Du bist ein hilfreicher und freundlicher Kundenservice-Mitarbeiter. "
                "Du sprichst ausschließlich Deutsch. "
                "Deine Antworten sollten natürlich, prägnant und gesprächsorientiert "
                "sein, da diese über ein Telefon geführt werden."
            }]
        },
        "input_audio_transcription": {},
        "output_audio_transcription": {}
    }
    
    print("Verbinde mit Gemini Live API...")
    
    try:
        async with client.aio.live.connect(model=model, config=config) as session:
            print("="*50)
            print("🚀 Verbunden! Der Agent hört jetzt zu.")
            print("   Sprich in dein Mikrofon. (Ctrl+C zum Beenden)")
            print("="*50)
            
            # Run both streaming directions concurrently
            capture_task = asyncio.create_task(audio_capture_task(session, p))
            playback_task = asyncio.create_task(audio_playback_task(session, p))
            
            await asyncio.gather(capture_task, playback_task)
            
    except asyncio.CancelledError:
        print("\nBeende Session...")
    except KeyboardInterrupt:
        print("\nBenutzerabbruch...")
    except Exception as e:
        print(f"\nVerbindungsfehler: {e}")
    finally:
        p.terminate()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nProgramm beendet.")
