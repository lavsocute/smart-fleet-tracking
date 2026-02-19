import { IsNumber, IsOptional, IsBoolean, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTelemetryDto {
  @ApiProperty({ description: 'Vehicle ID', example: 1 })
  @IsNumber()
  vehicleId: number;

  @ApiProperty({ description: 'Latitude (-90 to 90)', example: 10.7769 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ description: 'Longitude (-180 to 180)', example: 106.7009 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiPropertyOptional({
    description: 'Speed in km/h',
    example: 45.5,
    default: 0,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  speed?: number;

  @ApiPropertyOptional({
    description: 'Heading in degrees (0-360)',
    example: 180,
    default: 0,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(360)
  heading?: number;

  @ApiPropertyOptional({
    description: 'Engine status',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  engineStatus?: boolean;
}
