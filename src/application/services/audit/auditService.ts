import { AuditLogModel } from '../../../framework/database/mongodb/models/auditLogModel';

export const auditService = {
  create: (input: {
    adminId: string;
    action: string;
    targetType: string;
    targetId: string;
    before?: unknown;
    after?: unknown;
    reason?: string;
    metadata?: unknown;
  }) =>
    AuditLogModel.create({
      adminId: input.adminId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      before: input.before || {},
      after: input.after || {},
      reason: input.reason || '',
      metadata: input.metadata || {},
    }),
};
