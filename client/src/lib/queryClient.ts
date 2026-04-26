import { QueryClient, QueryFunction } from "@tanstack/react-query";

const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

function createTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("Request timeout", "TimeoutError")),
    ms
  );
  controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  return controller.signal;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : undefined;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const signal = createTimeoutSignal(timeoutMs);
  const headers: Record<string, string> = {};
  if (data) headers["Content-Type"] = "application/json";

  // Include CSRF token for state-changing requests
  const safeMethods = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);
  if (!safeMethods.has(method.toUpperCase())) {
    const csrfToken = getCookie("XSRF-TOKEN");
    if (csrfToken) headers["x-xsrf-token"] = csrfToken;
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
      signal,
    });
    await throwIfResNotOk(res);
    return res;
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      throw new Error(`Request to ${url} timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
  timeoutMs?: number;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS }) =>
  async ({ queryKey }) => {
    const signal = createTimeoutSignal(timeoutMs);
    let res: Response;
    try {
      res = await fetch(queryKey.join("/") as string, {
        credentials: "include",
        signal,
      });
    } catch (err: any) {
      if (err?.name === "TimeoutError" || err?.name === "AbortError") {
        throw new Error(`Query timed out after ${timeoutMs / 1000}s`);
      }
      throw err;
    }

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    if (res.status === 503) {
      const body = await res.json().catch(() => ({}));
      const retryAfter = body?.retryAfter ?? 10;
      window.dispatchEvent(
        new CustomEvent("ccc:service-unavailable", { detail: { retryAfter } })
      );
      const serviceErr: any = new Error(body?.message ?? "Service temporarily unavailable");
      serviceErr.status = 503;
      serviceErr.retryAfter = retryAfter;
      throw serviceErr;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

function computeRetryDelay(attempt: number): number {
  const base = Math.min(1000 * Math.pow(2, attempt), 8_000);
  return base + Math.random() * 500;
}

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (!(error instanceof Error)) return failureCount < 2;
  const msg = error.message;
  if (msg.startsWith("401") || msg.startsWith("403") || msg.startsWith("404")) return false;
  if (msg.startsWith("400") || msg.startsWith("422")) return false;
  if ((error as any).status === 503) return failureCount < 4;
  if (msg.includes("timed out") || msg.includes("Failed to fetch")) return failureCount < 3;
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
      retry: shouldRetry,
      retryDelay: (attempt) => computeRetryDelay(attempt),
    },
    mutations: {
      retry: false,
    },
  },
});
