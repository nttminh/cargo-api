import { All, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ProxyService } from './proxy.service';

/**
 * Routing table: every public path and the service that owns it. Specific routes come first
 * because they carry their own rate limits; the per-resource catch-alls follow.
 * Anything not listed here is a 404 from the gateway itself.
 */
@ApiExcludeController()
@Controller()
export class ProxyController {
  constructor(private readonly proxy: ProxyService) {}

  // ---- Stricter limits on public endpoints -----------------------------------------------------

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('auth/login')
  login(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('identity', req, res);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('tracking/:trackingNumber')
  track(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('shipments', req, res);
  }

  // ---- identity ---------------------------------------------------------------------------------

  @All(['auth/*', 'users', 'users/*'])
  identity(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('identity', req, res);
  }

  // ---- master-data ------------------------------------------------------------------------------

  @All(['customers', 'customers/*', 'locations', 'locations/*', 'carriers', 'carriers/*'])
  masterData(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('masterData', req, res);
  }

  // ---- shipments --------------------------------------------------------------------------------

  @All(['shipments', 'shipments/*', 'freight/*'])
  shipments(@Req() req: Request, @Res() res: Response) {
    return this.proxy.forward('shipments', req, res);
  }
}
