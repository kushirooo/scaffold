import { IsIn } from 'class-validator';
import { TASK_STATUSES, type ApiTaskStatus } from '../task.types.js';

export class UpdateTaskStatusDto {
  @IsIn([...TASK_STATUSES], { message: 'Select a valid status.' })
  status: ApiTaskStatus;
}
