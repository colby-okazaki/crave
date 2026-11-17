import { API_URL } from "./config";
import { ApiError } from "./types";

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  /** Sent as X-Member-Id, so the server knows who's asking. */
  memberId?: string;
};

/**
 * Calls the backend and returns its JSON. Throws ApiError with the server's code
 * (e.g. GROUP_NOT_FOUND), or NETWORK when the server can't be reached.
 */
export async function request<T>(path: string, { method = "GET", body, memberId }: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(memberId ? { "X-Member-Id": memberId } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Can't reach the server.");
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = data?.error;
    throw new ApiError(res.status, error?.code ?? "SERVER_ERROR", error?.message ?? "Something went wrong.");
  }
  return data as T;
}
