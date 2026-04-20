"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";

type Suggestion = {
  displayName: string;
  latitude: number;
  longitude: number;
};

const suggestionCache = new Map<string, Suggestion[]>();

export const suggestBirthplaces = action({
  args: {
    query: v.string(),
  },
  returns: v.array(
    v.object({
      displayName: v.string(),
      latitude: v.number(),
      longitude: v.number(),
    })
  ),
  handler: async (_ctx, { query }): Promise<Suggestion[]> => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) {
      return [];
    }

    const cached = suggestionCache.get(normalized);
    if (cached) {
      return cached;
    }

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(
        query
      )}`,
      {
        headers: {
          "User-Agent": "Shastra/1.0 (birthplace suggestions)",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Place suggestion lookup failed: ${response.status}`);
    }

    const results = (await response.json()) as Array<{
      display_name?: string;
      lat?: string;
      lon?: string;
    }>;

    const suggestions = results
      .filter((result) => result.display_name && result.lat && result.lon)
      .map((result) => ({
        displayName: result.display_name as string,
        latitude: Number(result.lat),
        longitude: Number(result.lon),
      }))
      .filter(
        (result, index, all) =>
          all.findIndex((candidate) => candidate.displayName === result.displayName) ===
          index
      );

    suggestionCache.set(normalized, suggestions);
    return suggestions;
  },
});
