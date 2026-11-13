import { IsIn, IsUUID } from 'class-validator';
import {
  PROJECT_MEMBER_ROLES,
  type ApiProjectMemberRole,
} from '../project.types.js';

export class AssignProjectMemberDto {
  @IsUUID()
  userId: string;

  @IsIn([...PROJECT_MEMBER_ROLES])
  projectRole: ApiProjectMemberRole;
}
