import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { EntityNotFoundError, QueryFailedError } from 'typeorm';

type PgDriverError = { code?: string; detail?: string };

/** Normalises every error into one JSON envelope and maps common Postgres errors to 4xx. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        error = exception.name;
      } else {
        const b = body as { message?: string | string[]; error?: string };
        message = b.message ?? exception.message;
        error = b.error ?? exception.name;
      }
    } else if (exception instanceof EntityNotFoundError) {
      status = HttpStatus.NOT_FOUND;
      message = 'Resource not found';
      error = 'Not Found';
    } else if (exception instanceof QueryFailedError) {
      const driver = (exception as QueryFailedError & { driverError?: PgDriverError }).driverError;
      switch (driver?.code) {
        case '23505':
          status = HttpStatus.CONFLICT;
          message = driver.detail ?? 'Duplicate value';
          error = 'Conflict';
          break;
        case '23503':
          status = HttpStatus.UNPROCESSABLE_ENTITY;
          message = driver.detail ?? 'Referenced record does not exist';
          error = 'Unprocessable Entity';
          break;
        case '22P02':
          status = HttpStatus.BAD_REQUEST;
          message = 'Invalid input syntax';
          error = 'Bad Request';
          break;
      }
    }

    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    res.status(status).json({
      statusCode: status,
      error,
      message,
      path: req.url,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  }
}
