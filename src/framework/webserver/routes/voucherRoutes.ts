import { Router } from 'express';
import { voucherController } from '../../../adapters/controllers/voucher/voucherController';
import { asyncHandler } from '../response/asyncHandler';

export const voucherRoutes = Router();

voucherRoutes.get('/my', asyncHandler(voucherController.mine));
voucherRoutes.post('/:id/downloaded', asyncHandler(voucherController.markDownloaded));
