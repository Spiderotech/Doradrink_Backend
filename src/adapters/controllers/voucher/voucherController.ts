import { Request, Response } from 'express';
import { z } from 'zod';
import { voucherService } from '../../../application/services/voucher/voucherService';
import { sendSuccess } from '../../../framework/webserver/response/response';

const myVoucherQuerySchema = z.object({
  userId: z.string().min(1),
});

const downloadSchema = z.object({
  userId: z.string().min(1),
});

export const voucherController = {
  mine: async (req: Request, res: Response) => {
    const input = myVoucherQuerySchema.parse(req.query);
    const vouchers = await voucherService.listMine(input.userId);
    sendSuccess(res, { vouchers });
  },

  markDownloaded: async (req: Request, res: Response) => {
    const input = downloadSchema.parse(req.body);
    const voucher = await voucherService.markDownloaded({
      userId: input.userId,
      voucherId: String(req.params.id),
    });
    sendSuccess(res, { voucher });
  },
};
