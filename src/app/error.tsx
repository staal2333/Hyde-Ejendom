"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  const isChunkError =
    error?.message?.includes("ChunkLoadError") ||
    error?.message?.includes("Loading chunk") ||
    error?.message?.includes("Failed to fetch");

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-200 p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-7 h-7 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z"
            />
          </svg>
        </div>
        <h1 className="text-lg font-bold text-slate-800 mb-1">Noget gik galt</h1>
        {isChunkError ? (
          <p className="text-sm text-slate-600 mb-4">
            En opdatering er muligvis blevet udrullet. Prøv at opdatere siden (F5 eller Ctrl+R). Hvis
            fejlen fortsætter, ryd cachen eller prøv i et inkognitovindue.
          </p>
        ) : (
          <p className="text-sm text-slate-600 mb-4">
            Der opstod en uventet fejl. Prøv at genindlæse siden.
          </p>
        )}
        <button
          onClick={reset}
          className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg"
        >
          Prøv igen
        </button>
        <button
          onClick={() => window.location.reload()}
          className="ml-3 px-5 py-2.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50"
        >
          Genindlæs siden
        </button>
      </div>
    </div>
  );
}
