import asyncio
import os
import sys
import base64
import traceback
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Serve static files from the "static" directory
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def get():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return HTMLResponse(f.read())

async def receive_from_gemini(websocket: WebSocket, session):
    """Receive audio from Gemini and send it to the browser."""
    print("Task started: receive_from_gemini")
    try:
        while True:
            # The iterator in session.receive() might exhaust after a turn
            # so we wrap it in a while loop to listen for subsequent turns.
            async for response in session.receive():
                server_content = response.server_content
                if server_content is not None:
                    # Check for interruption signal
                    if getattr(server_content, "interrupted", False):
                        print("Gemini signal: Interrupted")
                        # Signal the browser to stop audio playback
                        await websocket.send_json({"type": "interrupted"})
                        continue

                    # Handle transcriptions
                    if getattr(server_content, "input_transcription", None):
                        transcript = server_content.input_transcription.text
                        await websocket.send_json({"type": "input_transcript", "text": transcript})
                    
                    if getattr(server_content, "output_transcription", None):
                        transcript = server_content.output_transcription.text
                        await websocket.send_json({"type": "output_transcript", "text": transcript})

                    model_turn = getattr(server_content, "model_turn", None)
                    if model_turn is not None:
                        for part in getattr(model_turn, "parts", []):
                            # WebSockets expect binary data for audio
                            if getattr(part, "inline_data", None) and part.inline_data.data:
                                # Send raw PCM bytes directly to the browser
                                await websocket.send_bytes(part.inline_data.data)

                    # Send turnaround signals if needed by the UI
                    if getattr(server_content, "turn_complete", False):
                        print("Gemini signal: Turn Complete (Response finished)")
            
            # If the iterator finishes, we stay in the while loop to Wait for next session events
            # unless the session is closed by elsewhere.
            await asyncio.sleep(0.01) # Avoid tight loop if iterator exhausts immediately
                    
    except asyncio.CancelledError:
        print("Task cancelled: receive_from_gemini")
    except Exception as e:
        print(f"Error receiving from Gemini: {e}")
        traceback.print_exc()
    finally:
        print("Task ended: receive_from_gemini")

async def send_to_gemini(websocket: WebSocket, session):
    """Receive audio from the browser and send it to Gemini."""
    print("Task started: send_to_gemini")
    try:
        while True:
            # We expect bytes (PCM) or string (JSON commands/keepalive)
            try:
                message = await websocket.receive()
            except RuntimeError:
                # Occurs if the connection is already closing/closed
                break
            
            if "bytes" in message:
                data = message["bytes"]
                await session.send_realtime_input(
                    audio=types.Blob(
                        data=data,
                        mime_type="audio/pcm;rate=16000"
                    )
                )
            elif "text" in message:
                print(f"Received text from browser: {message['text']}")
                # Handle possible JSON commands here
            else:
                print(f"Received unknown message type: {message}")
                
    except WebSocketDisconnect:
        print("Browser disconnected (WebSocketDisconnect).")
    except asyncio.CancelledError:
        print("Task cancelled: send_to_gemini")
    except Exception as e:
        print(f"Error sending to Gemini: {e}")
        traceback.print_exc()
    finally:
        print("Task ended: send_to_gemini")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("Browser WebSocket connection accepted.")
    
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Fehler: GEMINI_API_KEY wurde nicht in .env gefunden.")
        await websocket.close()
        return

    client = genai.Client()
    model = "gemini-2.5-flash-native-audio-preview-12-2025" 

    config = {
        "response_modalities": ["AUDIO"],
        "system_instruction": {
            "parts": [{"text": 
                "Du bist Amin's Assistent, ein hilfreicher und freundlicher Kundenservice-Mitarbeiter. "
                "Du sprichst ausschließlich Deutsch. "
                "Deine Antworten sollten natürlich, prägnant und gesprächsorientiert "
                "sein, da diese über ein Telefon oder WebRTC geführt werden."
            }]
        },
        "input_audio_transcription": {},
        "output_audio_transcription": {},
        "realtime_input_config": {
            "automatic_activity_detection": {
                "disabled": False,
                "silence_duration_ms": 1000,
            }
        }
    }
    
    try:
        async with client.aio.live.connect(model=model, config=config) as session:
            print("Connected to Gemini Live API session.")
            
            # Run both streaming directions concurrently
            receive_task = asyncio.create_task(receive_from_gemini(websocket, session))
            send_task = asyncio.create_task(send_to_gemini(websocket, session))
            
            # Use gather to wait for both tasks to complete.
            # Usually they will run until the browser disconnects or an error occurs.
            await asyncio.gather(receive_task, send_task)
                
    except Exception as e:
        print(f"Session connection error: {e}")
        traceback.print_exc()
    finally:
        print("Closing browser WebSocket.")
        try:
            await websocket.close()
        except:
            pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
