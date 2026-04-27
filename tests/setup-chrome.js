import { beforeEach } from 'vitest';
import { installChromeMock, resetChromeMock } from './setup.js';

installChromeMock();
beforeEach(() => resetChromeMock());
