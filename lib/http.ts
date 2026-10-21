// The parts of the Vercel Node request and response that the api/ functions use.
// The Vite dev plugin (vite-plugin-api.ts) gives the same shape, so the functions run in both.
import type { IncomingHttpHeaders } from 'node:http';

export interface ApiRequest {
  method?: string;
  headers: IncomingHttpHeaders;
  body?: unknown;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  end(): void;
}

export type ApiHandler = (req: ApiRequest, res: ApiResponse) => Promise<void> | void;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
