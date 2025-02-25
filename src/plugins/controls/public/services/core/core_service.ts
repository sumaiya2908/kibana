/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { KibanaPluginServiceFactory } from '@kbn/presentation-util-plugin/public';
import { ControlsCoreService } from './types';
import { ControlsPluginStartDeps } from '../../types';

export type CoreServiceFactory = KibanaPluginServiceFactory<
  ControlsCoreService,
  ControlsPluginStartDeps
>;

export const coreServiceFactory: CoreServiceFactory = ({ coreStart }) => {
  const { theme, i18n } = coreStart;

  return {
    theme,
    i18n,
  };
};
