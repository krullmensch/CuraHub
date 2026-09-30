// Route tests import `app` without a database: treat the instance as set up.
// Tests of the gate and the wizard reset this themselves.
import { setSetupState } from '../lib/setupState';

setSetupState({ complete: true, publicUrl: null });
