import { IsString, IsOptional, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateVehicleDto {
  @ApiProperty({ description: 'License plate number', example: '59A-12345' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  plateNumber: string;

  @ApiPropertyOptional({
    description: 'Vehicle type',
    example: 'truck',
    default: 'truck',
  })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  vehicleType?: string;

  @ApiPropertyOptional({
    description: 'Vehicle status',
    example: 'active',
    default: 'active',
  })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  status?: string;
}
