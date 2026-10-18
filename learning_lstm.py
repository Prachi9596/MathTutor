"""A small per-learner LSTM for adapting linear-equation practice difficulty.

The model is fitted only to checked attempts sent by the current browser session;
it does not persist student history or model weights.
"""

from __future__ import annotations

import re
from typing import Any

MIN_ATTEMPTS_FOR_LSTM = 6


def _difficulty(expression: str) -> int:
    """Map an equation to one of the three practice levels."""
    compact = expression.lower().replace(" ", "")
    powers = [int(power) for power in re.findall(r"x(?:\^|\*\*)\(?\{?(\d+)", compact)]
    if powers:
        return 3 if max(powers) >= 3 else 2
    sides = compact.split("=", 1)
    has_x_left = len(sides) == 2 and "x" in sides[0]
    has_x_right = len(sides) == 2 and "x" in sides[1]
    if "/" in compact or "(" in compact or ")" in compact:
        return 3
    if has_x_left and has_x_right:
        return 2
    return 1


def _features(level: int, previous_correct: bool) -> list[float]:
    return [
        float(level == 1),
        float(level == 2),
        float(level == 3),
        float(previous_correct),
    ]


def recommend(attempts: list[dict[str, Any]]) -> dict[str, Any]:
    """Predict success by difficulty and choose a suitably challenging next level."""
    chronological = list(reversed(attempts))
    events = [
        {
            "level": _difficulty(str(item["expression"])),
            "correct": bool(item["correct"]),
        }
        for item in chronological
        if item.get("expression")
    ]
    if not events:
        return {
            "difficulty": 1,
            "model": "warmup",
            "attempts_used": 0,
            "probabilities": {},
            "message": "Try a basic equation first; your answer checks will personalize future practice.",
        }

    recent = events[-5:]
    recent_accuracy = sum(item["correct"] for item in recent) / len(recent)
    typical_level = round(sum(item["level"] for item in recent) / len(recent))
    warmup_level = min(3, typical_level + 1) if recent_accuracy >= 0.8 else (
        max(1, typical_level - 1) if recent_accuracy < 0.5 else typical_level
    )

    if len(events) < MIN_ATTEMPTS_FOR_LSTM:
        return {
            "difficulty": warmup_level,
            "model": "warmup",
            "attempts_used": len(events),
            "probabilities": {},
            "message": f"Starting with level {warmup_level}; a few more checked answers will personalize practice.",
        }

    # Import lazily so the web app can still start if the optional neural runtime
    # is unavailable; in that case the caller can show the warm-up path.
    try:
        import torch
        from torch import nn
    except ImportError as error:
        raise RuntimeError("PyTorch is required for LSTM recommendations.") from error

    class PerformanceLSTM(nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.lstm = nn.LSTM(input_size=4, hidden_size=12, batch_first=True)
            self.output = nn.Linear(12, 1)

        def forward(self, sequence: Any) -> Any:
            states, _ = self.lstm(sequence)
            return self.output(states).squeeze(-1)

    torch.manual_seed(23)
    model = PerformanceLSTM()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.025)
    loss_function = nn.BCEWithLogitsLoss()
    inputs = torch.tensor(
        [[
            _features(item["level"], events[index - 1]["correct"] if index else False)
            for index, item in enumerate(events)
        ]],
        dtype=torch.float32,
    )
    targets = torch.tensor(
        [[float(item["correct"]) for item in events]],
        dtype=torch.float32,
    )
    model.train()
    for _ in range(70):
        optimizer.zero_grad()
        loss = loss_function(model(inputs), targets)
        loss.backward()
        optimizer.step()

    previous_correct = events[-1]["correct"]
    history_features = [
        _features(item["level"], events[index - 1]["correct"] if index else False)
        for index, item in enumerate(events)
    ]
    candidate_sequences = [
        history_features + [_features(level, previous_correct)]
        for level in (1, 2, 3)
    ]
    candidate_inputs = torch.tensor(candidate_sequences, dtype=torch.float32)
    model.eval()
    with torch.no_grad():
        probabilities = torch.sigmoid(model(candidate_inputs)[:, -1]).tolist()

    selected_level = min(
        range(1, 4),
        key=lambda level: (abs(probabilities[level - 1] - 0.7), level),
    )
    return {
        "difficulty": selected_level,
        "model": "lstm",
        "attempts_used": len(events),
        "probabilities": {
            str(level): round(float(probabilities[level - 1]), 3)
            for level in (1, 2, 3)
        },
        "message": f"Suggested level {selected_level}, based on your recent answers.",
    }
