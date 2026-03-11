"""Answer composition service — turns structured evidence into readings."""

from __future__ import annotations

import json
from typing import Generator
from google import genai
from pydantic import BaseModel


class ReadingResponse(BaseModel):
    direct_answer: str
    why_this_answer: str
    key_factors: list[str]
    method_view: str
    confidence_note: str
    what_to_watch: str
    explore_further: list[str]
    raw_text: str  # full text for display


class AnswerComposer:
    def __init__(self, api_key: str):
        self.client = genai.Client(api_key=api_key)
        self.model = "gemini-2.0-flash"

    def compose(
        self,
        query: str,
        evidence: dict,
        method: str,
        tone: str = "practical",
        birth_time_quality: str = "exact",
    ) -> ReadingResponse:
        """Compose a structured reading from evidence."""
        prompt = self._build_prompt(query, evidence, method, tone, birth_time_quality)

        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt,
            config={"response_mime_type": "application/json"},
        )

        data = json.loads(response.text)
        data["raw_text"] = self._format_reading(data)
        return ReadingResponse(**data)

    def compose_stream(
        self,
        query: str,
        evidence: dict,
        method: str,
        tone: str = "practical",
        birth_time_quality: str = "exact",
    ) -> Generator[str, None, None]:
        """Stream the reading text chunk by chunk."""
        prompt = self._build_prompt_freeform(
            query, evidence, method, tone, birth_time_quality
        )

        response = self.client.models.generate_content_stream(
            model=self.model,
            contents=prompt,
        )

        for chunk in response:
            if chunk.text:
                yield chunk.text

    def _build_prompt(self, query, evidence, method, tone, birth_time_quality):
        tone_instructions = {
            "practical": "Be direct, actionable, and grounded. Focus on what the person can do.",
            "emotional": "Be warm, empathetic, and validating. Acknowledge feelings.",
            "spiritual": "Be reflective, philosophical, and connect to larger patterns of growth.",
            "concise": "Be extremely brief and to-the-point. Minimal elaboration.",
        }

        tone_guide = tone_instructions.get(tone, tone_instructions["practical"])

        confidence_context = ""
        if birth_time_quality == "unknown":
            confidence_context = "IMPORTANT: Birth time is unknown. House positions and ascendant are unreliable. Focus on sign-level and planetary patterns. Mention this limitation."
        elif birth_time_quality == "approximate":
            confidence_context = "Note: Birth time is approximate. House and ascendant analysis has reduced accuracy. Mention this gently."

        return f'''You are Shastra, a wise and knowledgeable astrologer. You provide personalized readings grounded in actual chart data. Never fabricate planetary positions or aspects not present in the evidence.

TONE: {tone_guide}
{confidence_context}

The user asked: "{query}"

Astrological method used: {method}

Here is the structured evidence from chart analysis:
{json.dumps(evidence, indent=2, default=str)}

Based on this evidence, compose a reading in JSON format with these exact keys:
- "direct_answer": 2-3 sentences directly answering the question. Be specific to their chart.
- "why_this_answer": 3-5 sentences explaining the astrological reasoning. Reference specific planets, signs, and houses from the evidence.
- "key_factors": A list of 3-6 short strings, each describing a key planetary factor (e.g. "Saturn in 10th house brings career discipline", "Jupiter-Moon conjunction supports emotional wisdom")
- "method_view": 1-2 sentences describing which system was used and why it's relevant for this question.
- "confidence_note": 1 sentence expressing confidence naturally (e.g. "This reading carries strong indications given the multiple supporting factors" or "Some uncertainty exists due to approximate birth time").
- "what_to_watch": 1-2 sentences about upcoming transits, dasha periods, or patterns to watch.
- "explore_further": A list of 2-3 follow-up questions the user might find valuable (as complete questions).

IMPORTANT:
- Only reference planets, signs, houses, and aspects that are in the evidence.
- Express confidence in natural language, never as numbers or percentages.
- Do not use overly dramatic or fear-based language.
- Be insightful but responsible — note limitations where applicable.

Return ONLY valid JSON.'''

    def _build_prompt_freeform(self, query, evidence, method, tone, birth_time_quality):
        """Build prompt for streaming (returns formatted text, not JSON)."""
        tone_instructions = {
            "practical": "Be direct, actionable, and grounded.",
            "emotional": "Be warm, empathetic, and validating.",
            "spiritual": "Be reflective and philosophical.",
            "concise": "Be extremely brief.",
        }
        tone_guide = tone_instructions.get(tone, tone_instructions["practical"])

        return f'''You are Shastra, a wise astrologer providing personalized readings.

TONE: {tone_guide}

The user asked: "{query}"
Method: {method}

Evidence:
{json.dumps(evidence, indent=2, default=str)}

Write a reading using these markdown sections. Keep paragraphs SHORT (2-3 sentences each). Write so a non-astrologer can understand — explain what each planet/house means in plain language.

## Direct Answer
2-3 sentences directly answering the question in plain, clear language.

## Analysis
3-5 short paragraphs explaining the astrological reasoning. Each paragraph should focus on ONE insight. When mentioning a planet, briefly explain what it governs (e.g. "Venus, the planet of beauty and relationships"). When mentioning a house, say what life area it represents (e.g. "the 10th house of career").

## What to Watch
1-2 sentences about upcoming transits, dasha periods, or timing windows to be aware of.

## Explore Further
- 2-3 follow-up questions as bullets

IMPORTANT RULES:
- Only reference planets, signs, houses, and aspects present in the evidence.
- Do NOT include a "Key Factors" bullet list — the UI renders visual planet cards separately.
- Do NOT include a "Method View" or "Confidence Note" section — the UI handles those visually.
- Write for clarity — assume the reader knows nothing about astrology.
- Be insightful but responsible.'''

    @staticmethod
    def _format_reading(data: dict) -> str:
        """Format the JSON reading into displayable markdown."""
        sections = []
        sections.append(f"## Direct Answer\n{data.get('direct_answer', '')}")
        sections.append(f"## Why This Answer\n{data.get('why_this_answer', '')}")

        factors = data.get("key_factors", [])
        if factors:
            sections.append(
                "## Key Factors\n" + "\n".join(f"- {f}" for f in factors)
            )

        sections.append(f"## Method View\n{data.get('method_view', '')}")
        sections.append(f"## Confidence Note\n{data.get('confidence_note', '')}")
        sections.append(f"## What to Watch\n{data.get('what_to_watch', '')}")

        explore = data.get("explore_further", [])
        if explore:
            sections.append(
                "## Explore Further\n" + "\n".join(f"- {q}" for q in explore)
            )

        return "\n\n".join(sections)
