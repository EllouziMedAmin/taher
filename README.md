# 🎙️ Gemini Live Assistant (Amin's Voice Agent)

Welcome! This project is a real-time, voice-interactive AI assistant. It's designed to be a foundation for building powerful voice agents that can eventually help with tasks like managing your calendar or answering customer questions.

---

## 🌟 For Absolute Beginners
If you are new to programming, don't worry! This project is set up to be as simple as possible. Think of this repository as two main parts:
1. **The Brain (Backend)**: This is `server.py`. It talks to Google's Gemini AI and handles the heavy lifting.
2. **The Face (Frontend)**: These are the files in the `static/` folder. This is what you see in your web browser.

---

## 🛠️ How to Set This Up (Step-by-Step)

### 1. Requirements
You need to have **Python** installed on your computer. 
- [Download Python here](https://www.python.org/downloads/) (Make sure to check the box that says "Add Python to PATH" during installation).

### 2. Get your Google API Key
This project needs a "key" to talk to Google's AI.
1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Click on **"Get API key"**.
3. Create a new API key.
4. **Important**: Never share this key with anyone!

### 3. Setup the Project
1. Open your terminal (or Command Prompt).
2. Type `pip install -r requirements.txt` and press Enter. This installs all the extra "tools" the code needs.
3. Create a file named `.env` in this folder.
4. Open `.env` in a text editor (like Notepad) and paste your key inside like this:
   ```env
   GEMINI_API_KEY=your_key_here_without_quotes
   ```

### 4. Run the Agent
1. In your terminal, type: `python server.py`
2. Open your web browser and go to: `http://localhost:8000`
3. Click **"Anruf starten"** (Start Call) and start talking!

---

## 📁 Project Structure (Where things are)

- **`server.py`**: The main Python logic. This is where you would add "Tools" (like a Calendar tool) in the future.
- **`static/`**: 
    - `index.html`: The structure of the webpage.
    - `style.css`: How the webpage looks (colors, fonts, layout).
    - `app.js`: The "logic" for the browser (managing the microphone and audio).
    - `recorder-processor.js`: A helper for the browser to handle high-quality sound.
- **`.env`**: Your secret keys (Hidden by default).
- **`requirements.txt`**: A list of Python libraries the project needs.

---

## 💡 Future Development (Next Steps)
The next goal for this project is to add **Function Calling**. 
- **Calendar Tool**: You can add a Python function to `server.py` that checks your Google Calendar. 
- **Identity**: Currently, the agent knows it is **Amin's Assistant**. You can change this behavior in the `system_instruction` section inside `server.py`.

---

## 🚀 Deployment (Sharing with others)
To show this to someone else on a different computer:
1. Use a tool like **localtunnel** or **ngrok**.
2. Run `npx localtunnel --port 8000` in your terminal.
3. Share the URL it provides.

---

## License
MIT
