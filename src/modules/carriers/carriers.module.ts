import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Carrier } from './carrier.entity';
import { CarriersService } from './carriers.service';
import { CarriersController } from './carriers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Carrier])],
  controllers: [CarriersController],
  providers: [CarriersService],
  exports: [CarriersService],
})
export class CarriersModule {}
