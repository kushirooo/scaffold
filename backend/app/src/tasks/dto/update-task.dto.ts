import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { TASK_PRIORITIES, type ApiTaskPriority } from '../task.types.js';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateTaskDto {
  @Transform(trim)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1, { message: 'Title is required.' })
  @MaxLength(200, { message: 'Title must be 200 characters or fewer.' })
  title?: string;

  @Transform(trim)
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(2000, { message: 'Description must be 2000 characters or fewer.' })
  description?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Enter a valid due date.' })
  @IsDateString({ strict: true }, { message: 'Enter a valid due date.' })
  dueDate?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn([...TASK_PRIORITIES], { message: 'Select a valid priority.' })
  priority?: ApiTaskPriority;

  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID(undefined, { message: 'Select a valid assignee.' })
  assigneeId?: string;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsUUID(undefined, { message: 'Select a valid milestone.' })
  milestoneId?: string | null;
}
