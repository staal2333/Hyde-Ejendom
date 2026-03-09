// Shared SSE stream consumer hook
import { useCallback } from "react";
import type { ProgressEvent } from "./types";

type SetEvents = React.Dispatch<React.SetStateAction<ProgressEvent[]>>;
type SetPct = React.Dispatch<React.SetStateAction<number>>;
type SetPhase = React.Dispatch<React.SetStateAction<string>>;

interface UseSSEStreamDeps {
  setError: (msg: string | null) => void;
  fetchData: () => Promise<void>;
}

export function useSSEStream({ setError, fetchData }: UseSSEStreamDeps) {
  const consumeSSE = useCallback(
    async (
      url: string,
      method: "GET" | "POST",
      body: unknown,
      setEvents: SetEvents,
      setPct: SetPct,
      setPhase: SetPhase,
      onResult?: (event: ProgressEvent) => void,
      onDone?: () => void,
      signal?: AbortSignal
    ) => {
      try {
        const res = await fetch(url, {
          method,
          headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
          body: method === "POST" ? JSON.stringify(body) : undefined,
          signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: "Fejl" })) as { error?: string };
          setError(errData.error || "Fejl");
          return;
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) return;

        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6)) as Partial<ProgressEvent>;
              const pe: ProgressEvent = { ...event, timestamp: Date.now() } as ProgressEvent;
              setEvents((prev) => [...prev, pe]);
              if (event.progress !== undefined) setPct(event.progress);
              if (event.phase) setPhase(event.phase);
              if (onResult) onResult(pe);
              if (event.phase === "complete" || event.phase === "done") {
                setTimeout(fetchData, 1500);
              }
            } catch { /* skip malformed event */ }
          }
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          setEvents((prev) => [...prev, { phase: "stopped", message: "Stoppet af bruger", timestamp: Date.now() } as ProgressEvent]);
          setPct(100);
          setTimeout(fetchData, 1000);
        } else {
          setError(e instanceof Error ? e.message : "Stream fejlede");
        }
      } finally {
        if (onDone) onDone();
      }
    },
    [setError, fetchData]
  );

  return { consumeSSE };
}
