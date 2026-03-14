import asyncio
import os
import sys
import base64
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
    try:
        async for response in session.receive():
            server_content = response.server_content
            if server_content is not None:
                model_turn = getattr(server_content, "model_turn", None)
                if model_turn is not None:
                    for part in getattr(model_turn, "parts", []):
                        # WebSockets expect binary data for audio
                        if getattr(part, "inline_data", None) and part.inline_data.data:
                            # Send raw PCM bytes directly to the browser
                            await websocket.send_bytes(part.inline_data.data)

                # Send turnaround signals if needed by the UI
                if getattr(server_content, "turn_complete", False):
                    pass # Could send a JSON message here indicating turn complete
                    
    except asyncio.CancelledError:
        pass
    except Exception as e:
        print(f"Error receiving from Gemini: {e}")

async def send_to_gemini(websocket: WebSocket, session):
    """Receive audio from the browser and send it to Gemini."""
    try:
        while True:
            # We expect binary data from the WebSocket (Int16 PCM)
            data = await websocket.receive_bytes()
            
            await session.send_realtime_input(
                audio=types.Blob(
                    data=data,
                    mime_type="audio/pcm;rate=16000"
                )
            )
    except WebSocketDisconnect:
        print("Browser disconnected.")
    except asyncio.CancelledError:
        pass
    except Exception as e:
        print(f"Error sending to Gemini: {e}")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
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
                "Du bist ein hilfreicher und freundlicher Kundenservice-Mitarbeiter. "
                "Du sprichst ausschließlich Deutsch. "
                "Deine Antworten sollten natürlich, prägnant und gesprächsorientiert "
                "sein, da diese über ein Telefon oder WebRTC geführt werden."
            }]
        }
    }
    
    try:
        async with client.aio.live.connect(model=model, config=config) as session:
            print("Connected to Gemini Live API via WebSocket.")
            
            # Run both streaming directions concurrently
            receive_task = asyncio.create_task(receive_from_gemini(websocket, session))
            send_task = asyncio.create_task(send_to_gemini(websocket, session))
            
            done, pending = await asyncio.wait(
                [receive_task, send_task],
                return_when=asyncio.FIRST_COMPLETED
            )
            
            for task in pending:
                task.cancel()
                
    except Exception as e:
        print(f"Connection error: {e}")
    finally:
        try:
            await websocket.close()
        except:
            pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
