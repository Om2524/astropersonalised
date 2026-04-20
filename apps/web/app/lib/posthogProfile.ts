import posthog from "posthog-js";
import type { UserProfile } from "@/app/types";

export function getBirthProfileAnalyticsProperties(profile: UserProfile) {
  return {
    date_of_birth: profile.date_of_birth,
    ...(profile.time_of_birth ? { time_of_birth: profile.time_of_birth } : {}),
    birthplace: profile.birthplace,
    birth_time_quality: profile.birth_time_quality,
    birth_time_provided: Boolean(profile.time_of_birth),
    reading_tone: profile.tone,
    preferred_language: profile.language ?? "en",
  };
}

export function syncBirthProfilePersonProperties(profile: UserProfile) {
  const properties = getBirthProfileAnalyticsProperties(profile);

  posthog.setPersonProperties(properties, {
    initial_date_of_birth: profile.date_of_birth,
    ...(profile.time_of_birth
      ? { initial_time_of_birth: profile.time_of_birth }
      : {}),
    initial_birthplace: profile.birthplace,
    initial_birth_time_quality: profile.birth_time_quality,
    initial_birth_time_provided: Boolean(profile.time_of_birth),
    initial_reading_tone: profile.tone,
    initial_preferred_language: profile.language ?? "en",
  });
}
