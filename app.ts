import { createServer } from './src/framework/webserver/express';
import { connectMongoDB } from './src/framework/database/mongodb/connection';
import { env } from './src/config/env';
import { config } from './src/config/config';
import { adminAuthService } from './src/application/services/admin/adminAuthService';

const start = async () => {
  await connectMongoDB();
  await adminAuthService.bootstrapSuperAdmin(config.adminBootstrap);

  const app = createServer();

  app.listen(env.PORT, () => {
    console.log(`DoraDrink backend running on port ${env.PORT}`);
  });
};

start().catch(error => {
  console.error('Failed to start DoraDrink backend:', error);
  process.exit(1);
});
