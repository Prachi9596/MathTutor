

from pathlib import Path
import logging

from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from math_engine import calculate, check_work_steps, expressions_equivalent, plot_expression, plot_surface
from learning_lstm import recommend as recommend_practice
from recognizer import image_to_latex

ROOT = Path(__file__).resolve().parent
MAX_IMAGE_BYTES = 12 * 1024 * 1024
ALLOWED_TYPES = {"image/png", "image/jpeg", "image/webp"}

app = FastAPI(title="MathTutor Local Math Engine")
logger = logging.getLogger(__name__)


@app.post("/recognize")
def recognize(image: UploadFile = File(...)):
    if image.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Use a PNG, JPG, or WEBP image.")
    data = image.file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Choose an image smaller than 12 MB.")
    try:
        return {"latex": image_to_latex(data, image.content_type)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        logger.exception("Pix2Text failed while loading the model or recognizing an image")
        raise HTTPException(
            status_code=503,
            detail="The local Pix2Text model could not load or recognize this image. See the server terminal for the detailed error.",
        ) from error


class CalculationRequest(BaseModel):
    expression: str = Field(min_length=1, max_length=400)
    operation: str
    variable: str = Field(default="x", min_length=1, max_length=1)
    lower: str | None = Field(default=None, max_length=100)
    upper: str | None = Field(default=None, max_length=100)
    order: int = Field(default=1, ge=1, le=4)


class LearningAttempt(BaseModel):
    expression: str = Field(min_length=1, max_length=400)
    correct: bool


class LearningRequest(BaseModel):
    attempts: list[LearningAttempt] = Field(default_factory=list, max_length=120)


class StepCheckRequest(BaseModel):
    problem: str = Field(min_length=1, max_length=400)
    work: str = Field(min_length=1, max_length=4000)


class CompareRequest(BaseModel):
    expected: str = Field(min_length=1, max_length=400)
    actual: str = Field(min_length=1, max_length=400)


class PlotRequest(BaseModel):
    expression: str = Field(min_length=1, max_length=400)
    variable: str = Field(default="x", min_length=1, max_length=1)
    x_min: float = -10
    x_max: float = 10
    samples: int = Field(default=241, ge=20, le=1000)


class SurfacePlotRequest(BaseModel):
    expression: str = Field(min_length=1, max_length=400)
    x_variable: str = Field(default="x", min_length=1, max_length=1)
    y_variable: str = Field(default="y", min_length=1, max_length=1)
    x_min: float = -5
    x_max: float = 5
    y_min: float = -5
    y_max: float = 5
    samples: int = Field(default=41, ge=15, le=81)


@app.post("/plot")
def plot(request: PlotRequest):
    try:
        return plot_expression(request.expression, request.variable, request.x_min, request.x_max, request.samples)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/plot-surface")
def plot_two_variables(request: SurfacePlotRequest):
    try:
        return plot_surface(
            request.expression,
            request.x_variable,
            request.y_variable,
            request.x_min,
            request.x_max,
            request.y_min,
            request.y_max,
            request.samples,
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/compare")
def compare_answers(request: CompareRequest):
    try:
        return {"equivalent": expressions_equivalent(request.expected, request.actual)}
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/check-steps")
def check_steps(request: StepCheckRequest):
    try:
        return check_work_steps(request.problem, request.work)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/learning/recommend")
def learning_recommendation(request: LearningRequest):
    attempts = [attempt.model_dump() for attempt in request.attempts]
    try:
        return recommend_practice(attempts)
    except RuntimeError as error:
        logger.exception("The learning recommender could not load its LSTM runtime")
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.post("/calculate")
def calculate_expression(request: CalculationRequest):
    try:
        return calculate(
            expression=request.expression,
            operation=request.operation,
            variable=request.variable,
            lower=request.lower,
            upper=request.upper,
            order=request.order,
        )
    except ValueError as error:
        logger.warning(
            "Calculation request rejected (operation=%s, expression=%r): %s",
            request.operation,
            request.expression,
            error,
        )
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=422, detail="SymPy could not evaluate this expression.") from error


@app.get("/health")
def health():
    return JSONResponse({"status": "ok"})


app.mount("/", StaticFiles(directory=ROOT / "web", html=True), name="web")
