"""Query analysis and routing service using Gemini."""

from __future__ import annotations

import json

from google import genai
from pydantic import BaseModel, Field


class QueryClassification(BaseModel):
    domain: str = Field(
        description="One of: career, relationships, marriage, family, money, health, purpose, personality, education, spirituality, timing, compatibility, general"
    )
    time_orientation: str = Field(
        description="One of: timeless, present, near_future, long_future, retrospective, cyclical"
    )
    intent: str = Field(
        description="One of: explanation, prediction, comparison, reassurance, exploration, compatibility, identity"
    )
    birth_time_sensitivity: str = Field(
        description="One of: high, medium, low"
    )
    depth_mode: str = Field(
        description="One of: quick, standard, deep"
    )
    best_fit_engine: str = Field(
        description="One of: vedic, kp, western, compare"
    )


class QueryRouter:
    def __init__(self, api_key: str):
        self.client = genai.Client(api_key=api_key)
        self.model = "gemini-2.0-flash"

    def classify(self, query: str) -> QueryClassification:
        """Classify a user's astrology question."""
        prompt = (
            "You are an astrology query classifier. Analyze the user's question "
            "and return a JSON object with these fields:\n\n"
            '- "domain": The life area being asked about. Choose one: career, '
            "relationships, marriage, family, money, health, purpose, personality, "
            "education, spirituality, timing, compatibility, general\n"
            '- "time_orientation": When the question is focused. Choose one: '
            "timeless (personality/trait questions), present (current situation), "
            "near_future (next few months), long_future (years ahead), "
            "retrospective (looking back), cyclical (recurring patterns)\n"
            '- "intent": What the user wants. Choose one: explanation (understand why), '
            "prediction (what will happen), comparison (compare options), "
            "reassurance (seeking comfort), exploration (open-ended discovery), "
            "compatibility (relationship match), identity (who am I)\n"
            '- "birth_time_sensitivity": How much birth time accuracy matters for '
            "this question. Choose one: high (houses/ascendant critical - e.g. "
            "career, marriage timing), medium (helpful but not critical), "
            "low (sign-level questions work fine)\n"
            '- "depth_mode": How deep the answer should go. Choose one: '
            "quick (brief insight), standard (balanced), deep (thorough analysis)\n"
            '- "best_fit_engine": Which astrology system is best suited. Choose one: '
            "vedic (traditional Indian, good for karma/dharma/timing), "
            "kp (precise timing questions), western (psychological/personality), "
            "compare (user wants multiple perspectives or unclear)\n\n"
            "Rules:\n"
            '- Timing questions (when will X happen?) -> best_fit_engine should be "kp"\n'
            '- Personality/psychological questions -> best_fit_engine should be "western"\n'
            "- Karma, dharma, life purpose, traditional questions -> "
            'best_fit_engine should be "vedic"\n'
            "- If the question is broad or comparative -> "
            'best_fit_engine should be "compare"\n'
            "- Questions about houses, ascendant, marriage timing -> "
            'birth_time_sensitivity "high"\n'
            "- Questions about sun sign, general traits -> "
            'birth_time_sensitivity "low"\n\n'
            "Return ONLY a valid JSON object, no other text.\n\n"
            f'User question: "{query}"'
        )

        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt,
            config={"response_mime_type": "application/json"},
        )

        data = json.loads(response.text)
        return QueryClassification(**data)
