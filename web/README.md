# MathTutor local prototype

This prototype runs handwritten formula recognition and symbolic calculations through a local Python server. It does not need a Gemini API key, and it does not connect to a Colab notebook. The existing training notebooks are unchanged.

## Run it

Use Python 3.12 for the local recognition environment. The ONNX runtime wrapper used here is incompatible with the newest PyTorch 2.9+ line, so the requirements pin PyTorch below 2.9. From the project root in PowerShell:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-recognizer.txt
.\.venv\Scripts\python.exe -m uvicorn server:app --reload
```

Then open <http://127.0.0.1:8000>. The first image recognition request downloads the Pix2Text-MFR-1.5 model from Hugging Face; later requests reuse the local model cache. The server also exposes `/calculate` for local SymPy evaluation, differentiation, and supported integrals. Opening `web/index.html` as a static file will not provide these Python-backed features.

## Prototype features

- Choose **Upload handwriting** to send one PNG, JPG, or WEBP problem to local Pix2Text recognition. Review or edit the transcription and preview before solving. A function definition such as `f(x) = ...` is differentiated with respect to x; a derivative statement such as `f'(x) = ...` is integrated to recover `f(x) + C`.
- Choose **Type a problem** to enter a question with the standard or scientific keypad. The separate calculator is for numerical evaluation and calculus operations.
- Solve arithmetic, polynomial equations, and linear systems with up to four variables. Basic single-variable linear equations retain their explicit algebra steps; broader systems show their symbolic or matrix-solving steps.
- Use the scientific calculator for numerical evaluation, higher-order differentiation, repeated indefinite integration, and definite integration when SymPy can return a supported result.
- From an image, differentiate a recognized function definition, integrate a recognized derivative statement, and submit common explicit derivative or integral notation.
- Check supported numeric final answers; an optional answer photo is transcribed into the answer field for review before checking. The prototype does not grade handwritten working or compare all symbolic and multi-variable answers.
- Generate linear-equation practice questions, check answers, and keep question history and a mistake notebook in browser storage.
- Adaptive practice uses a small PyTorch LSTM fitted to the current browser's checked linear-equation attempts. It estimates success across three difficulty levels and picks a challenging next question. Before six checked attempts are available, the app uses a warm-up heuristic. The model is an educational prototype trained on the learner's own short history, so its probability estimates are not a validated assessment.

The LSTM recommendation endpoint is POST /learning/recommend. It receives only checked expression/correctness pairs from the browser and does not persist them on the server.

For best recognition, use a clear, tightly framed image of the formula. The first-run model download requires internet access. SymPy covers a wide range of symbolic expressions, but no computer algebra system can return elementary closed forms for every possible integral or solve every nonlinear system uniquely. This prototype reports when a result is unsupported or when free variables remain.
