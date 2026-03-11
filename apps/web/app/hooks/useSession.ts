"use client";

import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";

const SESSION_KEY = "shastra_session_id";

function getOrGenerateSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function useSession() {
  const [sessionId, setSessionId] = useState("");
  const [ready, setReady] = useState(false);
  const registerSession = useMutation(api.functions.sessions.getOrCreate);

  useEffect(() => {
    const id = getOrGenerateSessionId();
    setSessionId(id);

    if (id) {
      registerSession({ sessionId: id })
        .then(() => setReady(true))
        .catch(() => setReady(true));
    }
  }, [registerSession]);

  return { sessionId, ready };
}
