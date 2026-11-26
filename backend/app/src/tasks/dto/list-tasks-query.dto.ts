import { IsIn, ValidateIf } from 'class-validator';
import { TASK_STATUSES, type ApiTaskStatus } from '../task.types.js';

export class ListTasksQueryDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn([...TASK_STATUSES], { message: 'Select a valid status.' })
  status?: ApiTaskStatus;
}
