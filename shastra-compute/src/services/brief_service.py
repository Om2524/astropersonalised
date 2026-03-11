"""Daily Brief and Weekly Outlook generation service.

Computes current transits against a user's natal chart and produces
LLM-generated personalized astrological briefs.
"""

from __future__ import annotations

import json
from datetime import date, timedelta

from google import genai

from src.core.models.chart import CanonicalChart
from src.core.calculator import ChartCalculator


class BriefService:
    """Generates daily briefs and weekly outlooks from chart + transit data."""

    def __init__(self, api_key: str):
        """Initialize with a Gemini API key."""
        self.client = genai.Client(api_key=api_key)
        self.model = "gemini-2.0-flash"
        self.calculator = ChartCalculator()

    def generate_daily_brief(self, chart: CanonicalChart, target_date: date) -> dict:
        """Generate a personalized daily brief.

        Parameters
        ----------
        chart : CanonicalChart
            The user's natal chart.
        target_date : date
            The date for which to generate the brief.

        Returns
        -------
        dict
            Contains title, summary, mood, focus_area, tip, and transit metadata.
        """
        # 1. Compute transits for the target date
        transits = self.calculator.compute_transits(target_date, chart)

        # 2. Get moon's current sign (from transit planets)
        moon_transit = next((p for p in transits["transit_planets"] if p.name == "Moon"), None)

        # 3. Get current dasha context
        dasha = chart.vimshottari_dasha

        # 4. Build evidence summary
        evidence = {
            "date": target_date.isoformat(),
            "moon_transit": {
                "sign": moon_transit.sign if moon_transit else "unknown",
                "nakshatra": moon_transit.nakshatra if moon_transit else "unknown",
            },
            "significant_transits": [
                t for t in transits["transit_to_natal_aspects"]
                if t["orb"] < 3.0  # Only tight aspects
            ][:8],  # Limit to top 8
            "dasha": {
                "maha_lord": dasha.maha_lord if dasha else None,
                "antar_lord": dasha.antar_lord if dasha else None,
            },
            "ascendant_sign": chart.houses_whole_sign[0].sign if chart.houses_whole_sign else None,
        }

        # 5. Generate brief via Gemini
        prompt = f"""You are Shastra, an astrology AI. Generate a personalized daily brief for {target_date.strftime('%B %d, %Y')}.

Based on this astrological data:
{json.dumps(evidence, indent=2, default=str)}

Write a daily brief in JSON format with these keys:
- "title": A short title for the day (3-5 words, e.g., "A Day for Bold Moves")
- "summary": 3-5 sentences of personalized insight for the day. Reference the Moon transit, any significant planet aspects, and the dasha period. Be specific but not alarming.
- "mood": One word capturing the day's energy (e.g., "reflective", "dynamic", "grounding", "transformative")
- "focus_area": What life area to focus on today (e.g., "career", "relationships", "self-care", "creativity")
- "tip": One actionable tip for the day (1 sentence)

Be warm, specific to the chart, and insightful. Never fearmonger. Return ONLY valid JSON."""

        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt,
            config={"response_mime_type": "application/json"},
        )

        data = json.loads(response.text)
        data["date"] = target_date.isoformat()
        data["moon_sign"] = moon_transit.sign if moon_transit else None
        data["moon_nakshatra"] = moon_transit.nakshatra if moon_transit else None
        data["active_transits"] = len(evidence["significant_transits"])
        return data

    def generate_weekly_outlook(self, chart: CanonicalChart, week_start: date) -> dict:
        """Generate a personalized weekly outlook (Mon-Sun).

        Parameters
        ----------
        chart : CanonicalChart
            The user's natal chart.
        week_start : date
            The Monday that starts the week.

        Returns
        -------
        dict
            Contains title, overview, per-day highlights, best/challenging days, and advice.
        """
        # Compute transits for each day of the week
        daily_highlights = []
        all_transits = []

        for i in range(7):
            day = week_start + timedelta(days=i)
            transits = self.calculator.compute_transits(day, chart)
            moon = next((p for p in transits["transit_planets"] if p.name == "Moon"), None)
            tight_aspects = [t for t in transits["transit_to_natal_aspects"] if t["orb"] < 2.5]

            daily_highlights.append({
                "date": day.isoformat(),
                "day_name": day.strftime("%A"),
                "moon_sign": moon.sign if moon else None,
                "significant_aspects": len(tight_aspects),
                "key_aspects": tight_aspects[:3],
            })
            all_transits.extend(tight_aspects)

        dasha = chart.vimshottari_dasha

        evidence = {
            "week_start": week_start.isoformat(),
            "week_end": (week_start + timedelta(days=6)).isoformat(),
            "daily_highlights": daily_highlights,
            "dasha": {
                "maha_lord": dasha.maha_lord if dasha else None,
                "antar_lord": dasha.antar_lord if dasha else None,
            },
            "ascendant_sign": chart.houses_whole_sign[0].sign if chart.houses_whole_sign else None,
        }

        prompt = f"""You are Shastra, an astrology AI. Generate a personalized weekly outlook for the week of {week_start.strftime('%B %d')} to {(week_start + timedelta(days=6)).strftime('%B %d, %Y')}.

Astrological data:
{json.dumps(evidence, indent=2, default=str)}

Write a weekly outlook in JSON format:
- "title": A theme for the week (3-6 words)
- "overview": 3-5 sentence summary of the week's energy and themes
- "days": An array of 7 objects, each with:
  - "date": ISO date string
  - "day_name": e.g., "Monday"
  - "highlight": 1-2 sentences about that day's energy
  - "rating": 1-5 (energy/opportunity level, 5 being best)
- "best_days": Array of day names that are most favorable
- "challenging_days": Array of day names that need extra care
- "focus_areas": Array of 2-3 life areas to focus on this week
- "advice": 1-2 sentences of overall advice

Be warm and insightful. Return ONLY valid JSON."""

        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt,
            config={"response_mime_type": "application/json"},
        )

        data = json.loads(response.text)
        data["week_start"] = week_start.isoformat()
        data["week_end"] = (week_start + timedelta(days=6)).isoformat()
        return data
