import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'crypto';

/**
 * Structured JSON logs to stdout (pretty in development). The request id comes from the
 * x-request-id header when the gateway already set one, so one id follows a request through
 * every service.
 */
export const loggerModule = (service: string) =>
  LoggerModule.forRootAsync({
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({
      pinoHttp: {
        level: config.get<string>('logLevel'),
        base: { service },
        genReqId: (req, res) => {
          const existing = req.headers['x-request-id'];
          const id = (Array.isArray(existing) ? existing[0] : existing) || randomUUID();
          // Visible to the proxy too, so upstream services log the same id.
          req.headers['x-request-id'] = id;
          res.setHeader('x-request-id', id);
          return id;
        },
        redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password'],
        autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/health') },
        transport:
          config.get<string>('env') === 'development'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
      },
    }),
  });
