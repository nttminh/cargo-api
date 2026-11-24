import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, RequestHandler, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { ServerResponse } from 'http';
import type { Socket } from 'net';
import { Upstream, UPSTREAM_NAMES } from './upstreams';

/**
 * Streams requests to the backend services unchanged (method, path, query, headers, body).
 * The gateway runs without a body parser, so request bodies are piped, never buffered.
 */
@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);
  private readonly proxies: Record<Upstream, RequestHandler>;

  constructor(config: ConfigService) {
    const timeout = config.get<number>('upstreams.timeoutMs', 30_000);
    const make = (upstream: Upstream, target: string) =>
      createProxyMiddleware<Request, Response>({
        target,
        changeOrigin: false,
        xfwd: true,
        proxyTimeout: timeout,
        timeout,
        on: { error: (err, req, res) => this.onError(upstream, err, req, res) },
      });
    this.proxies = {
      identity: make('identity', config.getOrThrow('upstreams.identity')),
      masterData: make('masterData', config.getOrThrow('upstreams.masterData')),
      shipments: make('shipments', config.getOrThrow('upstreams.shipments')),
    };
  }

  forward(upstream: Upstream, req: Request, res: Response) {
    return this.proxies[upstream](req, res, (err?: unknown) => {
      if (err) this.onError(upstream, err as Error, req, res);
    });
  }

  /** Same JSON envelope as the services' own errors. */
  private onError(
    upstream: Upstream,
    err: Error,
    req: Request,
    res: Response | ServerResponse | Socket,
  ) {
    const name = UPSTREAM_NAMES[upstream];
    const code = (err as NodeJS.ErrnoException).code;
    this.logger.warn(`${name} ${req.method} ${req.url} failed: ${code ?? err.message}`);
    if (!('writeHead' in res) || res.headersSent) {
      if ('destroy' in res) res.destroy();
      return;
    }
    const timedOut = code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT';
    const status = timedOut ? 504 : code === 'ECONNREFUSED' || code === 'ENOTFOUND' ? 503 : 502;
    const error =
      status === 504 ? 'Gateway Timeout' : status === 503 ? 'Service Unavailable' : 'Bad Gateway';
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        statusCode: status,
        error,
        message: `The ${name} service is not available. Try again shortly.`,
        path: req.url,
        requestId: req.headers['x-request-id'],
        timestamp: new Date().toISOString(),
      }),
    );
  }
}
