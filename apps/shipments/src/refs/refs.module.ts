import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CarrierRef, CustomerRef, LocationRef } from './refs.entities';
import { MasterDataConsumer } from './master-data.consumer';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerRef, LocationRef, CarrierRef])],
  providers: [MasterDataConsumer],
  exports: [TypeOrmModule],
})
export class RefsModule {}
