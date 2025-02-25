/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { PluginInitializerContext } from '@kbn/core/server';

export type {
  SharePublicSetup as SharePluginSetup,
  SharePublicStart as SharePluginStart,
} from './plugin';

export { CSV_QUOTE_VALUES_SETTING, CSV_SEPARATOR_SETTING } from '../common/constants';

export async function plugin(initializerContext: PluginInitializerContext) {
  const { SharePlugin } = await import('./plugin');
  return new SharePlugin(initializerContext);
}
