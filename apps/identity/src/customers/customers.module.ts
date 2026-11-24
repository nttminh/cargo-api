import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerRef } from './customer-ref.entity';
import { CustomersConsumer } from './customers.consumer';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerRef])],
  providers: [CustomersConsumer],
  exports: [TypeOrmModule],
})
export class CustomerRefsModule {}
