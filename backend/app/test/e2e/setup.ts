import { applyE2eEnvironment } from './support/e2e-environment.js';

// Runs in every e2e worker before the test modules are evaluated, so
// `AppModule` boots with the dedicated e2e database and the e2e seed password.
applyE2eEnvironment();
