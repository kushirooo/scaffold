import {
  IsDateString,
  IsIn,
  IsNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PROJECT_STATUSES, type ApiProjectStatus } from '../project.types.js';

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsString()
  @MinLength(1)
  description: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  startDate: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  endDate: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  budget: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn([...PROJECT_STATUSES])
  status?: ApiProjectStatus;
}
