import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRoutes } from './modules/auth';
import { configsRoutes } from './modules/configs';
import { walletsRoutes } from './modules/wallets';
import { customContractsRoutes } from './modules/custom-contracts';
import { paymentsRoutes } from './modules/payments';
import { apiTokensRoutes } from './modules/api-tokens';
import { reportsRoutes } from './modules/reports';
import { publicRoutes } from './modules/public';
import { tokensRoutes } from './modules/tokens';
import { startPaymentPoller } from './jobs/payment-poller.job';
import { errorMiddleware } from './common/middlewares';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:4200', credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/auth', authRoutes);
app.use('/configs', configsRoutes);
app.use('/wallets', walletsRoutes);
app.use('/custom-contracts', customContractsRoutes);
app.use('/payments', paymentsRoutes);
app.use('/api-tokens', apiTokensRoutes);
app.use('/reports', reportsRoutes);
app.use('/tokens', tokensRoutes);
app.use('/api/v1', publicRoutes);

app.use(errorMiddleware);

startPaymentPoller();

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

export default app;
