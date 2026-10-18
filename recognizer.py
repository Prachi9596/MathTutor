

from __future__ import annotations

from io import BytesIO
from threading import Lock

from PIL import Image, ImageOps, UnidentifiedImageError

MODEL_ID = "breezedeus/pix2text-mfr-1.5"
_MODEL_LOCK = Lock()
_PROCESSOR = None
_MODEL = None


def _load_model():
    """Load the ONNX model once, on first use, and keep it warm for later requests."""
    global _PROCESSOR, _MODEL
    if _MODEL is None:
        with _MODEL_LOCK:
            if _MODEL is None:
                from optimum.onnxruntime import ORTModelForVision2Seq
                from transformers import TrOCRProcessor

                _PROCESSOR = TrOCRProcessor.from_pretrained(MODEL_ID, use_fast=False)
                _MODEL = ORTModelForVision2Seq.from_pretrained(
                    MODEL_ID,
                    use_cache=False,
                    provider="CPUExecutionProvider",
                )
    return _PROCESSOR, _MODEL


def image_to_latex(image_bytes: bytes, mime_type: str) -> str:
    """Recognize a formula image locally and return its LaTeX transcription."""
    if mime_type not in {"image/png", "image/jpeg", "image/webp"}:
        raise ValueError("Use a PNG, JPEG, or WEBP image.")
    try:
        with Image.open(BytesIO(image_bytes)) as source:
            image = ImageOps.exif_transpose(source).convert("RGB")
    except (UnidentifiedImageError, OSError) as error:
        raise ValueError("The uploaded file is not a readable image.") from error

    image.thumbnail((1200, 1200), Image.Resampling.LANCZOS)

    processor, model = _load_model()
    pixel_values = processor(images=[image], return_tensors="pt").pixel_values
    generated_ids = model.generate(pixel_values)
    text = processor.batch_decode(generated_ids, skip_special_tokens=True)[0].strip()
    return text or "NONE"
