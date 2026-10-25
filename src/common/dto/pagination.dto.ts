import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Free-text search' })
  @IsOptional()
  @IsString()
  search?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export const skipOf = (q: Pick<PaginationQueryDto, 'page' | 'limit'>) => (q.page - 1) * q.limit;

export const paginate = <T>(
  data: T[],
  total: number,
  q: Pick<PaginationQueryDto, 'page' | 'limit'>,
): PaginatedResult<T> => ({
  data,
  meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
});
