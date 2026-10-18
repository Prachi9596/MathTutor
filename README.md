# MathTutor

MathTutor is a web-based mathematics learning workspace. Students can type a problem or upload a handwritten expression, review its transcription, solve supported problems, check answers, view graphs, and track their practice.

## Overview

MathTutor combines a pretrained deep-learning model for handwritten formula recognition with symbolic mathematics and a browser-based learning interface.

When a student uploads an image, the recognition model converts the handwritten formula into LaTeX. The student can review and edit that transcription before sending it to the mathematics solver. This is important because handwritten symbols such as exponents, square roots, fractions, and primes can be misrecognized.

The project is an educational prototype. Its features support a defined range of mathematics problems; it does not guarantee that every handwritten expression can be recognized or every mathematical problem can be solved.

## Features

- **Handwritten problem recognition:** Upload a PNG, JPG, or WEBP image and transcribe it with Pix2Text.
- **Editable transcription:** Review and correct the recognized LaTeX before solving.
- **Typed problem entry:** Enter problems with a keyboard or an on-screen math keypad.
- **Equation solving:** Solve supported equations and systems with up to four variables.
- **Calculus:** Differentiate expressions and calculate supported indefinite and definite integrals.
- **Differential equations:** Solve a limited first-order form, `y' = g(x)y`.
- **Scientific calculator:** Evaluate supported numerical and mathematical expressions.
- **Final-answer checker:** Compare eligible submitted answers with the calculated result.
- **Step checker:** For one-variable linear equations, flag the first written step that changes the solution.
- **Graphing:** Plot supported one-variable expressions and two-variable contour plots.
- **Progress dashboard:** Show answer-check history, topic accuracy, weak areas, and topic-specific study suggestions.
- **Adaptive practice:** Use recent checked attempts to suggest a practice difficulty with a small LSTM prototype.
- **Mistake notebook and history:** Store practice records in the browser.

## How it works

1. The student types a problem or uploads a handwritten image.
2. For an image, the FastAPI server validates and prepares it before passing it to Pix2Text.
3. Pix2Text returns LaTeX, which the student can review and edit in the browser.
4. The frontend sends the corrected expression to the mathematics API.
5. SymPy calculates a supported result and returns structured output.
6. The browser displays the answer, available steps, answer-checking controls, and graphing options.
7. Checked answers are saved in the browser and used by the dashboard and practice recommender.

## Technology

| Component | Technology | Purpose |
|---|---|---|
| Frontend | HTML, CSS, JavaScript | User interface, keypads, transcription editor, graphs, and dashboard |
| API backend | Python, FastAPI, Uvicorn | Serves the application and connects frontend requests to backend features |
| Handwriting recognition | Pix2Text MFR 1.5, Transformers | Transcribes mathematical images into LaTeX |
| Recognition inference | Optimum and ONNX Runtime | Runs the pretrained formula-recognition model |
| Symbolic mathematics | SymPy | Solves supported equations and performs calculus and comparisons |
| Adaptive practice | PyTorch LSTM | Suggests a practice difficulty from recent answer history |
| Browser storage | `localStorage` | Saves history, mistakes, and checked attempts in the current browser |

## Deep-learning components

### Handwritten formula recognition

MathTutor uses the pretrained `breezedeus/pix2text-mfr-1.5` model for formula-image recognition. The application runs inference locally through Transformers and ONNX Runtime. It does not train this recognition model from scratch.

The first recognition request may download the model from Hugging Face. Later requests can use the local model cache.

### Adaptive practice

The LSTM recommender receives a short sequence of checked attempts. Its features represent question difficulty and recent correctness. After at least six attempts, it estimates a suitable difficulty from three levels. Before then, the application uses a warm-up rule.

The recommender is experimental. It is not trained on a large student dataset, does not save a permanent model for each student, and has not been validated as a measure of learning or mastery.

## Setup

### Requirements

- Windows, macOS, or Linux
- Python 3.12 recommended
- Internet access for the first download of the pretrained recognition model

### Windows PowerShell

Run these commands from the project root:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-recognizer.txt
.\.venv\Scripts\python.exe -m uvicorn server:app --reload
