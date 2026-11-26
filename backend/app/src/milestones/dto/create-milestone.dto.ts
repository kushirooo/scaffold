import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateMilestoneDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Name is required.' })
  @MaxLength(150, { message: 'Name must be 150 characters or fewer.' })
  name: string;

  @Transform(trim)
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(2000, {
    message: 'Description must be 2000 characters or fewer.',
  })
  description?: string | null;

  @Transform(trim)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Enter a valid target date.' })
  @IsDateString({ strict: true }, { message: 'Enter a valid target date.' })
  targetDate: string;
}
