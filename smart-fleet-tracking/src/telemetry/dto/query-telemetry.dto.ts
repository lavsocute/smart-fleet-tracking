import { IsOptional, IsNumber, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class QueryTelemetryDto {
  @ApiPropertyOptional({
    description: 'Time range in hours (default: 1)',
    example: 1,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  hours?: number = 1;

  @ApiPropertyOptional({ description: 'Max number of results', example: 100 })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  limit?: number = 100;

  @ApiPropertyOptional({
    description: 'Time bucket interval (e.g., "5 minutes")',
    example: '5 minutes',
  })
  @IsString()
  @IsOptional()
  bucket?: string = '5 minutes';
}
