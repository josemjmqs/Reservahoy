import { IsIn } from 'class-validator';

// Con qué cuenta del negocio demo se entra: la dueña o el profesional
export class DemoLoginDto {
  @IsIn(['owner', 'staff'])
  role: 'owner' | 'staff';
}
